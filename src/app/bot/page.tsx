'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import PushSubscribe from '@/components/PushSubscribe'

type BotMessage = {
  id: string
  message: string
  buttons: { label: string; action: string; submenu?: { label: string; action: string }[] }[] | null
  triggered_by: string | null
  related_id: string | null
  is_read: boolean
  created_at: string
}

export default function BotPage() {
  const [messages, setMessages] = useState<BotMessage[]>([])
  const [myUserId, setMyUserId] = useState<string | null>(null)
  const [gender, setGender] = useState<'male' | 'female'>('male')
  const [loading, setLoading] = useState(true)
  const [submenuOpen, setSubmenuOpen] = useState<string | null>(null) // message id with open submenu
  const [processing, setProcessing] = useState<string | null>(null) // button action being processed
  const [firstUnreadIndex, setFirstUnreadIndex] = useState<number | null>(null)
  const [showVetoModal, setShowVetoModal] = useState(false)
  const [vetoSource, setVetoSource] = useState<'weekly' | 'monthly'>('weekly')
  const [vetoCandidates, setVetoCandidates] = useState<{ task_id: string; task_title: string; weekly_count: number }[]>([])
  const [activeVetos, setActiveVetos] = useState<{ task_id: string; user_id: string; source: string }[]>([])
  const [selectedVetoTaskId, setSelectedVetoTaskId] = useState<string | null>(null)
  const [savingVeto, setSavingVeto] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const unreadRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    let cancelled = false
    async function load() {
      let user
      try {
        const { data } = await supabase.auth.getUser()
        user = data.user
      } catch { return }
      if (cancelled) return
      if (!user) { router.push('/auth'); return }
      setMyUserId(user.id)

      const { data: p } = await supabase
        .from('profiles')
        .select('gender, apartment_id')
        .eq('id', user.id)
        .single()
      if (!p?.apartment_id) { router.push('/setup'); return }
      if (p.gender === 'female') setGender('female')

      const msgs = await fetchMessages(user.id)
      const idx = msgs.findIndex(m => !m.is_read)
      if (idx !== -1) setFirstUnreadIndex(idx)
      setLoading(false)

      // mark all as read
      await supabase
        .from('bot_messages')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  // scroll to first unread (or bottom) after initial load
  useEffect(() => {
    if (loading) return
    if (firstUnreadIndex !== null) unreadRef.current?.scrollIntoView({ behavior: 'instant' })
    else bottomRef.current?.scrollIntoView({ behavior: 'instant' })
  }, [loading])

  // realtime: new messages
  useEffect(() => {
    if (!myUserId) return
    const channel = supabase
      .channel('bot_messages_realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'bot_messages',
        filter: `user_id=eq.${myUserId}`,
      }, (payload) => {
        setMessages(prev => [...prev, payload.new as BotMessage])
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
        supabase.from('bot_messages').update({ is_read: true }).eq('id', payload.new.id)
          .then(() => window.dispatchEvent(new CustomEvent('bot-messages-read')))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [myUserId])


  async function fetchMessages(userId: string): Promise<BotMessage[]> {
    const { data } = await supabase
      .from('bot_messages')
      .select('id, message, buttons, triggered_by, related_id, is_read, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(200)
    const msgs = data ?? []
    setMessages(msgs)
    return msgs
  }

  async function handleAction(msg: BotMessage, action: string, label: string) {
    if (processing) return
    setProcessing(msg.id + action)
    setSubmenuOpen(null)

    try {
      await handleBotAction(action, msg, label)
    } finally {
      setProcessing(null)
    }
  }

  const NEGATIVE_ACTIONS = new Set([
    'nightly_skip', 'nightly_sleep', 'overnight_overdue',
    'bill_not_yet', 'rent_not_yet', 'calendar_decline',
    'release_fixed_task', 'reject_removal', 'noop',
  ])

  async function handleBotAction(action: string, msg: BotMessage, label: string) {
    // log the response
    await supabase.from('bot_responses').insert({
      message_id: msg.id,
      user_id: myUserId,
      action,
    })

    const [baseAction, actionId] = action.split(':')
    const doneAction = (NEGATIVE_ACTIONS.has(action) || NEGATIVE_ACTIONS.has(baseAction)) ? '__rejected__' : '__done__'

    // navigation-only actions don't disable the message
    const NAV_ACTIONS = new Set(['go_tasks', 'go_dashboard', 'go_shopping', 'go_calendar', 'go_bills', 'go_settings'])
    if (!NAV_ACTIONS.has(action) && !NAV_ACTIONS.has(baseAction)) {
      // disable the message buttons by updating it
      await supabase.from('bot_messages').update({
        buttons: [{ label: `✓ ${label}`, action: doneAction }]
      }).eq('id', msg.id)

      // update local state immediately
      setMessages(prev => prev.map(m =>
        m.id === msg.id
          ? { ...m, buttons: [{ label: `✓ ${label}`, action: doneAction }] }
          : m
      ))
    }

    // handle each action
    if (action === 'go_tasks') {
      router.push('/tasks')
      return
    }

    if (action === 'go_shopping') {
      router.push('/shopping')
      return
    }

    if (action === 'go_calendar') {
      if (msg.related_id) router.push(`/calendar?event=${msg.related_id}`)
      else router.push('/calendar')
      return
    }

    if (action === 'go_bills') {
      router.push('/bills')
      return
    }

    if (action === 'go_bot') {
      // already here — scroll to bottom
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      return
    }

    if (action === 'go_summary') {
      router.push('/summary')
      return
    }

    if (action === 'go_dashboard') {
      router.push('/')
      return
    }

    if (action === 'apartment_type_solo') {
      const aptId = await getApartmentId()
      await supabase.rpc('send_onboarding_message_solo', { p_user_id: myUserId, p_apartment_id: aptId })
      return
    }

    if (action === 'apartment_type_multi') {
      const aptId = await getApartmentId()
      await supabase.rpc('send_onboarding_message', { p_user_id: myUserId, p_apartment_id: aptId })
      return
    }

    if (action === 'will_invite') {
      const aptId = await getApartmentId()
      await supabase.rpc('send_will_invite_explanation', { p_user_id: myUserId, p_apartment_id: aptId })
      return
    }

    if (action === 'go_settings') {
      router.push('/dashboard')
      return
    }

    if (action === 'going_solo') {
      const aptId = await getApartmentId()
      await supabase.rpc('confirm_going_solo', { p_apartment_id: aptId, p_user_id: myUserId })
      return
    }

    if (action === 'go_veto') {
      const source = msg.triggered_by === 'monthly_winner' ? 'monthly' : 'weekly'
      setVetoSource(source)
      setSelectedVetoTaskId(null)
      const [{ data: candidates }, { data: vetos }] = await Promise.all([
        supabase.rpc('get_veto_candidates'),
        supabase.rpc('get_active_vetos'),
      ])
      setVetoCandidates(candidates ?? [])
      setActiveVetos(vetos ?? [])
      setShowVetoModal(true)
      return
    }

    if (action === 'go_solo_explain') {
      await supabase.from('bot_messages').insert({
        user_id: myUserId,
        apartment_id: await getApartmentId(),
        triggered_by: 'solo_explain',
        message: gender === 'female'
          ? 'במצב סולו: אין ניקוד ואין תחרות - כל המטלות עלייך. HaNudnik עדיין יזכיר לך מה צריך לעשות, אבל אין \"מי לוקח\" - רק אתי ואת 🏠'
          : 'במצב סולו: אין ניקוד ואין תחרות - כל המטלות עליך. HaNudnik עדיין יזכיר לך מה צריך לעשות, אבל אין \"מי לוקח\" - רק אני ואתה 🏠',
        buttons: null,
      })
      return
    }

    if (action === 'task_claim') {
      if (!msg.related_id) return
      const aptId = await getApartmentId()
      await supabase.from('bot_messages').insert({
        user_id: myUserId,
        apartment_id: aptId,
        triggered_by: 'claim_reminder_pick',
        message: 'מתי לתזכר?',
        buttons: [
          { label: 'בעוד חצי שעה', action: 'task_claim_in_30' },
          { label: 'בעוד 45 דקות', action: 'task_claim_in_45' },
          { label: 'בעוד שעה', action: 'task_claim_in_60' },
        ],
        related_id: msg.related_id,
      })
      return
    }

    if (action.startsWith('task_claim_in_')) {
      const minutes = parseInt(action.replace('task_claim_in_', ''))
      if (msg.related_id) {
        const remindAt = new Date(Date.now() + minutes * 60 * 1000)
        const pad = (n: number) => String(n).padStart(2, '0')
        const reminderTime = `${pad(remindAt.getHours())}:${pad(remindAt.getMinutes())}`
        await supabase.rpc('claim_task', {
          p_instance_id: msg.related_id,
          p_reminder_time: reminderTime,
        })
        await supabase.rpc('schedule_reminder_after_claim', {
          p_instance_id: msg.related_id,
          p_reminder_time: reminderTime,
          p_user_id: myUserId,
        })
      }
      return
    }

    if (action === 'task_done') {
      if (msg.related_id) await supabase.rpc('complete_task', { p_instance_id: msg.related_id })
      return
    }

    if (action === 'overnight_done') {
      if (msg.related_id) await supabase.rpc('overnight_complete', { p_instance_id: msg.related_id })
      return
    }

    if (action === 'overnight_overdue') {
      if (msg.related_id) await supabase.rpc('overnight_overdue', { p_instance_id: msg.related_id })
      return
    }

    if (action === 'task_forfeit') {
      if (msg.related_id) {
        await supabase.rpc('cancel_claim', { p_instance_id: msg.related_id })
        await supabase.rpc('notify_forfeit_to_others', { p_instance_id: msg.related_id })
      }
      return
    }

    if (action.startsWith('remind_')) {
      const minutes = parseInt(action.split('_')[1])
      if (msg.related_id) {
        const remindAt = new Date(Date.now() + minutes * 60 * 1000)
        const newTime = remindAt.toTimeString().slice(0, 5)
        await supabase.rpc('delay_reminder', {
          p_instance_id: msg.related_id,
          p_new_time: newTime,
        })
        // schedule a new reminder message
        await supabase.rpc('schedule_task_reminder', {
          p_instance_id: msg.related_id,
          p_reminder_time: newTime,
          p_user_id: myUserId,
          p_apartment_id: await getApartmentId(),
        })
      }
      return
    }

    if (baseAction === 'calendar_confirm' || baseAction === 'calendar_decline') {
      const eventId = actionId || msg.related_id
      const newStatus = baseAction === 'calendar_confirm' ? 'confirmed' : 'declined'
      if (eventId) {
        await supabase
          .from('calendar_invitees')
          .update({ status: newStatus })
          .eq('event_id', eventId)
          .eq('user_id', myUserId)

        // שליחת הודעה למארגן + מוזמנים מאושרים
        const { data: event } = await supabase
          .from('calendar_events')
          .select('title, event_date, created_by, apartment_id')
          .eq('id', eventId)
          .single()
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name, gender')
          .eq('id', myUserId!)
          .single()
        const { data: invitees } = await supabase
          .from('calendar_invitees')
          .select('user_id, status')
          .eq('event_id', eventId)
        if (event && profile) {
          const actionWord = newStatus === 'confirmed'
            ? (profile.gender === 'female' ? 'אישרה' : 'אישר')
            : (profile.gender === 'female' ? 'ביטלה' : 'ביטל')
          const dateDisplay = new Date(event.event_date + 'T12:00:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })
          const notifMsg = `${profile.display_name} ${actionWord} הגעה לאירוע "${event.title}" (${dateDisplay})`
          const notifyIds = [
            event.created_by,
            ...(invitees ?? []).filter(i => i.user_id !== myUserId && i.status === 'confirmed').map(i => i.user_id)
          ].filter(id => id !== myUserId)
          for (const uid of notifyIds) {
            await supabase.from('bot_messages').insert({
              user_id: uid,
              apartment_id: event.apartment_id,
              message: notifMsg,
              buttons: null,
              triggered_by: 'calendar_rsvp_update',
              related_id: eventId,
              is_read: false,
            })
          }
        }
      }
      return
    }

    if (action === 'approve_removal') {
      if (msg.related_id) await supabase.rpc('approve_removal', { p_request_id: msg.related_id })
      return
    }

    if (action === 'reject_removal') {
      if (msg.related_id) await supabase.rpc('reject_removal', { p_request_id: msg.related_id })
      return
    }

    if (action === 'approve_fixed_task') {
      if (msg.related_id) await supabase.rpc('approve_fixed_task', { p_request_id: msg.related_id })
      return
    }

    if (action === 'reject_fixed_task') {
      if (msg.related_id) await supabase.rpc('reject_fixed_task', { p_request_id: msg.related_id })
      return
    }

    if (action === 'reclaim_fixed_task') {
      if (msg.related_id) await supabase.rpc('reclaim_fixed_task', { p_task_id: msg.related_id })
      return
    }

    if (action === 'release_fixed_task') {
      if (msg.related_id) await supabase.rpc('release_fixed_task', { p_task_id: msg.related_id })
      return
    }

    if (action === 'go_fixed_tasks') {
      router.push('/tasks?fixed=1')
      return
    }

    if (action === 'approve_uncomplete') {
      if (msg.related_id) await supabase.rpc('uncomplete_task', { p_instance_id: msg.related_id })
      return
    }

    if (action === 'nightly_mark_my') {
      await supabase.rpc('send_nightly_mine_task_list')
      return
    }

    if (action === 'nightly_sleep') {
      await supabase.rpc('nightly_sleep_my_tasks')
      return
    }

    if (action === 'nightly_mark_unclaimed') {
      if (msg.related_id) await supabase.rpc('send_nightly_unclaimed_task_list', { p_apartment_id: msg.related_id })
      return
    }

    if (action === 'nightly_skip') {
      // no-op — tasks carry over naturally via overnight check
      return
    }

    if (action === 'go_laundry') {
      router.push('/laundry')
      return
    }

    if (action === 'noop' || action === 'remind_menu') {
      // intentional no-op — button just closes itself (label already updated to ✓)
      return
    }

    if (action === 'bill_add') {
      router.push('/bills?add=1')
      return
    }

    if (action === 'bill_pay') {
      router.push('/bills')
      return
    }

    if (action === 'rent_paid') {
      router.push('/bills')
      return
    }

    if (action === 'rent_not_yet') {
      return
    }

    if (action === 'bill_not_yet') {
      // reschedule reminder +2 days
      if (msg.related_id) {
        const rescheduleAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
        await supabase.rpc('reschedule_bill_reminder', {
          p_bill_type_id: msg.related_id,
          p_remind_at: rescheduleAt,
        })
      }
      return
    }
  }

  async function confirmVeto() {
    if (!selectedVetoTaskId) return
    setSavingVeto(true)
    await supabase.rpc('set_veto', { p_task_id: selectedVetoTaskId, p_source: vetoSource })
    setSavingVeto(false)
    setShowVetoModal(false)
    const msgs = await fetchMessages(myUserId!)
    setMessages(msgs)
  }

  async function getApartmentId(): Promise<string> {
    const { data } = await supabase
      .from('profiles')
      .select('apartment_id')
      .eq('id', myUserId)
      .single()
    return data?.apartment_id ?? ''
  }

  function formatTime(iso: string) {
    const d = new Date(iso)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
    if (diffDays === 1) return 'אתמול'
    return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })
  }

  function isExpired(msg: BotMessage) {
    if (msg.buttons?.length === 1 && (msg.buttons[0].action === '__done__' || msg.buttons[0].action === '__rejected__')) return true
    return false
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" dir="rtl" style={{ visibility: loading ? 'hidden' : 'visible' }}>
      <PushSubscribe />
      {/* header */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => router.back()} className="text-gray-500 text-xl">→</button>
        <div className="w-9 h-9 rounded-full bg-indigo-100 overflow-hidden flex items-center justify-center">
          <img src="/HaNudnik Character.png" alt="HaNudnik" className="w-full h-full object-cover" />
        </div>
        <div>
          <p className="font-bold text-gray-800 text-sm">HaNudnik</p>
          <p className="text-xs text-gray-400">הדייר הדיגיטלי שלך</p>
        </div>
      </div>

      {/* messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-6">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 text-sm mt-16">
            <img src="/HaNudnik Character.png" alt="HaNudnik" className="w-16 h-16 object-contain mx-auto mb-3" />
            <p>HaNudnik ישלח לך הודעות כאן</p>
          </div>
        )}

        {messages.map((msg, idx) => {
          const done = isExpired(msg)
          return (
            <div key={msg.id}>
            {firstUnreadIndex !== null && idx === firstUnreadIndex && (
              <div ref={unreadRef} className="flex items-center gap-2 my-2">
                <div className="flex-1 h-px bg-indigo-200" />
                <span className="text-xs text-indigo-400 font-medium whitespace-nowrap">הודעות שלא נקראו</span>
                <div className="flex-1 h-px bg-indigo-200" />
              </div>
            )}
            <div className="flex flex-col items-start gap-2 max-w-sm">
              {/* bubble */}
              <div className="bg-white rounded-2xl rounded-tr-sm px-4 py-3 shadow-sm border border-gray-100 text-sm text-gray-800 leading-relaxed whitespace-pre-line">
                {msg.message}
              </div>

              {/* timestamp */}
              <span className="text-xs text-gray-400 px-1">{formatTime(msg.created_at)}</span>

              {/* buttons */}
              {msg.buttons && msg.buttons.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {msg.buttons.map((btn) => {
                    if (btn.action === '__done__') {
                      return (
                        <span key={btn.action} className="px-3 py-1.5 rounded-full text-xs bg-green-50 text-green-600 border border-green-200">
                          {btn.label}
                        </span>
                      )
                    }
                    if (btn.action === '__rejected__') {
                      return (
                        <span key={btn.action} className="px-3 py-1.5 rounded-full text-xs bg-red-50 text-red-500 border border-red-200">
                          {btn.label}
                        </span>
                      )
                    }

                    const hasSubmenu = btn.submenu && btn.submenu.length > 0
                    const isOpen = submenuOpen === msg.id + btn.action

                    return (
                      <div key={btn.action} className="relative">
                        <button
                          disabled={!!processing || done}
                          onClick={() => {
                            if (hasSubmenu) {
                              setSubmenuOpen(isOpen ? null : msg.id + btn.action)
                            } else {
                              handleAction(msg, btn.action, btn.label)
                            }
                          }}
                          className={`px-3 py-1.5 rounded-full text-xs border transition-all
                            ${done
                              ? 'bg-gray-50 text-gray-300 border-gray-100'
                              : 'bg-white text-indigo-600 border-indigo-200 active:bg-indigo-50'
                            }
                            ${processing === msg.id + btn.action ? 'opacity-50' : ''}
                          `}
                        >
                          {btn.label}
                          {hasSubmenu && <span className="mr-1 text-gray-400">▾</span>}
                        </button>

                        {/* submenu */}
                        {hasSubmenu && isOpen && (
                          <div className="absolute top-full mt-1 right-0 bg-white rounded-xl shadow-lg border border-gray-100 z-20 py-1 min-w-max">
                            {btn.submenu!.map((sub) => (
                              <button
                                key={sub.action}
                                onClick={() => handleAction(msg, sub.action, sub.label)}
                                className="block w-full text-right px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                              >
                                {sub.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {showVetoModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-4" dir="rtl">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold text-gray-900">
                {vetoSource === 'monthly' ? '🥇 ניצחת את החודש!' : '🏆 ניצחת השבוע!'}
              </h2>
              <button onClick={() => setShowVetoModal(false)} className="text-gray-400">✕</button>
            </div>
            <p className="text-sm text-gray-500 mb-3">
              {vetoSource === 'monthly'
                ? 'בחר/י משימה שלא תצטרך/י לעשות ב-7 הימים הקרובים'
                : 'בחר/י משימה שלא תצטרך/י לעשות השבוע הקרוב'}
            </p>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {vetoCandidates.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">טוען...</p>
              )}
              {vetoCandidates.map(task => {
                const takenByOther = activeVetos.find(v => v.task_id === task.task_id && v.user_id !== myUserId)
                const alreadyMyOtherVeto = activeVetos.some(v => v.task_id === task.task_id && v.user_id === myUserId && v.source !== vetoSource)
                const disabled = !!takenByOther || alreadyMyOtherVeto
                return (
                  <button
                    key={task.task_id}
                    onClick={() => !disabled && setSelectedVetoTaskId(task.task_id)}
                    disabled={disabled}
                    className={`w-full text-right px-3 py-2.5 rounded-lg border text-sm transition-colors flex items-center justify-between ${
                      selectedVetoTaskId === task.task_id
                        ? 'border-purple-500 bg-purple-50 text-purple-800 font-medium'
                        : disabled
                        ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <span>
                      {task.task_title}
                      {takenByOther && <span className="text-xs mr-1 text-gray-400"> - נבחר ע"י {(takenByOther as any).display_name}</span>}
                      {alreadyMyOtherVeto && <span className="text-xs mr-1 text-gray-400"> (נבחר)</span>}
                    </span>
                    {task.weekly_count > 1 && (
                      <span className={`text-xs shrink-0 mr-2 ${selectedVetoTaskId === task.task_id ? 'text-purple-500' : disabled ? 'text-gray-300' : 'text-gray-400'}`}>
                        {task.weekly_count} חזרות
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowVetoModal(false)} className="flex-1 border border-gray-200 rounded-lg py-2.5 text-sm">אחר כך</button>
              <button
                onClick={confirmVeto}
                disabled={!selectedVetoTaskId || savingVeto}
                className="flex-1 bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-40"
              >{savingVeto ? '...' : 'אשר וטו'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
