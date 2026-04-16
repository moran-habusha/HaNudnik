'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type WeekEntry = { user_id: string; display_name: string; points: number; week_start: string; is_former: boolean; gender: string }
type MonthEntry = { user_id: string; display_name: string; points: number; month_start: string; is_former: boolean; gender: string }

type SummaryGroup = {
  type: 'week' | 'month'
  date: string // week_start or month_start (ISO)
  sortKey: string
  label: string
  entries: { user_id: string; display_name: string; points: number; is_former: boolean; gender: string }[]
}

export default function HistoryPage() {
  const [groups, setGroups] = useState<SummaryGroup[]>([])
  const [loaded, setLoaded] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) { router.push('/auth'); return }

      const [{ data: weekData }, { data: monthData }] = await Promise.all([
        supabase.rpc('get_weekly_history'),
        supabase.rpc('get_monthly_history'),
      ])

      const weekEntries: WeekEntry[] = weekData ?? []
      const monthEntries: MonthEntry[] = monthData ?? []

      // Group weekly
      const weekGroups: Record<string, SummaryGroup> = {}
      for (const e of weekEntries) {
        if (!weekGroups[e.week_start]) {
          const sentOn = new Date(e.week_start)
          sentOn.setDate(sentOn.getDate() + 7)
          weekGroups[e.week_start] = {
            type: 'week',
            date: e.week_start,
            sortKey: sentOn.toISOString().slice(0, 10),
            label: formatWeek(e.week_start),
            entries: [],
          }
        }
        weekGroups[e.week_start].entries.push({ user_id: e.user_id, display_name: e.display_name, points: e.points, is_former: e.is_former, gender: e.gender })
      }

      // Group monthly
      const monthGroups: Record<string, SummaryGroup> = {}
      for (const e of monthEntries) {
        if (!monthGroups[e.month_start]) {
          // sort key = 1st of next month (day summary is sent)
          const d = new Date(e.month_start)
          const firstOfNext = new Date(d.getFullYear(), d.getMonth() + 1, 1)
          const monthlySortKey = firstOfNext.toISOString().slice(0, 10)
          monthGroups[e.month_start] = {
            type: 'month',
            date: e.month_start,
            sortKey: monthlySortKey,
            label: formatMonth(e.month_start),
            entries: [],
          }
        }
        monthGroups[e.month_start].entries.push({ user_id: e.user_id, display_name: e.display_name, points: e.points, is_former: e.is_former, gender: e.gender })
      }

      // Merge and sort by sortKey desc
      const all: SummaryGroup[] = [
        ...Object.values(weekGroups),
        ...Object.values(monthGroups),
      ].sort((a, b) => b.sortKey.localeCompare(a.sortKey))

      setGroups(all)
      setLoaded(true)
    }
    load()
  }, [])

  function formatWeek(dateStr: string) {
    const d = new Date(dateStr)
    const end = new Date(d)
    end.setDate(end.getDate() + 6)
    const fmt = (x: Date) => `${x.getDate()}/${x.getMonth() + 1}`
    return `שבוע ${fmt(d)} – ${fmt(end)}`
  }

  function formatMonth(dateStr: string) {
    const d = new Date(dateStr)
    const names = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר']
    return `חודש ${names[d.getMonth()]} ${d.getFullYear()}`
  }

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <header className="bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.push('/dashboard')} className="text-gray-500 hover:text-gray-900">→</button>
        <h1 className="font-bold text-gray-900">📊 היסטוריה</h1>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-4">
        {!loaded ? (
          <p className="text-center text-gray-400 text-sm py-8">טוען...</p>
        ) : groups.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-8">אין היסטוריה עדיין</p>
        ) : (
          groups.map((group, idx) => {
            const isLatest = idx === 0
            return (
              <div
                key={`${group.type}-${group.date}`}
                className={`rounded-xl border p-4 ${
                  isLatest
                    ? group.type === 'month'
                      ? 'bg-blue-50 border-blue-200'
                      : 'bg-amber-50 border-amber-200'
                    : 'bg-white border-gray-100'
                }`}
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs">{group.type === 'month' ? '📅' : '📊'}</span>
                  <h2 className={`text-xs font-semibold uppercase ${isLatest ? (group.type === 'month' ? 'text-blue-600' : 'text-amber-600') : 'text-gray-400'}`}>
                    {group.label}
                  </h2>
                  {isLatest && (
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${group.type === 'month' ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'}`}>
                      אחרון
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {group.entries.map((e, i) => {
                    const hasPoints = e.points > 0
                    const rank = hasPoints ? group.entries.filter(x => x.points > 0).indexOf(e) : -1
                    const medal = rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : null
                    return (
                    <div key={e.user_id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm w-5 text-center">
                          {hasPoints ? (medal ?? `${rank + 1}.`) : '–'}
                        </span>
                        <span className={`text-sm ${hasPoints ? (isLatest ? 'text-gray-900' : 'text-gray-700') : 'text-gray-400'}`}>
                          {e.display_name}
                          {e.is_former && <span className="text-xs text-gray-400 mr-1">({e.gender === 'female' ? 'עזבה' : 'עזב'})</span>}
                        </span>
                      </div>
                      <span className={`text-sm font-semibold ${hasPoints ? (isLatest ? 'text-gray-900' : 'text-gray-600') : 'text-gray-400'}`}>{e.points} נק׳</span>
                    </div>
                    )
                  })}
                </div>
              </div>
            )
          })
        )}
      </main>
    </div>
  )
}
