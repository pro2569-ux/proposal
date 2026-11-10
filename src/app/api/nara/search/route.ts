import { NextRequest, NextResponse } from 'next/server'
import { searchBids, getBidDetail } from '@/src/lib/nara-api'
import { createApiSupabaseClient } from '@/src/lib/supabase-api'

/**
 * 나라장터 입찰공고 검색 API
 *
 * Query Parameters:
 * - q: 검색 키워드 (공고명)
 * - startDate: 조회 시작일 (ISO 8601 또는 yyyy-MM-dd)
 * - endDate: 조회 종료일 (ISO 8601 또는 yyyy-MM-dd)
 * - page: 페이지 번호 (기본: 1)
 * - limit: 페이지당 결과 수 (기본: 10, 최대: 100)
 * - bidNumber: 특정 입찰공고번호 조회 (예: 20240101234-00)
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

    const searchParams = request.nextUrl.searchParams

    // 특정 공고번호로 상세 조회
    const bidNumber = searchParams.get('bidNumber')
    if (bidNumber) {
      const detail = await getBidDetail(bidNumber)

      if (!detail) {
        return NextResponse.json(
          {
            success: false,
            error: '해당 입찰공고를 찾을 수 없습니다.'
          },
          { status: 404 }
        )
      }

      return NextResponse.json({
        success: true,
        data: detail,
      })
    }

    // 일반 검색
    const keyword = searchParams.get('q') || ''
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = Math.min(
      parseInt(searchParams.get('limit') || '10', 10),
      100
    )

    // 날짜 파라미터 파싱
    let startDate: Date | undefined
    let endDate: Date | undefined

    const startDateParam = searchParams.get('startDate')
    const endDateParam = searchParams.get('endDate')

    if (startDateParam) {
      startDate = new Date(startDateParam)
      if (isNaN(startDate.getTime())) {
        return NextResponse.json(
          {
            success: false,
            error: '잘못된 시작일 형식입니다. (ISO 8601 또는 yyyy-MM-dd 형식을 사용하세요)'
          },
          { status: 400 }
        )
      }
    }

    if (endDateParam) {
      endDate = new Date(endDateParam)
      if (isNaN(endDate.getTime())) {
        return NextResponse.json(
          {
            success: false,
            error: '잘못된 종료일 형식입니다. (ISO 8601 또는 yyyy-MM-dd 형식을 사용하세요)'
          },
          { status: 400 }
        )
      }
    }

    // 나라장터 API 호출
    const result = await searchBids({
      keyword,
      startDate,
      endDate,
      pageNo: page,
      numOfRows: limit,
    })

    return NextResponse.json(
      {
        success: true,
        data: result.items,
        pagination: {
          page: result.pageNo,
          limit,
          totalCount: result.totalCount,
          totalPages: Math.ceil(result.totalCount / limit),
        },
      },
    )
  } catch (error) {
    console.error('나라장터 API 오류:', error)

    return NextResponse.json(
      {
        success: false,
        error: '나라장터 API 호출 중 오류가 발생했습니다.',
      },
      { status: 500 }
    )
  }
}

