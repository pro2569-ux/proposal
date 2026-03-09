'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import type { BidInfo } from '@/src/types'

interface SearchFilters {
  keyword: string
  startDate: string
  endDate: string
}

interface SearchResponse {
  success: boolean
  data: BidInfo[]
  pagination: {
    page: number
    limit: number
    totalCount: number
    totalPages: number
  }
  error?: string
}

async function searchBids(
  filters: SearchFilters,
  page: number = 1
): Promise<SearchResponse> {
  const params = new URLSearchParams({
    q: filters.keyword,
    page: String(page),
    limit: '12',
  })

  if (filters.startDate) {
    params.append('startDate', filters.startDate)
  }
  if (filters.endDate) {
    params.append('endDate', filters.endDate)
  }

  const response = await fetch(`/api/nara/search?${params}`)
  const data = await response.json()

  if (!data.success) {
    throw new Error(data.error || '검색에 실패했습니다.')
  }

  return data
}

function getDefaultDates() {
  const today = new Date()
  const weekAgo = new Date(today)
  weekAgo.setDate(today.getDate() - 7)
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  return { startDate: fmt(weekAgo), endDate: fmt(today) }
}

export default function DashboardPage() {
  const router = useRouter()
  const defaults = getDefaultDates()
  const [creatingBid, setCreatingBid] = useState<string | null>(null)
  const [filters, setFilters] = useState<SearchFilters>({
    keyword: '',
    startDate: defaults.startDate,
    endDate: defaults.endDate,
  })
  const [submittedFilters, setSubmittedFilters] = useState<SearchFilters | null>(null)
  const [currentPage, setCurrentPage] = useState(1)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['bids', submittedFilters, currentPage],
    queryFn: () => searchBids(submittedFilters!, currentPage),
    enabled: submittedFilters !== null && submittedFilters.keyword.length > 0,
  })

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!filters.keyword.trim()) {
      alert('검색어를 입력해주세요.')
      return
    }

    // 날짜 범위 검증 (최대 30일)
    if (filters.startDate && filters.endDate) {
      const start = new Date(filters.startDate)
      const end = new Date(filters.endDate)
      const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))

      if (daysDiff > 30) {
        alert('날짜 범위는 최대 30일까지 가능합니다.')
        return
      }

      if (daysDiff < 0) {
        alert('시작일이 종료일보다 늦을 수 없습니다.')
        return
      }
    }

    setCurrentPage(1)
    setSubmittedFilters({ ...filters }) // 검색 버튼 클릭 시에만 필터 제출
  }

  const handleCreateProposal = async (bid: BidInfo) => {
    const bidKey = `${bid.bidNtceNo}-${bid.bidNtceOrd}`
    if (creatingBid) return

    setCreatingBid(bidKey)
    try {
      // 기존 제안서가 있는지 확인
      const checkRes = await fetch(`/api/proposals?bidNumber=${encodeURIComponent(bidKey)}`)
      const checkJson = await checkRes.json()

      if (checkJson.success && checkJson.data?.id) {
        // 기존 제안서로 이동
        router.push(`/dashboard/proposals/${checkJson.data.id}`)
        return
      }

      // 없으면 새로 생성
      const res = await fetch('/api/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bidNumber: bidKey,
          bidTitle: bid.bidNtceNm,
          bidOrg: bid.ntceInsttNm || bid.dminsttNm,
          budget: bid.presmptPrce ? parseInt(bid.presmptPrce.replace(/,/g, ''), 10) || undefined : undefined,
          bidData: {
            bidNtceNo: bid.bidNtceNo,
            bidNtceOrd: bid.bidNtceOrd || '00',
            bidNtceNm: bid.bidNtceNm,
            ntceInsttNm: bid.ntceInsttNm,
            dminsttNm: bid.dminsttNm,
            bidNtceDt: bid.bidNtceDt || '',
            bidClseDt: bid.bidClseDt || '',
            presmptPrce: bid.presmptPrce || '',
          },
        }),
      })

      const json = await res.json()
      if (json.success && json.data?.proposalId) {
        router.push(`/dashboard/proposals/${json.data.proposalId}`)
      } else {
        alert(json.error || '제안서 생성에 실패했습니다.')
      }
    } catch {
      alert('네트워크 오류가 발생했습니다.')
    } finally {
      setCreatingBid(null)
    }
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr || dateStr.length < 12) return '-'
    // yyyyMMddHHmm -> yyyy.MM.dd HH:mm
    return `${dateStr.substring(0, 4)}.${dateStr.substring(
      4,
      6
    )}.${dateStr.substring(6, 8)} ${dateStr.substring(
      8,
      10
    )}:${dateStr.substring(10, 12)}`
  }

  const formatAmount = (amountStr: string) => {
    if (!amountStr) return '-'
    const amount = parseInt(amountStr.replace(/,/g, ''), 10)
    if (isNaN(amount)) return '-'
    return `${(amount / 100000000).toFixed(1)}억원`
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                나라장터 AI 제안서 생성
              </h1>
              <p className="mt-1 text-sm text-gray-600">
                입찰공고를 검색하고 AI로 제안서를 자동 생성하세요
              </p>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500">
                {data?.pagination.totalCount
                  ? `총 ${data.pagination.totalCount.toLocaleString()}건`
                  : ''}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Search Section */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <form
            onSubmit={handleSearch}
            className="rounded-lg bg-white p-6 shadow-md"
          >
            <div className="grid gap-4 md:grid-cols-4">
              {/* Keyword */}
              <div className="md:col-span-2">
                <label
                  htmlFor="keyword"
                  className="mb-2 block text-sm font-medium text-gray-700"
                >
                  검색어
                </label>
                <input
                  id="keyword"
                  type="text"
                  value={filters.keyword}
                  onChange={(e) =>
                    setFilters({ ...filters, keyword: e.target.value })
                  }
                  placeholder="공고명 검색 (예: 소프트웨어 개발)"
                  className="w-full rounded-md border border-gray-300 px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              {/* Start Date */}
              <div>
                <label
                  htmlFor="startDate"
                  className="mb-2 block text-sm font-medium text-gray-700"
                >
                  시작일
                </label>
                <input
                  id="startDate"
                  type="date"
                  value={filters.startDate}
                  onChange={(e) =>
                    setFilters({ ...filters, startDate: e.target.value })
                  }
                  className="w-full rounded-md border border-gray-300 px-4 py-2.5 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              {/* End Date */}
              <div>
                <label
                  htmlFor="endDate"
                  className="mb-2 block text-sm font-medium text-gray-700"
                >
                  종료일
                </label>
                <input
                  id="endDate"
                  type="date"
                  value={filters.endDate}
                  onChange={(e) =>
                    setFilters({ ...filters, endDate: e.target.value })
                  }
                  className="w-full rounded-md border border-gray-300 px-4 py-2.5 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>

            {/* Info Message */}
            <div className="mt-3 text-sm text-gray-500">
              💡 날짜 범위는 최대 30일까지 검색 가능합니다. 날짜를 입력하지 않으면 최근 7일 기준으로 검색됩니다.
            </div>

            {/* Search Button */}
            <div className="mt-4 flex justify-end">
              <button
                type="submit"
                disabled={isLoading}
                className="rounded-md bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <svg
                      className="h-4 w-4 animate-spin"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    검색 중...
                  </span>
                ) : (
                  '검색'
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Results */}
        {submittedFilters === null && (
          <div className="rounded-lg bg-white p-12 text-center shadow-sm">
            <svg
              className="mx-auto h-16 w-16 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <h3 className="mt-4 text-lg font-medium text-gray-900">
              검색어를 입력하세요
            </h3>
            <p className="mt-2 text-sm text-gray-500">
              키워드와 날짜 범위를 설정하고 검색 버튼을 클릭하세요
            </p>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="rounded-lg bg-white p-12 text-center shadow-sm">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600"></div>
            <p className="mt-4 text-sm text-gray-600">검색 중입니다...</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-red-50 p-6 shadow-sm">
            <div className="flex items-start">
              <svg
                className="h-6 w-6 text-red-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">
                  검색 중 오류가 발생했습니다
                </h3>
                <p className="mt-1 text-sm text-red-700">
                  {error instanceof Error ? error.message : '알 수 없는 오류'}
                </p>
                <button
                  onClick={() => refetch()}
                  className="mt-3 text-sm font-medium text-red-800 underline hover:text-red-900"
                >
                  다시 시도
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Empty Results */}
        {!isLoading && !error && data && data.data.length === 0 && (
          <div className="rounded-lg bg-white p-12 text-center shadow-sm">
            <svg
              className="mx-auto h-16 w-16 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <h3 className="mt-4 text-lg font-medium text-gray-900">
              검색 결과가 없습니다
            </h3>
            <p className="mt-2 text-sm text-gray-500">
              다른 검색어나 날짜 범위로 다시 시도해보세요
            </p>
          </div>
        )}

        {/* Results Grid */}
        {!isLoading && !error && data && data.data.length > 0 && (
          <>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {data.data.map((bid) => (
                <div
                  key={`${bid.bidNtceNo}-${bid.bidNtceOrd}`}
                  className="group relative flex flex-col overflow-hidden rounded-lg bg-white shadow-md transition-all hover:shadow-xl"
                >
                  {/* Card Content */}
                  <div className="flex flex-1 flex-col p-6">
                    {/* Badge */}
                    <div className="mb-3 flex items-center gap-2">
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                        {bid.bidMethdNm || '일반입찰'}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="mb-3 line-clamp-2 text-lg font-semibold text-gray-900 group-hover:text-blue-600">
                      {bid.bidNtceNm}
                    </h3>

                    {/* Info */}
                    <div className="mb-4 space-y-2 text-sm">
                      <div className="flex items-start gap-2">
                        <svg
                          className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                          />
                        </svg>
                        <span className="text-gray-700">
                          {bid.ntceInsttNm || bid.dminsttNm}
                        </span>
                      </div>

                      <div className="flex items-start gap-2">
                        <svg
                          className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <span className="font-semibold text-blue-600">
                          {formatAmount(bid.presmptPrce)}
                        </span>
                      </div>

                      <div className="flex items-start gap-2">
                        <svg
                          className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                        <div>
                          <div className="text-gray-600">
                            마감: {formatDate(bid.bidClseDt)}
                          </div>
                          <div className="text-xs text-gray-500">
                            개찰: {formatDate(bid.opengDt)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Action Button */}
                    <button
                      onClick={() => handleCreateProposal(bid)}
                      disabled={creatingBid !== null}
                      className="mt-auto w-full rounded-md bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:from-blue-500 hover:to-purple-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="flex items-center justify-center gap-2">
                        {creatingBid === `${bid.bidNtceNo}-${bid.bidNtceOrd}` ? (
                          <>
                            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            생성 중...
                          </>
                        ) : (
                          <>
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            제안서 생성
                          </>
                        )}
                      </span>
                    </button>
                  </div>

                  {/* Hover Effect Border */}
                  <div className="pointer-events-none absolute inset-0 rounded-lg ring-2 ring-blue-500 ring-opacity-0 transition-all group-hover:ring-opacity-100"></div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {data.pagination.totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  이전
                </button>

                <span className="px-4 py-2 text-sm text-gray-700">
                  {currentPage} / {data.pagination.totalPages}
                </span>

                <button
                  onClick={() =>
                    setCurrentPage((p) =>
                      Math.min(data.pagination.totalPages, p + 1)
                    )
                  }
                  disabled={currentPage === data.pagination.totalPages}
                  className="rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  다음
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
