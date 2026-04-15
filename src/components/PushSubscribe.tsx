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

    async function subscribe() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const reg = await navigator.serviceWorker.ready

        // בדוק אם יש כבר subscription במכשיר הזה
        let sub = await reg.pushManager.getSubscription()

        if (!sub) {
          // אין subscription — בקש הרשאה ותצור
          const permission = await Notification.requestPermission()
          if (permission !== 'granted') return

          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
          })
        }

        // שמור ב-DB (upsert — בטוח לקרוא כל פעם)
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

      } catch (e) {
        console.error('push subscribe error', e)
      }
    }

    subscribe()
  }, [])

  return null
}
