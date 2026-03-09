import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * API Route / Server Component 용 Supabase 클라이언트
 * 쿠키 기반으로 현재 사용자 세션을 유지한다.
 */
export function createApiSupabaseClient() {
  const cookieStore = cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component에서 호출 시 set 불가 - 무시
          }
        },
      },
    }
  )
}
