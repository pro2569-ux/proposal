/**
 * 나라장터(G2B) 공공데이터포털 API 클라이언트
 * 문서: https://www.data.go.kr/
 *
 * 오퍼레이션:
 * - getBidPblancListInfoServcPPSSrch: 용역 (소프트웨어, 컨설팅 등)
 * - getBidPblancListInfoCnstwkPPSSrch: 공사
 * - getBidPblancListInfoThngPPSSrch: 물품
 * - getBidPblancListInfoFrgcptPPSSrch: 외자
 */

const NARA_API_BASE_URL = 'https://apis.data.go.kr/1230000/ad/BidPublicInfoService'
const SERVICE_KEY = process.env.NARA_API_KEY || ''

export type BidType = 'servc' | 'cnstwk' | 'thng' | 'frgcpt' | 'all'

export interface BidSearchParams {
  keyword?: string
  startDate?: Date
  endDate?: Date
  pageNo?: number
  numOfRows?: number
  bidType?: BidType // 입찰 분류 (기본: all)
}

export interface BidInfo {
  bidNtceNo: string // 입찰공고번호
  bidNtceOrd: string // 입찰공고차수
  bidNtceNm: string // 공고명
  ntceInsttNm: string // 공고기관명
  dminsttNm: string // 수요기관명
  bidNtceDt: string // 입찰공고일시
  bidClseDt: string // 입찰마감일시
  opengDt: string // 개찰일시
  presmptPrce: string // 추정가격
  prearngPrceDcsnMthdNm: string // 예정가격결정방법명
  bidMethdNm: string // 입찰방법명
  cntrctCnclsMthdNm: string // 계약체결방법명
  rcptDt: string // 접수일시
  rbidPermsnYn: string // 재입찰허용여부
}

export interface BidDetailInfo extends BidInfo {
  bidNtceDtlUrl: string // 공고상세URL
  bidQlfctRgstDt: string // 입찰참가자격등록일시
  opengPlce: string // 개찰장소
  rbidOpengDt: string // 재입찰개찰일시
  rlOpengDt: string // 실개찰일시
  asignBdgtAmt: string // 배정예산금액
  dtilPrdctClsfcNo: string // 세부품목분류번호
}

export interface NaraApiResponse<T> {
  response: {
    header: {
      resultCode: string
      resultMsg: string
    }
    body: {
      items?: T[]
      item?: T[]
      numOfRows?: number
      pageNo?: number
      totalCount?: number
    }
  }
}

/**
 * 날짜를 나라장터 API 포맷(yyyyMMddHHmm)으로 변환
 */
function formatDateForNara(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  return `${year}${month}${day}${hours}${minutes}`
}

/**
 * 입찰 타입별 오퍼레이션 이름 가져오기
 */
function getOperationName(bidType: BidType): string[] {
  const operations = {
    servc: ['getBidPblancListInfoServcPPSSrch'], // 용역
    cnstwk: ['getBidPblancListInfoCnstwkPPSSrch'], // 공사
    thng: ['getBidPblancListInfoThngPPSSrch'], // 물품
    frgcpt: ['getBidPblancListInfoFrgcptPPSSrch'], // 외자
    all: [
      'getBidPblancListInfoServcPPSSrch',
      'getBidPblancListInfoCnstwkPPSSrch',
      'getBidPblancListInfoThngPPSSrch',
    ],
  }
  return operations[bidType] || operations.all
}

/**
 * 나라장터 입찰공고 검색
 * @param keyword 공고명 검색어
 * @param startDate 조회 시작일
 * @param endDate 조회 종료일
 * @param pageNo 페이지 번호 (기본: 1)
 * @param numOfRows 페이지당 결과 수 (기본: 10, 최대: 999)
 * @param bidType 입찰 분류 (기본: all - 용역+공사+물품)
 */
