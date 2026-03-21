import { NextRequest, NextResponse } from 'next/server'
import { createApiSupabaseClient } from '@/src/lib/supabase-api'

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
}

/**
 * POST /api/proposals
 * 제안서 레코드만 생성 (status: 'pending').
 * 실제 AI 생성은 POST /api/proposals/[id]/generate 에서 별도 호출.
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
    if (!body.bidNumber || !body.bidTitle || !body.bidOrg) {
      return NextResponse.json(
        { success: false, error: '필수 항목이 누락되었습니다. (bidNumber, bidTitle, bidOrg)' },
        { status: 400 }
      )
    }

    // proposals 테이블에 레코드 생성 (pending 상태)
    const { data: proposal, error: insertError } = await supabase
      .from('proposals')
      .insert({
        user_id: user.id,
        bid_number: body.bidNumber,
        bid_title: body.bidTitle,
        bid_org: body.bidOrg,
        budget: body.budget ?? null,
        status: 'pending',
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

    return NextResponse.json(
      {
        success: true,
        data: {
          proposalId: proposal.id,
          status: 'pending',
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('[API] 제안서 생성 오류:', error)
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
