# 나라장터 AI 제안서 자동생성 서비스

## 프로젝트 개요
나라장터(G2B) 입찰공고를 선택하면 AI가 자동으로
제안서 PPT를 생성하는 SaaS 서비스

## 기술 스택
- Frontend: Next.js 14, TypeScript, Tailwind
- Backend: Next.js API Routes
- DB/Auth: Supabase
- AI: OpenAI GPT-4o (메인), 향후 Claude/Gemini 추가
- 상태관리: Zustand

## 핵심 규칙
- 한국어 기반 서비스, 모든 UI 한국어
- API 키는 환경변수로만 관리
- 에러는 한국어 메시지로 사용자에게 표시
- Supabase RLS 정책 필수 적용
