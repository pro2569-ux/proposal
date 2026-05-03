import { NextRequest, NextResponse } from 'next/server'
import { createApiSupabaseClient } from '@/src/lib/supabase-api'

export const runtime = 'nodejs'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createApiSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 })
  }
  const { data, error } = await supabase
    .from('user_themes')
    .select('id, name, description, spec, created_at')
    .eq('id', params.id)
    .single()
  if (error || !data) {
    return NextResponse.json({ success: false, error: '테마를 찾을 수 없습니다.' }, { status: 404 })
  }
  return NextResponse.json({ success: true, theme: data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createApiSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 })
  }
  const { error } = await supabase
    .from('user_themes')
    .delete()
    .eq('id', params.id)
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
