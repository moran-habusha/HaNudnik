'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type Profile = { display_name: string; apartment_id: string; is_away: boolean; away_return_date: string | null; away_start_date: string | null; gender: string | null }
type Apartment = { id: string; name: string; mode: 'solo' | 'shared'; summary_day: number | null }
type ScoreEntry = { user_id: string; display_name: string; points: number }
type WinnerNotif = { id: string; title: string; body: string }

type Task = {
  task_id: string
  title: string
  frequency: string | null
  frequency_config: { days?: number[]; every?: number; day?: number; slots?: Record<string, string> } | null
  task_subtype: string | null
  fixed_user_id: string | null
  fixed_user_name: string | null
  instance_id: string | null
  due_date: string | null
  claimed_by: string | null
  claimed_by_name: string | null
  claimed_at: string | null
  reminder_time: string | null
  forfeited_by: string | null
  done_by: string | null
  done_by_name: string | null
  done_at: string | null
  points_multiplier: number
  slot: string | null
  overdue_from: string | null
  emoji: string | null
}

const SLOT_LABELS: Record<string, string> = {
  morning: 'בוקר', noon: 'צהריים', evening: 'ערב', night: 'לילה',
}

const SLOT_ORDER = ['morning', 'noon', 'evening', 'night']

type Veto = { user_id: string; display_name: string; task_id: string; task_title: string; source: string; expires_at: string }


