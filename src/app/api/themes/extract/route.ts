import { NextRequest, NextResponse } from 'next/server'
import { createApiSupabaseClient } from '@/src/lib/supabase-api'
import { extractThemeFromMarkdown } from '@/src/lib/prompts/extract-theme'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * POST /api/themes/extract
 * body: { markdown: string }
 * 디자인 시스템 마크다운을 LLM이 분석하여 worker가 즉시 사용 가능한 Theme JSON을 반환.
 *
 * 사용 흐름:
 *   1) 사용자가 .md 디자인 가이드 업로드 → 이 API 호출
 *   2) 반환된 ThemeSpec을 보관 (DB or 클라이언트)
 *   3) PPT 다운로드 시 body로 전달하여 인라인 적용
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

    const { markdown } = await request.json()
    if (typeof markdown !== 'string' || markdown.trim().length < 50) {
      return NextResponse.json(
        { success: false, error: '디자인 문서 내용이 너무 짧습니다 (최소 50자).' },
        { status: 400 }
      )
    }

    const { theme, usage } = await extractThemeFromMarkdown(markdown)

    return NextResponse.json({
      success: true,
      theme,
      usage,
    })
  } catch (err: any) {
    console.error('[ThemeExtract] 실패:', err)
    return NextResponse.json(
      { success: false, error: err?.message || '테마 추출 실패' },
      { status: 500 }
    )
  }
}