export async function searchBids({
  keyword = '',
  startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 기본: 7일 전
  endDate = new Date(),
  pageNo = 1,
  numOfRows = 10,
  bidType = 'all',
}: BidSearchParams = {}): Promise<{
  items: BidInfo[]
  totalCount: number
  pageNo: number
}> {
  try {
    if (!SERVICE_KEY) {
      throw new Error('NARA_API_KEY 환경변수가 설정되지 않았습니다.')
    }

    // 날짜 범위 검증 (최대 30일)
    const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    if (daysDiff > 30) {
      console.warn(`[NARA API] 날짜 범위가 너무 큽니다 (${daysDiff}일). 30일로 제한합니다.`)
      startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000)
    }

    const operations = getOperationName(bidType)

    // 여러 오퍼레이션 병렬 호출
    const results = await Promise.allSettled(
      operations.map((operation) => searchBidsByOperation(operation, {
        keyword,
        startDate,
        endDate,
        pageNo,
        numOfRows,
      }))
    )

    // 성공한 결과만 수집
    const allItems: BidInfo[] = []
    let totalCount = 0

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        allItems.push(...result.value.items)
        totalCount += result.value.totalCount
        console.log(`[NARA API] ${operations[index]} 성공:`, result.value.totalCount, '건')
      } else {
        console.warn(`[NARA API] ${operations[index]} 실패:`, result.reason?.message)
      }
    })

    // 날짜순 정렬 (최신순)
    allItems.sort((a, b) => {
      return b.bidNtceDt.localeCompare(a.bidNtceDt)
    })

    console.log('[NARA API] 전체 검색 성공:', totalCount, '건')

    return {
      items: allItems,
      totalCount,
      pageNo,
    }
  } catch (error) {
    console.error('[NARA API] 검색 실패:', error)
    throw error
  }
}

/**
 * 단일 오퍼레이션으로 검색
 */
async function searchBidsByOperation(
  operation: string,
  params: {
    keyword: string
    startDate: Date
    endDate: Date
    pageNo: number
    numOfRows: number
  }
): Promise<{
  items: BidInfo[]
  totalCount: number
}> {
  const urlParams = new URLSearchParams({
    serviceKey: SERVICE_KEY,
    pageNo: String(params.pageNo),
    numOfRows: String(Math.min(params.numOfRows, 999)),
    inqryDiv: '1', // 1: 검색
    inqryBgnDt: formatDateForNara(params.startDate),
    inqryEndDt: formatDateForNara(params.endDate),
    type: 'json',
  })

  if (params.keyword) {
    urlParams.append('bidNtceNm', params.keyword)
  }

  const url = `${NARA_API_BASE_URL}/${operation}?${urlParams}`

  console.log('[NARA API] 요청:', operation)

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`[NARA API] ${operation} HTTP 오류:`, response.status, errorText)
    throw new Error(`나라장터 API HTTP 오류: ${response.status} ${response.statusText}`)
  }

  const contentType = response.headers.get('content-type')
  const responseText = await response.text()

  console.log(`[NARA API] ${operation} Content-Type:`, contentType)
  console.log(`[NARA API] ${operation} 응답 (처음 500자):`, responseText.substring(0, 500))

  // JSON 파싱 시도
  let data: any
  try {
    data = JSON.parse(responseText)
  } catch (parseError) {
    console.error(`[NARA API] ${operation} JSON 파싱 실패:`, parseError)
    console.error(`[NARA API] ${operation} 전체 응답:`, responseText)
    throw new Error(`JSON 파싱 실패: ${responseText.substring(0, 200)}`)
  }

  console.log(`[NARA API] ${operation} 파싱된 데이터 구조:`, JSON.stringify(data, null, 2).substring(0, 500))

  // 에러 응답 처리
  const errorResponse = data['nkoneps.com.response.ResponseError']
  if (errorResponse && errorResponse.header) {
    const { resultCode, resultMsg } = errorResponse.header
    console.error(`[NARA API] ${operation} API 에러:`, resultCode, resultMsg)
    throw new Error(`나라장터 API 에러 [${resultCode}]: ${resultMsg}`)
  }

  // 정상 응답 검증
  if (!data.response || !data.response.header) {
    console.error(`[NARA API] ${operation} 잘못된 응답 구조:`, data)
    throw new Error(`잘못된 API 응답 구조`)
  }

  if (data.response.header.resultCode !== '00') {
    console.error(`[NARA API] ${operation} 응답 오류:`, data.response.header)
    throw new Error(
      `나라장터 API 오류: [${data.response.header.resultCode}] ${data.response.header.resultMsg || '알 수 없는 오류'}`
    )
  }

  const items = parseBidData<BidInfo>(data)
  const totalCount = data.response.body.totalCount || 0

  return {
    items,
    totalCount,
  }
}

