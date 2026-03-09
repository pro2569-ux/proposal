# 나라장터 API 연동 가이드

## 개요

나라장터(G2B) 공공데이터포털 API를 통해 입찰공고를 검색하고 조회할 수 있습니다.

## API 엔드포인트

### 1. 입찰공고 검색

**GET** `/api/nara/search`

#### Query Parameters

| 파라미터 | 타입 | 필수 | 설명 | 기본값 |
|---------|------|------|------|--------|
| q | string | ✗ | 공고명 검색 키워드 | - |
| startDate | string | ✗ | 조회 시작일 (ISO 8601 또는 yyyy-MM-dd) | 30일 전 |
| endDate | string | ✗ | 조회 종료일 (ISO 8601 또는 yyyy-MM-dd) | 오늘 |
| page | number | ✗ | 페이지 번호 | 1 |
| limit | number | ✗ | 페이지당 결과 수 (최대 100) | 10 |

#### 예제 요청

```bash
# 기본 검색 (최근 30일)
GET /api/nara/search?q=소프트웨어

# 기간 지정 검색
GET /api/nara/search?q=AI&startDate=2024-01-01&endDate=2024-12-31

# 페이징
GET /api/nara/search?q=개발&page=2&limit=20
```

#### 응답 예제

```json
{
  "success": true,
  "data": [
    {
      "bidNtceNo": "20240101234",
      "bidNtceOrd": "00",
      "bidNtceNm": "AI 기반 제안서 자동생성 시스템 구축",
      "ntceInsttNm": "행정안전부",
      "dminsttNm": "행정안전부",
      "bidNtceDt": "202401011000",
      "bidClseDt": "202401151800",
      "opengDt": "202401160900",
      "presmptPrce": "500000000",
      "bidMethdNm": "일반경쟁입찰",
      "cntrctCnclsMthdNm": "총액계약"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "totalCount": 156,
    "totalPages": 16
  }
}
```

### 2. 입찰공고 상세 조회

**GET** `/api/nara/search?bidNumber={공고번호-차수}`

#### Query Parameters

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| bidNumber | string | ✅ | 입찰공고번호-차수 (예: 20240101234-00) |

#### 예제 요청

```bash
GET /api/nara/search?bidNumber=20240101234-00
```

#### 응답 예제

```json
{
  "success": true,
  "data": {
    "bidNtceNo": "20240101234",
    "bidNtceOrd": "00",
    "bidNtceNm": "AI 기반 제안서 자동생성 시스템 구축",
    "ntceInsttNm": "행정안전부",
    "dminsttNm": "행정안전부",
    "bidNtceDt": "202401011000",
    "bidClseDt": "202401151800",
    "opengDt": "202401160900",
    "presmptPrce": "500000000",
    "bidMethdNm": "일반경쟁입찰",
    "cntrctCnclsMthdNm": "총액계약",
    "bidNtceDtlUrl": "https://www.g2b.go.kr:8081/...",
    "opengPlce": "행정안전부 3층 회의실"
  }
}
```

## 클라이언트에서 사용하기

### React Component 예제

```typescript
'use client'

import { useState } from 'react'
import type { BidInfo } from '@/src/types'

export default function BidSearch() {
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState<BidInfo[]>([])
  const [loading, setLoading] = useState(false)

  const handleSearch = async () => {
    setLoading(true)
    try {
      const response = await fetch(
        `/api/nara/search?q=${encodeURIComponent(keyword)}&limit=20`
      )
      const data = await response.json()

      if (data.success) {
        setResults(data.data)
      } else {
        alert(data.error)
      }
    } catch (error) {
      console.error('검색 실패:', error)
      alert('검색 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <input
        type="text"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder="공고명 검색"
      />
      <button onClick={handleSearch} disabled={loading}>
        {loading ? '검색 중...' : '검색'}
      </button>

      <ul>
        {results.map((bid) => (
          <li key={`${bid.bidNtceNo}-${bid.bidNtceOrd}`}>
            <h3>{bid.bidNtceNm}</h3>
            <p>발주기관: {bid.ntceInsttNm}</p>
            <p>예산: {parseInt(bid.presmptPrce).toLocaleString()}원</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

## 서버에서 직접 사용하기

### Server Component 또는 API Route

```typescript
import { searchBids, getBidDetail } from '@/src/lib/nara-api'

// 검색
const result = await searchBids({
  keyword: '소프트웨어 개발',
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-12-31'),
  pageNo: 1,
  numOfRows: 20,
})

console.log(`총 ${result.totalCount}개 검색`)
console.log(result.items)

// 상세 조회
const detail = await getBidDetail('20240101234-00')
console.log(detail)
```

## 유틸리티 함수

### 날짜 포맷팅

```typescript
import { formatDateForNara, parseNaraDate } from '@/src/lib/nara-api'

// Date -> 나라장터 포맷 (yyyyMMddHHmm)
const formatted = formatDateForNara(new Date())
// "202403071430"

// 나라장터 포맷 -> Date
const date = parseNaraDate('202403071430')
// Date 객체
```

### 금액 파싱

```typescript
import { parseAmount } from '@/src/lib/nara-api'

const amount = parseAmount('500,000,000')
// 500000000
```

### 공고번호 포맷팅

```typescript
import { formatBidNumber } from '@/src/lib/nara-api'

const bidNumber = formatBidNumber('20240101234', '00')
// "20240101234-00"
```

## 에러 처리

API는 다음과 같은 에러를 반환할 수 있습니다:

```json
{
  "success": false,
  "error": "에러 메시지"
}
```

### 일반적인 에러

- **400 Bad Request**: 잘못된 파라미터
- **404 Not Found**: 입찰공고를 찾을 수 없음
- **500 Internal Server Error**: 서버 오류 또는 나라장터 API 오류

## 제한사항

- 페이지당 최대 100개 결과
- 공공데이터포털 API 호출 제한이 적용될 수 있습니다
- 날짜 범위를 너무 크게 설정하면 응답이 느릴 수 있습니다

## 참고

- [나라장터 공공데이터포털](https://www.data.go.kr/)
- [나라장터 G2B](https://www.g2b.go.kr/)
