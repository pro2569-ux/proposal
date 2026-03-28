import { NextRequest, NextResponse } from 'next/server'
import { createApiSupabaseClient } from '@/src/lib/supabase-api'

/**
 * PATCH /api/proposals/[id]/sections
 * 섹션 내용 수정 (편집된 텍스트를 저장)
 */
export async function PATCH(
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

    // 제안서 소유자 확인
    const { data: proposal } = await supabase
      .from('proposals')
      .select('id')
      .eq('id', proposalId)
      .eq('user_id', user.id)
      .single()

    if (!proposal) {
      return NextResponse.json(
        { success: false, error: '제안서를 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    const body = await request.json()
    const { sectionId, content } = body as { sectionId: string; content: string }

    if (!sectionId || content === undefined) {
      return NextResponse.json(
        { success: false, error: 'sectionId와 content가 필요합니다.' },
        { status: 400 }
      )
    }

    // 섹션 업데이트
    const { error } = await supabase
      .from('proposal_sections')
      .update({ content })
      .eq('id', sectionId)
      .eq('proposal_id', proposalId)

    if (error) {
      console.error('[API] 섹션 수정 실패:', error)
      return NextResponse.json(
        { success: false, error: '섹션 수정에 실패했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[API] 섹션 수정 오류:', error)
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
