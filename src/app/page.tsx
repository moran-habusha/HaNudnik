'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function checkAuth() {
      const { data: { user } } = await supabase.auth.getUser()
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

  return (
    <div className="h-screen overflow-hidden flex items-center justify-center" style={{ backgroundColor: '#BBBBF7' }}>
      <img src="/HaNudnik Logo.png" alt="HaNudnik" className="w-48 h-48 object-contain" />
    </div>
  )
}
