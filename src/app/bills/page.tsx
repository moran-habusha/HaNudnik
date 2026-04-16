'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type Bill = {
  id: string
  bill_type: string
  amount: number
  due_date: string
  month: number
  year: number
  is_paid: boolean
  paid_at: string | null
  profiles: { display_name: string } | null
}

type BillType = {
  id: string
  name: string
  frequency_type: string
  is_active: boolean
  notes: string | null
  fixed_amount: number | null
  emoji: string | null
}

type ExpectedBill = {
  bill_type_id: string
  name: string
  frequency_type: string
  bill_month: number
  bill_year: number
  notes: string | null
  bill_id: string | null
  fixed_amount: number | null
  emoji: string | null
}

type RentReminder = {
  id: string
  user_id: string | null
  display_name: string
  label: string
  renewal_date: string | null
  notes: string | null
  payment_day: number | null
  amount: number | null
}

const MONTHS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר']

const FREQ_LABELS: Record<string, string> = {
  monthly: 'חודשי',
  bimonthly_even: 'דו-חודשי (זוגי)',
  bimonthly_odd: 'דו-חודשי (אי-זוגי)',
  quarterly: 'רבעוני',
  annual: 'שנתי',
}

const FREQ_OPTIONS = ['monthly', 'bimonthly_even', 'bimonthly_odd', 'quarterly', 'annual']

const BILL_EMOJIS = ['⚡','🔥','💧','🏠','🌐','📡','🏛️','📋','📱','🚗','💳','🔑','📺','🛡️','💵','💰','🔌','🚿']

function monthRangeLabel(frequency_type: string, month: number, year: number): string {
  const m = (n: number, y: number) => `${MONTHS[n - 1]} ${y}`
  if (frequency_type === 'monthly') return m(month, year)
  if (frequency_type === 'bimonthly_even' || frequency_type === 'bimonthly_odd') {
    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear = month === 1 ? year - 1 : year
    return `${MONTHS[prevMonth - 1]} - ${m(month, year)}`
  }
  if (frequency_type === 'quarterly') {
    const start = month - 2
    const startMonth = start < 1 ? start + 12 : start
    const startYear = start < 1 ? year - 1 : year
    return `${MONTHS[startMonth - 1]} - ${m(month, year)}`
  }
  return m(month, year)
}

