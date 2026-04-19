'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type Task = {
  task_id: string
  title: string
  frequency: string | null
  frequency_config: { days?: number[]; every?: number; day?: number; slots?: Record<string, string> } | null
  task_subtype: string | null
  fixed_user_id: string | null
  fixed_user_name: string | null
  emoji: string | null
  last_done_at: string | null
  last_real_done_at: string | null
}

const TASK_EMOJIS = ['🍽️','🗑️','🌀','🧹','🧺','🛁','🏺','🚪','🛒','🥛','💦','✨','🐾','💡','🌿','🛋️','🚿','🌱','📦','🔧']

const FREQ_LABELS: Record<string, string> = {
  daily: 'כל יום',
  multiple_daily: 'כמה פעמים ביום',
  specific_days: 'כמה פעמים בשבוע',
  biweekly: 'פעם בשבועיים',
  monthly: 'פעם בחודש',
}

const DAYS_HE = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']
const DAYS_HE_FULL = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

const SLOT_OPTIONS = [
  { key: 'morning', label: 'בוקר',    min: '07:00', max: '10:00', default: '07:00' },
  { key: 'noon',    label: 'צהריים',  min: '12:00', max: '15:00', default: '12:00' },
  { key: 'evening', label: 'ערב',     min: '17:00', max: '20:00', default: '17:00' },
  { key: 'night',   label: 'לילה',    min: '22:00', max: '23:59', default: '22:00' },
]

