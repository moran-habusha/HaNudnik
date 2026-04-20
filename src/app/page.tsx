'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()
  const supabase = createClient()
  const [isAndroid, setIsAndroid] = useState(false)

  useEffect(() => {
    const android = /Android/i.test(navigator.userAgent)
    setIsAndroid(android)

    async function checkAuth() {
      const [{ data: { session } }] = await Promise.all([
        supabase.auth.getSession(),
        android ? Promise.resolve() : new Promise(r => setTimeout(r, 1500)),
      ])
      const user = session?.user
      if (!user) { router.push('/auth'); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('apartment_id')
        .eq('id', user.id)
        .single()

      if (!profile?.apartment_id) {
        router.push('/setup')
      } else {
        router.push('/dashboard')
      }
    }
    checkAuth()
  }, [])

  if (isAndroid) return null

  return (
    <div className="h-screen overflow-hidden flex items-center justify-center" style={{ backgroundColor: '#BBBBF7' }}>
      <img src="/HaNudnik Logo.png" alt="HaNudnik" className="w-72 h-72 object-contain" />
    </div>
  )
}
