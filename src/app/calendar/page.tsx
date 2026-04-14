'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'

const COLORS = ['#C7CEEA', '#B5EAD7', '#A8D8EA', '#FFD9A0', '#FFF5B1']
const DAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']
const MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר']

type Profile = {
  id: string
  display_name: string
  joined_at: string
  is_away: boolean
  away_return_date: string | null
  away_start_date: string | null
  gender: string | null
}

type CalendarEvent = {
  id: string
  title: string
  description: string | null
  event_date: string
  event_time: string | null
  created_by: string
  reminder_days_before: number[] | null
}

type CalendarInvitee = {
  id: string
  event_id: string
  user_id: string
  status: 'pending' | 'confirmed' | 'declined'
  reminder_days_before: number[] | null
}

export default function CalendarPage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [apartmentId, setApartmentId] = useState<string | null>(null)
  const [pageLoading, setPageLoading] = useState(true)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [invitees, setInvitees] = useState<Record<string, CalendarInvitee[]>>({})
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showDayModal, setShowDayModal] = useState(false)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newDate, setNewDate] = useState('')
  const [newTime, setNewTime] = useState('')
  const [selectedInvitees, setSelectedInvitees] = useState<Set<string>>(new Set())
  const [newReminderDays, setNewReminderDays] = useState<number[]>([])
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [savingReminder, setSavingReminder] = useState(false)
  const [pendingRsvp, setPendingRsvp] = useState<Record<string, 'confirmed' | 'declined'>>({}) // eventId -> pending status
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth'); return }
      setUserId(user.id)

      const { data: profile } = await supabase
        .from('profiles')
        .select('apartment_id')
        .eq('id', user.id)
        .single()

      if (!profile?.apartment_id) { router.push('/setup'); return }
      setApartmentId(profile.apartment_id)

      const evList = await Promise.all([
        fetchProfiles(profile.apartment_id),
        fetchEvents(profile.apartment_id),
      ]).then(results => results[1] as CalendarEvent[])
      setPageLoading(false)

      // open event modal from query param (e.g. from bot "צפה באירוע")
      const eventId = searchParams.get('event')
      if (eventId && evList) {
        const ev = evList.find((e: CalendarEvent) => e.id === eventId)
        if (ev) {
          setSelectedDay(ev.event_date)
          setShowDayModal(true)
        }
      }
    }
    load()
  }, [])

  useEffect(() => {
    if (!apartmentId) return
    const channel = supabase
      .channel('calendar-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events', filter: `apartment_id=eq.${apartmentId}` }, () => fetchEvents(apartmentId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_invitees' }, () => fetchEvents(apartmentId))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [apartmentId])

  async function fetchProfiles(aptId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name, joined_at, is_away, away_return_date, away_start_date, gender')
      .eq('apartment_id', aptId)
      .order('joined_at', { ascending: true })

    if (!data) return
    setProfiles(data as Profile[])
  }

  async function fetchEvents(aptId: string): Promise<CalendarEvent[]> {
    const { data: eventsData } = await supabase
      .from('calendar_events')
      .select('id, title, description, event_date, event_time, created_by, reminder_days_before')
      .eq('apartment_id', aptId)

    const evList = eventsData ?? []
    setEvents(evList)

    if (evList.length > 0) {
      const { data: invData } = await supabase
        .from('calendar_invitees')
        .select('id, event_id, user_id, status, reminder_days_before')
        .in('event_id', evList.map(e => e.id))

      if (invData) {
        const grouped: Record<string, CalendarInvitee[]> = {}
        for (const inv of invData) {
          if (!grouped[inv.event_id]) grouped[inv.event_id] = []
          grouped[inv.event_id].push(inv)
        }
        setInvitees(grouped)
      }
    }
    return evList
  }

  function colorOf(uid: string) {
    const idx = profiles.findIndex(p => p.id === uid)
    return idx >= 0 ? COLORS[idx % COLORS.length] : '#9ca3af'
  }

  function nameOf(uid: string) {
    return profiles.find(p => p.id === uid)?.display_name ?? ''
  }

  // Event bar segments: creator always solid, invitees solid if confirmed / stripes if pending
  function gridBarSegments(e: CalendarEvent) {
    const evInvitees = invitees[e.id] ?? []
    const parts = [
      { color: colorOf(e.created_by), status: 'confirmed' as string },
      ...evInvitees.map(i => ({ color: colorOf(i.user_id), status: i.status as string }))
    ]
    return parts.sort((a, b) => (a.status === 'declined' ? 1 : 0) - (b.status === 'declined' ? 1 : 0))
  }

  // Build calendar grid
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1)
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  function dateStr(day: number) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  function eventsOnDay(day: number) {
    return events.filter(e => e.event_date === dateStr(day))
  }

  function openDay(day: number) {
    setSelectedDay(dateStr(day))
    setSelectedEventId(null)
    setShowDayModal(true)
  }

  function openAdd(prefillDate?: string) {
    setEditingEvent(null)
    setNewTitle('')
    setNewDesc('')
    setNewDate(prefillDate ?? dateStr(new Date().getDate()))
    setNewTime('')
    setSelectedInvitees(new Set())
    setNewReminderDays([])
    setShowAddModal(true)
  }

  function openEdit(event: CalendarEvent) {
    setEditingEvent(event)
    setNewTitle(event.title)
    setNewDesc(event.description ?? '')
    setNewDate(event.event_date)
    setNewTime(event.event_time ?? '')
    const evInvitees = invitees[event.id] ?? []
    setSelectedInvitees(new Set(evInvitees.map(i => i.user_id)))
    setNewReminderDays(event.reminder_days_before ?? [])
    setShowAddModal(true)
    setShowDayModal(false)
  }

  function toggleInvitee(id: string) {
    setSelectedInvitees(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function saveEvent() {
    if (!newTitle.trim() || !newDate || !apartmentId || !userId) return

    if (editingEvent) {
      await supabase.from('calendar_events').update({
        title: newTitle.trim(),
        description: newDesc.trim() || null,
        event_date: newDate,
        event_time: newTime || null,
      }).eq('id', editingEvent.id)

      // Find existing invitees from local state
      const existingIds = new Set((invitees[editingEvent.id] ?? []).map(i => i.user_id))
      const newInvitees = Array.from(selectedInvitees).filter(uid => !existingIds.has(uid))

      // Replace invitees
      await supabase.from('calendar_invitees').delete().eq('event_id', editingEvent.id)
      if (selectedInvitees.size > 0) {
        await supabase.from('calendar_invitees').insert(
          Array.from(selectedInvitees).map(uid => ({
            event_id: editingEvent.id,
            user_id: uid,
            status: 'pending',
          }))
        )
      }

      // Send bot messages only to newly added invitees
      if (newInvitees.length > 0) {
        const myName = nameOf(userId)
        const dateDisplay = new Date(editingEvent.event_date + 'T12:00:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })
        const timeStr = editingEvent.event_time ? ` בשעה ${editingEvent.event_time.slice(0, 5)}` : ''
        await supabase.rpc('send_calendar_invite_notifications', {
          p_event_id: editingEvent.id,
          p_invitee_ids: newInvitees,
          p_sender_name: myName,
          p_title: newTitle.trim(),
          p_date_display: dateDisplay,
          p_time_str: timeStr,
          p_apartment_id: apartmentId,
        })
      }
    } else {
      const { data: newEvent } = await supabase
        .from('calendar_events')
        .insert({
          apartment_id: apartmentId,
          created_by: userId,
          title: newTitle.trim(),
          description: newDesc.trim() || null,
          event_date: newDate,
          event_time: newTime || null,
          reminder_days_before: newReminderDays.length > 0 ? newReminderDays : null,
        })
        .select('id')
        .single()

      if (newEvent && selectedInvitees.size > 0) {
        await supabase.from('calendar_invitees').insert(
          Array.from(selectedInvitees).map(uid => ({
            event_id: newEvent.id,
            user_id: uid,
            status: 'pending',
          }))
        )

        // Bot message for each invitee (via SECURITY DEFINER to bypass RLS)
        const myName = nameOf(userId)
        const dateDisplay = new Date(newDate + 'T12:00:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })
        const timeStr = newTime ? ` בשעה ${newTime.slice(0, 5)}` : ''

        const { error: inviteErr } = await supabase.rpc('send_calendar_invite_notifications', {
          p_event_id: newEvent.id,
          p_invitee_ids: Array.from(selectedInvitees),
          p_sender_name: myName,
          p_title: newTitle.trim(),
          p_date_display: dateDisplay,
          p_time_str: timeStr,
          p_apartment_id: apartmentId,
        })
        if (inviteErr) console.error('calendar invite error:', inviteErr)
      }
    }

    setShowAddModal(false)
    setEditingEvent(null)
    await fetchEvents(apartmentId)
  }

  async function deleteEvent(id: string) {
    if (!apartmentId) return
    await supabase.from('calendar_events').delete().eq('id', id)
    setShowDayModal(false)
    await fetchEvents(apartmentId)
  }

  async function setReminder(event: CalendarEvent, days: number[]) {
    if (!apartmentId || !userId) return
    setSavingReminder(true)
    const val = days.length > 0 ? days : null
    if (event.created_by === userId) {
      await supabase.from('calendar_events').update({ reminder_days_before: val }).eq('id', event.id)
    } else {
      await supabase.from('calendar_invitees').update({ reminder_days_before: val }).eq('event_id', event.id).eq('user_id', userId)
    }
    await fetchEvents(apartmentId)
    setSavingReminder(false)
  }

  function myReminderDays(event: CalendarEvent): number[] {
    if (event.created_by === userId) return event.reminder_days_before ?? []
    const inv = (invitees[event.id] ?? []).find(i => i.user_id === userId)
    return inv?.reminder_days_before ?? []
  }

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const twoWeeksFromNow = new Date(today); twoWeeksFromNow.setDate(today.getDate() + 14)
  const twoWeeksStr = twoWeeksFromNow.toISOString().slice(0, 10)
  // Map from date string → profiles departing that day (within 2 weeks)
  const departureDayMap: Record<string, Profile[]> = {}
  for (const p of profiles) {
    if (p.away_start_date && p.away_start_date >= todayStr && p.away_start_date <= twoWeeksStr) {
      if (!departureDayMap[p.away_start_date]) departureDayMap[p.away_start_date] = []
      departureDayMap[p.away_start_date].push(p)
    }
  }

  // Map from date string → profiles returning that day
  const returnDayMap: Record<string, Profile[]> = {}
  for (const p of profiles) {
    if (p.away_return_date) {
      if (!returnDayMap[p.away_return_date]) returnDayMap[p.away_return_date] = []
      returnDayMap[p.away_return_date].push(p)
    }
  }

  const dayEvents = selectedDay ? events.filter(e => e.event_date === selectedDay) : []
  const otherProfiles = profiles.filter(p => p.id !== userId)

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <header className="bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/dashboard')} className="text-gray-500 hover:text-gray-900">→</button>
        <h1 className="font-bold text-gray-900 flex-1">📅 לוח שנה</h1>
        <button
          onClick={() => openAdd()}
          className="bg-indigo-600 text-white rounded-lg px-3 py-1.5 text-sm font-medium"
        >+ הוסף</button>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-4">

        {/* Month navigation */}
        <div className="flex items-center justify-between">
          <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="text-gray-500 hover:text-gray-900 px-2 py-1 text-lg">‹</button>
          <h2 className="font-semibold text-gray-900">{MONTHS[month]} {year}</h2>
          <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="text-gray-500 hover:text-gray-900 px-2 py-1 text-lg">›</button>
        </div>

        {/* Calendar grid */}
        <div className={`bg-white rounded-xl border border-gray-100 overflow-hidden transition-opacity duration-200 ${pageLoading ? 'opacity-0' : 'opacity-100'}`}>
          {/* Day headers */}
          <div className="grid grid-cols-7">
            {DAYS.map((d, i) => (
              <div key={d} className={`text-center text-xs font-semibold py-2 ${i >= 5 ? 'text-blue-400' : 'text-gray-400'}`}>{d}</div>
            ))}
          </div>

          {/* Cells */}
          <div className="grid grid-cols-7 border-t border-gray-100">
            {cells.map((day, i) => {
              const colIndex = i % 7
              const isWeekend = colIndex >= 5
              const isToday = day !== null && dateStr(day) === todayStr
              const dayEvs = day !== null ? eventsOnDay(day) : []

              return (
                <div
                  key={i}
                  onClick={() => day && openDay(day)}
                  className={`min-h-[56px] border-b border-l border-gray-50 p-1 flex flex-col gap-0.5
                    ${day ? 'cursor-pointer hover:bg-gray-50' : ''}
                    ${isWeekend && day ? 'bg-blue-50/40' : ''}
                  `}
                >
                  {day && (
                    <>
                      <span className={`text-xs font-medium self-center w-6 h-6 flex items-center justify-center rounded-full
                        ${isToday ? 'bg-indigo-600 text-white' : 'text-gray-700'}
                      `}>{day}</span>
                      <div className="flex flex-col gap-px w-full">
                        {dayEvs.slice(0, 3).map(e => (
                          <div key={e.id} className="w-full h-1 rounded-full overflow-hidden flex">
                            {gridBarSegments(e).map((seg, si, arr) => (
                              <div
                                key={si}
                                className="flex-1 h-full"
                                style={{
                                  ...(seg.status === 'confirmed'
                                    ? { background: seg.color }
                                    : seg.status === 'declined'
                                    ? { background: '#e5e7eb' }
                                    : { background: `repeating-linear-gradient(45deg, ${seg.color}, ${seg.color} 3px, white 3px, white 5px)` }
                                  ),
                                  ...(si < arr.length - 1 ? { borderRight: '1px solid rgba(0,0,0,0.2)' } : {})
                                }}
                              />
                            ))}
                          </div>
                        ))}
                        {dayEvs.length > 3 && (
                          <span className="text-[9px] text-gray-400 text-center">+{dayEvs.length - 3}</span>
                        )}
                        {departureDayMap[dateStr(day)]?.map(p => (
                          <div key={p.id} className="flex items-center gap-0.5 leading-none">
                            <span className="text-[10px]">🧳</span>
                            <span className="text-[8px] text-gray-500 truncate">{p.display_name.split(' ')[0]}</span>
                          </div>
                        ))}
                        {returnDayMap[dateStr(day)]?.map(p => (
                          <div key={p.id} className="flex items-center gap-0.5 leading-none">
                            <span className="text-[10px]">🏠</span>
                            <span className="text-[8px] text-gray-500 truncate">{p.display_name.split(' ')[0]}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Legend */}
        {profiles.length > 1 && (
          <div className="bg-white rounded-xl border border-gray-100 p-3 flex flex-wrap gap-x-4 gap-y-2">
            {profiles.map(p => {
              const returnLabel = p.away_return_date
                ? new Date(p.away_return_date + 'T00:00:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })
                : null
              return (
                <div key={p.id} className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: colorOf(p.id) }} />
                  <span className="text-xs text-gray-600">{p.display_name}</span>
                  {p.is_away && (
                    <span className="text-xs text-gray-400">
                      {returnLabel ? `· ✈️ חוזר/ת ${returnLabel}` : '· 🧳'}
                    </span>
                  )}
                  {!p.is_away && p.away_start_date && p.away_start_date >= todayStr && p.away_start_date <= twoWeeksStr && (
                    <span className="text-xs text-blue-400">
                      · 🧳 {p.gender === 'female' ? 'יוצאת' : 'יוצא'} ב-{new Date(p.away_start_date + 'T00:00:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}

      </main>

      {/* Day modal */}
      {showDayModal && selectedDay && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-4 max-h-[80vh] overflow-y-auto" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">
                {new Date(selectedDay + 'T12:00:00').toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}
              </h2>
              <button onClick={() => setShowDayModal(false)} className="text-gray-400">✕</button>
            </div>

            {dayEvents.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">אין אירועים ביום זה</p>
            )}

            <div className="space-y-2 mb-4">
              {dayEvents.map(e => {
                const evInvitees = invitees[e.id] ?? []
                const isShared = evInvitees.length > 0
                const allParts = isShared
                  ? ([{ uid: e.created_by, status: 'confirmed' as string }, ...evInvitees.map(i => ({ uid: i.user_id, status: i.status as string }))]
                      .sort((a, b) => (a.status === 'declined' ? 1 : 0) - (b.status === 'declined' ? 1 : 0)))
                  : null

                return (
                  <div key={e.id}>
                    <button
                      onClick={() => setSelectedEventId(selectedEventId === e.id ? null : e.id)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50 text-right"
                    >
                      {/* Split bar for shared, dot for personal */}
                      {isShared && allParts ? (
                        <div className="w-3 self-stretch rounded overflow-hidden flex flex-col flex-shrink-0">
                          {allParts.map((p, idx, arr) => (
                            <div
                              key={idx}
                              className="flex-1 min-h-[4px]"
                              style={{
                                ...(p.status === 'confirmed'
                                  ? { background: colorOf(p.uid) }
                                  : p.status === 'declined'
                                  ? { background: '#e5e7eb' }
                                  : { background: `repeating-linear-gradient(45deg, ${colorOf(p.uid)}, ${colorOf(p.uid)} 3px, white 3px, white 5px)` }
                                ),
                                ...(idx < arr.length - 1 ? { borderBottom: '1px solid rgba(0,0,0,0.2)' } : {})
                              }}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: colorOf(e.created_by) }} />
                      )}

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{e.title}</p>
                        <p className="text-xs text-gray-400">
                          {nameOf(e.created_by)}
                          {e.event_time ? ` · ${e.event_time.slice(0, 5)}` : ''}
                          {isShared && <span className="text-gray-300"> · משותף</span>}
                        </p>
                      </div>
                      <span className="text-xs text-gray-300 flex-shrink-0">
                        {selectedEventId === e.id ? '▴' : '▾'}
                      </span>
                    </button>

                    {selectedEventId === e.id && (
                      <div className="mx-3 mb-1 p-3 bg-gray-50 rounded-b-xl border border-t-0 border-gray-100">
                        {/* Participant status */}
                        {isShared && allParts && (
                          <div className="flex flex-wrap gap-x-3 gap-y-1.5 mb-3">
                            {allParts.map((p, idx) => (
                              <div key={idx} className="flex items-center gap-1.5">
                                <div
                                  className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                                  style={p.status === 'confirmed'
                                    ? { background: colorOf(p.uid) }
                                    : p.status === 'declined'
                                    ? { background: '#e5e7eb' }
                                    : { background: `repeating-linear-gradient(45deg, ${colorOf(p.uid)}, ${colorOf(p.uid)} 3px, white 3px, white 5px)`, outline: `1.5px solid ${colorOf(p.uid)}` }
                                  }
                                />
                                <span className={`text-xs ${p.status === 'declined' ? 'text-gray-400 line-through' : 'text-gray-600'}`}>{nameOf(p.uid)}</span>
                                <span className="text-xs">{p.status === 'confirmed' ? '✓' : p.status === 'declined' ? '✕' : '⏳'}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {e.description && (
                          <p className="text-sm text-gray-600 mb-3 whitespace-pre-wrap">{e.description}</p>
                        )}

                        {/* Reminder */}
                        <div className="mb-3">
                          <p className="text-xs text-gray-400 mb-1.5">🔔 תזכורת</p>
                          <div className="flex gap-1.5 flex-wrap">
                            {(() => {
                              const cur = myReminderDays(e)
                              const none = cur.length === 0
                              return [null, 1, 2, 3, 7].map(days => {
                                const active = days === null ? none : cur.includes(days)
                                const disabled = savingReminder || (days !== null && none === false && !active && cur.length >= 4)
                                return (
                                  <button
                                    key={String(days)}
                                    disabled={disabled}
                                    onClick={() => {
                                      if (days === null) {
                                        setReminder(e, [])
                                      } else {
                                        const next = cur.includes(days) ? cur.filter(d => d !== days) : [...cur, days]
                                        setReminder(e, next)
                                      }
                                    }}
                                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors disabled:opacity-30 ${active ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}
                                  >
                                    {days === null ? 'ללא' : days === 1 ? 'יום לפני' : `${days} ימים לפני`}
                                  </button>
                                )
                              })
                            })()}
                          </div>
                        </div>

                        {e.created_by === userId ? (
                          <div className="flex gap-2">
                            <button onClick={() => openEdit(e)} className="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-100">עריכה</button>
                            <button onClick={() => deleteEvent(e.id)} className="flex-1 bg-red-50 text-red-500 rounded-lg py-2 text-sm hover:bg-red-100">מחיקה</button>
                          </div>
                        ) : (() => {
                          const myInvite = evInvitees.find(i => i.user_id === userId)
                          if (!myInvite) return !e.description && !isShared ? <p className="text-xs text-gray-400">אין פרטים נוספים</p> : null
                          const myProfile = profiles.find(p => p.id === userId)
                          const canArrive = myProfile?.gender === 'female' ? 'יכולה' : 'יכול'
                          const myName = nameOf(userId!)
                          const effectiveStatus = pendingRsvp[e.id] ?? myInvite.status
                          const hasChange = pendingRsvp[e.id] !== undefined && pendingRsvp[e.id] !== myInvite.status

                          async function saveRsvp() {
                            const newStatus = pendingRsvp[e.id]
                            if (!newStatus || newStatus === myInvite!.status) return
                            await supabase.from('calendar_invitees').update({ status: newStatus }).eq('event_id', e.id).eq('user_id', userId!)

                            const dateDisplay = new Date(e.event_date + 'T12:00:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })
                            const actionWord = newStatus === 'confirmed'
                              ? (myProfile?.gender === 'female' ? 'אישרה' : 'אישר')
                              : (myProfile?.gender === 'female' ? 'ביטלה' : 'ביטל')
                            const msg = `${myName} ${actionWord} הגעה לאירוע "${e.title}" (${dateDisplay})`

                            const notifyIds = [
                              e.created_by,
                              ...evInvitees.filter(i => i.user_id !== userId && i.status === 'confirmed').map(i => i.user_id)
                            ].filter(id => id !== userId)

                            for (const uid of notifyIds) {
                              await supabase.from('bot_messages').insert({
                                user_id: uid,
                                apartment_id: apartmentId,
                                message: msg,
                                buttons: null,
                                triggered_by: 'calendar_rsvp_update',
                                related_id: e.id,
                                is_read: false,
                              })
                            }

                            setPendingRsvp(prev => { const n = {...prev}; delete n[e.id]; return n })
                            await fetchEvents(apartmentId!)
                          }

                          return (
                            <div className="flex flex-col gap-2 mt-1">
                              <div className="flex gap-2">
                                <button
                                  onClick={() => setPendingRsvp(prev => ({ ...prev, [e.id]: 'confirmed' }))}
                                  className={`flex-1 rounded-lg py-2 text-sm transition-colors ${effectiveStatus === 'confirmed' ? 'bg-green-100 text-green-700' : effectiveStatus === 'declined' ? 'bg-gray-50 text-gray-400' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}
                                >
                                  {effectiveStatus === 'confirmed' ? '✓ אני בפנים' : 'אני בפנים ✓'}
                                </button>
                                <button
                                  onClick={() => setPendingRsvp(prev => ({ ...prev, [e.id]: 'declined' }))}
                                  className={`flex-1 rounded-lg py-2 text-sm transition-colors ${effectiveStatus === 'declined' ? 'bg-red-100 text-red-600' : 'border border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                                >
                                  {effectiveStatus === 'declined' ? `✕ לא ${canArrive}` : `לא ${canArrive} להגיע`}
                                </button>
                              </div>
                              {hasChange && (
                                <button
                                  onClick={saveRsvp}
                                  className="w-full bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium"
                                >
                                  שמור שינויים
                                </button>
                              )}
                            </div>
                          )
                        })()}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <button
              onClick={() => { setShowDayModal(false); openAdd(selectedDay) }}
              className="w-full bg-indigo-600 text-white rounded-xl py-2.5 text-sm font-medium"
            >+ הוסף אירוע ליום זה</button>
          </div>
        </div>
      )}

      {/* Add / Edit modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-4" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">{editingEvent ? 'עריכת אירוע' : 'אירוע חדש'}</h2>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400">✕</button>
            </div>

            <div className="space-y-3">
              <input
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="כותרת האירוע"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
              <div className="flex gap-2">
                <input
                  type="date"
                  value={newDate}
                  onChange={e => setNewDate(e.target.value)}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
                <input
                  type="time"
                  value={newTime}
                  onChange={e => setNewTime(e.target.value)}
                  className="w-32 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
              <textarea
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                placeholder="הערות (אופציונלי)..."
                rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
              />

              {/* Invite residents */}
              {otherProfiles.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 mb-2">הזמנת דיירים (אופציונלי)</p>
                  <div className="flex flex-wrap gap-2">
                    {otherProfiles.map(p => {
                      const sel = selectedInvitees.has(p.id)
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => toggleInvitee(p.id)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-all ${
                            sel ? 'border-transparent font-medium text-gray-800' : 'border-gray-200 text-gray-500'
                          }`}
                          style={sel ? { background: colorOf(p.id) } : {}}
                        >
                          {sel && <span className="text-xs">✓</span>}
                          {p.display_name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-3">
              <p className="text-xs text-gray-400 mb-1.5">🔔 תזכורת (אופציונלי)</p>
              <div className="flex gap-1.5 flex-wrap">
                {[null, 1, 2, 3, 7].map(days => {
                  const none = newReminderDays.length === 0
                  const active = days === null ? none : newReminderDays.includes(days)
                  const disabled = days !== null && !none && !active && newReminderDays.length >= 4
                  return (
                    <button
                      key={String(days)}
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        if (days === null) setNewReminderDays([])
                        else setNewReminderDays(newReminderDays.includes(days) ? newReminderDays.filter(d => d !== days) : [...newReminderDays, days])
                      }}
                      className={`px-2.5 py-1 rounded-full text-xs border transition-colors disabled:opacity-30 ${active ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}
                    >
                      {days === null ? 'ללא' : days === 1 ? 'יום לפני' : `${days} ימים לפני`}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowAddModal(false)} className="flex-1 border border-gray-200 rounded-lg py-2.5 text-sm">ביטול</button>
              <button
                onClick={saveEvent}
                disabled={!newTitle.trim() || !newDate}
                className="flex-1 bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-40"
              >{editingEvent ? 'שמור' : 'הוסף'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
