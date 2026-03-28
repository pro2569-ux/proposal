'use client'

import { useEffect, useState } from 'react'
import { createSupabaseBrowserClient } from '@/src/lib/supabase-browser'

export type ProposalStatus =
  | 'pending'
  | 'analyzing'
  | 'outlining'
  | 'generating_sections'
  | 'assembling'
  | 'completed'
  | 'failed'

const STATUS_LABELS: Record<ProposalStatus, string> = {
  pending: '대기 중',
  analyzing: '공고 분석 중...',
  outlining: '목차 설계 중...',
  generating_sections: '제안서 본문 작성 중...',
  assembling: '검수 및 다이어그램 생성 중...',
  completed: '완료!',
  failed: '오류 발생',
}

interface UseProposalProgressReturn {
  status: ProposalStatus
  label: string
  progress: number
  detail: string | null
}

export function useProposalProgress(proposalId: string): UseProposalProgressReturn {
  const [status, setStatus] = useState<ProposalStatus>('pending')
  const [progress, setProgress] = useState(0)
  const [detail, setDetail] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()

    // 초기 상태 조회
    supabase
      .from('proposals')
      .select('status, progress_step, progress_pct, progress_msg')
      .eq('id', proposalId)
      .single()
      .then(({ data }) => {
        if (data) {
          applyState(data)
        }
      })

    // Realtime 구독
    const channel = supabase
      .channel(`proposal-progress-${proposalId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'proposals',
          filter: `id=eq.${proposalId}`,
        },
        (payload) => {
          applyState(payload.new)
        }
      )
      .subscribe()

    function applyState(row: any) {
      // progress_step이 있으면 세분화된 상태 사용, 없으면 status 폴백
      const step = row.progress_step as ProposalStatus | null
      const dbStatus = row.status as string

      if (dbStatus === 'completed') {
        setStatus('completed')
        setProgress(100)
        setDetail(null)
      } else if (dbStatus === 'failed') {
        setStatus('failed')
        setProgress(row.progress_pct ?? 0)
        setDetail(row.progress_msg ?? null)
      } else if (step && step in STATUS_LABELS) {
        setStatus(step)
        setProgress(row.progress_pct ?? 0)
        setDetail(row.progress_msg ?? null)
      } else if (dbStatus === 'generating') {
        // 레거시: progress_step 없이 generating만 있는 경우
        setStatus('analyzing')
        setProgress(10)
        setDetail(null)
      } else {
        setStatus('pending')
        setProgress(0)
        setDetail(null)
      }
    }

    return () => {
      supabase.removeChannel(channel)
    }
  }, [proposalId])

  return {
    status,
    label: STATUS_LABELS[status] ?? status,
    progress,
    detail,
  }
}
