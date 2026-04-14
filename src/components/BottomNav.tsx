'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

const HIDE_ON = ['/auth', '/setup']

const TABS = [
  { label: 'בית', emoji: '🏠', href: '/dashboard' },
  { label: 'מטלות', emoji: '✅', href: '/tasks' },
  { label: 'הנודניק', emoji: '', href: '/bot' },
  { label: 'קניות', emoji: '🛒', href: '/shopping' },
]

const MORE_ITEMS = [
  { label: 'חשבונות', emoji: '💳', href: '/bills' },
  { label: 'כביסה', emoji: '🧺', href: '/laundry' },
  { label: 'לוח שנה', emoji: '📅', href: '/calendar' },
  { label: 'היסטוריה', emoji: '📊', href: '/history' },
]

export default function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [moreOpen, setMoreOpen] = useState(false)
  const [unreadBot, setUnreadBot] = useState(0)
  const [aptMode, setAptMode] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    async function fetchUnread() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { count } = await supabase
        .from('bot_messages')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false)
      setUnreadBot(count ?? 0)
      if (aptMode === null) {
        const { data: profile } = await supabase.from('profiles').select('apartment_id').eq('id', user.id).single()
        if (profile?.apartment_id) {
          const { data: apt } = await supabase.from('apartments').select('mode').eq('id', profile.apartment_id).single()
          setAptMode(apt?.mode ?? null)
        }
      }
    }
    fetchUnread()

    const channel = supabase
      .channel('bot-unread')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bot_messages' }, fetchUnread)
      .subscribe()

    window.addEventListener('bot-messages-read', fetchUnread)
    return () => {
      supabase.removeChannel(channel)
      window.removeEventListener('bot-messages-read', fetchUnread)
    }
  }, [pathname])

  if (HIDE_ON.includes(pathname)) return null

  return (
    <>
      {/* More overlay */}
      {moreOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="absolute bottom-16 right-0 left-0 mx-4 bg-white rounded-2xl shadow-xl p-3 flex justify-center gap-2"
            onClick={e => e.stopPropagation()}
            dir="rtl"
          >
            {MORE_ITEMS.filter(item => !(aptMode === 'solo' && item.href === '/history')).map(item => (
              <button
                key={item.href}
                onClick={() => { setMoreOpen(false); router.push(item.href) }}
                className="flex flex-col items-center gap-1 py-3 px-4 w-20 rounded-xl hover:bg-gray-50 transition-colors"
              >
                <span className="text-2xl">{item.emoji}</span>
                <span className="text-xs text-gray-600">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bottom bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-100 flex items-stretch"
        dir="rtl"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {TABS.map(tab => {
          const active = pathname === tab.href || (tab.href !== '/dashboard' && pathname.startsWith(tab.href))
          return (
            <button
              key={tab.href}
              onClick={() => { setMoreOpen(false); router.push(tab.href) }}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${
                active ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <div className="relative">
                {tab.href === '/bot'
                  ? <img src="/HaNudnikCharacter_thick_outline_White.png" alt="בוט" className={`w-7 h-7 object-contain transition-opacity ${active ? 'opacity-100' : 'opacity-60'}`} />
                  : <span className="text-xl leading-none">{tab.emoji}</span>
                }
                {tab.href === '/bot' && unreadBot > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[14px] h-3.5 flex items-center justify-center px-0.5">
                    {unreadBot > 9 ? '9+' : unreadBot}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          )
        })}
        <button
          onClick={() => setMoreOpen(v => !v)}
          className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${
            moreOpen ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          <span className="text-xl leading-none">☰</span>
          <span className="text-[10px] font-medium">עוד</span>
        </button>
      </nav>
    </>
  )
}
