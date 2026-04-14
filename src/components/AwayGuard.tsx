'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import BottomNav from './BottomNav'

const SKIP_PATHS = ['/auth', '/setup']

export default function AwayGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const [status, setStatus] = useState<'loading' | 'away' | 'active'>('loading')
  const [gender, setGender] = useState<string>('male')
  const [returnDate, setReturnDate] = useState<string>('')
  const [newDate, setNewDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  const skip = SKIP_PATHS.some(p => pathname?.startsWith(p))

  useEffect(() => {
    if (skip) { setStatus('active'); return }
    checkAway()
  }, [pathname])

  async function checkAway() {
    setStatus('loading')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setStatus('active'); return }
    setUserId(user.id)
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_away, away_return_date, gender')
      .eq('id', user.id)
      .single()
    if (!profile) { setStatus('active'); return }
    setGender(profile.gender ?? 'male')
    if (profile.is_away) {
      setReturnDate(profile.away_return_date ?? '')
      setNewDate(profile.away_return_date ?? '')
      setStatus('away')
    } else {
      setStatus('active')
    }
  }

  async function returnNow() {
    setSaving(true)
    await supabase.rpc('return_from_away')
    setStatus('active')
    router.push('/dashboard')
  }

  async function updateDate() {
    if (!newDate || !userId) return
    setSaving(true)
    await supabase.from('profiles').update({ away_return_date: newDate }).eq('id', userId)
    setReturnDate(newDate)
    setSaving(false)
  }

  if (status === 'loading') return null

  if (status === 'away') {
    const isFemale = gender === 'female'
    const formattedDate = returnDate
      ? new Date(returnDate + 'T00:00:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })
      : null

    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4" dir="rtl">
        <div className="bg-white rounded-2xl border border-gray-100 p-6 w-full max-w-sm">
          <div className="text-center mb-6">
            <p className="text-5xl mb-3">✈️</p>
            <h1 className="text-lg font-bold text-gray-900">
              {isFemale ? 'את במצב AWAY' : 'אתה במצב AWAY'}
            </h1>
            {formattedDate && (
              <p className="text-sm text-gray-500 mt-1">
                תאריך חזרה מתוכנן: {formattedDate}
              </p>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">שנה תאריך חזרה</label>
              <input
                type="date"
                value={newDate}
                onChange={e => setNewDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <button
              onClick={updateDate}
              disabled={saving || !newDate || newDate === returnDate}
              className="w-full bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-40"
            >
              {saving ? '...' : 'עדכן תאריך'}
            </button>

            <div className="border-t border-gray-100 pt-3">
              <button
                onClick={returnNow}
                disabled={saving}
                className="w-full border border-gray-200 rounded-lg py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                {saving ? '...' : '🏠 חזרתי - בטל מצב AWAY'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      {children}
      <BottomNav />
    </>
  )
}
