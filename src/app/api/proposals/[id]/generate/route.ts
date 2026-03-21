import { NextRequest, NextResponse } from 'next/server'
import { createApiSupabaseClient } from '@/src/lib/supabase-api'
import { ProposalPipeline } from '@/src/lib/pipeline/proposal-pipeline'
import type { BidData } from '@/src/types/proposal'

/**
 * POST /api/proposals/[id]/generate
 * 제안서 AI 생성 파이프라인 실행.
 * pending 또는 failed 상태에서만 실행 가능.
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

    // pending 또는 failed 상태에서만 생성 가능
    if (proposal.status !== 'pending' && proposal.status !== 'failed') {
      return NextResponse.json(
        { success: false, error: '이미 생성 중이거나 완료된 제안서입니다.' },
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
      .update({ status: 'generating' })
      .eq('id', proposalId)

    // 파이프라인 실행
    const pipeline = new ProposalPipeline(proposalId)

    try {
      const result = await pipeline.execute(bidData)

      return NextResponse.json({
        success: true,
        data: {
          proposalId,
          status: 'completed',
          title: result.title,
          usage: result.usage,
        },
      })
    } catch (pipelineError: any) {
      console.error('[API] 파이프라인 실행 실패:', pipelineError)

      await supabase
        .from('proposals')
        .update({ status: 'failed' })
        .eq('id', proposalId)

      return NextResponse.json(
        {
          success: false,
          error: `제안서 생성 중 오류가 발생했습니다: ${pipelineError.message}`,
          data: { proposalId, status: 'failed' },
        },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('[API] 제안서 생성 오류:', error)
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
