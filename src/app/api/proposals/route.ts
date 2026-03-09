import { NextRequest, NextResponse } from 'next/server'
import { createApiSupabaseClient } from '@/src/lib/supabase-api'
import { ProposalPipeline } from '@/src/lib/pipeline/proposal-pipeline'
import type { BidData } from '@/src/types/proposal'

/**
 * GET /api/proposals
 * 내 제안서 목록 조회
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createApiSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { success: false, error: '로그인이 필요합니다.' },
        { status: 401 }
      )
    }

    // bidNumber 쿼리가 있으면 해당 공고의 기존 제안서 조회
    const bidNumber = request.nextUrl.searchParams.get('bidNumber')
    if (bidNumber) {
      const { data: existing } = await supabase
        .from('proposals')
        .select('id, status')
        .eq('user_id', user.id)
        .eq('bid_number', bidNumber)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (existing) {
        return NextResponse.json({ success: true, data: existing })
      }
      return NextResponse.json({ success: false, data: null })
    }

    const { data: proposals, error } = await supabase
      .from('proposals')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[API] 제안서 목록 조회 실패:', error)
      return NextResponse.json(
        { success: false, error: '제안서 목록을 불러올 수 없습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, data: proposals })
  } catch (error) {
    console.error('[API] 제안서 목록 조회 오류:', error)
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

interface CreateProposalBody {
  bidNumber: string
  bidTitle: string
  bidOrg: string
  budget?: number
  bidData: BidData
}

/**
 * POST /api/proposals
 * 제안서 생성 요청 -> 파이프라인 실행
 *
 * TODO: 현재 동기 처리. 향후 BullMQ 큐로 전환하여
 * 즉시 proposalId 반환 후 백그라운드에서 파이프라인 실행 예정.
 * 전환 시 이 핸들러는 큐에 job을 추가하고 바로 응답하도록 변경.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createApiSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { success: false, error: '로그인이 필요합니다.' },
        { status: 401 }
      )
    }

    const body: CreateProposalBody = await request.json()

    // 입력 검증
    if (!body.bidNumber || !body.bidTitle || !body.bidOrg || !body.bidData) {
      return NextResponse.json(
        { success: false, error: '필수 항목이 누락되었습니다. (bidNumber, bidTitle, bidOrg, bidData)' },
        { status: 400 }
      )
    }

    // proposals 테이블에 레코드 생성
    const { data: proposal, error: insertError } = await supabase
      .from('proposals')
      .insert({
        user_id: user.id,
        bid_number: body.bidNumber,
        bid_title: body.bidTitle,
        bid_org: body.bidOrg,
        budget: body.budget ?? null,
        status: 'generating',
        ai_cost: 0,
      })
      .select()
      .single()

    if (insertError || !proposal) {
      console.error('[API] 제안서 레코드 생성 실패:', insertError)
      return NextResponse.json(
        { success: false, error: '제안서 생성에 실패했습니다.' },
        { status: 500 }
      )
    }

    // 파이프라인 실행 (동기)
    // TODO: BullMQ 전환 시 여기서 큐에 job 추가로 변경
    // const job = await proposalQueue.add('generate', { proposalId: proposal.id, bidData: body.bidData })
    // return NextResponse.json({ success: true, data: { proposalId: proposal.id, jobId: job.id, status: 'generating' } }, { status: 201 })
    const pipeline = new ProposalPipeline(proposal.id)

    try {
      const result = await pipeline.execute(body.bidData)

      return NextResponse.json(
        {
          success: true,
          data: {
            proposalId: proposal.id,
            status: 'completed',
            title: result.title,
            usage: result.usage,
          },
        },
        { status: 201 }
      )
    } catch (pipelineError: any) {
      console.error('[API] 파이프라인 실행 실패:', pipelineError)

      await supabase
        .from('proposals')
        .update({ status: 'failed' })
        .eq('id', proposal.id)

      return NextResponse.json(
        {
          success: false,
          error: `제안서 생성 중 오류가 발생했습니다: ${pipelineError.message}`,
          data: { proposalId: proposal.id, status: 'failed' },
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
