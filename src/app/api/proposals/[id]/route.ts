import { NextRequest, NextResponse } from 'next/server'
import { createApiSupabaseClient } from '@/src/lib/supabase-api'

/**
 * GET /api/proposals/[id]
 * 특정 제안서 조회 (진행상태 + 섹션 결과)
 */
export async function GET(
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

    // 제안서 기본 정보 조회
    const { data: proposal, error: proposalError } = await supabase
      .from('proposals')
      .select('*')
      .eq('id', proposalId)
      .eq('user_id', user.id)
      .single()

    if (proposalError || !proposal) {
      return NextResponse.json(
        { success: false, error: '제안서를 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    // 섹션 목록 조회 (완료된 경우)
    let sections: any[] = []
    if (proposal.status === 'completed') {
      const { data, error: sectionsError } = await supabase
        .from('proposal_sections')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('order_index', { ascending: true })

      if (sectionsError) {
        console.error('[API] 섹션 조회 실패:', sectionsError)
      } else {
        sections = data ?? []
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        ...proposal,
        sections,
      },
    })
  } catch (error) {
    console.error('[API] 제안서 상세 조회 오류:', error)
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
