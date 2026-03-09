'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import ProposalProgress from '@/src/components/ProposalProgress'

interface ProposalSection {
  id: string
  section_type: string
  title: string
  content: string
  order_index: number
}

interface RfpData {
  projectName?: string
  projectBackground?: string
  functionalRequirements?: { id: string; category: string; description: string; priority: string }[]
  evaluationCriteria?: { category: string; item: string; score: string; keyPoint: string }[]
  [key: string]: any
}

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
  rfp_data: RfpData | null
  sections: ProposalSection[]
}

const STATUS_CONFIG = {
  pending: { label: '대기 중', color: 'bg-gray-100 text-gray-700', barColor: 'bg-gray-400' },
  generating: { label: '생성 중', color: 'bg-blue-100 text-blue-700', barColor: 'bg-blue-500' },
  completed: { label: '완료', color: 'bg-green-100 text-green-700', barColor: 'bg-green-500' },
  failed: { label: '실패', color: 'bg-red-100 text-red-700', barColor: 'bg-red-500' },
} as const

export default function ProposalDetailPage() {
  const params = useParams()
  const router = useRouter()
  const proposalId = params.id as string

  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState(0)
  const [editedContents, setEditedContents] = useState<Record<string, string>>({})
  const [regenerating, setRegenerating] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [rfpUploading, setRfpUploading] = useState(false)
  const [rfpDragOver, setRfpDragOver] = useState(false)

  const fetchProposal = useCallback(async () => {
    try {
      const res = await fetch(`/api/proposals/${proposalId}`)
      const json = await res.json()

      if (!json.success) {
        setError(json.error || '제안서를 불러올 수 없습니다.')
        return
      }

      setProposal(json.data)
      setError(null)

      // 섹션 콘텐츠를 편집 상태에 초기화 (최초 1회)
      if (json.data.sections?.length > 0) {
        setEditedContents((prev) => {
          if (Object.keys(prev).length > 0) return prev
          const initial: Record<string, string> = {}
          json.data.sections.forEach((s: ProposalSection) => {
            initial[s.id] = formatSectionContent(s.content)
          })
          return initial
        })
      }
    } catch {
      setError('네트워크 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }, [proposalId])

  // 초기 로드 + 진행 중일 때 폴링
  useEffect(() => {
    fetchProposal()
  }, [fetchProposal])

  useEffect(() => {
    if (!proposal || proposal.status !== 'generating') return

    const interval = setInterval(fetchProposal, 3000)
    return () => clearInterval(interval)
  }, [proposal?.status, fetchProposal])

  const handleRegenerate = async () => {
    if (!proposal || regenerating) return
    if (!confirm('제안서를 다시 생성하시겠습니까? 기존 내용이 덮어씌워집니다.')) return

    setRegenerating(true)
    try {
      const res = await fetch(`/api/proposals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bidNumber: proposal.bid_number,
          bidTitle: proposal.bid_title,
          bidOrg: proposal.bid_org,
          budget: proposal.budget,
          bidData: {
            bidNtceNo: proposal.bid_number.split('-')[0],
            bidNtceOrd: proposal.bid_number.split('-')[1] || '00',
            bidNtceNm: proposal.bid_title,
            ntceInsttNm: proposal.bid_org,
            dminsttNm: proposal.bid_org,
            bidNtceDt: '',
            bidClseDt: '',
            presmptPrce: String(proposal.budget || ''),
          },
        }),
      })
      const json = await res.json()
      if (json.success && json.data?.proposalId) {
        router.push(`/dashboard/proposals/${json.data.proposalId}`)
      } else {
        alert(json.error || '재생성에 실패했습니다.')
      }
    } catch {
      alert('네트워크 오류가 발생했습니다.')
    } finally {
      setRegenerating(false)
    }
  }

  const handleDownload = async () => {
    if (!proposal || downloading) return

    setDownloading(true)
    try {
      const res = await fetch(`/api/proposals/${proposalId}/download`)

      // Storage URL이 반환된 경우
      const contentType = res.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        const json = await res.json()
        if (!json.success) {
          alert(json.error || 'PPT 다운로드에 실패했습니다.')
          return
        }
        // 서명된 URL로 다운로드
        window.open(json.data.downloadUrl, '_blank')
        return
      }

      // 직접 바이너리가 반환된 경우
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `제안서_${proposal.bid_title.substring(0, 30)}.pptx`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('PPT 다운로드 중 오류가 발생했습니다.')
    } finally {
      setDownloading(false)
    }
  }

  const handleRfpUpload = async (file: File) => {
    if (rfpUploading) return
    const allowedExts = ['.pdf', '.hwp', '.hwpx', '.docx', '.doc']
    if (!allowedExts.some((ext) => file.name.toLowerCase().endsWith(ext))) {
      alert('PDF, HWP, DOCX 파일만 업로드 가능합니다.')
      return
    }

    setRfpUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('proposalId', proposalId)

      const res = await fetch('/api/rfp/upload', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const text = await res.text()
        console.error('[RFP] Server error:', res.status, text)
        try {
          const errJson = JSON.parse(text)
          alert(errJson.error || `서버 오류 (${res.status})`)
        } catch {
          alert(`서버 오류 (${res.status})`)
        }
        return
      }

      const json = await res.json()
      if (!json.success) {
        alert(json.error || 'RFP 분석에 실패했습니다.')
        return
      }

      // 제안서 데이터 새로고침
      await fetchProposal()
      alert(`RFP 분석 완료! (${json.data.tokensUsed.toLocaleString()} 토큰 사용)`)
    } catch (err: any) {
      console.error('[RFP Upload Error]', err)
      alert(`RFP 업로드 중 오류가 발생했습니다: ${err?.message || err}`)
    } finally {
      setRfpUploading(false)
    }
  }

  const handleRfpDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setRfpDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleRfpUpload(file)
  }

  const handleRfpFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleRfpUpload(file)
  }

  // --- 로딩 / 에러 ---

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" />
          <p className="mt-4 text-sm text-gray-600">제안서를 불러오는 중...</p>
        </div>
      </div>
    )
  }

  if (error || !proposal) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <div className="rounded-lg bg-white p-8 text-center shadow-md">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-gray-700">{error || '제안서를 찾을 수 없습니다.'}</p>
          <Link href="/dashboard" className="mt-4 inline-block text-sm font-medium text-blue-600 hover:text-blue-500">
            대시보드로 돌아가기
          </Link>
        </div>
      </div>
    )
  }

  const statusCfg = STATUS_CONFIG[proposal.status]
  const sections = proposal.sections?.sort((a, b) => a.order_index - b.order_index) ?? []

  // --- 렌더링 ---

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* 헤더 */}
      <header className="border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex items-center gap-3">
                <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">
                  &larr; 대시보드
                </Link>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusCfg.color}`}>
                  {statusCfg.label}
                </span>
              </div>
              <h1 className="truncate text-2xl font-bold text-gray-900">
                {proposal.bid_title}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
                <span>{proposal.bid_org}</span>
                <span>공고번호: {proposal.bid_number}</span>
                {proposal.budget && (
                  <span>예산: {(proposal.budget / 100000000).toFixed(1)}억원</span>
                )}
                {proposal.ai_cost > 0 && (
                  <span>토큰: {proposal.ai_cost.toLocaleString()}</span>
                )}
              </div>
            </div>

            {/* 액션 버튼 */}
            <div className="flex flex-shrink-0 items-center gap-2">
              {proposal.status === 'completed' && (
                <button
                  onClick={handleDownload}
                  disabled={downloading}
                  className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-500 disabled:opacity-50"
                >
                  <svg className={`h-4 w-4 ${downloading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    {downloading ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    )}
                  </svg>
                  {downloading ? 'PPT 생성 중...' : 'PPT 다운로드'}
                </button>
              )}
              {(proposal.status === 'completed' || proposal.status === 'failed') && (
                <button
                  onClick={handleRegenerate}
                  disabled={regenerating}
                  className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:opacity-50"
                >
                  <svg className={`h-4 w-4 ${regenerating ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {regenerating ? '생성 중...' : '다시 생성'}
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* RFP 업로드 영역 (완료 상태에서만) */}
        {proposal.status === 'completed' && (
          <div className="mb-6">
            {!proposal.rfp_data ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setRfpDragOver(true) }}
                onDragLeave={() => setRfpDragOver(false)}
                onDrop={handleRfpDrop}
                className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
                  rfpDragOver
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-gray-300 bg-white hover:border-gray-400'
                } ${rfpUploading ? 'pointer-events-none opacity-60' : ''}`}
              >
                {rfpUploading ? (
                  <div className="flex items-center justify-center gap-3">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
                    <span className="text-sm font-medium text-blue-600">RFP 분석 중... (30초~1분 소요)</span>
                  </div>
                ) : (
                  <>
                    <svg className="mx-auto h-10 w-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="mt-2 text-sm font-medium text-gray-700">
                      제안요청서(RFP) PDF를 업로드하면 더 정확한 제안서를 생성합니다
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      드래그 앤 드롭 또는 클릭하여 선택 (PDF, HWP, DOCX / 최대 20MB)
                    </p>
                    <label className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50">
                      파일 선택
                      <input type="file" accept=".pdf,.hwp,.hwpx,.docx,.doc" onChange={handleRfpFileSelect} className="hidden" />
                    </label>
                  </>
                )}
              </div>
            ) : (
              <RfpPreview rfpData={proposal.rfp_data} />
            )}
          </div>
        )}

        {/* 진행 중 / 실패: ProposalProgress 컴포넌트 */}
        {proposal.status !== 'completed' && (
          <ProposalProgress
            proposalId={proposalId}
            onCompleted={() => fetchProposal()}
            onRetry={handleRegenerate}
          />
        )}

        {/* 완료 - 섹션 탭 뷰 */}
        {proposal.status === 'completed' && sections.length > 0 && (
          <div className="overflow-hidden rounded-lg bg-white shadow-md">
            {/* 탭 헤더 */}
            <div className="border-b border-gray-200">
              <nav className="-mb-px flex overflow-x-auto" aria-label="섹션 탭">
                {sections.map((section, index) => (
                  <button
                    key={section.id}
                    onClick={() => setActiveTab(index)}
                    className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                      activeTab === index
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                    }`}
                  >
                    {section.title}
                  </button>
                ))}
              </nav>
            </div>

            {/* 탭 콘텐츠 */}
            <div className="p-6">
              {sections[activeTab] && (
                <div>
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-gray-900">
                      {sections[activeTab].title}
                    </h2>
                    <span className="text-xs text-gray-400">
                      섹션 {activeTab + 1} / {sections.length}
                    </span>
                  </div>
                  <textarea
                    value={
                      editedContents[sections[activeTab].id] ??
                      formatSectionContent(sections[activeTab].content)
                    }
                    onChange={(e) =>
                      setEditedContents((prev) => ({
                        ...prev,
                        [sections[activeTab].id]: e.target.value,
                      }))
                    }
                    rows={20}
                    className="w-full rounded-md border border-gray-300 px-4 py-3 font-mono text-sm leading-relaxed text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              )}

              {/* 이전/다음 버튼 */}
              <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4">
                <button
                  onClick={() => setActiveTab((t) => Math.max(0, t - 1))}
                  disabled={activeTab === 0}
                  className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-30"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  이전 섹션
                </button>
                <button
                  onClick={() => setActiveTab((t) => Math.min(sections.length - 1, t + 1))}
                  disabled={activeTab === sections.length - 1}
                  className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-30"
                >
                  다음 섹션
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 완료인데 섹션이 없는 경우 */}
        {proposal.status === 'completed' && sections.length === 0 && (
          <div className="rounded-lg bg-white p-12 text-center shadow-md">
            <p className="text-gray-500">생성된 섹션이 없습니다.</p>
          </div>
        )}
      </main>
    </div>
  )
}

// --- RFP 미리보기 ---

function RfpPreview({ rfpData }: { rfpData: RfpData }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-lg border border-green-200 bg-green-50 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-semibold text-green-800">RFP 분석 완료</span>
          {rfpData.projectName && (
            <span className="text-sm text-green-700">— {rfpData.projectName}</span>
          )}
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs font-medium text-green-700 hover:text-green-900"
        >
          {expanded ? '접기' : '상세 보기'}
        </button>
      </div>

      {/* 요약 뱃지 */}
      <div className="mt-2 flex flex-wrap gap-2">
        {rfpData.functionalRequirements && (
          <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
            기능요구 {rfpData.functionalRequirements.length}건
          </span>
        )}
        {rfpData.evaluationCriteria && (
          <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
            평가항목 {rfpData.evaluationCriteria.length}건
          </span>
        )}
      </div>

      {/* 상세 펼침 */}
      {expanded && (
        <div className="mt-4 space-y-3 rounded-md bg-white p-4 text-sm">
          {rfpData.projectBackground && (
            <div>
              <h4 className="font-semibold text-gray-800">사업 배경</h4>
              <p className="mt-1 text-gray-600">{rfpData.projectBackground}</p>
            </div>
          )}

          {rfpData.functionalRequirements && rfpData.functionalRequirements.length > 0 && (
            <div>
              <h4 className="font-semibold text-gray-800">핵심 기능 요구사항</h4>
              <ul className="mt-1 space-y-1">
                {rfpData.functionalRequirements.slice(0, 8).map((req) => (
                  <li key={req.id} className="flex items-start gap-2 text-gray-600">
                    <span className="mt-0.5 inline-block rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono text-gray-500">
                      {req.id}
                    </span>
                    <span>{req.description}</span>
                    <span className={`ml-auto flex-shrink-0 text-xs ${req.priority === '필수' ? 'text-red-600' : 'text-gray-400'}`}>
                      {req.priority}
                    </span>
                  </li>
                ))}
                {rfpData.functionalRequirements.length > 8 && (
                  <li className="text-gray-400">... 외 {rfpData.functionalRequirements.length - 8}건</li>
                )}
              </ul>
            </div>
          )}

          {rfpData.evaluationCriteria && rfpData.evaluationCriteria.length > 0 && (
            <div>
              <h4 className="font-semibold text-gray-800">평가 기준</h4>
              <div className="mt-1 overflow-hidden rounded border border-gray-200">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-medium text-gray-600">영역</th>
                      <th className="px-3 py-1.5 text-left font-medium text-gray-600">항목</th>
                      <th className="px-3 py-1.5 text-right font-medium text-gray-600">배점</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rfpData.evaluationCriteria.map((item, i) => (
                      <tr key={i} className={i % 2 === 0 ? '' : 'bg-gray-50'}>
                        <td className="px-3 py-1.5 text-gray-700">{item.category}</td>
                        <td className="px-3 py-1.5 text-gray-600">{item.item}</td>
                        <td className="px-3 py-1.5 text-right font-medium text-gray-800">{item.score}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// --- 유틸 ---

function formatSectionContent(raw: string): string {
  try {
    const blocks = JSON.parse(raw)
    if (!Array.isArray(blocks)) return raw

    return blocks
      .map((block: any) => {
        switch (block.type) {
          case 'heading':
            return `${'#'.repeat(block.level || 2)} ${block.text}`
          case 'paragraph':
            return block.text
          case 'bullet_list':
            return (block.items || []).map((item: string) => `  - ${item}`).join('\n')
          case 'table_placeholder':
            return `[표: ${block.description}]`
          case 'diagram_placeholder':
            return `[그림: ${block.description}]`
          default:
            return block.text || ''
        }
      })
      .filter(Boolean)
      .join('\n\n')
  } catch {
    return raw
  }
}
