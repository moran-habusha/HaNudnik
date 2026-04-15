'use client'

import { useEffect } from 'react'

export default function SwRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    let reg: ServiceWorkerRegistration | null = null

    navigator.serviceWorker.register('/sw.js').then(r => {
      reg = r
    })

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload()
    })

    const checkUpdate = () => {
      if (reg && !document.hidden) reg.update()
    }

    document.addEventListener('visibilitychange', checkUpdate)
    window.addEventListener('focus', checkUpdate)

    return () => {
      document.removeEventListener('visibilitychange', checkUpdate)
      window.removeEventListener('focus', checkUpdate)
    }
  }, [])

  return null
}
