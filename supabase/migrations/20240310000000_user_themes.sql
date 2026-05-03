-- ========================================
-- USER THEMES TABLE
-- 사용자가 .md 디자인 문서를 업로드해 만든 PPT 커스텀 테마 보관소.
-- spec JSONB는 worker의 Theme dataclass와 1:1 매핑되는 ThemeSpec 형식.
-- ========================================

CREATE TABLE user_themes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  spec JSONB NOT NULL,
  source_markdown TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX user_themes_user_id_idx ON user_themes(user_id);

ALTER TABLE user_themes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_themes_select_own" ON user_themes
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_themes_insert_own" ON user_themes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_themes_update_own" ON user_themes
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "user_themes_delete_own" ON user_themes
  FOR DELETE USING (auth.uid() = user_id);
