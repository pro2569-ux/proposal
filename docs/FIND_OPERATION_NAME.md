# 나라장터 API 오퍼레이션 이름 확인 방법

## 현재 상황

- ✅ **엔드포인트 수정 완료**: `https://apis.data.go.kr/1230000/ad/BidPublicInfoService`
- ❓ **오퍼레이션 이름 확인 필요**: 현재 `getBidPblancListInfoServcPPSSrch` 사용 중

---

## 📋 오퍼레이션 이름 확인 방법

### 1. 공공데이터포털 로그인

https://www.data.go.kr/ 접속 후 로그인

### 2. 마이페이지 → 오픈API

우측 상단 **"마이페이지"** → 좌측 메뉴 **"오픈API"**

### 3. 신청한 API 찾기

나라장터 관련 API 찾아서 **"상세보기"** 클릭

### 4. API 명세서 확인

**"참고문서"** 또는 **"상세기능정보"** 탭에서 확인:

```
┌─────────────────────────────────────────────┐
│ 오퍼레이션 목록                              │
├─────────────────────────────────────────────┤
│ 1. getBidPblancListInfo                     │
│    - 입찰공고 목록 조회                      │
│                                             │
│ 2. getBidPblancDetail                       │
│    - 입찰공고 상세 조회                      │
│                                             │
│ 3. getPublicProcureInfo                     │
│    - 조달정보 조회                          │
└─────────────────────────────────────────────┘
```

### 5. 요청 변수 확인

각 오퍼레이션의 **필수 파라미터**와 **선택 파라미터** 확인

---

## 🔍 확인해야 할 정보

다음 정보를 알려주세요:

1. **API 전체 이름**
   - 예: "나라장터 전자조달 입찰공고 목록 정보조회 서비스"

2. **제공기관**
   - 예: 조달청

3. **오퍼레이션 이름** (가장 중요!)
   - 예: `getBidPblancListInfo`

4. **필수 파라미터 목록**
   - 예: serviceKey, pageNo, numOfRows, type

5. **전체 예시 URL** (명세서에 있는 경우)
   - 예: `https://apis.data.go.kr/.../getBidPblancListInfo?serviceKey=...`

---

## 🧪 임시 해결: 일반적인 오퍼레이션 테스트

일반적으로 많이 사용되는 오퍼레이션들:

### 시도 1: getBidPblancListInfo
```bash
curl "https://apis.data.go.kr/1230000/ad/BidPublicInfoService/getBidPblancListInfo?serviceKey=YOUR_KEY&pageNo=1&numOfRows=5&type=json"
```

### 시도 2: getBidPblancList
```bash
curl "https://apis.data.go.kr/1230000/ad/BidPublicInfoService/getBidPblancList?serviceKey=YOUR_KEY&pageNo=1&numOfRows=5&type=json"
```

### 시도 3: getPublicProcureInfo
```bash
curl "https://apis.data.go.kr/1230000/ad/BidPublicInfoService/getPublicProcureInfo?serviceKey=YOUR_KEY&pageNo=1&numOfRows=5&type=json"
```

---

## 📸 스크린샷 첨부 가능

공공데이터포털의 API 명세서 화면을 캡처해서 공유해주시면 정확히 알려드릴 수 있습니다!

특히 다음 부분:
- **상세기능정보** 탭
- **오퍼레이션 목록**
- **요청 변수** 테이블
- **예시 URL**

---

## 🎯 다음 단계

정확한 오퍼레이션 이름을 알려주시면:

1. `src/lib/nara-api.ts` 파일 수정
2. API 호출 테스트
3. 정상 작동 확인

이렇게 진행하겠습니다!
