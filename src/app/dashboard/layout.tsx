'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/src/lib/supabase-browser'

interface Profile {
  email: string
  name: string | null
  company_name: string | null
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()

  // /dashboard/proposals/[id] 같은 상세 페이지에서는 네비 숨김
  const isDetailPage = /^\/dashboard\/proposals\/[^/]+$/.test(pathname)
  if (isDetailPage) return <>{children}</>

  const navItems = [
    { href: '/dashboard', label: '공고 검색', icon: SearchIcon },
    { href: '/dashboard/proposals', label: '내 제안서', icon: DocIcon },
  ]

  const handleLogout = async () => {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-8">
              <Link href="/dashboard" className="text-lg font-bold text-gray-900">
                나라장터 AI 제안서
              </Link>
              <nav className="flex gap-1">
                {navItems.map(({ href, label, icon: Icon }) => {
                  const isActive = href === '/dashboard'
                    ? pathname === '/dashboard'
                    : pathname.startsWith(href)
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </Link>
                  )
                })}
              </nav>
            </div>
            <div className="flex items-center gap-3">
              <ProfileMenu onLogout={handleLogout} />
            </div>
          </div>
        </div>
      </header>

      {children}
    </div>
  )
}

function ProfileMenu({ onLogout }: { onLogout: () => void }) {
  const [open, setOpen] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [editing, setEditing] = useState(false)
  const [companyName, setCompanyName] = useState('')
  const [saving, setSaving] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/profile')
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data) {
          setProfile(json.data)
          setCompanyName(json.data.company_name || '')
        }
      })
      .catch(() => {})
  }, [])

  // 외부 클릭 시 닫기
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
        setEditing(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_name: companyName }),
      })
      const json = await res.json()
      if (json.success && json.data) {
        setProfile(json.data)
        setEditing(false)
      }
    } catch {
      // silent
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
          {profile?.email?.[0]?.toUpperCase() || '?'}
        </div>
        <span className="hidden sm:inline">
          {profile?.name
            ? `${profile.name}님`
            : profile?.company_name || profile?.email?.split('@')[0] || '...'}
        </span>
        <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-lg bg-white py-1 shadow-lg ring-1 ring-black/5">
          {/* 프로필 정보 */}
          <div className="border-b border-gray-100 px-4 py-3">
            <p className="text-xs text-gray-500">{profile?.email}</p>

            {editing ? (
              <div className="mt-2">
                <label className="text-xs font-medium text-gray-700">회사명</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="예: (주)우리회사"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                />
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                  >
                    {saving ? '저장 중...' : '저장'}
                  </button>
                  <button
                    onClick={() => {
                      setEditing(false)
                      setCompanyName(profile?.company_name || '')
                    }}
                    className="rounded-md px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                  >
                    취소
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-gray-400">
                  PPT 표지에 이 회사명이 표시됩니다
                </p>
              </div>
            ) : (
              <div className="mt-1 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900">
                  {profile?.company_name || (
                    <span className="text-gray-400">회사명 미설정</span>
                  )}
                </span>
                <button
                  onClick={() => setEditing(true)}
                  className="text-xs font-medium text-blue-600 hover:text-blue-500"
                >
                  수정
                </button>
              </div>
            )}
          </div>

          {/* 메뉴 항목 */}
          <button
            onClick={() => {
              setOpen(false)
              onLogout()
            }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-gray-600 hover:bg-gray-50"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            로그아웃
          </button>
        </div>
      )}
    </div>
  )
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  )
}

function DocIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )
}