const SLOT_LABELS: Record<string, string> = {
  morning: 'בוקר', noon: 'צהריים', evening: 'ערב', night: 'לילה',
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [pendingRequests, setPendingRequests] = useState<Set<string>>(new Set())
  const [showForm, setShowForm] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [pageLoading, setPageLoading] = useState(true)
  const [loading, setLoading] = useState(false)
  const [myUserId, setMyUserId] = useState<string | null>(null)
  const [aptMode, setAptMode] = useState<string | null>(null)
  const [aptId, setAptId] = useState<string | null>(null)
  const [laundryMethod, setLaundryMethod] = useState<'hang' | 'dry'>('hang')
  const [savingLaundryMethod, setSavingLaundryMethod] = useState(false)
  const [fadingOut, setFadingOut] = useState<Set<string>>(new Set())
  const [confirmDeleteTaskId, setConfirmDeleteTaskId] = useState<string | null>(null)
  const [confirmReleaseTaskId, setConfirmReleaseTaskId] = useState<string | null>(null)
  const [requestingFixed, setRequestingFixed] = useState<string | null>(null)
  const [baselineModal, setBaselineModal] = useState<{ taskId: string; taskTitle: string; frequency: 'biweekly' | 'monthly'; configDay: number } | null>(null)
  const emptyForm = { title: '', frequency: 'daily', specific_days: [] as number[], weekly_day: 0, slots: {} as Record<string, string>, emoji: '' }
  const [form, setForm] = useState(emptyForm)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) { router.push('/auth'); return }
      setMyUserId(user.id)
      const { data: profile } = await supabase.from('profiles').select('apartment_id').eq('id', user.id).single()
      if (!profile?.apartment_id) { router.push('/setup'); return }
      const [{ data: apt }] = await Promise.all([
        supabase.from('apartments').select('id, mode, laundry_method').eq('id', profile.apartment_id).single(),
        fetchTasks(true),
      ])
      setAptMode(apt?.mode ?? null)
      setAptId(apt?.id ?? null)
      setLaundryMethod(apt?.laundry_method ?? 'hang')
    }
    load()
  }, [])

  useEffect(() => {
    if (!aptId) return
    const channel = supabase
      .channel('tasks-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `apartment_id=eq.${aptId}` }, () => fetchTasks())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [aptId])

  async function fetchTasks(initial = false): Promise<Task[]> {
    const { data } = await supabase.rpc('get_all_tasks')
    const tasks: Task[] = data ?? []
    setTasks(tasks)
    if (initial) setPageLoading(false)

    // fetch pending fixed task requests
    const { data: reqs } = await supabase
      .from('fixed_task_requests')
      .select('task_id')
      .eq('status', 'pending')
    setPendingRequests(new Set((reqs ?? []).map((r: { task_id: string }) => r.task_id)))
    return tasks
  }

  async function addTask() {
    if (!form.title.trim()) return
    const freqForBaseline = form.frequency
    const titleForBaseline = form.title.trim()
    setLoading(true)
    let config: object | null = null
    if (form.frequency === 'specific_days') config = { days: form.specific_days }
    else if (form.frequency === 'biweekly' || form.frequency === 'monthly') config = { day: form.weekly_day }
    else if (form.frequency === 'multiple_daily') config = { slots: form.slots }

    const { error } = await supabase.rpc('add_task', {
      p_title: form.title.trim(),
      p_frequency: form.frequency,
      p_frequency_config: config,
      p_emoji: form.emoji || null,
    })
    if (error) alert('שגיאה: ' + error.message)
    else {
      setShowForm(false)
      setForm(emptyForm)
      const newTasks = await fetchTasks()
      if (freqForBaseline === 'biweekly' || freqForBaseline === 'monthly') {
        const newTask = newTasks.find(t => t.title === titleForBaseline && t.frequency === freqForBaseline)
        if (newTask) setBaselineModal({ taskId: newTask.task_id, taskTitle: newTask.title, frequency: freqForBaseline as 'biweekly' | 'monthly', configDay: form.weekly_day })
      }
    }
    setLoading(false)
  }

  async function saveEdit() {
    if (!editingTask || !form.title.trim()) return
    const prevFrequency = editingTask.frequency
    const editedTaskId = editingTask.task_id
    setLoading(true)
    let config: object | null = null
    if (form.frequency === 'specific_days') config = { days: form.specific_days }
    else if (form.frequency === 'biweekly' || form.frequency === 'monthly') config = { day: form.weekly_day }
    else if (form.frequency === 'multiple_daily') config = { slots: form.slots }

    const { error } = await supabase.rpc('update_task', {
      p_task_id: editingTask.task_id,
      p_title: form.title.trim(),
      p_frequency: form.frequency,
      p_frequency_config: config,
      p_emoji: form.emoji || null,
    })
    if (error) alert('שגיאה: ' + error.message)
    else {
      setEditingTask(null)
      setForm(emptyForm)
      const updatedTasks = await fetchTasks()
      if ((form.frequency === 'biweekly' || form.frequency === 'monthly') && form.frequency !== prevFrequency) {
        const edited = updatedTasks.find(t => t.task_id === editedTaskId)
        if (edited) setBaselineModal({ taskId: edited.task_id, taskTitle: edited.title, frequency: form.frequency as 'biweekly' | 'monthly', configDay: form.weekly_day })
      }
    }
    setLoading(false)
  }

  function withFade(id: string, action: () => Promise<void>) {
    setFadingOut(s => new Set(s).add(id))
    setTimeout(async () => {
      await action()
      setFadingOut(s => { const n = new Set(s); n.delete(id); return n })
    }, 300)
  }

  async function deleteTask(taskId: string) {
    withFade(taskId, async () => {
      await supabase.rpc('delete_task', { p_task_id: taskId })
      fetchTasks()
    })
  }

  async function saveLaundryMethod(taskId: string, method: 'hang' | 'dry') {
    if (!aptId) return
    setSavingLaundryMethod(true)
    withFade(taskId, async () => {
      await supabase.from('apartments').update({ laundry_method: method }).eq('id', aptId)
      setLaundryMethod(method)
      setSavingLaundryMethod(false)
      await fetchTasks()
    })
  }

  async function setLaundryNotRelevant(taskId: string) {
    withFade(taskId, async () => {
      await supabase.rpc('update_task', {
        p_task_id: taskId,
        p_title: 'כביסה',
        p_frequency: null,
        p_frequency_config: null,
      })
      await fetchTasks()
    })
  }

  async function requestFixed(taskId: string) {
    if (requestingFixed) return
    setRequestingFixed(taskId)
    const { error } = await supabase.rpc('request_fixed_task', { p_task_id: taskId, p_requester_id: myUserId })
    if (error) alert('שגיאה: ' + error.message)
    else fetchTasks()
    setRequestingFixed(null)
  }

  async function releaseFixed(taskId: string) {
    await supabase.rpc('release_fixed_task', { p_task_id: taskId })
    fetchTasks()
  }

  function openEdit(task: Task) {
    const cfg = task.frequency_config
    setForm({
      title: task.title,
      frequency: task.frequency ?? 'daily',
      specific_days: cfg?.days ?? [],
      weekly_day: cfg?.day ?? 0,
      slots: cfg?.slots ?? {},
      emoji: task.emoji ?? '',
    })
    setEditingTask(task)
  }

  function toggleSpecificDay(day: number) {
    setForm(f => ({
      ...f,
      specific_days: f.specific_days.includes(day)
        ? f.specific_days.filter(d => d !== day)
        : [...f.specific_days, day],
    }))
  }

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })
  }

  function localDateStr(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  function calcNextDue(task: Task): string | null {
    const cfg = task.frequency_config
    const configDay = cfg?.day ?? 0

    if (task.frequency === 'biweekly') {
      if (!task.last_done_at) return null
      const base = new Date(task.last_done_at + 'T00:00:00')
      base.setDate(base.getDate() + 14)
      while (base.getDay() !== configDay) base.setDate(base.getDate() + 1)
      return localDateStr(base)
    }

    if (task.frequency === 'monthly') {
      if (!task.last_done_at) return null
      const today = new Date()
      let yr = today.getFullYear()
      let mo = today.getMonth()
      if (task.last_done_at) {
        const lastDone = new Date(task.last_done_at + 'T00:00:00')
        if (lastDone.getMonth() === mo && lastDone.getFullYear() === yr) {
          mo += 1
          if (mo > 11) { mo = 0; yr += 1 }
        }
      }
      const d = new Date(yr, mo, 1)
      while (d.getDay() !== configDay) d.setDate(d.getDate() + 1)
      return localDateStr(d)
    }

    return null
  }

  async function confirmBaseline(doneAt: string | null) {
    if (!baselineModal) return
    if (doneAt) {
      await supabase.rpc('set_task_baseline', { p_task_id: baselineModal.taskId, p_done_at: doneAt })
      fetchTasks()
    }
    setBaselineModal(null)
  }

  function freqSummary(task: Task) {
    if (!task.frequency) return 'לא הוגדרה תדירות'
    const cfg = task.frequency_config
    if (task.frequency === 'specific_days') {
      const days = (cfg?.days ?? []).map(d => DAYS_HE_FULL[d])
      if (days.length === 1) return `פעם בשבוע, בימי ${days[0]}`
      if (days.length === 2) return `פעמיים בשבוע, בימים ${days[0]} ו${days[1]}`
      return `${days.length} פעמים בשבוע, בימים ${days.join(', ')}`
    }
    if (task.frequency === 'biweekly') return `פעם בשבועיים, בימי ${DAYS_HE_FULL[cfg?.day ?? 0]}`
    if (task.frequency === 'monthly') return `פעם בחודש, בימי ${DAYS_HE_FULL[cfg?.day ?? 0]}`
    if (task.frequency === 'multiple_daily') {
      const slots = SLOT_OPTIONS.filter(s => s.key in (cfg?.slots ?? {})).map(s => SLOT_LABELS[s.key])
      return slots.join(' ו')
    }
    return FREQ_LABELS[task.frequency] ?? task.frequency
  }

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <header className="bg-white border-b border-gray-100 px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard')} className="text-gray-500 hover:text-gray-900">→</button>
          <h1 className="font-bold text-gray-900">✅ מטלות</h1>
        </div>
        <button
          onClick={() => { setShowForm(true); setEditingTask(null); setForm(emptyForm) }}
          className="bg-indigo-600 text-white rounded-lg px-3 py-1.5 text-sm font-medium"
        >+ הוסף</button>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-2">
        {tasks.length === 0 && !pageLoading && (
          <div className="text-center text-gray-400 text-sm py-8">אין מטלות עדיין</div>
        )}

        {[...tasks].sort((a, b) => {
          const laundryOrder = (t: typeof a) => {
            if (t.task_subtype !== 'laundry_wash') return 1
            return t.frequency === null ? 2 : 0
          }
          return laundryOrder(a) - laundryOrder(b)
        }).map(task => {
          const isMyFixed = task.fixed_user_id === myUserId
          const isPending = pendingRequests.has(task.task_id)
          const canRequestFixed = aptMode === 'shared' && !task.fixed_user_id && !isPending
          const isLaundry = task.task_subtype === 'laundry_wash'

          if (isLaundry) {
            return (
              <div key={task.task_id} className={`bg-white rounded-xl border border-blue-100 p-4 transition-opacity duration-300 ${fadingOut.has(task.task_id) ? 'opacity-0' : 'opacity-100'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900">🧺 כביסה</p>
                      <span className="text-xs bg-blue-50 text-blue-500 border border-blue-100 rounded-full px-2 py-0.5">מיוחדת</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{freqSummary(task)}</p>

                    {/* laundry method */}
                    <div className="mt-3">
                      <p className="text-xs font-medium text-gray-600 mb-1.5">שיטת כביסה בדירה:</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveLaundryMethod(task.task_id, 'hang')}
                          disabled={savingLaundryMethod}
                          className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${laundryMethod === 'hang' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                        >תליה + קיפול</button>
                        <button
                          onClick={() => saveLaundryMethod(task.task_id, 'dry')}
                          disabled={savingLaundryMethod}
                          className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${laundryMethod === 'dry' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                        >מייבש + קיפול</button>
                      </div>
                    </div>

                    <div className="mt-2 flex gap-2">
                      {task.frequency ? (
                        <button
                          onClick={() => setLaundryNotRelevant(task.task_id)}
                          className="text-xs text-gray-400 border border-gray-100 rounded-full px-2.5 py-1 hover:bg-gray-50"
                        >לא רלוונטי (ללא מכונה)</button>
                      ) : (
                        <span className="text-xs text-gray-400 border border-gray-100 rounded-full px-2.5 py-1 bg-gray-50">לא רלוונטי</span>
                      )}
                    </div>
                  </div>
                  <button onClick={() => openEdit(task)} className="text-gray-300 hover:text-gray-600 text-sm px-2 py-1">✏️</button>
                </div>
              </div>
            )
          }

          return (
            <div key={task.task_id} className={`bg-white rounded-xl border border-gray-100 shadow-sm p-4 transition-opacity duration-300 ${fadingOut.has(task.task_id) ? 'opacity-0' : 'opacity-100'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900">{task.emoji ? `${task.emoji} ${task.title}` : task.title}</p>
                    {task.fixed_user_id && aptMode !== 'solo' && (
                      <span className="text-xs bg-purple-50 text-purple-500 border border-purple-100 rounded-full px-2 py-0.5">
                        📌 {isMyFixed ? 'שלי' : task.fixed_user_name}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{freqSummary(task)}</p>
                  {(task.frequency === 'biweekly' || task.frequency === 'monthly') && (() => {
                    const nextDue = calcNextDue(task)
                    return (
                      <div className="flex gap-3 mt-0.5">
                        {task.last_real_done_at && (
                          <p className="text-xs text-gray-300">ביצוע אחרון: {formatDate(task.last_real_done_at)}</p>
                        )}
                        {nextDue && (
                          <p className="text-xs text-indigo-400">ביצוע הבא: {formatDate(nextDue)}</p>
                        )}
                      </div>
                    )
                  })()}

                  {/* fixed task actions */}
                  <div className="mt-2 flex gap-2 flex-wrap">
                    {canRequestFixed && (
                      <button
                        onClick={() => requestFixed(task.task_id)}
                        disabled={requestingFixed === task.task_id}
                        className="text-xs text-purple-500 border border-purple-100 rounded-full px-2.5 py-1 hover:bg-purple-50 disabled:opacity-50"
                      >
                        {requestingFixed === task.task_id ? '...' : '📌 בקש כמטלה קבועה'}
                      </button>
                    )}
                    {isPending && (
                      <span className="text-xs text-amber-500 border border-amber-100 rounded-full px-2.5 py-1 bg-amber-50">
                        ⏳ ממתין לאישור דיירים
                      </span>
                    )}
                    {isMyFixed && (
                      <button
                        onClick={() => setConfirmReleaseTaskId(task.task_id)}
                        className="text-xs text-gray-400 border border-gray-100 rounded-full px-2.5 py-1 hover:bg-gray-50"
                      >
                        שחרר
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => openEdit(task)} className="text-gray-300 hover:text-gray-600 text-sm px-2 py-1">✏️</button>
                  <button onClick={() => setConfirmDeleteTaskId(task.task_id)} className="text-gray-300 hover:text-red-400 text-sm px-2 py-1">🗑</button>
                </div>
              </div>
            </div>
          )
        })}
      </main>

      {/* Confirm delete task modal */}
      {confirmDeleteTaskId && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-4" dir="rtl">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900">מחיקת משימה</h2>
              <button onClick={() => setConfirmDeleteTaskId(null)} className="text-gray-400">✕</button>
            </div>
            <p className="text-sm text-gray-500 mb-5">למחוק את המשימה לצמיתות?</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDeleteTaskId(null)} className="flex-1 border border-gray-200 rounded-lg py-2.5 text-sm">ביטול</button>
              <button
                onClick={() => { const id = confirmDeleteTaskId; setConfirmDeleteTaskId(null); deleteTask(id) }}
                className="flex-1 bg-red-500 text-white rounded-lg py-2.5 text-sm font-medium"
              >מחק</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm release fixed modal */}
      {confirmReleaseTaskId && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-4" dir="rtl">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900">שחרור מטלה קבועה</h2>
              <button onClick={() => setConfirmReleaseTaskId(null)} className="text-gray-400">✕</button>
            </div>
            <p className="text-sm text-gray-500 mb-5">לשחרר את המטלה הקבועה?</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmReleaseTaskId(null)} className="flex-1 border border-gray-200 rounded-lg py-2.5 text-sm">ביטול</button>
              <button
                onClick={() => { const id = confirmReleaseTaskId; setConfirmReleaseTaskId(null); releaseFixed(id) }}
                className="flex-1 bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium"
              >שחרר</button>
            </div>
          </div>
        </div>
      )}

      {/* Baseline modal */}
      {baselineModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-4" dir="rtl">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold text-gray-900">{baselineModal.taskTitle}</h2>
              <button onClick={() => setBaselineModal(null)} className="text-gray-400">✕</button>
            </div>

            {baselineModal.frequency === 'biweekly' && (() => {
              // Find next two occurrences of configDay from tomorrow
              const occurrences: Date[] = []
              const d = new Date(); d.setDate(d.getDate() + 1)
              while (occurrences.length < 2) {
                if (d.getDay() === baselineModal.configDay) occurrences.push(new Date(d))
                d.setDate(d.getDate() + 1)
              }
              return (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-gray-400 mb-1">מתי תרצי שהמטלה תופיע בפעם הראשונה?</p>
                  {occurrences.map((date, i) => {
                    const baseline = new Date(date); baseline.setDate(baseline.getDate() - 14)
                    return (
                      <button key={i}
                        onClick={() => confirmBaseline(localDateStr(baseline))}
                        className="w-full border border-gray-200 rounded-lg py-3 text-sm text-right px-4 hover:bg-gray-50"
                      >
                        {DAYS_HE_FULL[date.getDay()]} {date.getDate()}.{date.getMonth() + 1}
                        {i === 0 && <span className="text-gray-400 text-xs"> (הקרוב)</span>}
                      </button>
                    )
                  })}
                </div>
              )
            })()}

            {baselineModal.frequency === 'monthly' && (() => {
              const now = new Date()
              const occurrences: Date[] = []
              let d = new Date(now.getFullYear(), now.getMonth(), baselineModal.configDay)
              if (d <= now) d = new Date(now.getFullYear(), now.getMonth() + 1, baselineModal.configDay)
              occurrences.push(new Date(d))
              occurrences.push(new Date(d.getFullYear(), d.getMonth() + 1, d.getDate()))
              return (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-gray-400 mb-1">מתי תרצי שהמטלה תופיע בפעם הראשונה?</p>
                  {occurrences.map((date, i) => {
                    const baseline = new Date(date.getFullYear(), date.getMonth() - 1, date.getDate())
                    return (
                      <button key={i}
                        onClick={() => confirmBaseline(localDateStr(baseline))}
                        className="w-full border border-gray-200 rounded-lg py-3 text-sm text-right px-4 hover:bg-gray-50"
                      >
                        {date.getDate()}.{date.getMonth() + 1}
                        {i === 0 && <span className="text-gray-400 text-xs"> (הקרוב)</span>}
                      </button>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* Add modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-4" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">הוספת מטלה</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">שם המטלה</label>
                <input autoFocus type="text" value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  placeholder="כלים, שואב אבק, אשפה..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">אימוגי <span className="text-gray-400 font-normal">(אופציונלי)</span></label>
                <div className="flex flex-wrap gap-1.5">
                  {TASK_EMOJIS.map(e => (
                    <button key={e} type="button" onClick={() => setForm(f => ({ ...f, emoji: f.emoji === e ? '' : e }))}
                      className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center border transition-colors ${form.emoji === e ? 'border-indigo-600 bg-gray-100' : 'border-gray-200 hover:bg-gray-50'}`}>
                      {e}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">תדירות</label>
                <select value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
                  {Object.entries(FREQ_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              {form.frequency === 'specific_days' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">בחר ימים</label>
                  <div className="flex gap-1.5">
                    {DAYS_HE.map((d, i) => (
                      <button key={i} type="button" onClick={() => toggleSpecificDay(i)}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium border ${form.specific_days.includes(i) ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-600'}`}>{d}</button>
                    ))}
                  </div>
                </div>
              )}
              {(form.frequency === 'biweekly' || form.frequency === 'monthly') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {form.frequency === 'monthly' ? 'באיזה יום בשבוע (בערך)?' : 'איזה יום?'}
                  </label>
                  <div className="flex gap-1.5">
                    {DAYS_HE.map((d, i) => (
                      <button key={i} type="button" onClick={() => setForm(f => ({ ...f, weekly_day: i }))}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium border ${form.weekly_day === i ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-600'}`}>{d}</button>
                    ))}
                  </div>
                </div>
              )}
              {form.frequency === 'multiple_daily' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">זמני ביצוע (לפחות 2)</label>
                  <div className="space-y-2">
                    {SLOT_OPTIONS.map(slot => {
                      const isSel = slot.key in form.slots
                      return (
                        <div key={slot.key} className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              const s = { ...form.slots }
                              if (isSel) delete s[slot.key]
                              else s[slot.key] = slot.default
                              setForm(f => ({ ...f, slots: s }))
                            }}
                            className={`w-20 py-1.5 rounded-lg text-sm font-medium border text-center ${isSel ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-600'}`}
                          >{slot.label}</button>
                          {isSel && (
                            <input type="time" min={slot.min} max={slot.max} value={form.slots[slot.key]}
                              onChange={e => setForm(f => ({ ...f, slots: { ...f.slots, [slot.key]: e.target.value } }))}
                              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                          )}
                          {isSel && <span className="text-xs text-gray-400">{slot.min}–{slot.max}</span>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowForm(false)} className="flex-1 border border-gray-200 rounded-lg py-2.5 text-sm">ביטול</button>
              <button
                onClick={addTask}
                disabled={loading || !form.title.trim() ||
                  (form.frequency === 'specific_days' && form.specific_days.length === 0) ||
                  (form.frequency === 'multiple_daily' && Object.keys(form.slots).length < 2)}
                className="flex-1 bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-40"
              >{loading ? '...' : 'הוספה'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editingTask && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-4" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">עריכת מטלה</h2>
              <button onClick={() => { setEditingTask(null); setForm(emptyForm) }} className="text-gray-400">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">שם המטלה</label>
                <input autoFocus type="text" value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">אימוגי <span className="text-gray-400 font-normal">(אופציונלי)</span></label>
                <div className="flex flex-wrap gap-1.5">
                  {TASK_EMOJIS.map(e => (
                    <button key={e} type="button" onClick={() => setForm(f => ({ ...f, emoji: f.emoji === e ? '' : e }))}
                      className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center border transition-colors ${form.emoji === e ? 'border-indigo-600 bg-gray-100' : 'border-gray-200 hover:bg-gray-50'}`}>
                      {e}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">תדירות</label>
                <select value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
                  {Object.entries(FREQ_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              {form.frequency === 'specific_days' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">בחר ימים</label>
                  <div className="flex gap-1.5">
                    {DAYS_HE.map((d, i) => (
                      <button key={i} type="button" onClick={() => toggleSpecificDay(i)}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium border ${form.specific_days.includes(i) ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-600'}`}>{d}</button>
                    ))}
                  </div>
                </div>
              )}
              {(form.frequency === 'biweekly' || form.frequency === 'monthly') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {form.frequency === 'monthly' ? 'באיזה יום בשבוע (בערך)?' : 'איזה יום?'}
                  </label>
                  <div className="flex gap-1.5">
                    {DAYS_HE.map((d, i) => (
                      <button key={i} type="button" onClick={() => setForm(f => ({ ...f, weekly_day: i }))}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium border ${form.weekly_day === i ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-600'}`}>{d}</button>
                    ))}
                  </div>
                </div>
              )}
              {form.frequency === 'multiple_daily' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">זמני ביצוע (לפחות 2)</label>
                  <div className="space-y-2">
                    {SLOT_OPTIONS.map(slot => {
                      const isSel = slot.key in form.slots
                      return (
                        <div key={slot.key} className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              const s = { ...form.slots }
                              if (isSel) delete s[slot.key]
                              else s[slot.key] = slot.default
                              setForm(f => ({ ...f, slots: s }))
                            }}
                            className={`w-20 py-1.5 rounded-lg text-sm font-medium border text-center ${isSel ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-600'}`}
                          >{slot.label}</button>
                          {isSel && (
                            <input type="time" min={slot.min} max={slot.max} value={form.slots[slot.key]}
                              onChange={e => setForm(f => ({ ...f, slots: { ...f.slots, [slot.key]: e.target.value } }))}
                              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                          )}
                          {isSel && <span className="text-xs text-gray-400">{slot.min}–{slot.max}</span>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => { setEditingTask(null); setForm(emptyForm) }} className="flex-1 border border-gray-200 rounded-lg py-2.5 text-sm">ביטול</button>
              <button
                onClick={saveEdit}
                disabled={loading || !form.title.trim() ||
                  (form.frequency === 'specific_days' && form.specific_days.length === 0) ||
                  (form.frequency === 'multiple_daily' && Object.keys(form.slots).length < 2)}
                className="flex-1 bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-40"
              >{loading ? '...' : 'שמור'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