/**
 * 입찰공고 상세 조회
 * @param bidNumber 입찰공고번호-차수 (예: "20240101234-00")
 */
export async function getBidDetail(bidNumber: string): Promise<BidDetailInfo | null> {
  try {
    // 공고번호에서 번호와 차수 분리
    const [bidNtceNo, bidNtceOrd] = bidNumber.split('-')

    if (!bidNtceNo || !bidNtceOrd) {
      throw new Error('잘못된 입찰공고번호 형식입니다. (예: 20240101234-00)')
    }

    const params = new URLSearchParams({
      serviceKey: SERVICE_KEY,
      bidNtceNo,
      bidNtceOrd,
      type: 'json',
    })

    const url = `${NARA_API_BASE_URL}/getBidPblancListInfoServcPPSSrch?${params}`

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`나라장터 API 오류: ${response.status} ${response.statusText}`)
    }

    const data: NaraApiResponse<BidDetailInfo> = await response.json()

    // API 응답 검증
    if (data.response.header.resultCode !== '00') {
      throw new Error(
        `나라장터 API 오류: ${data.response.header.resultMsg || '알 수 없는 오류'}`
      )
    }

    const items = parseBidData(data)
    return items.length > 0 ? (items[0] as BidDetailInfo) : null
  } catch (error) {
    console.error('나라장터 API 상세 조회 실패:', error)
    throw error
  }
}

/**
 * 나라장터 API 응답 데이터 파싱
 * API는 items 또는 item 형태로 응답할 수 있음
 */
export function parseBidData<T>(data: NaraApiResponse<T>): T[] {
  const body = data.response.body

  if (!body) {
    return []
  }

  // 배열 형태의 items
  if (body.items && Array.isArray(body.items)) {
    return body.items
  }

  // 단일 객체 또는 배열 형태의 item
  if (body.item) {
    return Array.isArray(body.item) ? body.item : [body.item]
  }

  return []
}

/**
 * 입찰공고 번호 포맷 (번호-차수)
 */
export function formatBidNumber(bidNtceNo: string, bidNtceOrd: string): string {
  return `${bidNtceNo}-${bidNtceOrd}`
}

/**
 * 금액 문자열을 숫자로 변환 (쉼표 제거)
 */
export function parseAmount(amountStr: string): number {
  if (!amountStr) return 0
  return parseInt(amountStr.replace(/,/g, ''), 10) || 0
}

/**
 * 날짜 문자열을 Date 객체로 변환
 * @param dateStr yyyyMMddHHmm 형식
 */
export function parseNaraDate(dateStr: string): Date | null {
  if (!dateStr || dateStr.length < 12) return null

  const year = parseInt(dateStr.substring(0, 4), 10)
  const month = parseInt(dateStr.substring(4, 6), 10) - 1
  const day = parseInt(dateStr.substring(6, 8), 10)
  const hours = parseInt(dateStr.substring(8, 10), 10)
  const minutes = parseInt(dateStr.substring(10, 12), 10)

  return new Date(year, month, day, hours, minutes)
}
