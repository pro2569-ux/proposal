'use client'

import { useEffect } from 'react'

type ProgressStep =
  | 'pending'
  | 'analyzing'
  | 'outlining'
  | 'generating_sections'
  | 'assembling'
  | 'completed'
  | 'failed'

interface ProposalProgressProps {
  proposalId: string
  /** DB progress_step 값 (파이프라인이 기록) */
  progressStep: string | null
  /** DB progress_pct 값 (0~100) */
  progressPct: number
  /** DB progress_msg 값 */
  progressMsg: string | null
  /** DB status 값 (generating, failed, etc.) */
  dbStatus: string
  onCompleted?: () => void
  onRetry?: () => void
}

const STEPS: { key: ProgressStep; label: string }[] = [
  { key: 'analyzing', label: '공고 분석' },
  { key: 'outlining', label: '목차 설계' },
  { key: 'generating_sections', label: '본문 작성' },
  { key: 'assembling', label: '검수 및 다이어그램' },
]

const STEP_ORDER = STEPS.map((s) => s.key)

const STEP_LABELS: Record<ProgressStep, string> = {
  pending: '대기 중',
  analyzing: '공고 분석 중...',
  outlining: '목차 설계 중...',
  generating_sections: '제안서 본문 작성 중...',
  assembling: '검수 및 다이어그램 생성 중...',
  completed: '완료!',
  failed: '오류 발생',
}

function getStepState(stepKey: ProgressStep, currentStep: ProgressStep) {
  const currentIdx = STEP_ORDER.indexOf(currentStep)
  const stepIdx = STEP_ORDER.indexOf(stepKey)

  if (currentStep === 'completed') return 'done'
  if (currentStep === 'failed') {
    if (stepIdx < currentIdx) return 'done'
    if (stepIdx === currentIdx) return 'failed'
    return 'waiting'
  }
  if (currentIdx < 0) return 'waiting'
  if (stepIdx < currentIdx) return 'done'
  if (stepIdx === currentIdx) return 'active'
  return 'waiting'
}

export default function ProposalProgress({
  progressStep,
  progressPct,
  progressMsg,
  dbStatus,
  onCompleted,
  onRetry,
}: ProposalProgressProps) {
  // progressStep → ProgressStep 변환 (폴백 처리)
  const step: ProgressStep =
    dbStatus === 'completed' ? 'completed'
    : dbStatus === 'failed' ? 'failed'
    : (progressStep as ProgressStep) && progressStep! in STEP_LABELS
      ? (progressStep as ProgressStep)
    : dbStatus === 'generating' ? 'analyzing' // 레거시 폴백
    : 'pending'

  const progress = dbStatus === 'completed' ? 100 : progressPct
  const detail = progressMsg

  // 완료 콜백
  useEffect(() => {
    if (dbStatus === 'completed' && onCompleted) {
      onCompleted()
    }
  }, [dbStatus, onCompleted])

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
              <circle
                cx="90" cy="90" r={radius}
                fill="none" stroke="#e5e7eb" strokeWidth="10"
              />
              <circle
                cx="90" cy="90" r={radius}
                fill="none"
                stroke={step === 'failed' ? '#ef4444' : '#3b82f6'}
                strokeWidth="10" strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-3xl font-bold ${step === 'failed' ? 'text-red-600' : 'text-blue-600'}`}>
                {progress}%
              </span>
              <span className="mt-1 text-xs text-gray-400">
                {step === 'failed' ? '실패' : '진행률'}
              </span>
            </div>
          </div>
        </div>

        {/* 현재 단계 텍스트 */}
        <div className="mt-6 text-center">
          <p className={`text-lg font-semibold ${step === 'failed' ? 'text-red-600' : 'text-gray-900'}`}>
            {step === 'failed' ? (
              '제안서 생성에 실패했습니다'
            ) : (
              <span className="inline-flex items-center gap-2">
                {step !== 'pending' && step !== 'completed' && (
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                )}
                {STEP_LABELS[step] ?? '생성 중...'}
              </span>
            )}
          </p>
          {detail && step !== 'failed' && step !== 'completed' && (
            <p className="mt-1 text-sm text-gray-400">{detail}</p>
          )}
        </div>

        {/* 세로 스텝 리스트 */}
        <div className="mt-8 space-y-0">
          {STEPS.map((s, index) => {
            const state = getStepState(s.key, step)
            return (
              <div key={s.key} className="relative flex items-start gap-4 pb-6 last:pb-0">
                {index < STEPS.length - 1 && (
                  <div
                    className={`absolute left-[15px] top-[30px] h-[calc(100%-18px)] w-0.5 ${
                      state === 'done' ? 'bg-green-300' : 'bg-gray-200'
                    }`}
                  />
                )}

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
                    {s.label}
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

        {/* 실패 시 다시 시도 */}
        {step === 'failed' && onRetry && (
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
        {step !== 'failed' && step !== 'completed' && (
          <p className="mt-6 text-center text-xs text-gray-400">
            페이지를 벗어나도 생성은 계속 진행됩니다
          </p>
        )}
      </div>
    </div>
  )
}
