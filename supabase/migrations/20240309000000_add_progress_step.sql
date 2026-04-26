-- 파이프라인 세분화된 진행 상태를 저장하는 컬럼 추가
ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS progress_step TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS progress_pct  INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS progress_msg  TEXT DEFAULT NULL;

-- Realtime이 이 컬럼 변경도 감지하도록 publication 갱신
-- (Supabase는 기본적으로 모든 컬럼 변경 감지)
