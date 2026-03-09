'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/src/lib/supabase-browser'

type Mode = 'login' | 'signup'

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect') || '/dashboard'

  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const supabase = createSupabaseBrowserClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setMessage(null)

    if (!email || !password) {
      setError('이메일과 비밀번호를 입력해주세요.')
      return
    }

    if (mode === 'signup') {
      if (password.length < 6) {
        setError('비밀번호는 6자 이상이어야 합니다.')
        return
      }
      if (password !== confirmPassword) {
        setError('비밀번호가 일치하지 않습니다.')
        return
      }
    }

    setLoading(true)

    try {
      if (mode === 'login') {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (authError) {
          setError(
            authError.message === 'Invalid login credentials'
              ? '이메일 또는 비밀번호가 올바르지 않습니다.'
              : authError.message
          )
          return
        }
        router.push(redirect)
        router.refresh()
      } else {
        const { error: authError } = await supabase.auth.signUp({
          email,
          password,
        })
        if (authError) {
          setError(authError.message)
          return
        }
        setMessage('회원가입이 완료되었습니다. 이메일을 확인해주세요.')
        setMode('login')
      }
    } catch {
      setError('네트워크 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const toggleMode = () => {
    setMode((m) => (m === 'login' ? 'signup' : 'login'))
    setError(null)
    setMessage(null)
    setConfirmPassword('')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 px-4">
      <div className="w-full max-w-md">
        {/* 로고 영역 */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">
            나라장터 AI 제안서
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            입찰공고를 선택하면 AI가 자동으로 제안서를 생성합니다
          </p>
        </div>

        {/* 카드 */}
        <div className="rounded-xl bg-white p-8 shadow-lg ring-1 ring-gray-100">
          <h2 className="text-xl font-semibold text-gray-900">
            {mode === 'login' ? '로그인' : '회원가입'}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {mode === 'login'
              ? '계정에 로그인하세요'
              : '새 계정을 만드세요'}
          </p>

          {/* 에러/메시지 */}
          {error && (
            <div className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {message && (
            <div className="mt-4 rounded-md bg-green-50 px-4 py-3 text-sm text-green-700">
              {message}
            </div>
          )}

          {/* 폼 */}
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                이메일
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
                className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                비밀번호
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? '6자 이상 입력' : '비밀번호'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            {mode === 'signup' && (
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                  비밀번호 확인
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="비밀번호 다시 입력"
                  autoComplete="new-password"
                  required
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading && (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              )}
              {loading
                ? (mode === 'login' ? '로그인 중...' : '가입 중...')
                : (mode === 'login' ? '로그인' : '회원가입')
              }
            </button>
          </form>

          {/* 모드 전환 */}
          <div className="mt-6 text-center text-sm">
            <span className="text-gray-500">
              {mode === 'login' ? '계정이 없으신가요?' : '이미 계정이 있으신가요?'}
            </span>
            <button
              type="button"
              onClick={toggleMode}
              className="ml-1 font-medium text-blue-600 hover:text-blue-500"
            >
              {mode === 'login' ? '회원가입' : '로그인'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
