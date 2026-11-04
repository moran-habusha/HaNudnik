'use client'

import { useEffect } from 'react'

export default function BabiezSwRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/babiez-sw.js', { scope: '/babiez/' }).catch(() => {})
  }, [])

  return null
}
