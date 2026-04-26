'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { APP_VERSION } from '@/src/version'

interface Proposal {
  id: string
  bid_number: string
  bid_title: string
  bid_org: string
  budget: number | null
  status: 'pending' | 'generating' | 'completed' | 'failed'
  ai_cost: number
  created_at: string
  completed_at: string | null
}

const STATUS_CONFIG = {
  pending: { label: '대기 중', color: 'bg-gray-100 text-gray-700', dot: 'bg-gray-400' },
  generating: { label: '생성 중', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
  completed: { label: '완료', color: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
  failed: { label: '실패', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
} as const

type StatusFilter = 'all' | 'pending' | 'generating' | 'completed' | 'failed'

async function fetchProposals(): Promise<Proposal[]> {
  const res = await fetch('/api/proposals')
  const json = await res.json()
  if (!json.success) throw new Error(json.error || '제안서 목록을 불러올 수 없습니다.')
  return json.data || []
}

export default function ProposalsListPage() {
  const router = useRouter()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const { data: proposals, isLoading, error, refetch } = useQuery({
    queryKey: ['myProposals'],
    queryFn: fetchProposals,
  })

  const handleDelete = async (e: React.MouseEvent, proposal: Proposal) => {
    e.stopPropagation() // 카드 클릭(이동) 방지
    if (deletingId) return
    if (!confirm(`"${proposal.bid_title}" 제안서를 삭제하시겠습니까?\n삭제 후 복구할 수 없습니다.`)) return

    setDeletingId(proposal.id)
    try {
      const res = await fetch(`/api/proposals/${proposal.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (json.success) {
        refetch()
      } else {
        alert(json.error || '삭제에 실패했습니다.')
      }
    } catch {
      alert('네트워크 오류가 발생했습니다.')
    } finally {
      setDeletingId(null)
    }
  }

  const filtered = proposals?.filter(
    (p) => statusFilter === 'all' || p.status === statusFilter
  ) ?? []

  const statusCounts = proposals?.reduce(
    (acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1
      acc.all += 1
      return acc
    },
    { all: 0, pending: 0, generating: 0, completed: 0, failed: 0 } as Record<string, number>
  ) ?? { all: 0 }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatBudget = (budget: number | null) => {
    if (!budget) return '-'
    return `${(budget / 100000000).toFixed(1)}억원`
  }

  return (
    <>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* 상단 헤더 */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">내 제안서</h2>
            <p className="mt-1 text-sm text-gray-500">
              생성한 제안서를 확인하고 관리하세요
            </p>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:from-blue-500 hover:to-purple-500"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            새 공고 검색
          </Link>
        </div>

        {/* 필터 탭 */}
        <div className="mb-6 flex gap-2 overflow-x-auto">
          {([
            { key: 'all', label: '전체' },
            { key: 'completed', label: '완료' },
            { key: 'generating', label: '생성 중' },
            { key: 'pending', label: '대기 중' },
            { key: 'failed', label: '실패' },
          ] as { key: StatusFilter; label: string }[]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                statusFilter === key
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              {label}
              {(statusCounts[key] ?? 0) > 0 && (
                <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold ${
                  statusFilter === key
                    ? 'bg-white/20 text-white'
                    : 'bg-gray-200 text-gray-600'
                }`}>
                  {statusCounts[key]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* 로딩 */}
        {isLoading && (
          <div className="rounded-lg bg-white p-12 text-center shadow-sm">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" />
            <p className="mt-4 text-sm text-gray-600">제안서 목록을 불러오는 중...</p>
          </div>
        )}

        {/* 에러 */}
        {error && (
          <div className="rounded-lg bg-red-50 p-6 text-center shadow-sm">
            <p className="text-sm text-red-700">
              {error instanceof Error ? error.message : '목록을 불러올 수 없습니다.'}
            </p>
          </div>
        )}

        {/* 빈 상태 */}
        {!isLoading && !error && proposals && proposals.length === 0 && (
          <div className="rounded-lg bg-white p-12 text-center shadow-md">
            <svg className="mx-auto h-16 w-16 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="mt-4 text-lg font-semibold text-gray-900">아직 제안서가 없습니다</h3>
            <p className="mt-2 text-sm text-gray-500">공고를 검색하고 첫 제안서를 만들어보세요</p>
            <Link
              href="/dashboard"
              className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
            >
              공고 검색하기
            </Link>
          </div>
        )}

        {/* 필터링 결과 없음 */}
        {!isLoading && !error && proposals && proposals.length > 0 && filtered.length === 0 && (
          <div className="rounded-lg bg-white p-12 text-center shadow-sm">
            <p className="text-sm text-gray-500">해당 상태의 제안서가 없습니다.</p>
          </div>
        )}

        {/* 제안서 목록 */}
        {!isLoading && !error && filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map((proposal) => {
              const cfg = STATUS_CONFIG[proposal.status]
              return (
                <button
                  key={proposal.id}
                  onClick={() => router.push(`/dashboard/proposals/${proposal.id}`)}
                  className="group flex w-full items-center gap-4 rounded-lg bg-white p-5 text-left shadow-sm transition-all hover:shadow-md"
                >
                  {/* 상태 점 */}
                  <div className="flex-shrink-0">
                    <div className={`h-3 w-3 rounded-full ${cfg.dot} ${
                      proposal.status === 'generating' ? 'animate-pulse' : ''
                    }`} />
                  </div>

                  {/* 메인 정보 */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-base font-semibold text-gray-900 group-hover:text-blue-600">
                        {proposal.bid_title}
                      </h3>
                      <span className={`flex-shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
                      <span>{proposal.bid_org}</span>
                      <span className="text-gray-300">|</span>
                      <span>{formatBudget(proposal.budget)}</span>
                      <span className="text-gray-300">|</span>
                      <span>{formatDate(proposal.created_at)}</span>
                      {proposal.completed_at && (
                        <>
                          <span className="text-gray-300">|</span>
                          <span className="text-green-600">완료: {formatDate(proposal.completed_at)}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* 삭제 + 화살표 */}
                  <div className="flex flex-shrink-0 items-center gap-2">
                    {proposal.status !== 'generating' && (
                      <button
                        onClick={(e) => handleDelete(e, proposal)}
                        disabled={deletingId === proposal.id}
                        className="rounded-md p-1.5 text-gray-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 disabled:opacity-50"
                        title="삭제"
                      >
                        {deletingId === proposal.id ? (
                          <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                        ) : (
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        )}
                      </button>
                    )}
                    <svg className="h-5 w-5 text-gray-300 group-hover:text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </main>

      {/* Version */}
      <div className="fixed bottom-2 right-3 text-xs text-gray-300">
        {APP_VERSION}
      </div>
    </>
  )
}
