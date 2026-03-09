-- proposals 테이블에 RFP(제안요청서) PDF 분석 데이터 컬럼 추가
ALTER TABLE proposals ADD COLUMN rfp_data JSONB;

COMMENT ON COLUMN proposals.rfp_data IS 'RFP PDF에서 추출/분석한 상세 요구사항 (JSONB)';

-- 기존 CHECK 제약 조건 수정: result_url을 nullable로 (이미 빈 문자열 허용 중)
ALTER TABLE proposals DROP CONSTRAINT IF EXISTS valid_completion;
ALTER TABLE proposals ADD CONSTRAINT valid_completion CHECK (
  (status = 'completed' AND completed_at IS NOT NULL) OR
  (status != 'completed')
);
