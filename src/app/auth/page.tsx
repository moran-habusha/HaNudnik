'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('register')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [gender, setGender] = useState<'male' | 'female' | ''>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (mode === 'register') {
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password })
      if (signUpError) { setError(signUpError.message); setLoading(false); return }

      if (data.user) {
        const { error: profileError } = await supabase.from('profiles').insert({
          id: data.user.id,
          display_name: displayName,
          gender: gender || null,
        })
        if (profileError) { setError(profileError.message); setLoading(false); return }
      }
      router.push('/setup')
    } else {
      const { error: loginError } = await supabase.auth.signInWithPassword({ email, password })
      if (loginError) { setError(loginError.message); setLoading(false); return }
      router.push('/')
    }
    setLoading(false)
  }

  return (
    <div className="h-screen overflow-hidden bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 w-full max-w-sm p-8">
        <div className="text-center mb-8">
          <img src="/HaNudnikCharacter_thick_outline_White.png" alt="HaNudnik" className="w-20 h-20 object-contain mx-auto mb-2" />
          <h1 className="text-3xl font-bold text-gray-900">HaNudnik</h1>
          <p className="text-gray-500 text-sm mt-1">הדייר הדיגיטלי שלך</p>
        </div>

        <div className="flex rounded-lg bg-gray-100 p-1 mb-6">
          <button
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${mode === 'login' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}
            onClick={() => setMode('login')}
          >התחברות</button>
          <button
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${mode === 'register' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}
            onClick={() => setMode('register')}
          >הרשמה</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" dir="rtl">
          {mode === 'register' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">שם תצוגה</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  required
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="איך קוראים לך?"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">מגדר</label>
                <div className="flex gap-3">
                  {(['female', 'male'] as const).map(g => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGender(g)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${
                        gender === g
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'border-gray-200 text-gray-600'
                      }`}
                    >
                      {g === 'female' ? 'נקבה' : 'זכר'}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">אימייל</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">סיסמה</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'רגע...' : mode === 'login' ? 'כניסה' : 'יצירת חשבון'}
          </button>
        </form>
      </div>
    </div>
  )
}
