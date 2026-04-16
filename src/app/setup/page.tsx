'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function SetupPage() {
  const [step, setStep] = useState<'choose' | 'create' | 'join'>('choose')
  const [apartmentName, setApartmentName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function createApartment() {
    setLoading(true)
    setError('')

    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) { router.push('/auth'); return }

    const { data: aptId, error: rpcError } = await supabase.rpc('create_apartment', {
      apt_name: apartmentName,
      apt_mode: 'solo',
    })

    if (rpcError) { setError(rpcError.message); setLoading(false); return }

    await supabase.rpc('ask_apartment_type', {
      p_user_id: user.id,
      p_apartment_id: aptId,
    })

    router.push('/bot')
  }

  async function joinApartment() {
    setLoading(true)
    setError('')
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) { router.push('/auth'); return }

    const { data: invite, error: inviteError } = await supabase
      .from('invites')
      .select('*')
      .eq('id', inviteCode.replace(/\s+/g, ''))
      .gt('expires_at', new Date().toISOString())
      .is('used_by', null)
      .single()

    if (inviteError || !invite) { setError('קישור לא תקין או שפג תוקפו'); setLoading(false); return }

    const { count } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('apartment_id', invite.apartment_id)

    if ((count ?? 0) >= 5) { setError('הדירה מלאה (מקסימום 5 דיירים)'); setLoading(false); return }

    await supabase.from('bot_messages').delete().eq('user_id', user.id)
    await supabase.from('profiles').update({ apartment_id: invite.apartment_id }).eq('id', user.id)
    await supabase.from('invites').update({ used_by: user.id, used_at: new Date().toISOString() }).eq('id', inviteCode.replace(/\s+/g, ''))

    // read mode after joining — RLS now allows it since profile is updated
    const { data: apt } = await supabase.from('apartments').select('mode').eq('id', invite.apartment_id).single()

    if (apt?.mode === 'solo') {
      await supabase.rpc('notify_solo_to_shared', { p_apartment_id: invite.apartment_id, p_new_user_id: user.id })
    } else {
      await supabase.rpc('notify_resident_joined', { p_new_user_id: user.id, p_apartment_id: invite.apartment_id })
      await supabase.rpc('send_onboarding_message', { p_user_id: user.id, p_apartment_id: invite.apartment_id })
    }

    router.push('/bot')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 w-full max-w-sm p-8" dir="rtl">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">ברוך הבא!</h1>
          <p className="text-gray-500 text-sm mt-1">רוצה ליצור דירה או להצטרף לקיימת?</p>
        </div>

        {step === 'choose' && (
          <div className="space-y-3">
            <button
              onClick={() => setStep('create')}
              className="w-full border-2 border-gray-900 rounded-xl p-4 text-right hover:bg-gray-50 transition-colors"
            >
              <div className="font-semibold text-gray-900">יצירת דירה חדשה</div>
            </button>
            <button
              onClick={() => setStep('join')}
              className="w-full border border-gray-200 rounded-xl p-4 text-right hover:bg-gray-50 transition-colors"
            >
              <div className="font-semibold text-gray-900">הצטרפות לדירה קיימת</div>
              <div className="text-sm text-gray-500 mt-0.5">יש לי קישור הזמנה</div>
            </button>
          </div>
        )}

        {step === 'create' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">שם הדירה</label>
              <input
                type="text"
                value={apartmentName}
                onChange={e => setApartmentName(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                placeholder='דירת הבלגן, פנטהאוז תל אביב...'
              />
            </div>

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <div className="flex gap-2">
              <button onClick={() => setStep('choose')} className="flex-1 border border-gray-200 rounded-lg py-2.5 text-sm">חזרה</button>
              <button
                onClick={createApartment}
                disabled={loading || !apartmentName.trim()}
                className="flex-1 bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50"
              >
                {loading ? 'רגע...' : 'יצירה'}
              </button>
            </div>
          </div>
        )}

        {step === 'join' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">קוד הזמנה</label>
              <input
                type="text"
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                placeholder="הדבק את קוד ההזמנה כאן"
              />
            </div>

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <div className="flex gap-2">
              <button onClick={() => setStep('choose')} className="flex-1 border border-gray-200 rounded-lg py-2.5 text-sm">חזרה</button>
              <button
                onClick={joinApartment}
                disabled={loading || !inviteCode.trim()}
                className="flex-1 bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50"
              >
                {loading ? 'רגע...' : 'הצטרפות'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
