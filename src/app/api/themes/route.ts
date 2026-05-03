import { NextRequest, NextResponse } from 'next/server'
import { createApiSupabaseClient } from '@/src/lib/supabase-api'
import { extractThemeFromMarkdown } from '@/src/lib/prompts/extract-theme'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * GET /api/themes
 * 현재 사용자의 커스텀 테마 목록.
 */
export async function GET() {
  const supabase = createApiSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('user_themes')
    .select('id, name, description, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true, themes: data ?? [] })
}

/**
 * POST /api/themes
 * body: { name, markdown, description? }
 * .md를 LLM으로 ThemeSpec으로 추출하여 저장한다.
 */
export async function POST(request: NextRequest) {
  const supabase = createApiSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { name, markdown, description } = await request.json().catch(() => ({}))
  if (!name || typeof name !== 'string') {
    return NextResponse.json({ success: false, error: '테마 이름이 필요합니다.' }, { status: 400 })
  }
  if (typeof markdown !== 'string' || markdown.trim().length < 50) {
    return NextResponse.json({ success: false, error: '디자인 문서가 너무 짧습니다 (최소 50자).' }, { status: 400 })
  }

  let spec
  try {
    const result = await extractThemeFromMarkdown(markdown)
    spec = result.theme
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: `테마 추출 실패: ${err?.message || '알 수 없음'}` },
      { status: 500 }
    )
  }

  const { data, error } = await supabase
    .from('user_themes')
    .insert({
      user_id: user.id,
      name,
      description: description || null,
      spec,
      source_markdown: markdown,
    })
    .select('id, name, description, created_at')
    .single()

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true, theme: data, spec })
}
