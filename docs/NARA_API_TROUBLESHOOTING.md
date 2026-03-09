# 나라장터 API 500 에러 해결 가이드

## ❌ 현재 에러

```
[NARA API] HTTP 오류: 500 Unexpected errors
```

이 에러는 **API 서버에서 반환하는 오류**로, 다음과 같은 원인이 있을 수 있습니다.

---

## 🔍 원인별 해결 방법

### 1. API 키가 승인되지 않음 ⭐ 가장 흔한 원인

#### 확인 방법
1. 공공데이터포털 로그인: https://www.data.go.kr/
2. 우측 상단 **"마이페이지"** → **"오픈API"**
3. 신청한 API 상태 확인

#### 상태별 조치

**"승인 대기 중"**:
- 보통 즉시 승인되지만, 1-2시간 소요될 수 있음
- 이메일로 승인 알림 대기

**"승인 완료"**:
- "개발계정 상세보기" 클릭
- **일반 인증키 (Decoding)** 다시 복사
- `.env.local`에 정확히 입력

**"미신청"**:
- 활용신청이 안 된 상태
- API 상세 페이지에서 "활용신청" 클릭

---

### 2. 잘못된 API 선택

나라장터 관련 API가 여러 개 있습니다. **정확한 API**를 선택해야 합니다.

#### ✅ 올바른 API

**검색어**: "나라장터 전자조달 입찰공고"

**API 정보**:
- 제공기관: **조달청**
- API명: **나라장터 전자조달 입찰공고 목록 정보조회 서비스**
- 서비스명: `BidPublicInfoService04` (버전 확인!)
- 오퍼레이션: `getBidPblancListInfoServcPPSSrch`

#### ❌ 주의: 비슷한 이름의 다른 API들

- BidPublicInfoService (구버전)
- BidPublicInfoService02 (구버전)
- BidPublicInfoService03 (구버전)

→ 반드시 **04 버전** 확인!

---

### 3. API 키 복사 오류

#### 자주하는 실수

**❌ 잘못된 예**:
```env
# Encoding 키 사용
NARA_API_KEY=...%2F...%3D%3D

# 앞뒤 공백 포함
NARA_API_KEY= NmME9H...

# 일부만 복사
NARA_API_KEY=NmME9H620V8JEP
```

**✅ 올바른 예**:
```env
# Decoding 키, 공백 없음, 전체 복사
NARA_API_KEY=NmME9H620V8JEPBBQU/TYsRlEZqIRTcL1LA18PSIFtSYYyI0OGfQ/hddu3AdyUPaWGiRD0JLQ2ztlKiayRoy5A==
```

---

### 4. 잘못된 엔드포인트 또는 파라미터

#### 필수 파라미터 확인

공공데이터포털 API 명세서에서 **필수 파라미터** 확인:

일반적인 필수 파라미터:
- `serviceKey` (인증키)
- `pageNo` (페이지 번호)
- `numOfRows` (한 페이지 결과 수)
- `type` (응답 형식: json 또는 xml)

선택적 파라미터:
- `inqryDiv` (조회구분: 1=검색)
- `inqryBgnDt` (조회 시작일시)
- `inqryEndDt` (조회 종료일시)
- `bidNtceNm` (공고명 검색어)

---

### 5. 트래픽 제한 초과

#### 확인
- 마이페이지 → 오픈API → 활용현황 확인
- 일일 트래픽 제한 (보통 1,000건/일)

#### 해결
- 다음 날까지 대기
- 또는 트래픽 증량 신청

---

## 🧪 단계별 디버깅

### Step 1: API 승인 상태 확인

```bash
# 공공데이터포털 로그인
# 마이페이지 → 오픈API
# 상태가 "승인 완료"인지 확인
```

### Step 2: 정확한 키 복사

```bash
# "개발계정 상세보기" 클릭
# "일반 인증키 (Decoding)" 복사 버튼 클릭
# .env.local 파일 열기
# NARA_API_KEY= 뒤에 붙여넣기 (공백 없이)
```

### Step 3: 환경변수 확인

```bash
# 프로젝트 루트에서
cat .env.local | grep NARA_API_KEY

# 키가 올바르게 설정되었는지 확인
# - Encoding 키 (X): %2F, %3D 포함
# - Decoding 키 (O): /, = 포함
```

### Step 4: 개발 서버 재시작

```bash
# Ctrl + C로 서버 종료
npm run dev

# 환경변수는 서버 시작 시 로드되므로
# 변경 후 반드시 재시작 필요
```

### Step 5: 간단한 테스트

브라우저 콘솔 또는 터미널에서:

```bash
# 최소 파라미터로 테스트
curl "https://apis.data.go.kr/1230000/BidPublicInfoService04/getBidPblancListInfoServcPPSSrch?serviceKey=YOUR_DECODING_KEY&pageNo=1&numOfRows=5&type=json"
```

**성공 응답 예시**:
```json
{
  "response": {
    "header": {
      "resultCode": "00",
      "resultMsg": "NORMAL SERVICE."
    },
    "body": {
      "items": [...],
      "totalCount": 123
    }
  }
}
```

**실패 응답 예시**:
```json
{
  "response": {
    "header": {
      "resultCode": "03",
      "resultMsg": "SERVICE KEY IS NOT REGISTERED ERROR."
    }
  }
}
```

또는 단순히:
```
Unexpected errors
```

---

## 📞 추가 지원

### 공공데이터포털 문의

**문제가 계속되면** 공공데이터포털에 직접 문의:

1. 공공데이터포털 로그인
2. 하단 **"고객지원"** → **"1:1 문의"**
3. 문의 내용:
   ```
   제목: 나라장터 API 500 에러 문의

   내용:
   - 신청 API: 나라장터 전자조달 입찰공고 목록 정보조회 서비스 (BidPublicInfoService04)
   - 승인 상태: 승인 완료
   - 오류 내용: API 호출 시 "Unexpected errors" 응답
   - 테스트 URL: [전체 URL 첨부]
   - 요청 일시: [현재 시간]
   ```

### 대안 API

나라장터 API가 계속 작동하지 않는 경우:

1. **G2B 나라장터 웹사이트 크롤링** (합법적 범위 내)
2. **다른 공공데이터 API** 사용
3. **직접 데이터 입력** 방식으로 프로토타입 개발

---

## ✅ 최종 체크리스트

해결을 위해 다음을 순서대로 확인하세요:

- [ ] API가 **승인 완료** 상태인가?
- [ ] **BidPublicInfoService04** (04 버전)인가?
- [ ] **Decoding 키**를 복사했는가? (Encoding 키 ❌)
- [ ] `.env.local` 파일에 **공백 없이** 입력했는가?
- [ ] 개발 서버를 **재시작**했는가?
- [ ] 브라우저에서 **직접 API URL 테스트**해봤는가?
- [ ] 트래픽 제한에 **걸리지 않았는가**?

모두 확인했는데도 안 되면:
→ **공공데이터포털 고객지원**에 문의하거나
→ **새로운 API 키를 재발급**받으세요

---

## 💡 참고

API 키 발급 상세 가이드: `docs/API_KEY_SETUP.md`
