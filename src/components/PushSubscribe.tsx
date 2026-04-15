'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

function getPlatform(): 'ios' | 'android' {
  const ua = navigator.userAgent
  return /iphone|ipad|ipod/i.test(ua) ? 'ios' : 'android'
}

export default function PushSubscribe() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    if (localStorage.getItem('push_subscribed')) return

    async function subscribe() {
      localStorage.setItem('push_debug', 'started')
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { localStorage.setItem('push_debug', 'no user'); return }
        localStorage.setItem('push_debug', 'got user: ' + user.id)

        const permission = await Notification.requestPermission()
        localStorage.setItem('push_debug', 'permission: ' + permission)
        if (permission !== 'granted') return

        localStorage.setItem('push_debug', 'vapid key: ' + (VAPID_PUBLIC_KEY ? 'exists' : 'MISSING'))
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        })
        localStorage.setItem('push_debug', 'subscribed!')

        const { endpoint, keys } = sub.toJSON() as {
          endpoint: string
          keys: { p256dh: string; auth: string }
        }

        await supabase.from('push_subscriptions').upsert({
          user_id: user.id,
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          platform: getPlatform(),
        }, { onConflict: 'user_id,endpoint' })

        localStorage.setItem('push_subscribed', '1')
      } catch (e) {
        localStorage.setItem('push_debug', 'error: ' + String(e))
        // שמור שגיאה בבוט לדיבאג
        try {
          const supabase = createClient()
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            const { data: profile } = await supabase.from('profiles').select('apartment_id').eq('id', user.id).single()
            if (profile?.apartment_id) {
              await supabase.from('bot_messages').insert({
                user_id: user.id,
                apartment_id: profile.apartment_id,
                message: `[debug push] שגיאה: ${String(e)}`,
                triggered_by: 'push_debug',
                is_read: false,
              })
            }
          }
        } catch {}
      }
    }

    subscribe()
  }, [])

  return null
}
