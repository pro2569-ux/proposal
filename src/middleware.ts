import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/src/lib/supabase-middleware'

const PUBLIC_PATHS = ['/', '/login', '/signup']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const { user, supabaseResponse } = await updateSession(request)

  // 나라장터 검색 API는 인증 불필요
  if (pathname.startsWith('/api/nara')) {
    return supabaseResponse
  }

  // 그 외 API 라우트 인증 체크
  if (pathname.startsWith('/api')) {
    if (!user) {
      return NextResponse.json(
        { success: false, error: '로그인이 필요합니다.' },
        { status: 401 }
      )
    }
    return supabaseResponse
  }

  // 공개 경로는 통과 (로그인된 상태에서 login/signup 접근 시 대시보드로)
  if (PUBLIC_PATHS.some((p) => pathname === p || (p !== '/' && pathname.startsWith(p)))) {
    if (user && pathname !== '/') {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }
    return supabaseResponse
  }

  // 그 외 경로: 미인증 시 로그인으로
  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
