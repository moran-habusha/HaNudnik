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

export async function subscribeToPush(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) return false

    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()

    if (!sub) {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') return false
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
    }

    const { endpoint, keys } = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
    const platform = getPlatform()

    await supabase.from('push_subscriptions')
      .delete()
      .eq('user_id', user.id)
      .eq('platform', platform)
      .neq('endpoint', endpoint)

    await supabase.from('push_subscriptions').upsert({
      user_id: user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      platform,
    }, { onConflict: 'user_id,endpoint' })

    return true
  } catch (e) {
    console.error('push subscribe error', e)
    return false
  }
}

export default function PushSubscribe() {
  useEffect(() => {
    subscribeToPush()
  }, [])

  return null
}
