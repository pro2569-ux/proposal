'use client'

import { useEffect } from 'react'
import { useProposalProgress, type ProposalStatus } from '@/src/hooks/useProposalProgress'

interface ProposalProgressProps {
  proposalId: string
  onCompleted?: () => void
  onRetry?: () => void
}

const STEPS: { key: ProposalStatus; label: string }[] = [
  { key: 'analyzing', label: '공고 분석' },
  { key: 'outlining', label: '목차 설계' },
  { key: 'generating_sections', label: '본문 작성' },
  { key: 'assembling', label: '검수 및 다이어그램' },
]

const STEP_ORDER = STEPS.map((s) => s.key)

function getStepState(stepKey: ProposalStatus, currentStatus: ProposalStatus) {
  const currentIdx = STEP_ORDER.indexOf(currentStatus)
  const stepIdx = STEP_ORDER.indexOf(stepKey)

  if (currentStatus === 'completed') return 'done'
  if (currentStatus === 'failed') {
    if (stepIdx < currentIdx) return 'done'
    if (stepIdx === currentIdx) return 'failed'
    return 'waiting'
  }
  if (currentIdx < 0) return 'waiting' // pending 등
  if (stepIdx < currentIdx) return 'done'
  if (stepIdx === currentIdx) return 'active'
  return 'waiting'
}

export default function ProposalProgress({ proposalId, onCompleted, onRetry }: ProposalProgressProps) {
  const { status, label, progress, detail } = useProposalProgress(proposalId)

  // 완료 콜백
  useEffect(() => {
    if (status === 'completed' && onCompleted) {
      onCompleted()
    }
  }, [status, onCompleted])

  // 원형 프로그레스 계산
  const radius = 70
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (progress / 100) * circumference

  return (
    <div className="mx-auto max-w-lg">
      <div className="rounded-2xl bg-white p-8 shadow-lg">
        {/* 원형 프로그레스바 */}
        <div className="flex justify-center">
          <div className="relative">
            <svg width="180" height="180" className="-rotate-90">
              {/* 배경 원 */}
              <circle
                cx="90"
                cy="90"
                r={radius}
                fill="none"
                stroke="#e5e7eb"
                strokeWidth="10"
              />
              {/* 진행 원 */}
              <circle
                cx="90"
                cy="90"
                r={radius}
                fill="none"
                stroke={status === 'failed' ? '#ef4444' : '#3b82f6'}
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            {/* 중앙 텍스트 */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-3xl font-bold ${status === 'failed' ? 'text-red-600' : 'text-blue-600'}`}>
                {progress}%
              </span>
              <span className="mt-1 text-xs text-gray-400">
                {status === 'failed' ? '실패' : '진행률'}
              </span>
            </div>
          </div>
        </div>

        {/* 현재 단계 텍스트 */}
        <div className="mt-6 text-center">
          <p className={`text-lg font-semibold ${status === 'failed' ? 'text-red-600' : 'text-gray-900'}`}>
            {status === 'failed' ? (
              '제안서 생성에 실패했습니다'
            ) : (
              <span className="inline-flex items-center gap-2">
                {status !== 'pending' && status !== 'completed' && (
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                )}
                {label}
              </span>
            )}
          </p>
          {detail && status !== 'failed' && status !== 'completed' && (
            <p className="mt-1 text-sm text-gray-400">{detail}</p>
          )}
        </div>

        {/* 세로 스텝 리스트 */}
        <div className="mt-8 space-y-0">
          {STEPS.map((step, index) => {
            const state = getStepState(step.key, status)
            return (
              <div key={step.key} className="relative flex items-start gap-4 pb-6 last:pb-0">
                {/* 세로 연결선 */}
                {index < STEPS.length - 1 && (
                  <div
                    className={`absolute left-[15px] top-[30px] h-[calc(100%-18px)] w-0.5 ${
                      state === 'done' ? 'bg-green-300' : 'bg-gray-200'
                    }`}
                  />
                )}

                {/* 아이콘 */}
                <div className="relative z-10 flex-shrink-0">
                  {state === 'done' ? (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500">
                      <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  ) : state === 'active' ? (
                    <div className="flex h-8 w-8 animate-pulse items-center justify-center rounded-full bg-blue-500 shadow-lg shadow-blue-500/30">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    </div>
                  ) : state === 'failed' ? (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500">
                      <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200">
                      <span className="text-xs font-semibold text-gray-400">{index + 1}</span>
                    </div>
                  )}
                </div>

                {/* 텍스트 */}
                <div className="flex-1 pt-1">
                  <p
                    className={`text-sm font-medium ${
                      state === 'done'
                        ? 'text-green-700'
                        : state === 'active'
                          ? 'text-blue-700'
                          : state === 'failed'
                            ? 'text-red-600'
                            : 'text-gray-400'
                    }`}
                  >
                    {step.label}
                    {state === 'done' && (
                      <span className="ml-2 text-xs font-normal text-green-500">완료</span>
                    )}
                  </p>
                  {state === 'active' && detail && (
                    <p className="mt-0.5 text-xs text-blue-500">{detail}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* 실패 시 다시 시도 버튼 */}
        {status === 'failed' && onRetry && (
          <div className="mt-8 text-center">
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-500"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              다시 시도
            </button>
          </div>
        )}

        {/* 하단 안내 */}
        {status !== 'failed' && status !== 'completed' && (
          <p className="mt-6 text-center text-xs text-gray-400">
            페이지를 벗어나도 생성은 계속 진행됩니다
          </p>
        )}
      </div>
    </div>
  )
}
