import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createApiSupabaseClient } from '@/src/lib/supabase-api'
import { ProposalPipeline } from '@/src/lib/pipeline/proposal-pipeline'
import type { BidData } from '@/src/types/proposal'

// 백그라운드 파이프라인이 5분 가까이 걸릴 수 있어 함수 수명을 최대치로 설정.
export const maxDuration = 300

/**
 * POST /api/proposals/[id]/generate
 * 제안서 AI 생성 파이프라인 실행.
 * generating 상태(진행 중)일 때만 차단. 그 외 상태는 모두 재생성 가능.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createApiSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { success: false, error: '로그인이 필요합니다.' },
        { status: 401 }
      )
    }

    const proposalId = params.id

    // 제안서 조회 + 소유자 확인
    const { data: proposal, error: fetchError } = await supabase
      .from('proposals')
      .select('*')
      .eq('id', proposalId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !proposal) {
      return NextResponse.json(
        { success: false, error: '제안서를 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    // 진행 중(generating)일 때만 차단. completed/pending/failed는 재생성 허용.
    if (proposal.status === 'generating') {
      return NextResponse.json(
        { success: false, error: '이미 생성이 진행 중입니다. 잠시 후 다시 시도해주세요.' },
        { status: 400 }
      )
    }

    // bidData는 요청 body에서 받음
    const body = await request.json()
    const bidData: BidData = body.bidData || {
      bidNtceNo: proposal.bid_number.split('-')[0],
      bidNtceOrd: proposal.bid_number.split('-')[1] || '00',
      bidNtceNm: proposal.bid_title,
      ntceInsttNm: proposal.bid_org,
      dminsttNm: proposal.bid_org,
      bidNtceDt: '',
      bidClseDt: '',
      presmptPrce: String(proposal.budget || ''),
    }

    // 상태를 generating으로 업데이트
    await supabase
      .from('proposals')
      .update({
        status: 'generating',
        progress_step: 'analyzing',
        progress_pct: 0,
        progress_msg: '생성을 시작합니다...',
      })
      .eq('id', proposalId)

    // 기존 섹션 삭제 (재생성 시)
    await supabase
      .from('proposal_sections')
      .delete()
      .eq('proposal_id', proposalId)

    // 파이프라인을 백그라운드로 실행 (즉시 응답하되 waitUntil로 함수 수명을 연장).
    // waitUntil 없이 fire-and-forget 하면 응답 직후 함수가 종료되어 분석 도중 죽는다.
    const pipeline = new ProposalPipeline(proposalId)

    waitUntil(
      pipeline.execute(bidData).catch(async (pipelineError: any) => {
        console.error('[API] 파이프라인 실행 실패:', pipelineError)
        await supabase
          .from('proposals')
          .update({
            status: 'failed',
            progress_step: 'failed',
            progress_pct: 0,
            progress_msg: pipelineError.message,
          })
          .eq('id', proposalId)
      })
    )

    return NextResponse.json({
      success: true,
      data: {
        proposalId,
        status: 'generating',
      },
    })
  } catch (error) {
    console.error('[API] 제안서 생성 오류:', error)
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
