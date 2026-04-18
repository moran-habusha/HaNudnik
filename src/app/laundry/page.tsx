'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type LaundryEntry = {
  user_id: string
  display_name: string
  request: string
  updated_at: string | null
}

type MachineStatus = {
  id: string
  started_by: string
  started_at: string
  duration_minutes: number
  machine_type: string
}

type HistoryEntry = {
  user_id: string
  display_name: string
  done: string[]
  kept: string[]
}

type LaundryHistoryRecord = {
  id: string
  started_at: string
  finished_at: string
  entries: HistoryEntry[]
}

export default function LaundryPage() {
  const [entries, setEntries] = useState<LaundryEntry[]>([])
  const [myUserId, setMyUserId] = useState<string | null>(null)
  const [apartmentId, setApartmentId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [saving, setSaving] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [aptMode, setAptMode] = useState<string | null>(null)
  const [machine, setMachine] = useState<MachineStatus | null>(null)
  const [showDurationModal, setShowDurationModal] = useState(false)
  const [durationInput, setDurationInput] = useState('')
  const [savingMachine, setSavingMachine] = useState(false)
  const [doneChecked, setDoneChecked] = useState<Set<string>>(new Set())
  const [history, setHistory] = useState<LaundryHistoryRecord[]>([])
  const [showDismissModal, setShowDismissModal] = useState(false)
  const [dismissRestoreRequests, setDismissRestoreRequests] = useState(false)
  const [isExtraWash, setIsExtraWash] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      const len = textareaRef.current.value.length
      textareaRef.current.focus()
      textareaRef.current.setSelectionRange(len, len)
    }
  }, [isEditing])

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) { router.push('/auth'); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('apartment_id')
        .eq('id', user.id)
        .single()

      if (!profile?.apartment_id) { router.push('/setup'); return }
      setApartmentId(profile.apartment_id)

      const { data: apt } = await supabase.from('apartments').select('mode').eq('id', profile.apartment_id).single()
      setAptMode(apt?.mode ?? null)

      const { data } = await supabase.rpc('get_laundry_requests')
      const list: LaundryEntry[] = data ?? []
      const mine = list.find(e => e.user_id === user.id)
      setEntries(list)
      setMyUserId(user.id)
      setEditText(mine?.request ?? '')

      const { data: machineData } = await supabase
        .from('laundry_machine')
        .select('id, started_by, started_at, duration_minutes, machine_type')
        .eq('apartment_id', profile.apartment_id)
        .single()
      setMachine(machineData ?? null)

      const { data: histData } = await supabase
        .from('laundry_history')
        .select('id, started_at, finished_at, entries')
        .eq('apartment_id', profile.apartment_id)
        .order('started_at', { ascending: false })
        .limit(2)
      setHistory(histData ?? [])

      setLoaded(true)
    }
    load()
  }, [])

  useEffect(() => {
    if (!apartmentId || !myUserId) return
    async function refetch() {
      const [{ data: req }, { data: machineData }, { data: histData }] = await Promise.all([
        supabase.rpc('get_laundry_requests'),
        supabase.from('laundry_machine').select('id, started_by, started_at, duration_minutes, machine_type').eq('apartment_id', apartmentId!).maybeSingle(),
        supabase.from('laundry_history').select('id, started_at, finished_at, entries').eq('apartment_id', apartmentId!).order('started_at', { ascending: false }).limit(2),
      ])
      setEntries(req ?? [])
      setMachine(machineData ?? null)
      setHistory(histData ?? [])
    }
    const channel = supabase
      .channel('laundry-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'laundry_requests', filter: `apartment_id=eq.${apartmentId}` }, refetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'laundry_machine', filter: `apartment_id=eq.${apartmentId}` }, refetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'laundry_history', filter: `apartment_id=eq.${apartmentId}` }, refetch)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [apartmentId, myUserId])

  async function saveAndClose() {
    setSaving(true)
    const { error } = await supabase.rpc('upsert_laundry_request', { p_request: editText })
    if (error) {
      alert('שגיאה בשמירה: ' + error.message)
    } else {
      setEntries(prev => prev.map(e =>
        e.user_id === myUserId ? { ...e, request: editText } : e
      ))
      setIsEditing(false)
    }
    setSaving(false)
  }

  async function startMachine() {
    const mins = parseInt(durationInput)
    if (!mins || mins <= 0 || !apartmentId || !myUserId) return
    setSavingMachine(true)

    const startedAt = new Date().toISOString()

    // Build history entries from checked items
    const histEntries: HistoryEntry[] = entriesWithRequest.map(entry => {
      const lines = entry.request.split('\n').filter(l => l.trim())
      const done = lines.filter((_, i) => doneChecked.has(`${entry.user_id}::${i}`)).map(l => l.replace(/^[•\-]\s*/, ''))
      const kept = lines.filter((_, i) => !doneChecked.has(`${entry.user_id}::${i}`)).map(l => l.replace(/^[•\-]\s*/, ''))
      return { user_id: entry.user_id, display_name: entry.display_name, done, kept }
    })

    // Save machine record
    await supabase.from('laundry_machine').upsert({
      apartment_id: apartmentId,
      started_by: myUserId,
      started_at: startedAt,
      duration_minutes: mins,
      machine_type: 'wash',
    }, { onConflict: 'apartment_id' })

    // Save history
    await supabase.from('laundry_history').insert({
      apartment_id: apartmentId,
      started_at: startedAt,
      finished_at: new Date(Date.now() + mins * 60000).toISOString(),
      duration_minutes: mins,
      entries: histEntries,
    })

    // Update requests — keep only unchecked lines
    for (const entry of entriesWithRequest) {
      const lines = entry.request.split('\n').filter(l => l.trim())
      const remaining = lines.filter((_, i) => !doneChecked.has(`${entry.user_id}::${i}`))
      const newRequest = remaining.join('\n')
      if (entry.user_id === myUserId) {
        await supabase.rpc('upsert_laundry_request', { p_request: newRequest })
      } else {
        await supabase.rpc('update_laundry_request_for_user', { p_user_id: entry.user_id, p_request: newRequest })
      }
    }

    // Complete wash task → gives points + creates hang task (skip for extra wash cycle)
    if (!isExtraWash) {
      await supabase.rpc('complete_wash_task', { p_apartment_id: apartmentId })
    }
    await supabase.rpc('finish_laundry_machine', { p_apartment_id: apartmentId })
    setIsExtraWash(false)

    const { data: machineData } = await supabase
      .from('laundry_machine')
      .select('id, started_by, started_at, duration_minutes, machine_type')
      .eq('apartment_id', apartmentId)
      .single()
    setMachine(machineData ?? null)

    const { data: reqData } = await supabase.rpc('get_laundry_requests')
    const list: LaundryEntry[] = reqData ?? []
    setEntries(list)
    setEditText(list.find(e => e.user_id === myUserId)?.request ?? '')

    const { data: histData } = await supabase
      .from('laundry_history')
      .select('id, started_at, finished_at, entries')
      .eq('apartment_id', apartmentId)
      .order('started_at', { ascending: false })
      .limit(2)
    setHistory(histData ?? [])

    setShowDurationModal(false)
    setDurationInput('')
    setDoneChecked(new Set())
    setSavingMachine(false)
  }

  async function dismissMachine() {
    if (!apartmentId || !machine) return
    setDismissRestoreRequests(false)
    setShowDismissModal(true)
  }

  async function confirmDismissMachine() {
    if (!apartmentId || !machine) return
    setShowDismissModal(false)
    await supabase.rpc('cancel_laundry_machine', {
      p_apartment_id: apartmentId,
      p_restore_requests: dismissRestoreRequests,
    })
    setMachine(null)
  }

  function machineEndTime() {
    if (!machine) return ''
    const end = new Date(new Date(machine.started_at).getTime() + machine.duration_minutes * 60000)
    return end.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
  }

  function machineStartTime() {
    if (!machine) return ''
    return new Date(machine.started_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
  }

  function toggleDone(key: string) {
    setDoneChecked(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const myEntry = entries.find(e => e.user_id === myUserId)
  const othersEntries = entries.filter(e => e.user_id !== myUserId)
  const entriesWithRequest = entries.filter(e => e.request?.trim())

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <header className="bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/dashboard')} className="text-gray-500 hover:text-gray-900">→</button>
        <h1 className="font-bold text-gray-900">🧺 כביסה</h1>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-4" style={{ visibility: loaded ? 'visible' : 'hidden' }}>

        {/* Machine status / activate banner */}
        {machine ? (
          <div className={`border rounded-xl p-4 ${machine.machine_type === 'dry' ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'}`}>
            <div className="flex items-center justify-between mb-1">
              <p className={`font-semibold text-sm ${machine.machine_type === 'dry' ? 'text-red-900' : 'text-blue-900'}`}>
                {machine.machine_type === 'dry' ? '🌀 מייבש פועל' : '🧺 מכונה פועלת'}
              </p>
              <button onClick={dismissMachine} className={`text-lg leading-none ${machine.machine_type === 'dry' ? 'text-red-400 hover:text-red-600' : 'text-blue-400 hover:text-blue-600'}`}>✕</button>
            </div>
            <p className={`text-xs ${machine.machine_type === 'dry' ? 'text-red-700' : 'text-blue-700'}`}>הופעלה ב-{machineStartTime()} · מסתיימת בערך ב-{machineEndTime()}</p>
            <button
              onClick={() => { setIsExtraWash(true); setShowDurationModal(true) }}
              className="mt-2 text-xs text-blue-500 border border-blue-200 rounded-full px-3 py-1 hover:bg-blue-50 bg-white"
            >🧺 הפעל מכונה נוספת</button>
          </div>
        ) : (
          <button
            onClick={() => setShowDurationModal(true)}
            className="w-full bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-right"
          >
            <p className="font-semibold text-indigo-900 text-sm">הפעלת מכונה 🧺</p>
            <p className="text-xs text-indigo-600 mt-0.5">{aptMode === 'solo' ? 'לחצי כאן כדי לסמן הפעלת מכונה' : 'לחצי כדי לעדכן את הדיירים'}</p>
          </button>
        )}

        {/* My request */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold text-gray-500 uppercase">{aptMode === 'solo' ? 'התזכורות שלי' : 'הבקשה שלי'}</h2>
            {!isEditing && (
              <button
                onClick={() => { if (!myEntry?.request) setEditText('• '); setIsEditing(true) }}
                className="text-xs text-gray-500 hover:text-gray-900 border border-gray-200 rounded px-2 py-0.5"
              >עריכה</button>
            )}
          </div>

          {isEditing ? (
            <>
              <textarea
                value={editText}
                onChange={e => setEditText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    const ta = e.currentTarget
                    const pos = ta.selectionStart
                    const before = editText.slice(0, pos)
                    const after = editText.slice(pos)
                    const currentLine = before.split('\n').pop() ?? ''
                    const isBullet = currentLine.startsWith('• ')
                    if (isBullet && currentLine.trim() === '•') {
                      setEditText(before.slice(0, before.lastIndexOf('• ')) + after)
                      return
                    }
                    const insert = isBullet ? '\n• ' : '\n'
                    setEditText(before + insert + after)
                    setTimeout(() => ta.setSelectionRange(pos + insert.length, pos + insert.length), 0)
                  }
                }}
                placeholder="למשל: צריך בגדי ספורט נקיים עד יום שלישי"
                ref={textareaRef}
                rows={4}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => { setIsEditing(false); setEditText(myEntry?.request ?? '') }}
                  className="flex-1 border border-gray-200 rounded-lg py-2 text-sm"
                >ביטול</button>
                <button
                  onClick={saveAndClose}
                  disabled={saving}
                  className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-40"
                >{saving ? '...' : 'שמור'}</button>
              </div>
            </>
          ) : (
            myEntry?.request ? (
              <div className="text-sm text-gray-800 space-y-0.5">
                {myEntry.request.split('\n').map((line, i) => (
                  <p key={i} className={line.startsWith('• ') || /^\d+\./.test(line) ? 'pr-1' : ''}>{line || '\u00A0'}</p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">{aptMode === 'solo' ? 'לא הוספו תזכורות' : 'לא הוספת בקשה עדיין'}</p>
            )
          )}
        </div>

        {/* Others' requests */}
        {othersEntries.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold text-gray-500 uppercase mb-2">בקשות שאר הדיירים</h2>
            <div className="space-y-2">
              {othersEntries.map(entry => (
                <div key={entry.user_id} className="bg-white rounded-xl border border-gray-100 p-4">
                  <p className="text-xs font-semibold text-gray-500 mb-1">{entry.display_name}</p>
                  {entry.request ? (
                    <div className="text-sm text-gray-800 space-y-0.5">
                      {entry.request.split('\n').map((line, i) => (
                        <p key={i}>{line || '\u00A0'}</p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 italic">אין בקשה</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {loaded && entries.length <= 1 && othersEntries.length === 0 && (
          <div className="text-center text-gray-400 text-sm py-4">אין דיירים נוספים בדירה</div>
        )}

        {/* Laundry history */}
        {history.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold text-gray-400 uppercase mb-2">כביסות אחרונות</h2>
            <div className="space-y-3">
              {history.map(record => (
                <div key={record.id} className="bg-white rounded-xl border border-gray-100 p-4">
                  <p className="text-xs font-semibold text-gray-500 mb-3">
                    {new Date(record.started_at).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })}
                    {' · '}
                    {new Date(record.started_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                    {'–'}
                    {new Date(record.finished_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <div className="space-y-3">
                    {(record.entries as HistoryEntry[]).map(entry => (
                      <div key={entry.user_id}>
                        <p className="text-xs font-semibold text-gray-500 mb-1">{entry.display_name}</p>
                        {entry.done.length > 0 && (
                          <div className="space-y-0.5">
                            {entry.done.map((item, i) => (
                              <p key={i} className="text-sm text-green-700">✓ {item}</p>
                            ))}
                          </div>
                        )}
                        {entry.kept.length > 0 && (
                          <div className="space-y-0.5 mt-0.5">
                            {entry.kept.map((item, i) => (
                              <p key={i} className="text-sm text-gray-400">↩ {item} <span className="text-xs">(נשמר)</span></p>
                            ))}
                          </div>
                        )}
                        {entry.done.length === 0 && entry.kept.length === 0 && (
                          <p className="text-sm text-gray-300 italic">לא הייתה בקשה</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Duration + requests modal */}
      {showDurationModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">הפעלת מכונת כביסה</h2>
              <button onClick={() => { setShowDurationModal(false); setDurationInput(''); setDoneChecked(new Set()) }} className="text-gray-400">✕</button>
            </div>

            <p className="text-sm text-gray-500 mb-3">כמה זמן התוכנית? (בדקות)</p>
            <input
              type="number"
              value={durationInput}
              onChange={e => setDurationInput(e.target.value)}
              placeholder="למשל: 90"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-lg font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-3"
              autoFocus
            />
            <div className="flex gap-2 flex-wrap mb-5">
              {[60, 90, 120].map(m => (
                <button
                  key={m}
                  onClick={() => setDurationInput(String(m))}
                  className={`px-4 py-2 rounded-full text-sm border transition-colors ${durationInput === String(m) ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >{m} דקות</button>
              ))}
            </div>

            {entriesWithRequest.length > 0 && (
              <>
                <div className="border-t border-gray-100 pt-4 mb-3">
                  <p className="text-sm text-gray-500 mb-3">מה נכנס לכביסה? (סמני את הבקשות שבוצעו)</p>
                  <div className="space-y-3">
                    {entriesWithRequest.map(entry => {
                      const lines = entry.request.split('\n').filter(l => l.trim())
                      return (
                        <div key={entry.user_id}>
                          {entriesWithRequest.length > 1 && (
                            <p className="text-xs font-semibold text-gray-400 mb-1 px-1">{entry.display_name}</p>
                          )}
                          <div className="space-y-1.5">
                            {lines.map((line, i) => {
                              const key = `${entry.user_id}::${i}`
                              const checked = doneChecked.has(key)
                              return (
                                <button
                                  key={key}
                                  onClick={() => toggleDone(key)}
                                  className={`w-full flex items-center gap-3 p-3 rounded-xl border text-right transition-colors ${
                                    checked ? 'border-green-300 bg-green-50' : 'border-gray-100 bg-white hover:bg-gray-50'
                                  }`}
                                >
                                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                                    checked ? 'border-green-500 bg-green-500' : 'border-gray-300'
                                  }`}>
                                    {checked && <span className="text-white text-xs">✓</span>}
                                  </div>
                                  <p className={`text-sm flex-1 text-right ${checked ? 'line-through text-gray-400' : 'text-gray-900'}`}>{line.replace(/^[•\-]\s*/, '')}</p>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </>
            )}

            <div className="flex gap-2 mt-4">
              <button onClick={() => { setShowDurationModal(false); setDurationInput(''); setDoneChecked(new Set()) }} className="flex-1 border border-gray-200 rounded-xl py-3 text-sm">ביטול</button>
              <button
                onClick={startMachine}
                disabled={!durationInput || parseInt(durationInput) <= 0 || savingMachine}
                className="flex-1 bg-indigo-600 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-40"
              >{savingMachine ? '...' : 'הפעלתי 🧺'}</button>
            </div>
          </div>
        </div>
      )}
      {/* Dismiss machine modal */}
      {showDismissModal && machine && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-4" dir="rtl">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900">ביטול הפעלת {machine.machine_type === 'dry' ? 'המייבש' : 'המכונה'}</h2>
              <button onClick={() => setShowDismissModal(false)} className="text-gray-400">✕</button>
            </div>
            {machine.machine_type === 'wash' && (
              <label className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 mb-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={dismissRestoreRequests}
                  onChange={e => setDismissRestoreRequests(e.target.checked)}
                  className="w-4 h-4 accent-indigo-600"
                />
                <span className="text-sm text-gray-700">החזר את בקשות הכביסה שסומנו בהפעלה הזאת</span>
              </label>
            )}
            <div className="flex gap-2">
              <button onClick={() => setShowDismissModal(false)} className="flex-1 border border-gray-200 rounded-lg py-2.5 text-sm">חזור</button>
              <button onClick={confirmDismissMachine} className="flex-1 bg-red-500 text-white rounded-lg py-2.5 text-sm font-medium">בטל הפעלה</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
