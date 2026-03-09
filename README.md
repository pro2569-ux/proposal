# Proposal App

Next.js 14 App Router 기반 제안서 관리 애플리케이션

## 기술 스택

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Database**: Supabase
- **AI**: OpenAI
- **State Management**: Zustand
- **Data Fetching**: TanStack Query (React Query)

## 프로젝트 구조

```
src/
├── app/
│   ├── (auth)/
│   │   └── login/page.tsx          # 로그인 페이지
│   ├── dashboard/
│   │   ├── layout.tsx              # 대시보드 레이아웃
│   │   └── page.tsx                # 공고 검색 페이지 ✅
│   ├── api/
│   │   ├── proposals/route.ts      # 제안서 API
│   │   └── nara/search/route.ts    # NARA 검색 API ✅
│   ├── layout.tsx                  # 루트 레이아웃 (React Query Provider)
│   ├── page.tsx                    # 랜딩 페이지 ✅
│   └── globals.css                 # 글로벌 스타일
├── components/                     # 재사용 가능한 컴포넌트
├── lib/
│   ├── supabase/
│   │   ├── client.ts              # Supabase 브라우저 클라이언트
│   │   └── server.ts              # Supabase 서버 클라이언트
│   ├── nara-api.ts                # 나라장터 API 클라이언트 ✅
│   ├── openai.ts                  # OpenAI 클라이언트
│   └── react-query.tsx            # React Query Provider ✅
├── types/
│   └── index.ts                   # TypeScript 타입 정의
└── stores/
    └── index.ts                   # Zustand 상태 관리

docs/
└── NARA_API.md                    # 나라장터 API 사용 가이드 ✅

supabase/
└── migrations/
    └── 20240307000000_initial_schema.sql  # DB 스키마 ✅
```

## 시작하기

### 1. 환경 변수 설정

`.env.local.example` 파일을 `.env.local`로 복사하고 환경 변수를 설정하세요:

```bash
cp .env.local.example .env.local
```

필요한 환경 변수:
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase 프로젝트 URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase Anon Key
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase Service Role Key
- `OPENAI_API_KEY`: OpenAI API Key
- `NARA_API_KEY`: 나라장터 공공데이터포털 API Key

### 2. 데이터베이스 마이그레이션

Supabase 프로젝트에서 SQL Editor를 열고 `supabase/migrations/20240307000000_initial_schema.sql` 파일의 내용을 실행하세요.

또는 Supabase CLI를 사용하는 경우:

```bash
# Supabase CLI 설치 (필요한 경우)
npm install -g supabase

# Supabase 프로젝트 연결
supabase link --project-ref your-project-ref

# 마이그레이션 실행
supabase db push
```

#### 데이터베이스 스키마

- **profiles**: 사용자 프로필 정보
- **proposals**: 제안서 메타데이터 및 상태 관리
- **proposal_sections**: 제안서 섹션별 상세 내용

모든 테이블에 RLS(Row Level Security) 정책이 적용되어 있어 각 사용자는 자신의 데이터만 접근할 수 있습니다.

### 3. 개발 서버 실행

```bash
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열어 확인하세요.

### 4. 빌드

```bash
npm run build
```

### 5. 프로덕션 실행

```bash
npm start
```

## 주요 기능

### ✅ 구현 완료

- **🏠 랜딩 페이지**: 서비스 소개 및 주요 기능 안내
- **🔍 나라장터 공고 검색**:
  - 실시간 나라장터(G2B) 입찰공고 검색
  - 키워드 및 날짜 범위 필터링
  - 페이징 처리 (최대 100개/페이지)
  - 공고 상세 정보 조회
- **📊 대시보드**:
  - 검색 결과 카드 형식 표시
  - 공고명, 발주기관, 예산, 마감일 정보
  - 로딩/에러/빈 결과 상태 처리
  - React Query 기반 데이터 페칭
- **🔌 API Routes**:
  - `/api/nara/search` - 나라장터 공고 검색 API (CORS 지원)
  - `/api/proposals` - 제안서 CRUD (예정)

### 🚧 개발 예정

- **🔐 인증 시스템**: Supabase 기반 로그인/회원가입
- **🤖 AI 제안서 생성**: OpenAI GPT-4를 활용한 자동 제안서 작성
- **📄 PPT 다운로드**: 생성된 제안서 PowerPoint 파일 다운로드
- **📈 제안서 관리**: 생성된 제안서 목록 및 상태 관리

## 개발 가이드

### 라우팅

- `/` - 랜딩 페이지
- `/dashboard` - 공고 검색 대시보드
- `/login` - 로그인 페이지 (라우트 그룹: auth)

### API Routes

Next.js 14 App Router의 Route Handlers를 사용합니다:

```typescript
// GET /api/proposals
export async function GET(request: NextRequest) { ... }

// POST /api/proposals
export async function POST(request: NextRequest) { ... }
```

### Supabase 사용

**클라이언트 컴포넌트**:
```typescript
import { createClient } from '@/src/lib/supabase/client'

const supabase = createClient()
```

**서버 컴포넌트/API**:
```typescript
import { createClient } from '@/src/lib/supabase/server'

const supabase = await createClient()
```

### State Management

Zustand를 사용한 전역 상태 관리:

```typescript
import { useAppStore } from '@/src/stores'

const { user, setUser } = useAppStore()
```

## 라이선스

MIT