export default function BillsPage() {
  const [bills, setBills] = useState<Bill[]>([])
  const [billTypes, setBillTypes] = useState<BillType[]>([])
  const [expectedBills, setExpectedBills] = useState<ExpectedBill[]>([])
  const [rentReminders, setRentReminders] = useState<RentReminder[]>([])
  const [residents, setResidents] = useState<{ id: string; display_name: string }[]>([])
  const [myUserId, setMyUserId] = useState<string | null>(null)
  const [aptMode, setAptMode] = useState<string | null>(null)
  const [apartmentId, setApartmentId] = useState<string | null>(null)

  // Modals
  const [tab, setTab] = useState<'bills' | 'types'>('bills')
  const [showAddBill, setShowAddBill] = useState(false)
  const [showAddType, setShowAddType] = useState(false)
  const [editingType, setEditingType] = useState<BillType | null>(null)
  const [showRentModal, setShowRentModal] = useState(false)
  const [editingRent, setEditingRent] = useState<RentReminder | null>(null)
  const [editingBill, setEditingBill] = useState<Bill | null>(null)
  const [quickAdd, setQuickAdd] = useState<{ bill: ExpectedBill; amount: string; due_date: string } | null>(null)
  const [fadingOut, setFadingOut] = useState<Set<string>>(new Set())
  const [confirmUnmark, setConfirmUnmark] = useState<string | null>(null)
  const [pageLoading, setPageLoading] = useState(true)
  const [loading, setLoading] = useState(false)

  // Add bill form
  const now = new Date()
  const [addMode, setAddMode] = useState<'existing' | 'new'>('existing')
  const [form, setForm] = useState({
    bill_type: '',
    amount: '',
    due_date: '',
    month: now.getMonth() + 1,
    year: now.getFullYear(),
  })
  // Type form
  const [typeForm, setTypeForm] = useState({ name: '', frequency_type: 'monthly', notes: '', fixed_amount: '', emoji: '' })

  // Rent form
  const [rentForm, setRentForm] = useState({ user_id: '' as string | null, label: '', renewal_date: '', notes: '', payment_day: '', amount: '' })

  // Edit bill form
  const [editBillAmount, setEditBillAmount] = useState('')

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
      setApartmentId(profile.apartment_id)

      supabase.from('apartments').select('mode').eq('id', profile.apartment_id).single().then(({ data }) => setAptMode(data?.mode ?? null))

      Promise.all([
        supabase.from('profiles').select('id, display_name').eq('apartment_id', profile.apartment_id).then(({ data }) => setResidents(data ?? [])),
        fetchBills(),
        fetchBillTypes(),
        fetchExpected(),
        fetchRent(),
      ]).then(() => setPageLoading(false))
    }
    load()
  }, [])

  useEffect(() => {
    if (!apartmentId) return
    const channel = supabase
      .channel('bills-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bills', filter: `apartment_id=eq.${apartmentId}` }, () => {
        fetchBills()
        fetchExpected()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bill_types', filter: `apartment_id=eq.${apartmentId}` }, () => {
        fetchBillTypes()
        fetchExpected()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [apartmentId])

  async function fetchBills() {
    const { data } = await supabase.rpc('get_bills')
    setBills(data ?? [])
  }

  async function fetchBillTypes() {
    const { data } = await supabase.rpc('get_bill_types')
    setBillTypes(data ?? [])
  }

  async function fetchExpected() {
    const { data } = await supabase.rpc('get_expected_bills')
    setExpectedBills(data ?? [])
  }

  async function fetchRent() {
    const { data } = await supabase.rpc('get_rent_reminders')
    setRentReminders(data ?? [])
  }

  async function addBill() {
    const billTypeName = addMode === 'new' ? typeForm.name : form.bill_type
    if (addMode === 'new') {
      if (!billTypeName) return
    } else {
      if (!billTypeName || !form.amount || !form.due_date) return
    }
    setLoading(true)

    // Default due_date for new type: end of current month
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]

    // If new type — create it first
    if (addMode === 'new') {
      await supabase.rpc('add_bill_type', {
        p_name: typeForm.name,
        p_frequency_type: typeForm.frequency_type,
        p_notes: typeForm.notes || null,
        p_fixed_amount: typeForm.fixed_amount ? parseFloat(typeForm.fixed_amount) : null,
        p_emoji: typeForm.emoji || null,
      })
      await fetchBillTypes()
    }

    await supabase.rpc('add_bill', {
      p_bill_type: addMode === 'new' ? typeForm.name : billTypeName,
      p_amount: addMode === 'new' ? parseFloat(typeForm.fixed_amount || '0') : parseFloat(form.amount),
      p_due_date: addMode === 'new' ? endOfMonth : form.due_date,
      p_month: form.month,
      p_year: form.year,
    })

    setShowAddBill(false)
    resetAddForm()
    await Promise.all([fetchBills(), fetchExpected()])
    setLoading(false)
  }

  function resetAddForm() {
    setForm({ bill_type: '', amount: '', due_date: '', month: now.getMonth() + 1, year: now.getFullYear() })
    setTypeForm({ name: '', frequency_type: 'monthly', notes: '', fixed_amount: '', emoji: '' })
    setAddMode('existing')
  }

  function openAddBill(prefill = '') {
    resetAddForm()
    if (prefill) {
      setForm(f => ({ ...f, bill_type: prefill }))
    }
    setShowAddBill(true)
  }

  async function quickAddBill() {
    if (!quickAdd || !quickAdd.amount) return
    setLoading(true)
    const lastDay = new Date(quickAdd.bill.bill_year, quickAdd.bill.bill_month, 0).getDate()
    const due_date = quickAdd.due_date ||
      `${quickAdd.bill.bill_year}-${String(quickAdd.bill.bill_month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    await supabase.rpc('add_bill', {
      p_bill_type: quickAdd.bill.name,
      p_amount: parseFloat(quickAdd.amount),
      p_due_date: due_date,
      p_month: quickAdd.bill.bill_month,
      p_year: quickAdd.bill.bill_year,
    })
    setQuickAdd(null)
    await Promise.all([fetchBills(), fetchExpected()])
    setLoading(false)
  }

  async function quickMarkPaid() {
    if (!quickAdd) return
    setLoading(true)
    const lastDay = new Date(quickAdd.bill.bill_year, quickAdd.bill.bill_month, 0).getDate()
    const due_date = `${quickAdd.bill.bill_year}-${String(quickAdd.bill.bill_month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    const amount = quickAdd.amount ? parseFloat(quickAdd.amount) : 0
    await supabase.rpc('add_bill', {
      p_bill_type: quickAdd.bill.name,
      p_amount: amount,
      p_due_date: due_date,
      p_month: quickAdd.bill.bill_month,
      p_year: quickAdd.bill.bill_year,
    })
    const { data: created } = await supabase
      .from('bills')
      .select('id')
      .eq('bill_type', quickAdd.bill.name)
      .order('created_at', { ascending: false })
      .limit(1).single()
    if (created) await supabase.rpc('mark_bill_paid', { p_bill_id: created.id })
    setQuickAdd(null)
    await Promise.all([fetchBills(), fetchExpected()])
    setLoading(false)
  }

  async function markRentPaid(r: RentReminder) {
    const now2 = new Date()
    const month = now2.getMonth() + 1
    const year = now2.getFullYear()
    const lastDay = new Date(year, month, 0).getDate()
    const dueDay = String(Math.min(r.payment_day ?? lastDay, lastDay)).padStart(2, '0')
    const due_date = `${year}-${String(month).padStart(2, '0')}-${dueDay}`

    // Check if already exists this month — avoid duplicate
    const { data: existing } = await supabase.from('bills')
      .select('id, is_paid').eq('bill_type', r.label).eq('month', month).eq('year', year).maybeSingle()

    if (existing) {
      if (!existing.is_paid) await supabase.rpc('mark_bill_paid', { p_bill_id: existing.id })
    } else {
      const { data: newBill } = await supabase.rpc('add_bill', {
        p_bill_type: r.label,
        p_amount: r.amount ?? 0,
        p_due_date: due_date,
        p_month: month,
        p_year: year,
      })
      const { data: created } = await supabase.from('bills')
        .select('id').eq('bill_type', r.label).eq('month', month).eq('year', year)
        .order('created_at', { ascending: false }).limit(1).single()
      if (created) await supabase.rpc('mark_bill_paid', { p_bill_id: created.id })
    }
    fetchBills()
  }

  function withFade(id: string, action: () => Promise<void>) {
    setFadingOut(s => new Set(s).add(id))
    setTimeout(async () => {
      await action()
      setFadingOut(s => { const n = new Set(s); n.delete(id); return n })
    }, 300)
  }

  async function markPaid(billId: string) {
    withFade(billId, async () => {
      await supabase.rpc('mark_bill_paid', { p_bill_id: billId })
      fetchBills()
    })
  }

  async function markUnpaid(billId: string) {
    withFade(billId, async () => {
      await supabase.from('bills').update({ is_paid: false, paid_by: null, paid_at: null }).eq('id', billId)
      fetchBills()
    })
  }

  async function saveBillEdit() {
    if (!editingBill || !editBillAmount) return
    setLoading(true)
    await supabase.from('bills').update({ amount: parseFloat(editBillAmount) }).eq('id', editingBill.id)
    setEditingBill(null)
    fetchBills()
    setLoading(false)
  }

  async function deleteBill(billId: string) {
    if (!confirm('למחוק את החשבון?')) return
    await supabase.from('bills').delete().eq('id', billId)
    await Promise.all([fetchBills(), fetchExpected()])
  }

  async function saveType() {
    setLoading(true)
    const fixedAmt = typeForm.fixed_amount ? parseFloat(typeForm.fixed_amount) : null
    if (editingType) {
      await supabase.rpc('update_bill_type', {
        p_id: editingType.id,
        p_name: typeForm.name,
        p_frequency_type: typeForm.frequency_type,
        p_is_active: editingType.is_active,
        p_notes: typeForm.notes || null,
        p_fixed_amount: fixedAmt,
        p_emoji: typeForm.emoji || null,
      })
    } else {
      await supabase.rpc('add_bill_type', {
        p_name: typeForm.name,
        p_frequency_type: typeForm.frequency_type,
        p_notes: typeForm.notes || null,
        p_fixed_amount: fixedAmt,
        p_emoji: typeForm.emoji || null,
      })
    }
    setShowAddType(false)
    setEditingType(null)
    setTypeForm({ name: '', frequency_type: 'monthly', notes: '', fixed_amount: '', emoji: '' })
    await Promise.all([fetchBillTypes(), fetchExpected()])
    setLoading(false)
  }

  async function deleteType(id: string) {
    if (!confirm('להסיר סוג חשבון זה?')) return
    await supabase.rpc('delete_bill_type', { p_id: id })
    await Promise.all([fetchBillTypes(), fetchExpected()])
  }

  async function saveRent() {
    setLoading(true)
    await supabase.rpc('upsert_rent_reminder', {
      p_user_id: rentForm.user_id || null,
      p_label: rentForm.label,
      p_renewal_date: rentForm.renewal_date || null,
      p_notes: rentForm.notes || null,
      p_payment_day: rentForm.payment_day ? parseInt(rentForm.payment_day) : null,
      p_amount: rentForm.amount ? parseFloat(rentForm.amount) : null,
    })
    setShowRentModal(false)
    setEditingRent(null)
    setRentForm({ user_id: '', label: '', renewal_date: '', notes: '', payment_day: '', amount: '' })
    fetchRent()
    setLoading(false)
  }

  async function deleteRent(id: string) {
    if (!confirm('למחוק?')) return
    await supabase.rpc('delete_rent_reminder', { p_id: id })
    fetchRent()
  }

  function openEditRent(r: RentReminder) {
    setEditingRent(r)
    setRentForm({ user_id: r.user_id ?? '', label: r.label, renewal_date: r.renewal_date ?? '', notes: r.notes ?? '', payment_day: r.payment_day?.toString() ?? '', amount: r.amount?.toString() ?? '' })
    setShowRentModal(true)
  }

  function openEditType(bt: BillType) {
    setEditingType(bt)
    setTypeForm({ name: bt.name, frequency_type: bt.frequency_type, notes: bt.notes ?? '', fixed_amount: bt.fixed_amount?.toString() ?? '', emoji: bt.emoji ?? '' })
    setShowAddType(true)
  }

  // Privacy: personal rent only visible to that user
  const visibleRent = rentReminders.filter(r => r.user_id === null || r.user_id === myUserId)
  const rentLabels = new Set(visibleRent.map(r => r.label))
  const curMonth = new Date().getMonth() + 1
  const curYear = new Date().getFullYear()
  // Exclude ALL rent from unpaid — rent block handles all months
  const unpaid = bills.filter(b => !b.is_paid && !rentLabels.has(b.bill_type))
  const paid = bills.filter(b => b.is_paid && !rentLabels.has(b.bill_type))
  const paidRent = bills.filter(b => b.is_paid && rentLabels.has(b.bill_type))

  const historyByType: Record<string, Bill[]> = {}
  for (const b of paid) {
    if (!historyByType[b.bill_type]) historyByType[b.bill_type] = []
    historyByType[b.bill_type].push(b)
  }

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <header className="bg-white border-b border-gray-100 px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard')} className="text-gray-500 hover:text-gray-900">→</button>
          <h1 className="font-bold text-gray-900">💳 חשבונות</h1>
        </div>
        <div className="flex gap-2">
          {tab === 'bills' && <button onClick={() => openAddBill()} className="bg-indigo-600 text-white rounded-lg px-3 py-1.5 text-sm font-medium">+ הוסף</button>}
          {tab === 'types' && <button onClick={() => { setEditingType(null); setTypeForm({ name: '', frequency_type: 'monthly', notes: '', fixed_amount: '', emoji: '' }); setShowAddType(true) }} className="bg-indigo-600 text-white rounded-lg px-3 py-1.5 text-sm font-medium">+ הוסף סוג חשבון</button>}
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-100 px-4 flex gap-4">
        <button onClick={() => setTab('bills')} className={`py-3 text-sm font-medium border-b-2 transition-colors ${tab === 'bills' ? 'border-indigo-600 text-gray-900' : 'border-transparent text-gray-400'}`}>חשבונות</button>
        <button onClick={() => setTab('types')} className={`py-3 text-sm font-medium border-b-2 transition-colors ${tab === 'types' ? 'border-indigo-600 text-gray-900' : 'border-transparent text-gray-400'}`}>רשימת חשבונות לתשלום</button>
      </div>

      <main className="max-w-lg mx-auto p-4 space-y-6 pb-24">

        {tab === 'types' && (
          <div className="space-y-6">

            {/* Rent first */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs font-semibold text-gray-400 uppercase">שכר דירה</h2>
                <button onClick={() => { setEditingRent(null); setRentForm({ user_id: myUserId ?? '', label: 'שכר דירה', renewal_date: '', notes: '', payment_day: '', amount: '' }); setShowRentModal(true) }}
                  className="text-xs text-gray-400 hover:text-gray-700 underline">+ הוסף</button>
              </div>
              {rentReminders.length === 0 ? (
                <div className="bg-white rounded-xl border border-dashed border-gray-200 px-4 py-5 text-center text-gray-400 text-sm">לא הוגדר שכר דירה</div>
              ) : (
                <div className="space-y-2">
                  {rentReminders.map(r => (
                    <div key={r.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-xs font-semibold text-gray-400 uppercase mb-0.5">{r.display_name}</p>
                          <p className="text-sm font-medium text-gray-800">🔑 {r.label}</p>
                          {r.amount && <p className="text-xs text-gray-500 mt-0.5">₪{r.amount} לחודש</p>}
                          {r.payment_day && <p className="text-xs text-gray-400 mt-0.5">תשלום ב-{r.payment_day} לחודש</p>}
                          {r.renewal_date && <p className="text-xs text-gray-400 mt-0.5">חידוש: {new Date(r.renewal_date).toLocaleDateString('he-IL')}</p>}
                          {r.notes && <p className="text-xs text-gray-500 mt-1">{r.notes}</p>}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => openEditRent(r)} className="text-xs text-gray-400 hover:text-gray-700 underline">עריכה</button>
                          <button onClick={() => deleteRent(r.id)} className="text-xs text-red-400 hover:text-red-600">🗑</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              {billTypes.filter(bt => bt.is_active).map(bt => (
                <div key={bt.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{bt.emoji && <span className="ml-1">{bt.emoji}</span>}{bt.name}</p>
                    <p className="text-xs text-gray-400">
                      {FREQ_LABELS[bt.frequency_type]}
                      {bt.fixed_amount ? ` · ₪${bt.fixed_amount} קבוע` : ''}
                      {bt.notes ? ` · ${bt.notes}` : ''}
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => openEditType(bt)} className="text-xs text-gray-400 hover:text-gray-700 underline">עריכה</button>
                    <button onClick={() => deleteType(bt.id)} className="text-xs text-red-400 hover:text-red-600">הסר</button>
                  </div>
                </div>
              ))}
              {billTypes.filter(bt => bt.is_active).length === 0 && !pageLoading && (
                <div className="text-center text-gray-400 text-sm py-8">אין סוגי חשבון</div>
              )}
            </div>

          </div>
        )}

        {tab === 'bills' && <>

        {/* Block 1 — Rent (all unpaid, including past months after unmark) */}
        {(() => {
          // Current month unpaid rent reminders (no bill entry or unpaid)
          const unpaidRentReminders = visibleRent.filter(r => {
            if (!r.payment_day) return false
            return !bills.some(b => b.bill_type === r.label && b.month === curMonth && b.year === curYear && b.is_paid)
          })
          // Past month rent bills that were unmarked
          const unpaidRentBills = bills.filter(b =>
            !b.is_paid && rentLabels.has(b.bill_type) &&
            !(b.month === curMonth && b.year === curYear)
          ).sort((a, b) => b.year - a.year || b.month - a.month)

          if (unpaidRentReminders.length === 0 && unpaidRentBills.length === 0) return null
          return (
            <div>
              <h2 className="text-xs font-semibold text-gray-400 uppercase mb-2">שכר דירה</h2>
              <div className="space-y-2">
                {unpaidRentReminders.map(r => (
                  <div key={r.id} className={`bg-white rounded-xl border border-red-100 p-4 transition-opacity duration-300 ${fadingOut.has(r.id) ? 'opacity-0' : 'opacity-100'}`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs font-semibold text-gray-400 mb-0.5">{r.display_name}</p>
                        <p className="text-sm font-medium text-gray-800">🔑 {r.label}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{MONTHS[curMonth - 1]} {curYear} · ב-{r.payment_day} לחודש</p>
                        {r.amount && <p className="text-xs text-gray-500 mt-0.5">₪{r.amount}</p>}
                        {r.notes && <p className="text-xs text-gray-500 mt-0.5">{r.notes}</p>}
                      </div>
                      <button onClick={() => withFade(r.id, () => markRentPaid(r))} className="bg-green-50 text-green-700 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-green-100">סמן כשולם ✓</button>
                    </div>
                  </div>
                ))}
                {unpaidRentBills.map(bill => (
                  <div key={bill.id} className={`bg-white rounded-xl border border-red-100 p-4 transition-opacity duration-300 ${fadingOut.has(bill.id) ? 'opacity-0' : 'opacity-100'}`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-800"><span className="ml-1">🔑</span>{bill.bill_type}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{MONTHS[bill.month - 1]} {bill.year}</p>
                        <p className="text-xs text-gray-500 mt-0.5">₪{bill.amount}</p>
                      </div>
                      <button onClick={() => withFade(bill.id, async () => { await supabase.rpc('mark_bill_paid', { p_bill_id: bill.id }); fetchBills() })} className="bg-green-50 text-green-700 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-green-100">סמן כשולם ✓</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        {/* Block 2 — Expected */}
        {expectedBills.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold text-gray-400 uppercase mb-2">צפויים - טרם הועלו</h2>
            <div className="space-y-2">
              {expectedBills.map(eb => (
                <div key={`${eb.bill_type_id}-${eb.bill_year}-${eb.bill_month}`} className="bg-white rounded-xl border border-dashed border-gray-200 px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-700">{eb.emoji && <span className="ml-1">{eb.emoji}</span>}{eb.name}</p>
                    <p className="text-xs text-gray-400">
                      {monthRangeLabel(eb.frequency_type, eb.bill_month, eb.bill_year)}
                      {eb.notes && ` · ${eb.notes}`}
                    </p>
                  </div>
                  <button
                    onClick={() => setQuickAdd({ bill: eb, amount: eb.fixed_amount?.toString() ?? '', due_date: '' })}
                    className="text-xs bg-indigo-600 text-white rounded-lg px-3 py-1.5 font-medium">
                    + הוסף
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Block 3 — Unpaid */}
        {unpaid.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold text-gray-400 uppercase mb-2">ממתינים לתשלום</h2>
            <div className="space-y-2">
              {unpaid.map(bill => (
                <div key={bill.id} className={`bg-white rounded-xl border border-red-100 p-4 transition-opacity duration-300 ${fadingOut.has(bill.id) ? 'opacity-0' : 'opacity-100'}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{billTypes.find(bt => bt.name === bill.bill_type)?.emoji && <span className="ml-1">{billTypes.find(bt => bt.name === bill.bill_type)?.emoji}</span>}{bill.bill_type}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {monthRangeLabel(billTypes.find(bt => bt.name === bill.bill_type)?.frequency_type ?? 'monthly', bill.month, bill.year)}
                        {' · עד '}{new Date(bill.due_date).toLocaleDateString('he-IL')}
                        {billTypes.find(bt => bt.name === bill.bill_type)?.notes && ` · ${billTypes.find(bt => bt.name === bill.bill_type)?.notes}`}
                      </p>
                    </div>
                    <p className="font-bold text-gray-900">₪{bill.amount}</p>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => markPaid(bill.id)} className="flex-1 bg-green-50 text-green-700 rounded-lg py-2 text-sm font-medium hover:bg-green-100">שולם ✓</button>
                    <button onClick={() => { setEditingBill(bill); setEditBillAmount(bill.amount.toString()) }} className="bg-gray-50 text-gray-500 rounded-lg px-3 py-2 text-sm hover:bg-gray-100">עריכה</button>
                    <button onClick={() => deleteBill(bill.id)} className="bg-red-50 text-red-500 rounded-lg px-3 py-2 text-sm hover:bg-red-100">🗑</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {visibleRent.length === 0 && expectedBills.length === 0 && unpaid.length === 0 && paid.length === 0 && !pageLoading && (
          <div className="text-center text-gray-400 text-sm py-8">אין חשבונות עדיין</div>
        )}

        {/* Block 4 — History */}
        {(paidRent.length > 0 || Object.keys(historyByType).length > 0) && (
          <div>
            <h2 className="text-xs font-semibold text-gray-400 uppercase mb-2">היסטוריה</h2>
            <div className="space-y-2">

          {/* Rent history first */}
          {paidRent.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <p className="text-sm font-semibold text-gray-700 mb-2"><span className="ml-1">🔑</span>שכר דירה</p>
              <div className="space-y-2">
                {paidRent.sort((a, b) => b.year - a.year || b.month - a.month).map(bill => {
                  const rentNote = visibleRent.find(r => r.label === bill.bill_type)?.notes
                  return (
                  <div key={bill.id} className="flex items-center justify-between text-xs">
                    <div>
                      <span className="text-gray-500">{MONTHS[bill.month - 1]} {bill.year}</span>
                      {rentNote && <span className="text-gray-400"> · {rentNote}</span>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-gray-700">₪{bill.amount}</span>
                      <div className="flex gap-1.5">
                        <button onClick={() => { setEditingBill(bill); setEditBillAmount(bill.amount.toString()) }}
                          className="text-gray-300 hover:text-gray-600 underline">עריכה</button>
                        <button onClick={() => setConfirmUnmark(bill.id)}
                          className="text-gray-300 hover:text-orange-500 underline">בטל תשלום</button>
                      </div>
                    </div>
                  </div>
                )})}
              </div>
            </div>
          )}
              {Object.entries(historyByType).map(([type, typeBills]) => (
                <div key={type} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                  <p className="text-sm font-semibold text-gray-700 mb-2">{billTypes.find(bt => bt.name === type)?.emoji && <span className="ml-1">{billTypes.find(bt => bt.name === type)?.emoji}</span>}{type}</p>
                  <div className="space-y-2">
                    {typeBills.sort((a, b) => b.year - a.year || b.month - a.month).map(bill => {
                      const bt = billTypes.find(bt => bt.name === bill.bill_type)
                      return (
                      <div key={bill.id} className="flex items-center justify-between text-xs">
                        <div>
                          <span className="text-gray-500">{monthRangeLabel(bt?.frequency_type ?? 'monthly', bill.month, bill.year)}</span>
                          {bt?.notes && <span className="text-gray-400"> · {bt.notes}</span>}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-gray-700">₪{bill.amount}</span>
                          <div className="flex gap-1.5">
                            <button onClick={() => { setEditingBill(bill); setEditBillAmount(bill.amount.toString()) }}
                              className="text-gray-300 hover:text-gray-600 underline">עריכה</button>
                            <button onClick={() => setConfirmUnmark(bill.id)}
                              className="text-gray-300 hover:text-orange-500 underline">בטל תשלום</button>
                          </div>
                        </div>
                      </div>
                    )})}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        </>}
      </main>

      {/* Add bill modal */}
      {showAddBill && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-4 max-h-[90vh] overflow-y-auto" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">{addMode === 'new' ? 'סוג חשבון חדש' : 'הוספת חשבון'}</h2>
              <button onClick={() => setShowAddBill(false)} className="text-gray-400">✕</button>
            </div>

            {/* Mode toggle */}
            <div className="flex gap-2 mb-4">
              <button onClick={() => setAddMode('existing')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${addMode === 'existing' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-500'}`}>
                חשבון קיים
              </button>
              <button onClick={() => setAddMode('new')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${addMode === 'new' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-500'}`}>
                סוג חשבון חדש
              </button>
            </div>

            <div className="space-y-3">
              {addMode === 'existing' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">סוג חשבון</label>
                  <select value={form.bill_type} onChange={e => setForm(f => ({ ...f, bill_type: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
                    <option value="">בחר סוג...</option>
                    {billTypes.filter(bt => bt.is_active).map(bt => (
                      <option key={bt.id} value={bt.name}>{bt.emoji ? bt.emoji + ' ' : ''}{bt.name}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">שם</label>
                    <input type="text" value={typeForm.name} onChange={e => setTypeForm(f => ({ ...f, name: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                      placeholder="שם החשבון" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">אימוגי</label>
                    <div className="flex flex-wrap gap-1.5">
                      {BILL_EMOJIS.map(e => (
                        <button key={e} type="button"
                          onClick={() => setTypeForm(f => ({ ...f, emoji: f.emoji === e ? '' : e }))}
                          className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center border transition-all
                            ${typeForm.emoji === e ? 'border-indigo-600 bg-gray-100' : 'border-gray-200 bg-white'}`}>
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">תדירות</label>
                    <select value={typeForm.frequency_type} onChange={e => setTypeForm(f => ({ ...f, frequency_type: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
                      {FREQ_OPTIONS.map(f => <option key={f} value={f}>{FREQ_LABELS[f]}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">סכום ₪</label>
                    <input type="number" value={typeForm.fixed_amount} onChange={e => setTypeForm(f => ({ ...f, fixed_amount: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                      placeholder="למשל: 120" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">הערה (אופציונלי)</label>
                    <input type="text" value={typeForm.notes} onChange={e => setTypeForm(f => ({ ...f, notes: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                      placeholder="למשל: חברת חשמל, תשלום ב-15" />
                  </div>
                </>
              )}

              {addMode === 'existing' && (<>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">סכום (₪)</label>
                <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" placeholder="0" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">תאריך אחרון לתשלום</label>
                <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">חודש</label>
                  <select value={form.month} onChange={e => setForm(f => ({ ...f, month: parseInt(e.target.value) }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
                    {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">שנה</label>
                  <select value={form.year} onChange={e => setForm(f => ({ ...f, year: parseInt(e.target.value) }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
                    {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>
              </>)}
            </div>

            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowAddBill(false)} className="flex-1 border border-gray-200 rounded-lg py-2.5 text-sm">ביטול</button>
              <button onClick={addBill}
                disabled={loading || (addMode === 'existing' ? (!form.bill_type || !form.amount || !form.due_date) : !typeForm.name)}
                className="flex-1 bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-40">
                {loading ? '...' : 'הוספה'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit bill type modal */}
      {showAddType && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-4" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">{editingType ? 'עריכת סוג חשבון' : 'הוספת סוג חשבון'}</h2>
              <button onClick={() => { setShowAddType(false); setEditingType(null) }} className="text-gray-400">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">שם</label>
                <input type="text" value={typeForm.name} onChange={e => setTypeForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" placeholder="שם החשבון" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">אימוגי</label>
                <div className="flex flex-wrap gap-1.5">
                  {BILL_EMOJIS.map(e => (
                    <button key={e} type="button"
                      onClick={() => setTypeForm(f => ({ ...f, emoji: f.emoji === e ? '' : e }))}
                      className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center border transition-all
                        ${typeForm.emoji === e ? 'border-indigo-600 bg-gray-100' : 'border-gray-200 bg-white'}`}>
                      {e}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">תדירות</label>
                <select value={typeForm.frequency_type} onChange={e => setTypeForm(f => ({ ...f, frequency_type: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
                  {FREQ_OPTIONS.map(f => <option key={f} value={f}>{FREQ_LABELS[f]}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">סכום קבוע ₪ (אופציונלי)</label>
                <input type="number" value={typeForm.fixed_amount} onChange={e => setTypeForm(f => ({ ...f, fixed_amount: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  placeholder="למשל: 120" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">הערה (אופציונלי)</label>
                <input type="text" value={typeForm.notes} onChange={e => setTypeForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  placeholder="למשל: חברת חשמל, תשלום ב-15" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => { setShowAddType(false); setEditingType(null) }} className="flex-1 border border-gray-200 rounded-lg py-2.5 text-sm">ביטול</button>
              <button onClick={saveType} disabled={loading || !typeForm.name}
                className="flex-1 bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-40">
                {loading ? '...' : editingType ? 'שמור' : 'הוספה'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit bill modal */}
      {editingBill && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-4" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">עריכת חשבון - {editingBill.bill_type}</h2>
              <button onClick={() => setEditingBill(null)} className="text-gray-400">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">סכום (₪)</label>
                <input type="number" value={editBillAmount} onChange={e => setEditBillAmount(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setEditingBill(null)} className="flex-1 border border-gray-200 rounded-lg py-2.5 text-sm">ביטול</button>
              <button onClick={saveBillEdit} disabled={loading || !editBillAmount}
                className="flex-1 bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-40">
                {loading ? '...' : 'שמור'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick-add from expected */}
      {quickAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-4" dir="rtl">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-semibold text-gray-900">{quickAdd.bill.name}</h2>
              <button onClick={() => setQuickAdd(null)} className="text-gray-400">✕</button>
            </div>
            <p className="text-xs text-gray-400 mb-4">
              {monthRangeLabel(quickAdd.bill.frequency_type, quickAdd.bill.bill_month, quickAdd.bill.bill_year)}
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">סכום (₪)</label>
                <input
                  type="number"
                  value={quickAdd.amount}
                  onChange={e => setQuickAdd(q => q ? { ...q, amount: e.target.value } : null)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  placeholder="0"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">תאריך אחרון לתשלום</label>
                <input
                  type="date"
                  value={quickAdd.due_date}
                  onChange={e => setQuickAdd(q => q ? { ...q, due_date: e.target.value } : null)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setQuickAdd(null)} className="flex-1 border border-gray-200 rounded-lg py-2.5 text-sm">ביטול</button>
              <button
                onClick={quickMarkPaid}
                disabled={loading}
                className="flex-1 bg-green-50 text-green-700 border border-green-200 rounded-lg py-2.5 text-sm font-medium disabled:opacity-40 hover:bg-green-100">
                {loading ? '...' : 'שולם כבר ✓'}
              </button>
              <button
                onClick={quickAddBill}
                disabled={loading || !quickAdd.amount}
                className="flex-1 bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-40">
                {loading ? '...' : 'הוסף לרשימה'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rent reminder modal */}
      {showRentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-4" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">{editingRent ? 'עריכת שכר דירה' : 'הוספת שכר דירה'}</h2>
              <button onClick={() => { setShowRentModal(false); setEditingRent(null) }} className="text-gray-400">✕</button>
            </div>
            <div className="space-y-3">
              {aptMode !== 'solo' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">דייר</label>
                  <select value={rentForm.user_id ?? ''} onChange={e => setRentForm(f => ({ ...f, user_id: e.target.value || null }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
                    <option value="">כל הדירה</option>
                    {residents.map(r => <option key={r.id} value={r.id}>{r.display_name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">תיאור</label>
                <input type="text" value={rentForm.label} onChange={e => setRentForm(f => ({ ...f, label: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" placeholder="שכר דירה" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">סכום (₪)</label>
                <input type="number" value={rentForm.amount} onChange={e => setRentForm(f => ({ ...f, amount: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" placeholder="0" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">יום תשלום בחודש</label>
                <select value={rentForm.payment_day} onChange={e => setRentForm(f => ({ ...f, payment_day: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
                  <option value="">לא מוגדר</option>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                    <option key={d} value={d}>{d} לחודש</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">תאריך חידוש חוזה</label>
                <input type="date" value={rentForm.renewal_date} onChange={e => setRentForm(f => ({ ...f, renewal_date: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">הערה</label>
                <input type="text" value={rentForm.notes} onChange={e => setRentForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" placeholder="סכום, הערה אישית..." />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => { setShowRentModal(false); setEditingRent(null) }} className="flex-1 border border-gray-200 rounded-lg py-2.5 text-sm">ביטול</button>
              <button onClick={saveRent} disabled={loading || !rentForm.label}
                className="flex-1 bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-40">
                {loading ? '...' : 'שמור'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm unmark payment */}
      {confirmUnmark && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-4" dir="rtl">
            <h2 className="font-semibold text-gray-900 mb-1">לבטל את סימון התשלום?</h2>
            <p className="text-sm text-gray-500 mb-4">החשבון יחזור לרשימת הממתינים לתשלום.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmUnmark(null)} className="flex-1 border border-gray-200 rounded-lg py-2.5 text-sm">לא</button>
              <button
                onClick={() => { markUnpaid(confirmUnmark); setConfirmUnmark(null) }}
                className="flex-1 bg-orange-500 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-orange-600">
                כן, בטל תשלום
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
