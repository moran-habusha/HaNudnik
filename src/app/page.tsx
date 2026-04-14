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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-400 text-sm">טוען...</div>
    </div>
  )
}
