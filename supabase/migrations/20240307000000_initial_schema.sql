-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum for proposal status
CREATE TYPE proposal_status AS ENUM ('pending', 'generating', 'completed', 'failed');

-- ========================================
-- 1. PROFILES TABLE
-- ========================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  company_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX profiles_email_idx ON profiles(email);

-- ========================================
-- 2. PROPOSALS TABLE
-- ========================================
CREATE TABLE proposals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- 나라장터 공고 정보
  bid_number TEXT NOT NULL,
  bid_title TEXT NOT NULL,
  bid_org TEXT NOT NULL,
  budget BIGINT,

  -- 제안서 생성 상태
  status proposal_status NOT NULL DEFAULT 'pending',
  result_url TEXT,

  -- AI 비용 추적
  ai_cost DECIMAL(10, 2) DEFAULT 0.00,

  -- 타임스탬프
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  -- 제약조건
  CONSTRAINT valid_completion CHECK (
    (status = 'completed' AND completed_at IS NOT NULL AND result_url IS NOT NULL) OR
    (status != 'completed')
  )
);

-- Indexes for performance
CREATE INDEX proposals_user_id_idx ON proposals(user_id);
CREATE INDEX proposals_status_idx ON proposals(status);
CREATE INDEX proposals_created_at_idx ON proposals(created_at DESC);
CREATE INDEX proposals_bid_number_idx ON proposals(bid_number);

-- ========================================
-- 3. PROPOSAL_SECTIONS TABLE
-- ========================================
CREATE TABLE proposal_sections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,

  -- 섹션 정보
  section_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  order_index INTEGER NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 제약조건: 같은 proposal 내에서 section_type은 unique
  CONSTRAINT unique_section_per_proposal UNIQUE (proposal_id, section_type)
);

-- Indexes
CREATE INDEX proposal_sections_proposal_id_idx ON proposal_sections(proposal_id);
CREATE INDEX proposal_sections_order_idx ON proposal_sections(proposal_id, order_index);

-- ========================================
-- RLS (Row Level Security) POLICIES
-- ========================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_sections ENABLE ROW LEVEL SECURITY;

-- ========================================
-- PROFILES RLS POLICIES
-- ========================================

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Users can insert their own profile
CREATE POLICY "Users can insert own profile"
  ON profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Users can delete their own profile
CREATE POLICY "Users can delete own profile"
  ON profiles
  FOR DELETE
  USING (auth.uid() = id);

-- ========================================
-- PROPOSALS RLS POLICIES
-- ========================================

-- Users can view their own proposals
CREATE POLICY "Users can view own proposals"
  ON proposals
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own proposals
CREATE POLICY "Users can insert own proposals"
  ON proposals
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own proposals
CREATE POLICY "Users can update own proposals"
  ON proposals
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own proposals
CREATE POLICY "Users can delete own proposals"
  ON proposals
  FOR DELETE
  USING (auth.uid() = user_id);

-- ========================================
-- PROPOSAL_SECTIONS RLS POLICIES
-- ========================================

-- Users can view sections of their own proposals
CREATE POLICY "Users can view own proposal sections"
  ON proposal_sections
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = proposal_sections.proposal_id
      AND proposals.user_id = auth.uid()
    )
  );

-- Users can insert sections for their own proposals
CREATE POLICY "Users can insert own proposal sections"
  ON proposal_sections
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = proposal_sections.proposal_id
      AND proposals.user_id = auth.uid()
    )
  );

-- Users can update sections of their own proposals
CREATE POLICY "Users can update own proposal sections"
  ON proposal_sections
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = proposal_sections.proposal_id
      AND proposals.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = proposal_sections.proposal_id
      AND proposals.user_id = auth.uid()
    )
  );

-- Users can delete sections of their own proposals
CREATE POLICY "Users can delete own proposal sections"
  ON proposal_sections
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = proposal_sections.proposal_id
      AND proposals.user_id = auth.uid()
    )
  );

-- ========================================
-- FUNCTIONS & TRIGGERS
-- ========================================

-- Function to automatically create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on auth.users insert
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Function to update completed_at when status changes to completed
CREATE OR REPLACE FUNCTION public.update_proposal_completed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    NEW.completed_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update completed_at
CREATE TRIGGER on_proposal_completed
  BEFORE UPDATE ON proposals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_proposal_completed_at();

-- ========================================
-- COMMENTS (Documentation)
-- ========================================

COMMENT ON TABLE profiles IS '사용자 프로필 정보';
COMMENT ON TABLE proposals IS '제안서 메타데이터 및 상태 관리';
COMMENT ON TABLE proposal_sections IS '제안서 섹션별 상세 내용';

COMMENT ON COLUMN proposals.bid_number IS '나라장터 공고번호';
COMMENT ON COLUMN proposals.bid_title IS '입찰 공고명';
COMMENT ON COLUMN proposals.bid_org IS '발주 기관명';
COMMENT ON COLUMN proposals.budget IS '예산 (원 단위)';
COMMENT ON COLUMN proposals.ai_cost IS 'AI API 호출 비용 (달러)';
COMMENT ON COLUMN proposal_sections.section_type IS '섹션 유형 (overview, approach, schedule 등)';
COMMENT ON COLUMN proposal_sections.order_index IS '섹션 표시 순서';
