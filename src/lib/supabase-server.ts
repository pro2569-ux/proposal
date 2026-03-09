import { createClient } from '@supabase/supabase-js'

/**
 * 서버 사이드 Supabase 클라이언트 (service role key 사용)
 * API Routes, 파이프라인 등 서버에서만 사용
 */
export function createServerSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase 환경변수가 설정되지 않았습니다.')
  }

  return createClient(supabaseUrl, supabaseServiceKey)
}
