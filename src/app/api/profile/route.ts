import { NextRequest, NextResponse } from 'next/server'
import { createApiSupabaseClient } from '@/src/lib/supabase-api'

/**
 * GET /api/profile
 * 내 프로필 조회
 */
export async function GET() {
  try {
    const supabase = createApiSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { success: false, error: '로그인이 필요합니다.' },
        { status: 401 }
      )
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, email, name, company_name, created_at')
      .eq('id', user.id)
      .single()

    if (error || !profile) {
      return NextResponse.json(
        { success: false, error: '프로필을 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, data: profile })
  } catch (error) {
    console.error('[API] 프로필 조회 오류:', error)
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/profile
 * 프로필 수정 (회사명)
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = createApiSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { success: false, error: '로그인이 필요합니다.' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const companyName = body.company_name?.trim() || null

    const { data: profile, error } = await supabase
      .from('profiles')
      .update({ company_name: companyName })
      .eq('id', user.id)
      .select('id, email, name, company_name, created_at')
      .single()

    if (error) {
      console.error('[API] 프로필 수정 실패:', error)
      return NextResponse.json(
        { success: false, error: '프로필 수정에 실패했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, data: profile })
  } catch (error) {
    console.error('[API] 프로필 수정 오류:', error)
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