export default function Dashboard() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [apartment, setApartment] = useState<Apartment | null>(null)
  const [scores, setScores] = useState<ScoreEntry[]>([])
  const [myUserId, setMyUserId] = useState<string | null>(null)
  const [winnerNotif, setWinnerNotif] = useState<WinnerNotif | null>(null)
  const [summaryNotif, setSummaryNotif] = useState<WinnerNotif | null>(null)
  const [needsVetoPick, setNeedsVetoPick] = useState<string[]>([])
  const [vetoSource, setVetoSource] = useState<'weekly' | 'monthly'>('weekly')
  const [vetoPickIndex, setVetoPickIndex] = useState(1)
  const [totalVetoPicks, setTotalVetoPicks] = useState(0)
  const [pageLoading, setPageLoading] = useState(true)
  const [tasks, setTasks] = useState<Task[]>([])
  const [fadingOut, setFadingOut] = useState<Set<string>>(new Set())
  const tasksRef = useRef<Task[]>([])
  const minutesRef = useRef<HTMLInputElement>(null)
  const [vetos, setVetos] = useState<Veto[]>([])
  const [vetoCandidates, setVetoCandidates] = useState<{ task_id: string; task_title: string; weekly_count: number }[]>([])
  const [claimingInstance, setClaimingInstance] = useState<string | null>(null)
  const [savingClaim, setSavingClaim] = useState(false)
  const [reminderTime, setReminderTime] = useState('')
  const [hoursInput, setHoursInput] = useState('')
  const [minutesInput, setMinutesInput] = useState('')
  const [showHoursDD, setShowHoursDD] = useState(false)
  const [showMinutesDD, setShowMinutesDD] = useState(false)
  const [delayingInstance, setDelayingInstance] = useState<string | null>(null)
  const [delayTime, setDelayTime] = useState('')
  const [completingTask, setCompletingTask] = useState<string | null>(null)
  const [showVetoModal, setShowVetoModal] = useState(false)
  const [selectedVetoTaskId, setSelectedVetoTaskId] = useState<string | null>(null)
  const [savingVeto, setSavingVeto] = useState(false)
  const [isAway, setIsAway] = useState(false)
  const [awayReturnDate, setAwayReturnDate] = useState<string | null>(null)
  const [awayStartDate, setAwayStartDate] = useState<string | null>(null)
  const [showAwayModal, setShowAwayModal] = useState(false)
  const [awayDateInput, setAwayDateInput] = useState('')
  const [awayStartInput, setAwayStartInput] = useState('')
  const [editingFutureAway, setEditingFutureAway] = useState(false)
  const [savingAway, setSavingAway] = useState(false)
  const [showLeaveModal, setShowLeaveModal] = useState(false)
  const [leavingApartment, setLeavingApartment] = useState(false)
  const [uncompleteModal, setUncompleteModal] = useState<{ instanceId: string; taskTitle: string; doneByName: string; isMine: boolean } | null>(null)
  const [penaltyClaimModal, setPenaltyClaimModal] = useState<{ instanceId: string; claimedAt: string } | null>(null)
  const [requestingUncomplete, setRequestingUncomplete] = useState(false)

  const [showRemoveModal, setShowRemoveModal] = useState(false)
  const [washMachine, setWashMachine] = useState<{ started_at: string; duration_minutes: number; machine_type: string } | null>(null)
  const [dryMachine, setDryMachine] = useState<{ started_at: string; duration_minutes: number; machine_type: string } | null>(null)
  const [showDryerModal, setShowDryerModal] = useState<string | null>(null)
  const [dryerDuration, setDryerDuration] = useState('')
  const [savingDryer, setSavingDryer] = useState(false)
  const [showShoppingReminder, setShowShoppingReminder] = useState(false)
  const [showWashModal, setShowWashModal] = useState<string | null>(null) // instance_id
  const [washDuration, setWashDuration] = useState('')
  const [washDoneChecked, setWashDoneChecked] = useState<Set<string>>(new Set())
  const [washEntries, setWashEntries] = useState<{ user_id: string; display_name: string; request: string }[]>([])
  const [savingWash, setSavingWash] = useState(false)
  const [extraWashAfterDryer, setExtraWashAfterDryer] = useState(false)
  const [washTimeLeft, setWashTimeLeft] = useState('')
  const [dryTimeLeft, setDryTimeLeft] = useState('')
  const [residents, setResidents] = useState<{ id: string; display_name: string }[]>([])
  const [removingResident, setRemovingResident] = useState(false)
  const [confirmRemoveTarget, setConfirmRemoveTarget] = useState<{id: string, name: string} | null>(null)
  const [showApartmentSettings, setShowApartmentSettings] = useState(false)
  const [editingAptName, setEditingAptName] = useState(false)
  const [newAptName, setNewAptName] = useState('')
  const [savingAptName, setSavingAptName] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [generatingInvite, setGeneratingInvite] = useState(false)
  const [residentCount, setResidentCount] = useState(0)
  const [inviteCopied, setInviteCopied] = useState(false)
  const router = useRouter()
  const supabase = createClient()


  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null

    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) { router.push('/auth'); return }
      setMyUserId(user.id)

      const { data: p } = await supabase.from('profiles').select('display_name, apartment_id, is_away, away_return_date, away_start_date, gender').eq('id', user.id).single()
      if (!p?.apartment_id) { router.push('/setup'); return }
      setProfile(p)
      setIsAway(p.is_away ?? false)
      setAwayReturnDate(p.away_return_date ?? null)
      setAwayStartDate(p.away_start_date ?? null)

      channel = supabase
        .channel('dashboard_realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'task_instances' }, () => {
          fetchTasksWithFade()
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, () => {
          fetchScores()
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'laundry_machine' }, async () => {
          const { data } = await supabase.from('laundry_machine').select('started_at, duration_minutes, machine_type').eq('apartment_id', p.apartment_id)
          const rows: { started_at: string; duration_minutes: number; machine_type: string }[] = data ?? []
          setWashMachine(rows.find(r => r.machine_type === 'wash') ?? null)
          setDryMachine(rows.find(r => r.machine_type === 'dry') ?? null)
        })
        .subscribe()

      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

      const [{ data: apt }, { data: machineData }] = await Promise.all([
        supabase.from('apartments').select('id, name, mode, summary_day').eq('id', p.apartment_id).single(),
        supabase.from('laundry_machine').select('started_at, duration_minutes, machine_type').eq('apartment_id', p.apartment_id),
      ])
      const machineRows: { started_at: string; duration_minutes: number; machine_type: string }[] = machineData ?? []
      setWashMachine(machineRows.find(r => r.machine_type === 'wash') ?? null)
      setDryMachine(machineRows.find(r => r.machine_type === 'dry') ?? null)
      setApartment(apt)

      if (apt?.mode === 'shared') {
        const [
          { data: s },
          { data: notifs },
          { data: summaryNotifs },
          { data: vetoData },
          { data: needsVeto },
        ] = await Promise.all([
          supabase.rpc('get_weekly_scores'),
          supabase.from('notifications').select('id, title, body').eq('user_id', user.id).eq('type', 'winner').eq('is_read', false).gte('created_at', cutoff).order('created_at', { ascending: false }).limit(1),
          supabase.from('notifications').select('id, title, body').eq('user_id', user.id).eq('type', 'weekly_summary').eq('is_read', false).gte('created_at', cutoff).order('created_at', { ascending: false }).limit(1),
          supabase.rpc('get_active_vetos'),
          supabase.rpc('needs_veto_pick'),
        ])
        const sortedScores = (s ?? []).sort((a: ScoreEntry, b: ScoreEntry) => {
          if (b.points !== a.points) return b.points - a.points
          if (a.user_id === user.id) return -1
          if (b.user_id === user.id) return 1
          return 0
        })
        setScores(sortedScores)
        if (notifs?.[0]) setWinnerNotif(notifs[0])
        if (summaryNotifs?.[0]) setSummaryNotif(summaryNotifs[0])
        setVetos(vetoData ?? [])
        const pendingSources: string[] = needsVeto ?? []
        setNeedsVetoPick(pendingSources)
        setTotalVetoPicks(pendingSources.length)
        setVetoPickIndex(1)
        if (pendingSources.length > 0) openVetoModal(pendingSources[0] as 'weekly' | 'monthly')
      }

      supabase.rpc('ensure_today_instances').then(({ error }) => {
        if (error) console.error('ensure_today_instances error:', error)
        fetchTasks(true)
      })
    }
    load()

    return () => {
      if (channel) supabase.removeChannel(channel)
    }
  }, [])

  function calcTimeLeft(machine: { started_at: string; duration_minutes: number } | null): string {
    if (!machine) return ''
    const end = new Date(new Date(machine.started_at).getTime() + machine.duration_minutes * 60000)
    const diffMs = end.getTime() - Date.now()
    if (diffMs <= 0) return 'הסתיים'
    const totalMins = Math.ceil(diffMs / 60000)
    const hours = Math.floor(totalMins / 60)
    const mins = totalMins % 60
    const endStr = end.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
    if (hours > 0) return `נשאר ${hours}:${String(mins).padStart(2, '0')} שעות · מסתיים ב-${endStr}`
    return `נשאר ${totalMins} דקות · מסתיים ב-${endStr}`
  }

  useEffect(() => {
    function update() {
      setWashTimeLeft(calcTimeLeft(washMachine))
      setDryTimeLeft(calcTimeLeft(dryMachine))
    }
    update()
    const id = setInterval(update, 60000)
    return () => clearInterval(id)
  }, [washMachine, dryMachine])

  async function fetchTasks(initial = false) {
    const { data, error } = await supabase.rpc('get_tasks')
    if (error) console.error('get_tasks error:', error)
    const newTasks = data ?? []
    tasksRef.current = newTasks
    setTasks(newTasks)
    if (initial) setPageLoading(false)
  }

  async function fetchTasksWithFade() {
    const { data, error } = await supabase.rpc('get_tasks')
    if (error) console.error('get_tasks error:', error)
    const newTasks = data ?? []
    const newIds = new Set(newTasks.map((t: Task) => t.instance_id).filter(Boolean))
    const stateKey = (t: Task) => `${t.claimed_by ?? ''}|${t.done_by ?? ''}|${t.forfeited_by ?? ''}`
    const newStateMap = new Map(newTasks.filter((t: Task) => t.instance_id).map((t: Task) => [t.instance_id!, stateKey(t)]))
    const toFade = tasksRef.current
      .filter(t => t.instance_id && (!newIds.has(t.instance_id) || newStateMap.get(t.instance_id) !== stateKey(t)))
      .map(t => t.instance_id!)
    if (toFade.length > 0) {
      setFadingOut(new Set(toFade))
      setTimeout(() => {
        tasksRef.current = newTasks
        setTasks(newTasks)
        setFadingOut(new Set())
      }, 300)
    } else {
      tasksRef.current = newTasks
      setTasks(newTasks)
    }
  }

  async function fetchScores(currentUserId?: string) {
    const { data } = await supabase.rpc('get_weekly_scores')
    const uid = currentUserId ?? myUserId
    const sorted = (data ?? []).sort((a: ScoreEntry, b: ScoreEntry) => {
      if (b.points !== a.points) return b.points - a.points
      if (a.user_id === uid) return -1
      if (b.user_id === uid) return 1
      return 0
    })
    setScores(sorted)
  }

  async function dismissWinner(id: string) {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id)
    setWinnerNotif(null)
  }

  function openClaim(instanceId: string) {
    setReminderTime('')
    setHoursInput('')
    setMinutesInput('')
    setClaimingInstance(instanceId)
  }

  async function confirmClaim() {
    if (!claimingInstance || savingClaim) return
    setSavingClaim(true)
    const { error } = await supabase.rpc('claim_task', {
      p_instance_id: claimingInstance,
      p_reminder_time: reminderTime,
    })
    if (error) { alert('שגיאה: ' + error.message); setSavingClaim(false); return }
    await supabase.rpc('schedule_reminder_after_claim', {
      p_instance_id: claimingInstance,
      p_reminder_time: reminderTime,
      p_user_id: myUserId,
    })
    setClaimingInstance(null)
    setSavingClaim(false)
    fetchTasks()
  }

  async function cancelClaim(instanceId: string, claimedAt: string | null) {
    const isPenalty = claimedAt && (Date.now() - new Date(claimedAt).getTime()) > 30 * 60 * 1000
    if (isPenalty) { setPenaltyClaimModal({ instanceId, claimedAt }); return }
    await executeCancelClaim(instanceId, false)
  }

  async function executeCancelClaim(instanceId: string, isPenalty: boolean) {
    const { error } = await supabase.rpc('cancel_claim', { p_instance_id: instanceId })
    if (error) { alert('שגיאה: ' + error.message); return }
    if (apartment?.mode === 'shared') {
      await supabase.rpc('notify_forfeit_to_others', { p_instance_id: instanceId })
    }
    fetchTasks()
    if (isPenalty && apartment?.mode === 'shared') fetchScores()
  }

  function openDelay(instanceId: string, currentTime: string | null) {
    setDelayTime(currentTime?.slice(0, 5) ?? '')
    setDelayingInstance(instanceId)
  }

  async function confirmDelay() {
    if (!delayingInstance) return
    const { error } = await supabase.rpc('delay_reminder', {
      p_instance_id: delayingInstance,
      p_new_time: delayTime,
    })
    if (error) { alert('שגיאה: ' + error.message); return }
    await supabase.rpc('schedule_reminder_after_claim', {
      p_instance_id: delayingInstance,
      p_reminder_time: delayTime,
      p_user_id: myUserId,
    })
    setDelayingInstance(null)
    fetchTasks()
  }

  async function claimSlot(instanceId: string, reminderTime: string | null) {
    const { error } = await supabase.rpc('claim_task', {
      p_instance_id: instanceId,
      p_reminder_time: reminderTime,
    })
    if (error) { alert('שגיאה: ' + error.message); return }
    if (reminderTime) {
      await supabase.rpc('schedule_reminder_after_claim', {
        p_instance_id: instanceId,
        p_reminder_time: reminderTime,
        p_user_id: myUserId,
      })
    }
    fetchTasks()
  }

  async function completeTask(instanceId: string, taskId: string, subtype?: string | null) {
    const { error } = await supabase.rpc('complete_task', { p_instance_id: instanceId })
    if (error) { alert('שגיאה: ' + error.message); return }
    setCompletingTask(taskId)
    if (subtype === 'shopping') setShowShoppingReminder(true)
    setTimeout(() => { setCompletingTask(null); fetchTasks(); fetchScores() }, 600)
  }

  function formatDoneAt(doneAt: string | null): string {
    if (!doneAt) return ''
    return new Date(doneAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
  }

  function isLaundryTaskLocked(subtype: string | null): boolean {
    if (subtype === 'laundry_hang' || subtype === 'laundry_dry') {
      if (!washMachine) return false
      const end = new Date(new Date(washMachine.started_at).getTime() + washMachine.duration_minutes * 60000)
      return end.getTime() > Date.now()
    }
    if (subtype === 'laundry_fold') {
      if (!dryMachine) return false
      const end = new Date(new Date(dryMachine.started_at).getTime() + dryMachine.duration_minutes * 60000)
      return end.getTime() > Date.now()
    }
    return false
  }

  function getLaundryEndTime(subtype: string | null): string | null {
    if ((subtype === 'laundry_hang' || subtype === 'laundry_dry') && washMachine) {
      const end = new Date(new Date(washMachine.started_at).getTime() + washMachine.duration_minutes * 60000)
      return `מכונה מסיימת ב-${end.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`
    }
    if (subtype === 'laundry_fold' && dryMachine) {
      const end = new Date(new Date(dryMachine.started_at).getTime() + dryMachine.duration_minutes * 60000)
      return `מייבש מסיים ב-${end.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`
    }
    return null
  }

  async function completeLaundryTask(task: Task) {
    if (task.task_subtype === 'laundry_dry') {
      setShowDryerModal(task.instance_id!)
      return
    }
    if (task.task_subtype === 'laundry_wash') {
      const { data } = await supabase.rpc('get_laundry_requests')
      const all: { user_id: string; display_name: string; request: string }[] = data ?? []
      setWashEntries(all.filter(e => e.request?.trim()))
      setWashDoneChecked(new Set())
      setWashDuration('')
      setShowWashModal(task.instance_id!)
      return
    }
    const { error } = await supabase.rpc('complete_task', { p_instance_id: task.instance_id! })
    if (error) { alert('שגיאה: ' + error.message); return }
    if (task.task_subtype === 'laundry_hang' && apartment) {
      await supabase.from('laundry_machine').delete().eq('apartment_id', apartment.id).eq('machine_type', 'wash')
      setWashMachine(null)
    } else if (task.task_subtype === 'laundry_fold' && apartment) {
      await supabase.from('laundry_machine').delete().eq('apartment_id', apartment.id).eq('machine_type', 'dry')
      setDryMachine(null)
    }
    setCompletingTask(task.task_id)
    setTimeout(() => { setCompletingTask(null); fetchTasks(); fetchScores() }, 600)
  }

  async function confirmWash() {
    if (!showWashModal || !apartment || !myUserId) return
    const mins = parseInt(washDuration)
    if (!mins || mins <= 0) return
    setSavingWash(true)
    const startedAt = new Date().toISOString()

    const histEntries = washEntries.map(entry => {
      const lines = entry.request.split('\n').filter(l => l.trim())
      const done = lines.filter((_, i) => washDoneChecked.has(`${entry.user_id}::${i}`)).map(l => l.replace(/^[•\-]\s*/, ''))
      const kept = lines.filter((_, i) => !washDoneChecked.has(`${entry.user_id}::${i}`)).map(l => l.replace(/^[•\-]\s*/, ''))
      return { user_id: entry.user_id, display_name: entry.display_name, done, kept }
    })

    await supabase.from('laundry_machine').upsert({
      apartment_id: apartment.id, started_by: myUserId, started_at: startedAt,
      duration_minutes: mins, machine_type: 'wash',
    }, { onConflict: 'apartment_id,machine_type' })

    await supabase.from('laundry_history').insert({
      apartment_id: apartment.id, started_at: startedAt,
      finished_at: new Date(Date.now() + mins * 60000).toISOString(),
      duration_minutes: mins, entries: histEntries,
    })

    for (const entry of washEntries) {
      const lines = entry.request.split('\n').filter(l => l.trim())
      const remaining = lines.filter((_, i) => !washDoneChecked.has(`${entry.user_id}::${i}`))
      const newRequest = remaining.join('\n')
      if (entry.user_id === myUserId) {
        await supabase.rpc('upsert_laundry_request', { p_request: newRequest })
      } else {
        await supabase.rpc('update_laundry_request_for_user', { p_user_id: entry.user_id, p_request: newRequest })
      }
    }

    await supabase.rpc('finish_laundry_machine', { p_apartment_id: apartment.id })

    const { data: machineData } = await supabase.from('laundry_machine')
      .select('started_at, duration_minutes, machine_type').eq('apartment_id', apartment.id)
    const washRows: { started_at: string; duration_minutes: number; machine_type: string }[] = machineData ?? []
    setWashMachine(washRows.find(r => r.machine_type === 'wash') ?? null)
    setDryMachine(washRows.find(r => r.machine_type === 'dry') ?? null)
    setShowWashModal(null)
    setWashDuration('')
    setWashDoneChecked(new Set())
    setSavingWash(false)
    fetchTasks()
    fetchScores()
  }

  async function confirmDryer() {
    if (!showDryerModal || !apartment) return
    const mins = parseInt(dryerDuration)
    if (!mins || mins <= 0) return
    setSavingDryer(true)
    const { error } = await supabase.rpc('complete_task', { p_instance_id: showDryerModal })
    if (error) { alert('שגיאה: ' + error.message); setSavingDryer(false); return }
    await supabase.from('laundry_machine').upsert({
      apartment_id: apartment.id,
      started_by: myUserId,
      started_at: new Date().toISOString(),
      duration_minutes: mins,
      machine_type: 'dry',
    }, { onConflict: 'apartment_id,machine_type' })
    const { data: machineData } = await supabase
      .from('laundry_machine')
      .select('started_at, duration_minutes, machine_type')
      .eq('apartment_id', apartment.id)
    const machineRows: { started_at: string; duration_minutes: number; machine_type: string }[] = machineData ?? []
    setWashMachine(machineRows.find(r => r.machine_type === 'wash') ?? null)
    setDryMachine(machineRows.find(r => r.machine_type === 'dry') ?? null)
    const taskId = tasks.find(t => t.instance_id === showDryerModal)?.task_id
    const shouldOpenExtraWash = extraWashAfterDryer
    setShowDryerModal(null)
    setDryerDuration('')
    setExtraWashAfterDryer(false)
    setSavingDryer(false)
    if (taskId) setCompletingTask(taskId)
    setTimeout(() => { setCompletingTask(null); fetchTasks(); fetchScores() }, 600)
    if (shouldOpenExtraWash) await openExtraWash()
  }

  async function openExtraWash() {
    const { data } = await supabase.rpc('get_laundry_requests')
    const all: { user_id: string; display_name: string; request: string }[] = data ?? []
    setWashEntries(all.filter(e => e.request?.trim()))
    setWashDoneChecked(new Set())
    setWashDuration('')
    setShowWashModal('extra')
  }

  async function openVetoModal(source: 'weekly' | 'monthly' = 'weekly') {
    setVetoSource(source)
    setSelectedVetoTaskId(null)
    setShowVetoModal(true)
    const { data } = await supabase.rpc('get_veto_candidates')
    setVetoCandidates(data ?? [])
  }

  async function confirmVeto() {
    if (!selectedVetoTaskId) return
    setSavingVeto(true)
    const { error } = await supabase.rpc('set_veto', { p_task_id: selectedVetoTaskId, p_source: vetoSource })
    if (error) { alert('שגיאה: ' + error.message); setSavingVeto(false); return }
    const { data: vetoData } = await supabase.rpc('get_active_vetos')
    setVetos(vetoData ?? [])
    fetchTasks()
    const remaining = needsVetoPick.filter(s => s !== vetoSource)
    setNeedsVetoPick(remaining)
    setShowVetoModal(false)
    setSavingVeto(false)
    setSelectedVetoTaskId(null)
    // if weekly winner banner → dismiss it
    if (vetoSource === 'weekly' && winnerNotif) {
      await supabase.from('notifications').update({ is_read: true }).eq('id', winnerNotif.id)
      setWinnerNotif(null)
    }
    // open again if another source is still pending
    if (remaining.length > 0) {
      setVetoPickIndex(totalVetoPicks - remaining.length + 1)
      setTimeout(() => openVetoModal(remaining[0] as 'weekly' | 'monthly'), 300)
    }
  }

  async function confirmSetAway() {
    setSavingAway(true)
    const today = new Date().toISOString().slice(0, 10)
    const startDate = awayStartInput || today
    const returnDate = awayDateInput || null
    const { error: awayErr } = await supabase.rpc('set_away', { p_return_date: returnDate, p_start_date: startDate })
    if (awayErr) { console.error('set_away error:', awayErr); alert('שגיאה: ' + awayErr.message); setSavingAway(false); return }
    if (startDate <= today) {
      window.location.reload()
      return
    } else {
      setAwayStartDate(startDate)
    }
    setAwayReturnDate(returnDate)
    setShowAwayModal(false)
    setAwayDateInput('')
    setAwayStartInput('')
    setSavingAway(false)
  }

  async function confirmReturnFromAway() {
    setSavingAway(true)
    await supabase.rpc('return_from_away')
    setIsAway(false)
    setAwayReturnDate(null)
    setAwayStartDate(null)
    setShowAwayModal(false)
    // intentionally not resetting savingAway — keeps button disabled after click
  }

  async function cancelFutureAway() {
    setSavingAway(true)
    await supabase.rpc('cancel_future_away')
    setAwayStartDate(null)
    setAwayReturnDate(null)
    setShowAwayModal(false)
    setSavingAway(false)
  }



  async function confirmUncomplete() {
    if (!uncompleteModal) return
    setRequestingUncomplete(true)
    if (uncompleteModal.isMine) {
      const { error } = await supabase.rpc('uncomplete_task', { p_instance_id: uncompleteModal.instanceId })
      if (error) { alert('שגיאה: ' + error.message); setRequestingUncomplete(false); return }
      setUncompleteModal(null)
      fetchTasks()
      fetchScores()
    } else {
      const { error } = await supabase.rpc('request_uncomplete_task', { p_instance_id: uncompleteModal.instanceId })
      if (error) { alert('שגיאה: ' + error.message); setRequestingUncomplete(false); return }
      setUncompleteModal(null)
    }
    setRequestingUncomplete(false)
  }

  async function openRemoveModal() {
    if (!apartment || !myUserId) return
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name')
      .eq('apartment_id', apartment.id)
      .neq('id', myUserId)
    setResidents(data ?? [])
    setShowRemoveModal(true)
  }

  async function requestRemoval(targetId: string) {
    if (!myUserId) return
    setRemovingResident(true)
    await supabase.rpc('request_resident_removal', { p_target_id: targetId, p_requester_id: myUserId })
    setRemovingResident(false)
    setShowRemoveModal(false)
  }

  async function saveAptName() {
    if (!apartment || !newAptName.trim()) return
    setSavingAptName(true)
    await supabase.from('apartments').update({ name: newAptName.trim() }).eq('id', apartment.id)
    await supabase.rpc('notify_apartment_renamed', { p_apartment_id: apartment.id, p_new_name: newAptName.trim() })
    setApartment({ ...apartment, name: newAptName.trim() })
    setEditingAptName(false)
    setSavingAptName(false)
  }

  async function openInviteModal() {
    setShowApartmentSettings(false)
    setInviteCode(null)
    const { count } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('apartment_id', apartment!.id)
    setResidentCount(count ?? 1)
    setShowInviteModal(true)
  }

  async function generateInvite() {
    if (!apartment || !myUserId) return
    setGeneratingInvite(true)
    const { data, error } = await supabase
      .from('invites')
      .insert({ apartment_id: apartment.id, created_by: myUserId })
      .select('id')
      .single()
    if (error || !data) { alert('שגיאה ביצירת הזמנה'); setGeneratingInvite(false); return }
    setInviteCode(data.id)
    setGeneratingInvite(false)
  }

  async function leaveApartment() {
    if (!myUserId || !apartment) return
    setLeavingApartment(true)
    await supabase.rpc('leave_apartment', { p_apartment_id: apartment.id, p_user_id: myUserId })
    await supabase.auth.signOut()
    router.push('/auth')
  }

  if (!profile || !apartment) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-400 text-sm">טוען...</div></div>
  }

  const maxPoints = scores.length > 0 ? Math.max(...scores.map(s => s.points)) : 0
  const isSummaryDay = apartment.summary_day !== null && new Date().getDay() === apartment.summary_day
  const leaders = scores.filter(s => s.points > 0 && s.points === maxPoints)
  const showSummaryBanner = isSummaryDay && leaders.length > 0

  // Only today's tasks (have an instance)
  const todayTasks = tasks.filter(t => t.instance_id !== null)

  // Regular tasks (non-slot)
  const regularTasks = todayTasks.filter(t => t.frequency !== 'multiple_daily')
  const doneTasks = regularTasks.filter(t => t.done_at).sort((a, b) => new Date(b.done_at!).getTime() - new Date(a.done_at!).getTime())

  // Pending tasks sorted by spec:
  // 1. overdue (נדחו מיום אחר)
  // 2. forfeited/released (שוחרר)
  // 3. claimed by me without reminder → claimed by me with reminder
  // 4. open (unclaimed, not my veto last)
  // 5. others' tasks (claimed by someone else or fixed to someone else)
  const isOthersTask = (t: Task) =>
    (t.fixed_user_id && t.fixed_user_id !== myUserId) ||
    (t.claimed_by && t.claimed_by !== myUserId)

  const myPendingTasks = regularTasks.filter(t => !t.done_at && !isOthersTask(t) && (t.overdue_from || t.claimed_by === myUserId)).sort((a, b) => {
    if (a.overdue_from && !b.overdue_from) return -1
    if (!a.overdue_from && b.overdue_from) return 1
    return 0
  })

  const openTasks = regularTasks.filter(t => !t.done_at && !isOthersTask(t) && !t.overdue_from && t.claimed_by !== myUserId).sort((a, b) => {
    const aVeto = vetos.find(v => v.task_id === a.task_id)?.user_id === myUserId
    const bVeto = vetos.find(v => v.task_id === b.task_id)?.user_id === myUserId
    if (aVeto && !bVeto) return 1
    if (!aVeto && bVeto) return -1
    return 0
  })

  const othersTasks = regularTasks.filter(t => !t.done_at && isOthersTask(t))

  // Multi-slot tasks: pending slots grouped for the task card, done slots go to done list
  const multiSlotGroupsAll: Record<string, Task[]> = {}
  const doneSlots: Task[] = []
  tasks.filter(t => t.frequency === 'multiple_daily').forEach(t => {
    if (t.done_at) {
      doneSlots.push(t)
    } else {
      if (!multiSlotGroupsAll[t.task_id]) multiSlotGroupsAll[t.task_id] = []
      multiSlotGroupsAll[t.task_id].push(t)
    }
  })
  Object.values(multiSlotGroupsAll).forEach(group =>
    group.sort((a, b) => SLOT_ORDER.indexOf(a.slot ?? '') - SLOT_ORDER.indexOf(b.slot ?? ''))
  )
  // Groups where all remaining slots are claimed by others → move to othersTasks section
  const multiSlotGroups: Record<string, Task[]> = {}
  const othersMultiSlotGroups: Record<string, Task[]> = {}
  Object.entries(multiSlotGroupsAll).forEach(([taskId, slots]) => {
    const allClaimedByOthers = slots.every(s => s.claimed_by && s.claimed_by !== myUserId)
    if (allClaimedByOthers) {
      othersMultiSlotGroups[taskId] = slots
    } else {
      multiSlotGroups[taskId] = slots
    }
  })

  function getVeto(taskId: string) {
    return vetos.find(v => v.task_id === taskId) ?? null
  }

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-4 py-4 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-gray-900">HaNudnik</h1>
          <p className="text-xs text-gray-500">{apartment.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setAwayStartInput(new Date().toISOString().slice(0, 10)); setShowAwayModal(true) }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              isAway
                ? 'bg-amber-50 border-amber-200 text-amber-700'
                : awayStartDate
                  ? 'bg-blue-50 border-blue-200 text-blue-700'
                  : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
            }`}
          >
            <span>{isAway ? '✈️' : awayStartDate ? '🧳' : '🏠'}</span>
            <span>
              {isAway ? 'בחופשה' : awayStartDate
                ? `נסיעה ב-${new Date(awayStartDate + 'T00:00:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })}`
                : 'בבית'}
            </span>
          </button>
          <button
            onClick={() => setShowApartmentSettings(true)}
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-50 text-gray-500 hover:text-gray-700 text-xl"
          >⚙️</button>
        </div>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-4">

        {/* Winner notification */}
        {winnerNotif && (
          <div className="bg-yellow-50 border border-yellow-300 rounded-xl px-4 py-3 flex items-start gap-3">
            <span className="text-xl mt-0.5">🏆</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-yellow-900">{winnerNotif.title}</p>
              <p className="text-xs text-yellow-800 mt-0.5">{winnerNotif.body}</p>
              {needsVetoPick.includes('weekly') ? (
                <button
                  onClick={() => openVetoModal('weekly')}
                  className="mt-2 text-xs font-semibold text-yellow-900 bg-yellow-200 hover:bg-yellow-300 rounded-full px-3 py-1"
                >בחר וטו עכשיו →</button>
              ) : (
                <p className="text-xs text-yellow-700 mt-1">הוטו נבחר ✓</p>
              )}
            </div>
            {!needsVetoPick.includes('weekly') && (
              <button onClick={() => dismissWinner(winnerNotif.id)} className="text-yellow-400 hover:text-yellow-600 text-lg leading-none">✕</button>
            )}
          </div>
        )}

        {/* Weekly summary notification */}
        {!winnerNotif && summaryNotif && (
          <div className="bg-yellow-50 border border-yellow-300 rounded-xl px-4 py-3 flex items-start gap-3">
            <span className="text-xl mt-0.5">📊</span>
            <div className="flex-1">
              <p className="text-xs text-yellow-800 whitespace-pre-line">{summaryNotif.body}</p>
            </div>
            <button
              onClick={async () => { await supabase.from('notifications').update({ is_read: true }).eq('id', summaryNotif.id); setSummaryNotif(null) }}
              className="text-yellow-400 hover:text-yellow-600 text-lg leading-none"
            >✕</button>
          </div>
        )}

        {/* Summary day banner */}
        {apartment.mode === 'shared' && showSummaryBanner && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <span className="text-xl">🏆</span>
            <p className="text-sm text-yellow-900">
              {leaders.length === 1
                ? `${leaders[0].display_name} ניצח/ה השבוע עם ${leaders[0].points} נק׳`
                : `תיקו! ${leaders.map(l => l.display_name).join(', ')} - ${leaders[0].points} נק׳`}
            </p>
          </div>
        )}

        {/* Weekly scores */}
        {apartment.mode === 'shared' && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900">ניקוד שבועי</h2>
              <button onClick={() => router.push('/history')} className="text-lg hover:opacity-70" title="היסטוריה">📊</button>
            </div>
            {pageLoading ? (
              <div className="space-y-3 animate-pulse">
                {[1,2,3].map(i => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-5 h-4 bg-gray-200 rounded" />
                    <div className="flex-1 space-y-1.5">
                      <div className="flex justify-between">
                        <div className="h-3.5 bg-gray-200 rounded w-20" />
                        <div className="h-3.5 bg-gray-200 rounded w-8" />
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5" />
                    </div>
                  </div>
                ))}
              </div>
            ) : scores.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-2">אין נקודות עדיין השבוע</p>
            ) : (
              <div className="space-y-2">
                {scores.map((entry, i) => (
                  <div key={entry.user_id} className="flex items-center gap-3">
                    <span className="text-sm w-5 text-gray-400 text-center">
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-sm ${entry.user_id === myUserId ? 'font-bold text-gray-900' : 'text-gray-700'}`}>
                          {entry.display_name}{entry.user_id === myUserId ? ` (${profile?.gender === 'female' ? 'את' : profile?.gender === 'male' ? 'אתה' : 'את/ה'})` : ''}
                        </span>
                        <span className="text-sm font-semibold text-gray-900">{entry.points}</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full transition-all ${i === 0 ? 'bg-yellow-400' : i === 1 ? 'bg-gray-400' : i === 2 ? 'bg-orange-400' : 'bg-blue-300'}`}
                          style={{ width: maxPoints > 0 ? `${(entry.points / maxPoints) * 100}%` : '0%' }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Laundry machine timers */}
        {washMachine && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <span className="text-xl">🧺</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-blue-900">מכונת כביסה פועלת</p>
              <p className="text-xs text-blue-700">{washTimeLeft}</p>
            </div>
            <button onClick={() => router.push('/laundry')} className="text-xs text-blue-600 underline shrink-0">פתח</button>
          </div>
        )}
        {dryMachine && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <span className="text-xl">🌀</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-900">מייבש פועל</p>
              <p className="text-xs text-red-700">{dryTimeLeft}</p>
            </div>
            <button onClick={() => router.push('/laundry')} className="text-xs text-red-600 underline shrink-0">פתח</button>
          </div>
        )}

        {/* Today's tasks */}
        <div>
          <h2 className="text-xs font-semibold text-gray-400 uppercase mb-2">משימות היום</h2>

          {pageLoading && (
            <div className="space-y-2 animate-pulse">
              {[1,2,3].map(i => (
                <div key={i} className="bg-white rounded-xl border border-gray-100 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-gray-200 rounded w-28" />
                      <div className="h-3 bg-gray-100 rounded w-20" />
                    </div>
                    <div className="h-8 bg-gray-200 rounded-lg w-20" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {todayTasks.length === 0 && !pageLoading && (
            <div className="bg-white rounded-xl border border-gray-100 p-6 text-center">
              <p className="text-gray-700 font-medium">ככה לא מנהלים דירה {profile?.gender === 'female' ? 'גברת' : 'גבר'}!</p>
              <p className="text-gray-400 text-sm mt-1">אין משימות להיום 🎉</p>
            </div>
          )}

          {myPendingTasks.length > 0 && (
            <div className="space-y-2">
              {myPendingTasks.map(task => {
                const veto = getVeto(task.task_id)
                const isMyVeto = veto?.user_id === myUserId
                return (
                  <div
                    key={task.instance_id ?? task.task_id}
                    className={`bg-white rounded-xl border p-4 transition-all duration-300
                      ${task.overdue_from ? 'border-red-300' : task.claimed_by ? 'border-blue-100' : 'border-gray-100'}
                      ${completingTask === task.task_id || (task.instance_id && fadingOut.has(task.instance_id)) ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}
                    `}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-gray-900">{task.emoji ? `${task.emoji} ${task.title}` : task.title}</p>
                          {task.points_multiplier > 1 && apartment?.mode !== 'solo' && (
                            <span className="text-xs bg-orange-100 text-orange-600 font-semibold px-1.5 py-0.5 rounded-full">
                              ×{task.points_multiplier}
                            </span>
                          )}
                        </div>
                        {veto && (
                          <p className="text-xs text-purple-500 mt-0.5">
                            🛡️ {isMyVeto ? 'הוטו שלך' : `וטו של ${veto.display_name}`}
                          </p>
                        )}
                        {task.overdue_from && (
                          <p className="text-xs text-red-400 mt-0.5">
                            נדחה מ-{new Date(task.overdue_from).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })}
                          </p>
                        )}
                        {task.forfeited_by && !task.claimed_by && (
                          <p className="text-xs text-orange-500 mt-0.5">שוחרר 🔥</p>
                        )}
                        {task.claimed_by && (apartment?.mode !== 'solo' || task.claimed_by !== myUserId) && (
                          <p className="text-xs text-blue-500 mt-0.5">
                            {task.claimed_by === myUserId ? 'לקחתי על עצמי' : `${task.claimed_by_name} על זה`}
                            {task.reminder_time && <span className="text-gray-400"> · תזכורת ב-{task.reminder_time.slice(0, 5)}</span>}
                          </p>
                        )}
                        {task.claimed_by === myUserId && apartment?.mode === 'solo' && task.reminder_time && (
                          <p className="text-xs text-gray-400 mt-0.5">🔔 תזכורת ב-{task.reminder_time.slice(0, 5)}</p>
                        )}
                        {task.fixed_user_name && apartment?.mode !== 'solo' && (
                          <p className="text-xs text-purple-500 mt-0.5">קבוע: {task.fixed_user_name}</p>
                        )}
                        {getLaundryEndTime(task.task_subtype) && (
                          <p className="text-xs text-blue-500 mt-0.5">⏱ {getLaundryEndTime(task.task_subtype)}</p>
                        )}
                      </div>
                    </div>

                    {(task.task_subtype === 'laundry_hang' || task.task_subtype === 'laundry_dry') && (
                      <div className="mt-2">
                        <button
                          onClick={openExtraWash}
                          className="text-xs text-blue-500 border border-blue-100 rounded-full px-3 py-1 hover:bg-blue-50"
                        >🧺 הפעל מכונה נוספת</button>
                      </div>
                    )}

                    <div className="flex gap-2 mt-3">
                      {task.claimed_by === myUserId ? (
                        <>
                          <button
                            onClick={() => task.task_subtype?.startsWith('laundry_') ? completeLaundryTask(task) : completeTask(task.instance_id!, task.task_id, task.task_subtype)}
                            disabled={isLaundryTaskLocked(task.task_subtype)}
                            className="flex-1 bg-green-50 text-green-700 rounded-lg py-2 text-sm font-medium hover:bg-green-100 disabled:opacity-40 disabled:cursor-not-allowed"
                          >{task.task_subtype === 'laundry_dry' ? 'הכנסתי למייבש ✓' : 'סמן כבוצע ✓'}</button>
                          {task.reminder_time && (
                            <button
                              onClick={() => openDelay(task.instance_id!, task.reminder_time)}
                              className="bg-blue-50 text-blue-500 rounded-lg px-3 py-2 text-sm hover:bg-blue-100"
                            >דחה</button>
                          )}
                          <button
                            onClick={() => cancelClaim(task.instance_id!, task.claimed_at)}
                            className="bg-gray-50 text-gray-500 rounded-lg px-3 py-2 text-sm hover:bg-gray-100"
                          >ביטול</button>
                        </>
                      ) : !task.claimed_by && (!task.fixed_user_id || task.fixed_user_id === myUserId) ? (
                        isMyVeto ? (
                          <button disabled className="flex-1 bg-purple-50 text-purple-400 rounded-lg py-2 text-sm font-medium cursor-not-allowed opacity-60">
                            לא זמין (וטו)
                          </button>
                        ) : (
                          <button
                            onClick={() => openClaim(task.instance_id!)}
                            disabled={task.forfeited_by === myUserId}
                            className="flex-1 bg-blue-50 text-blue-700 rounded-lg py-2 text-sm font-medium hover:bg-blue-100 disabled:opacity-30 disabled:cursor-not-allowed"
                          >{task.forfeited_by === myUserId ? 'ויתרת היום' : apartment?.mode === 'solo' ? `${profile?.gender === 'female' ? 'קבעי' : 'קבע'} תזכורת 🔔` : 'אני על זה'}</button>
                        )
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Multi-slot tasks */}
          <div className="space-y-2 mt-2">
          {Object.entries(multiSlotGroups).map(([taskId, slots]) => {
            const info = slots[0]
            const takenCount = slots.filter(s => s.claimed_by || s.done_at).length
            const allDone = slots.every(s => s.done_at)
            return (
              <div key={taskId} className={`bg-white rounded-xl border p-4 ${allDone ? 'opacity-60' : 'border-gray-100'}`}>
                <div className="flex items-center justify-between mb-3">
                  <p className="font-semibold text-gray-900">{info.emoji ? `${info.emoji} ${info.title}` : info.title}</p>
                  <span className="text-xs text-gray-400">{takenCount}/{slots.length} נלקחו</span>
                </div>
                <div className="space-y-2">
                  {slots.map(s => (
                    <div key={s.instance_id} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm
                      ${s.done_at ? 'bg-green-50' : !s.claimed_by ? 'bg-blue-50' : apartment?.mode === 'solo' ? 'bg-blue-50' : 'bg-gray-50 opacity-60'}`}>
                      <span className="font-medium w-14 text-gray-700">{SLOT_LABELS[s.slot ?? '']}</span>
                      <span className="text-xs text-gray-400">{s.reminder_time?.slice(0, 5)}</span>
                      <div className="flex-1" />
                      {s.done_at ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-green-600 font-medium">✓ {apartment?.mode !== 'solo' && s.done_by_name}{s.done_at ? `${apartment?.mode !== 'solo' && s.done_by_name ? ' · ' : ''}${formatDoneAt(s.done_at)}` : ''}</span>
                          {s.done_by && (
                            <button onClick={() => setUncompleteModal({ instanceId: s.instance_id!, taskTitle: info.title, doneByName: s.done_by_name ?? '', isMine: s.done_by === myUserId })}
                              className="text-xs text-gray-400 hover:text-red-400 underline">בטל</button>
                          )}
                        </div>
                      ) : s.claimed_by === myUserId ? (
                        <div className="flex gap-1.5">
                          <button onClick={() => completeTask(s.instance_id!, s.task_id)}
                            className="text-xs bg-green-100 text-green-700 rounded-lg px-2 py-1 font-medium hover:bg-green-200">סמן כבוצע ✓</button>
                          {s.reminder_time && (
                            <button onClick={() => openDelay(s.instance_id!, s.reminder_time)}
                              className="text-xs bg-blue-50 text-blue-500 rounded-lg px-2 py-1 hover:bg-blue-100">דחה</button>
                          )}
                          {apartment?.mode === 'solo' ? (
                            <>
                              {!s.reminder_time && (
                                <button onClick={() => openClaim(s.instance_id!)}
                                  className="text-xs bg-white text-blue-700 rounded-lg px-2 py-1 font-medium hover:bg-blue-100 border border-blue-200">
                                  {`${profile?.gender === 'female' ? 'קבעי' : 'קבע'} תזכורת 🔔`}
                                </button>
                              )}
                              <button onClick={() => cancelClaim(s.instance_id!, s.claimed_at)}
                                className="text-xs text-gray-400 hover:text-red-400 px-1">ביטול</button>
                            </>
                          ) : (
                            <button onClick={() => cancelClaim(s.instance_id!, s.claimed_at)}
                              className="text-xs text-gray-400 hover:text-red-400 px-1">ביטול</button>
                          )}
                        </div>
                      ) : s.claimed_by ? (
                        <span className="text-xs text-blue-500">{s.claimed_by_name}</span>
                      ) : (
                        <button onClick={() => openClaim(s.instance_id!)}
                          className="text-xs bg-white text-blue-700 rounded-lg px-2 py-1 font-medium hover:bg-blue-100 border border-blue-200">
                          {apartment?.mode === 'solo' ? `${profile?.gender === 'female' ? 'קבעי' : 'קבע'} תזכורת 🔔` : 'אני על זה'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
          </div>

          {/* Open tasks */}
          {openTasks.length > 0 && (
            <div className="space-y-2 mt-2">
              {openTasks.map(task => {
                const veto = getVeto(task.task_id)
                const isMyVeto = veto?.user_id === myUserId
                return (
                  <div
                    key={task.instance_id ?? task.task_id}
                    className={`bg-white rounded-xl border p-4 transition-all duration-300 border-gray-100
                      ${completingTask === task.task_id || (task.instance_id && fadingOut.has(task.instance_id)) ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}
                    `}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-gray-900">{task.emoji ? `${task.emoji} ${task.title}` : task.title}</p>
                          {task.points_multiplier > 1 && apartment?.mode !== 'solo' && (
                            <span className="text-xs bg-orange-100 text-orange-600 font-semibold px-1.5 py-0.5 rounded-full">×{task.points_multiplier}</span>
                          )}
                        </div>
                        {veto && (
                          <p className="text-xs text-purple-500 mt-0.5">🛡️ {isMyVeto ? 'הוטו שלך' : `וטו של ${veto.display_name}`}</p>
                        )}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {isMyVeto ? (
                          <button disabled className="flex-1 bg-purple-50 text-purple-400 rounded-lg py-2 px-3 text-sm font-medium cursor-not-allowed opacity-60">לא זמין (וטו)</button>
                        ) : (
                          <button
                            onClick={() => openClaim(task.instance_id!)}
                            disabled={task.forfeited_by === myUserId}
                            className="bg-blue-50 text-blue-700 rounded-lg py-2 px-3 text-sm font-medium hover:bg-blue-100 disabled:opacity-30 disabled:cursor-not-allowed"
                          >{task.forfeited_by === myUserId ? 'ויתרת היום' : apartment?.mode === 'solo' ? `${profile?.gender === 'female' ? 'קבעי' : 'קבע'} תזכורת 🔔` : 'אני על זה'}</button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Others' tasks (includes multi-slot groups fully claimed by others) */}
          {(othersTasks.length > 0 || Object.keys(othersMultiSlotGroups).length > 0) && (
            <div className="space-y-2 mt-2">
              {/* Multi-slot groups where all slots are taken by others — shown first */}
              {Object.entries(othersMultiSlotGroups).map(([taskId, slots]) => {
                const info = slots[0]
                return (
                  <div key={taskId} className="bg-white rounded-xl border border-gray-100 p-4 opacity-70 transition-all duration-500">
                    <div className="flex items-center justify-between mb-3">
                      <p className="font-semibold text-gray-700">{info.emoji ? `${info.emoji} ${info.title}` : info.title}</p>
                      <span className="text-xs text-gray-400">{slots.length}/{slots.length} נלקחו</span>
                    </div>
                    <div className="space-y-2">
                      {slots.map(s => (
                        <div key={s.instance_id} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-gray-50 opacity-60">
                          <span className="font-medium w-14 text-gray-700">{SLOT_LABELS[s.slot ?? '']}</span>
                          <span className="text-xs text-gray-400">{s.reminder_time?.slice(0, 5)}</span>
                          <div className="flex-1" />
                          <span className="text-xs text-blue-500">{s.claimed_by_name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
              {othersTasks.map(task => (
                <div key={task.instance_id ?? task.task_id} className="bg-white rounded-xl border border-gray-100 p-4 opacity-70">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-gray-700">{task.emoji ? `${task.emoji} ${task.title}` : task.title}</p>
                      {task.fixed_user_name && !task.claimed_by && apartment?.mode !== 'solo' && (
                        <p className="text-xs text-purple-500 mt-0.5">קבוע: {task.fixed_user_name}</p>
                      )}
                      {task.claimed_by && task.claimed_by_name && (
                        <p className="text-xs text-blue-500 mt-0.5">{task.claimed_by_name} על זה</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {(doneTasks.length > 0 || doneSlots.length > 0) && (
            <div className="mt-2 space-y-2">
              <p className="text-xs font-semibold text-gray-300 uppercase mt-3 mb-1">הושלמו</p>
              {[...doneTasks, ...doneSlots].sort((a, b) => new Date(b.done_at!).getTime() - new Date(a.done_at!).getTime()).map(task => (
                <div key={task.instance_id ?? task.task_id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 opacity-50">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-gray-700 line-through">
                      {task.title}
                      {task.slot && <span className="text-gray-400 font-normal mr-1">· {SLOT_LABELS[task.slot]}</span>}
                    </p>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-gray-400">{apartment?.mode !== 'solo' ? (task.done_by_name ?? '') : ''}{task.done_at ? `${apartment?.mode !== 'solo' && task.done_by_name ? ' · ' : ''}${formatDoneAt(task.done_at)}` : ''}</p>
                      <span className="text-green-500">✓</span>
                      {task.done_by && task.instance_id && (
                        <button
                          onClick={() => setUncompleteModal({ instanceId: task.instance_id!, taskTitle: task.slot ? `${task.title} · ${SLOT_LABELS[task.slot]}` : task.title, doneByName: task.done_by_name ?? '', isMine: task.done_by === myUserId })}
                          className="text-xs text-gray-400 hover:text-red-400 underline"
                        >בטל</button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Sandwich menu overlay */}

      {/* Claim + reminder modal */}
      {claimingInstance && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-4" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">מתי לתזכר אותך?</h2>
              <button onClick={() => setClaimingInstance(null)} className="text-gray-400">✕</button>
            </div>
            <p className="text-sm text-gray-500 mb-3">HaNudnik יתזכר אותך בשעה זו אם המשימה עדיין לא הושלמה</p>
            <div className="flex items-center justify-center gap-3" dir="ltr">
              {/* Hours */}
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="שע"
                  value={hoursInput}
                  onFocus={() => setShowHoursDD(true)}
                  onClick={e => { const l = e.currentTarget.value.length; e.currentTarget.setSelectionRange(l, l) }}
                  onBlur={() => setTimeout(() => setShowHoursDD(false), 150)}
                  onChange={e => {
                    const raw = e.target.value.replace(/\D/g, '')
                    const next = raw.length > 2 ? raw.slice(-1) : raw
                    const clamped = next.length === 2 && parseInt(next) > 23 ? '23' : next
                    setHoursInput(clamped)
                    const m = minutesInput || '00'
                    setReminderTime(clamped ? `${clamped.padStart(2, '0')}:${m.padStart(2, '0')}` : '')
                    if (clamped.length === 2) minutesRef.current?.focus()
                  }}
                  className="w-20 border border-gray-200 rounded-lg px-2 py-3 text-2xl text-center focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
                {showHoursDD && (
                  <div className="absolute bottom-full left-0 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-44 overflow-y-auto z-50 mb-1">
                    {Array.from({ length: 24 }, (_, i) => {
                      const val = String(i).padStart(2, '0')
                      return (
                        <div key={i}
                          onMouseDown={e => {
                            e.preventDefault()
                            const m = minutesInput || '00'
                            setHoursInput(val)
                            setReminderTime(`${val}:${m.padStart(2, '0')}`)
                            setShowHoursDD(false)
                            minutesRef.current?.focus()
                          }}
                          className={`py-2 text-xl text-center cursor-pointer hover:bg-indigo-50 ${hoursInput.padStart(2,'0') === val ? 'bg-indigo-100 font-bold' : ''}`}
                        >{val}</div>
                      )
                    })}
                  </div>
                )}
              </div>
              <span className="text-2xl font-bold text-gray-400">:</span>
              {/* Minutes */}
              <div className="relative">
                <input
                  ref={minutesRef}
                  type="text"
                  inputMode="numeric"
                  placeholder="דק"
                  value={minutesInput}
                  onFocus={() => setShowMinutesDD(true)}
                  onClick={e => { const l = e.currentTarget.value.length; e.currentTarget.setSelectionRange(l, l) }}
                  onBlur={() => setTimeout(() => setShowMinutesDD(false), 150)}
                  onChange={e => {
                    const raw = e.target.value.replace(/\D/g, '')
                    const next = raw.length > 2 ? raw.slice(-1) : raw
                    const clamped = next.length === 2 && parseInt(next) > 59 ? '59' : next
                    setMinutesInput(clamped)
                    const h = hoursInput || '00'
                    setReminderTime(hoursInput ? `${h.padStart(2, '0')}:${clamped.padStart(2, '0')}` : '')
                  }}
                  className="w-20 border border-gray-200 rounded-lg px-2 py-3 text-2xl text-center focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
                {showMinutesDD && (
                  <div className="absolute bottom-full left-0 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-50 mb-1">
                    {[0, 15, 30, 45].map(i => {
                      const val = String(i).padStart(2, '0')
                      return (
                        <div key={i}
                          onMouseDown={e => {
                            e.preventDefault()
                            const h = hoursInput || '00'
                            setMinutesInput(val)
                            setReminderTime(`${h.padStart(2, '0')}:${val}`)
                            setShowMinutesDD(false)
                          }}
                          className={`py-2 text-xl text-center cursor-pointer hover:bg-indigo-50 ${minutesInput.padStart(2,'0') === val ? 'bg-indigo-100 font-bold' : ''}`}
                        >{val}</div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setClaimingInstance(null)} className="flex-1 border border-gray-200 rounded-lg py-2.5 text-sm">ביטול</button>
              <button onClick={confirmClaim} disabled={savingClaim || !reminderTime} className="flex-1 bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-60">{savingClaim ? '...' : apartment?.mode === 'solo' ? `${profile?.gender === 'female' ? 'קבעי' : 'קבע'} תזכורת ✓` : 'אני על זה ✓'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delay reminder modal */}
      {delayingInstance && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-4" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">דחה תזכורת</h2>
              <button onClick={() => setDelayingInstance(null)} className="text-gray-400">✕</button>
            </div>
            <input
              type="time"
              value={delayTime}
              onChange={e => setDelayTime(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-3 text-lg text-center focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <div className="flex gap-2 mt-4">
              <button onClick={() => setDelayingInstance(null)} className="flex-1 border border-gray-200 rounded-lg py-2.5 text-sm">ביטול</button>
              <button onClick={confirmDelay} className="flex-1 bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium">שמור</button>
            </div>
          </div>
        </div>
      )}

      {/* Away modal */}
      {showAwayModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-4" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">
                {isAway ? '✈️ כרגע בחופשה' : awayStartDate ? '🧳 נסיעה מתוכננת' : '✈️ יציאה לחופשה'}
              </h2>
              <button onClick={() => { setShowAwayModal(false); setEditingFutureAway(false) }} className="text-gray-400">✕</button>
            </div>

            {isAway ? (
              <>
                <p className="text-sm text-gray-500 mb-1">{profile?.gender === 'female' ? 'לא תקבלי' : 'לא תקבל'} נדנודים בזמן ההיעדרות.</p>
                {awayReturnDate && (
                  <p className="text-sm text-gray-500 mb-4">
                    תאריך חזרה: {new Date(awayReturnDate + 'T00:00:00').toLocaleDateString('he-IL')}
                  </p>
                )}
                <div className="flex gap-2 mt-4">
                  <button onClick={() => setShowAwayModal(false)} className="flex-1 border border-gray-200 rounded-lg py-2.5 text-sm">סגור</button>
                  <button
                    onClick={confirmReturnFromAway}
                    disabled={savingAway}
                    className="flex-1 bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-40"
                  >{savingAway ? '...' : 'חזרתי הביתה 🏠'}</button>
                </div>
              </>
            ) : awayStartDate ? (
              <>
                {!editingFutureAway ? (
                  <>
                    <p className="text-sm text-gray-700 mb-1">
                      יציאה: {new Date(awayStartDate + 'T00:00:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                    {awayReturnDate && (
                      <p className="text-sm text-gray-500">
                        חזרה מתוכננת: {new Date(awayReturnDate + 'T00:00:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </p>
                    )}
                    {apartment?.mode !== 'solo' && <p className="text-xs text-gray-400 mt-3 mb-4">שאר הדיירים יקבלו הודעה ביום היציאה.</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={cancelFutureAway}
                        disabled={savingAway}
                        className="flex-1 border border-red-200 text-red-500 rounded-lg py-2.5 text-sm font-medium hover:bg-red-50 disabled:opacity-40"
                      >{savingAway ? '...' : 'בטל תכנון'}</button>
                      <button
                        onClick={() => { setAwayStartInput(awayStartDate); setAwayDateInput(awayReturnDate ?? ''); setEditingFutureAway(true) }}
                        className="flex-1 bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium"
                      >ערוך</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-2 mb-4">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">תאריך יציאה</label>
                        <input
                          type="date"
                          value={awayStartInput}
                          onChange={e => setAwayStartInput(e.target.value)}
                          min={new Date().toISOString().slice(0, 10)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">תאריך חזרה (אופציונלי)</label>
                        <input
                          type="date"
                          value={awayDateInput}
                          onChange={e => setAwayDateInput(e.target.value)}
                          min={awayStartInput}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setEditingFutureAway(false)} className="flex-1 border border-gray-200 rounded-lg py-2.5 text-sm">ביטול</button>
                      <button
                        onClick={async () => { setEditingFutureAway(false); await confirmSetAway() }}
                        disabled={savingAway || !awayStartInput}
                        className="flex-1 bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-40"
                      >{savingAway ? '...' : 'שמור'}</button>
                    </div>
                  </>
                )}
              </>
            ) : (
              <>
                <p className="text-sm text-gray-500 mb-3">{profile?.gender === 'female' ? 'לא תקבלי' : 'לא תקבל'} נדנודים בזמן ההיעדרות.{apartment?.mode !== 'solo' ? ' שאר הדיירים יקבלו הודעה.' : ''}</p>
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">תאריך יציאה</label>
                    <input
                      type="date"
                      value={awayStartInput}
                      onChange={e => setAwayStartInput(e.target.value)}
                      min={new Date().toISOString().slice(0, 10)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">תאריך חזרה (אופציונלי)</label>
                    <input
                      type="date"
                      value={awayDateInput}
                      onChange={e => setAwayDateInput(e.target.value)}
                      min={awayStartInput || new Date().toISOString().slice(0, 10)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button onClick={() => setShowAwayModal(false)} className="flex-1 border border-gray-200 rounded-lg py-2.5 text-sm">ביטול</button>
                  <button
                    onClick={confirmSetAway}
                    disabled={savingAway}
                    className="flex-1 bg-amber-500 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-40"
                  >{savingAway ? '...' : (awayStartInput && awayStartInput > new Date().toISOString().slice(0, 10)) ? (profile?.gender === 'female' ? 'תכנני נסיעה 🧳' : 'תכנן נסיעה 🧳') : (profile?.gender === 'female' ? 'יוצאת לחופשה ✈️' : 'יוצא לחופשה ✈️')}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Uncomplete confirmation modal */}
      {uncompleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-4" dir="rtl">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900">ביטול ביצוע</h2>
              <button onClick={() => setUncompleteModal(null)} className="text-gray-400">✕</button>
            </div>
            {uncompleteModal.isMine ? (
              <p className="text-sm text-gray-500 mb-5">
                {apartment?.mode === 'solo'
                  ? <>ביטול ביצוע <span className="font-medium text-gray-800">{uncompleteModal.taskTitle}</span>. האם לאשר?</>
                  : <>ביטול ביצוע <span className="font-medium text-gray-800">{uncompleteModal.taskTitle}</span> יפחית את הנקודות שקיבלת עליה. האם לאשר?</>
                }
              </p>
            ) : (
              <p className="text-sm text-gray-500 mb-5">
                כדי לבטל את ביצוע <span className="font-medium text-gray-800">{uncompleteModal.taskTitle}</span> של <span className="font-medium text-gray-800">{uncompleteModal.doneByName}</span> - תישלח להם בקשת אישור. האם לשלוח?
              </p>
            )}
            <div className="flex gap-2">
              <button onClick={() => setUncompleteModal(null)} className="flex-1 border border-gray-200 rounded-lg py-2.5 text-sm">ביטול</button>
              <button
                onClick={confirmUncomplete}
                disabled={requestingUncomplete}
                className="flex-1 bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-40"
              >{requestingUncomplete ? '...' : uncompleteModal.isMine ? 'כן, בטל ביצוע' : 'שלח בקשה'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Penalty cancel claim modal */}
      {penaltyClaimModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-4" dir="rtl">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900">ביטול תפיסת מטלה</h2>
              <button onClick={() => setPenaltyClaimModal(null)} className="text-gray-400">✕</button>
            </div>
            <p className="text-sm text-gray-500 mb-5">עברו יותר מ-30 דקות — יורדו לך 0.5 נקודות. להמשיך?</p>
            <div className="flex gap-2">
              <button onClick={() => setPenaltyClaimModal(null)} className="flex-1 border border-gray-200 rounded-lg py-2.5 text-sm">לא, חזור</button>
              <button
                onClick={() => { const m = penaltyClaimModal; setPenaltyClaimModal(null); executeCancelClaim(m.instanceId, true) }}
                className="flex-1 bg-red-500 text-white rounded-lg py-2.5 text-sm font-medium"
              >כן, בטל תפיסה</button>
            </div>
          </div>
        </div>
      )}

      {/* Apartment settings modal */}
      {showApartmentSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-4" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">⚙️ שינויים בדירה</h2>
              <button onClick={() => { setShowApartmentSettings(false); setEditingAptName(false) }} className="text-gray-400">✕</button>
            </div>

            {/* Edit apartment name */}
            <div className="border border-gray-100 rounded-xl p-3 mb-3">
              <p className="text-sm font-medium text-gray-700 mb-2">שם הדירה</p>
              {editingAptName ? (
                <div className="flex gap-2">
                  <input
                    value={newAptName}
                    onChange={e => setNewAptName(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    placeholder={apartment.name}
                    autoFocus
                  />
                  <button
                    onClick={saveAptName}
                    disabled={savingAptName || !newAptName.trim()}
                    className="bg-indigo-600 text-white rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-40"
                  >{savingAptName ? '...' : 'שמור'}</button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">{apartment.name}</span>
                  <button
                    onClick={() => { setNewAptName(apartment.name); setEditingAptName(true) }}
                    className="text-xs text-gray-400 hover:text-gray-700 underline"
                  >עריכה</button>
                </div>
              )}
            </div>

            {/* Invite resident */}
            <button
              onClick={openInviteModal}
              className="w-full text-right px-4 py-3 rounded-xl border border-gray-100 hover:bg-gray-50 text-sm text-gray-700 transition-colors mb-2"
            >📨 {profile?.gender === 'female' ? 'הזמיני' : 'הזמן'} דייר חדש</button>

            {/* Remove resident */}
            {apartment.mode === 'shared' && (
              <button
                onClick={() => { setShowApartmentSettings(false); openRemoveModal() }}
                className="w-full text-right px-4 py-3 rounded-xl border border-gray-100 hover:border-red-200 hover:bg-red-50 text-sm text-red-500 transition-colors mb-2"
              >{profile?.gender === 'female' ? 'הסירי' : 'הסר'} דייר מהדירה</button>
            )}

            {/* Leave */}
            <button
              onClick={() => { setShowApartmentSettings(false); setShowLeaveModal(true) }}
              className="w-full text-right px-4 py-3 rounded-xl border border-gray-100 hover:border-red-200 hover:bg-red-50 text-sm text-red-500 transition-colors"
            >{profile?.gender === 'female' ? 'עזבי' : 'עזוב'} דירה</button>
          </div>
        </div>
      )}

      {/* Invite resident modal */}
      {showInviteModal && apartment && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-4" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">📨 הזמנת דייר חדש</h2>
              <button onClick={() => setShowInviteModal(false)} className="text-gray-400">✕</button>
            </div>

            {residentCount >= 5 ? (
              <p className="text-sm text-red-500 text-center py-4">הדירה מלאה - אפשר עד 5 דיירים בדירה אחת.</p>
            ) : (
              <>
                <p className="text-sm text-gray-500 mb-4">
                  בדירה יש כרגע <span className="font-semibold text-gray-900">{residentCount}</span> דיירים מתוך 5.
                  {' '}אפשר להזמין עוד <span className="font-semibold text-gray-900">{5 - residentCount}</span>.
                </p>

                {!inviteCode ? (
                  <button
                    onClick={generateInvite}
                    disabled={generatingInvite}
                    className="w-full bg-indigo-600 text-white rounded-xl py-3 text-sm font-medium disabled:opacity-40"
                  >{generatingInvite ? 'יוצר...' : 'צור קישור הזמנה'}</button>
                ) : (
                  <>
                    <div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-700 whitespace-pre-line mb-3 leading-relaxed border border-gray-200 font-mono text-xs">
                      {`היי! 🏠\nהוזמנת להצטרף לדירה של ${apartment.name} באפליקציה HaNudnik.\n\nלהורדת האפליקציה: https://hanudnik.vercel.app\n\nלהצטרפות, פתח את האפליקציה ובחר "הצטרפות לדירה קיימת".\n\nקוד ההזמנה שלך:\n${inviteCode}\n\n(הקוד תקף ל-72 שעות)`}
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`היי! 🏠\nהוזמנת להצטרף לדירה של ${apartment.name} באפליקציה HaNudnik.\n\nלהורדת האפליקציה: https://hanudnik.vercel.app\n\nלהצטרפות, פתח את האפליקציה ובחר "הצטרפות לדירה קיימת".\n\nקוד ההזמנה שלך:\n${inviteCode}\n\n(הקוד תקף ל-72 שעות)`)
                        setInviteCopied(true)
                        setTimeout(() => setInviteCopied(false), 2500)
                      }}
                      className={`w-full rounded-xl py-3 text-sm font-medium transition-colors ${inviteCopied ? 'bg-green-600 text-white' : 'bg-indigo-600 text-white'}`}
                    >{inviteCopied ? 'הועתק! ✓' : 'העתק הודעה 📋'}</button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Remove resident modal */}
      {showRemoveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-4" dir="rtl">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900">הסרת דייר</h2>
              <button onClick={() => setShowRemoveModal(false)} className="text-gray-400">✕</button>
            </div>
            <p className={`text-sm mb-4 ${residents.length <= 1 ? 'text-red-500' : 'text-gray-500'}`}>
              {residents.length <= 1
                ? 'בדירת שני דיירים - הסרת הדייר תהיה מיידית וללא אישור נוסף.'
                : 'שאר הדיירים יקבלו בקשת אישור. הסרה תתבצע כשכולם יאשרו.'}
            </p>
            <div className="space-y-2 mb-4">
              {residents.map(r => (
                <button
                  key={r.id}
                  onClick={() => setConfirmRemoveTarget({ id: r.id, name: r.display_name })}
                  disabled={removingResident}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-gray-200 hover:border-red-300 hover:bg-red-50 transition-colors disabled:opacity-40"
                >
                  <span className="text-sm font-medium text-gray-800">{r.display_name}</span>
                  <span className="text-xs text-red-400">הסר/י ←</span>
                </button>
              ))}
            </div>
            <button onClick={() => setShowRemoveModal(false)} className="w-full border border-gray-200 rounded-lg py-2.5 text-sm">ביטול</button>
          </div>
        </div>
      )}

      {/* Confirm remove resident modal */}
      {confirmRemoveTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-4" dir="rtl">
            <h2 className="font-semibold text-gray-900 mb-2">אישור הסרת דייר</h2>
            <p className="text-sm text-gray-500 mb-4">
              {profile?.gender === 'female' ? 'בטוחה' : 'בטוח'} שרוצה להסיר את <strong>{confirmRemoveTarget.name}</strong> מהדירה?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmRemoveTarget(null)}
                className="flex-1 border border-gray-200 rounded-lg py-2.5 text-sm"
              >ביטול</button>
              <button
                disabled={removingResident}
                onClick={async () => {
                  await requestRemoval(confirmRemoveTarget.id)
                  setConfirmRemoveTarget(null)
                }}
                className="flex-1 bg-red-500 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-40"
              >{removingResident ? '...' : profile?.gender === 'female' ? 'כן, הסירי' : 'כן, הסר'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Leave apartment modal */}
      {showLeaveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-4" dir="rtl">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-900">עזיבת הדירה</h2>
              <button onClick={() => setShowLeaveModal(false)} className="text-gray-400">✕</button>
            </div>
            <p className="text-sm text-gray-500 mb-5">
              {apartment?.mode === 'solo'
                ? 'הדירה תימחק לצמיתות מהשרתים. לא ניתן לבטל פעולה זו.'
                : `${profile?.gender === 'female' ? 'בטוחה' : 'בטוח'}? שאר הדיירים יקבלו הודעה. לא ניתן לבטל פעולה זו.`}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setShowLeaveModal(false)} className="flex-1 border border-gray-200 rounded-lg py-2.5 text-sm">ביטול</button>
              <button
                onClick={leaveApartment}
                disabled={leavingApartment}
                className="flex-1 bg-red-500 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-40"
              >{leavingApartment ? '...' : 'סבבה, תוציא אותי מפה'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Veto modal */}
      {showVetoModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-4" dir="rtl">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-gray-900">
                  {vetoSource === 'monthly' ? '🥇 ניצחת את החודש!' : '🏆 ניצחת השבוע!'}
                </h2>
                {totalVetoPicks > 1 && (
                  <span className="text-xs font-medium bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full">
                    {vetoPickIndex}/{totalVetoPicks}
                  </span>
                )}
              </div>
              <button onClick={() => setShowVetoModal(false)} className="text-gray-400">✕</button>
            </div>
            <p className="text-sm text-gray-500 mb-3">
              {vetoSource === 'monthly'
                ? (profile?.gender === 'female' ? 'בחרי משימה שלא תצטרכי לעשות ב-7 הימים הקרובים' : 'בחר משימה שלא תצטרך לעשות ב-7 הימים הקרובים')
                : (profile?.gender === 'female' ? 'בחרי משימה שלא תצטרכי לעשות השבוע הקרוב' : 'בחר משימה שלא תצטרך לעשות השבוע הקרוב')}
            </p>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {vetoCandidates.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">טוען...</p>
              )}
              {vetoCandidates.map(task => {
                const takenByOther = vetos.find(v => v.task_id === task.task_id && v.user_id !== myUserId)
                const alreadyMyOtherVeto = vetos.some(v => v.task_id === task.task_id && v.user_id === myUserId && v.source !== vetoSource)
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
                      {takenByOther && <span className="text-xs mr-1 text-gray-400"> - נבחר ע"י {takenByOther.display_name}</span>}
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
      {/* Wash machine modal */}
      {showWashModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-5 max-h-[90vh] overflow-y-auto" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">הפעלת מכונת כביסה</h2>
              <button onClick={() => { setShowWashModal(null); setWashDuration(''); setWashDoneChecked(new Set()) }} className="text-gray-400">✕</button>
            </div>
            <p className="text-sm text-gray-500 mb-3">כמה זמן התוכנית? (בדקות)</p>
            <input
              type="number"
              value={washDuration}
              onChange={e => setWashDuration(e.target.value)}
              placeholder="למשל: 90"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-lg font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-3"
              autoFocus
            />
            <div className="flex gap-2 flex-wrap mb-5">
              {[60, 90, 120].map(m => (
                <button key={m} onClick={() => setWashDuration(String(m))}
                  className={`px-4 py-2 rounded-full text-sm border transition-colors ${washDuration === String(m) ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >{m} דקות</button>
              ))}
            </div>
            {washEntries.length > 0 && (
              <div className="border-t border-gray-100 pt-4 mb-3">
                <p className="text-sm text-gray-500 mb-3">מה נכנס לכביסה? (סמני את הבקשות שבוצעו)</p>
                <div className="space-y-3">
                  {washEntries.map(entry => {
                    const lines = entry.request.split('\n').filter(l => l.trim())
                    return (
                      <div key={entry.user_id}>
                        <p className="text-xs font-semibold text-gray-400 mb-1 px-1">{entry.display_name}</p>
                        <div className="space-y-1.5">
                          {lines.map((line, i) => {
                            const key = `${entry.user_id}::${i}`
                            const checked = washDoneChecked.has(key)
                            return (
                              <button key={key}
                                onClick={() => setWashDoneChecked(prev => { const s = new Set(prev); checked ? s.delete(key) : s.add(key); return s })}
                                className={`w-full flex items-center gap-3 p-3 rounded-xl border text-right transition-colors ${checked ? 'border-green-300 bg-green-50' : 'border-gray-100 bg-white hover:bg-gray-50'}`}
                              >
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${checked ? 'border-green-500 bg-green-500' : 'border-gray-300'}`}>
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
            )}
            <div className="flex gap-2 mt-4">
              <button onClick={() => { setShowWashModal(null); setWashDuration(''); setWashDoneChecked(new Set()) }} className="flex-1 border border-gray-200 rounded-xl py-3 text-sm">ביטול</button>
              <button onClick={confirmWash} disabled={!washDuration || parseInt(washDuration) <= 0 || savingWash}
                className="flex-1 bg-indigo-600 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-40"
              >{savingWash ? '...' : 'הפעלתי 🧺'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Dryer duration modal */}
      {showShoppingReminder && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50 p-4" onClick={() => setShowShoppingReminder(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg p-5 mb-16" dir="rtl" onClick={e => e.stopPropagation()}>
            <p className="font-semibold text-gray-900 mb-1">כל הכבוד! 🛒</p>
            <p className="text-sm text-gray-500 mb-4">אל תשכח/י לסמן את הפריטים שנקנו ברשימת הקניות.</p>
            <div className="flex gap-2">
              <button onClick={() => setShowShoppingReminder(false)} className="flex-1 border border-gray-200 rounded-lg py-2.5 text-sm text-gray-500">סימנתי כבר</button>
              <a href="/shopping" onClick={() => setShowShoppingReminder(false)}
                className="flex-1 bg-blue-50 text-blue-700 rounded-lg py-2.5 text-sm font-medium text-center hover:bg-blue-100">
                לרשימת הקניות ←
              </a>
            </div>
          </div>
        </div>
      )}

      {showDryerModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-5" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">הכנסת המייבש</h2>
              <button onClick={() => { setShowDryerModal(null); setDryerDuration('') }} className="text-gray-400">✕</button>
            </div>
            <p className="text-sm text-gray-500 mb-3">כמה זמן תוכנית הייבוש? (בדקות)</p>
            <input
              type="number"
              value={dryerDuration}
              onChange={e => setDryerDuration(e.target.value)}
              placeholder="למשל: 60"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-lg font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-3"
              autoFocus
            />
            <div className="flex gap-2 flex-wrap mb-4">
              {[45, 60, 75].map(m => (
                <button
                  key={m}
                  onClick={() => setDryerDuration(String(m))}
                  className={`px-4 py-2 rounded-full text-sm border transition-colors ${dryerDuration === String(m) ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >{m} דקות</button>
              ))}
            </div>
            <button
              onClick={() => setExtraWashAfterDryer(v => !v)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border mb-4 text-sm transition-colors ${extraWashAfterDryer ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-100 text-gray-500 hover:bg-gray-50'}`}
            >
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${extraWashAfterDryer ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}`}>
                {extraWashAfterDryer && <span className="text-white text-xs">✓</span>}
              </div>
              🧺 הפעלת מכונת כביסה נוספת במקביל
            </button>
            <div className="flex gap-2">
              <button onClick={() => { setShowDryerModal(null); setDryerDuration('') }} className="flex-1 border border-gray-200 rounded-xl py-3 text-sm">ביטול</button>
              <button
                onClick={confirmDryer}
                disabled={!dryerDuration || parseInt(dryerDuration) <= 0 || savingDryer}
                className="flex-1 bg-indigo-600 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-40"
              >{savingDryer ? '...' : 'הכנסתי למייבש 🌀'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
