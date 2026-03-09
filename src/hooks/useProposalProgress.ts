'use client'

import { useEffect, useState } from 'react'
import { createSupabaseBrowserClient } from '@/src/lib/supabase-browser'

export type ProposalStatus =
  | 'pending'
  | 'analyzing'
  | 'outlining'
  | 'writing'
  | 'reviewing'
  | 'generating_images'
  | 'generating_ppt'
  | 'completed'
  | 'failed'

const STATUS_LABELS: Record<ProposalStatus, string> = {
  pending: '대기 중',
  analyzing: '공고 분석 중...',
  outlining: '목차 설계 중...',
  writing: '제안서 본문 작성 중...',
  reviewing: 'AI 교차 검수 중...',
  generating_images: '다이어그램 생성 중...',
  generating_ppt: 'PPT 파일 생성 중...',
  completed: '완료!',
  failed: '오류 발생',
}

const STATUS_PROGRESS: Record<ProposalStatus, number> = {
  pending: 0,
  analyzing: 15,
  outlining: 25,
  writing: 50,
  reviewing: 70,
  generating_images: 80,
  generating_ppt: 90,
  completed: 100,
  failed: 0,
}

interface UseProposalProgressReturn {
  status: ProposalStatus
  label: string
  progress: number
}

export function useProposalProgress(proposalId: string): UseProposalProgressReturn {
  const [status, setStatus] = useState<ProposalStatus>('pending')

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()

    // 초기 상태 조회
    supabase
      .from('proposals')
      .select('status')
      .eq('id', proposalId)
      .single()
      .then(({ data }) => {
        if (data?.status) {
          setStatus(data.status as ProposalStatus)
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
          const newStatus = payload.new.status as ProposalStatus
          setStatus(newStatus)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [proposalId])

  return {
    status,
    label: STATUS_LABELS[status] ?? status,
    progress: STATUS_PROGRESS[status] ?? 0,
  }
}
