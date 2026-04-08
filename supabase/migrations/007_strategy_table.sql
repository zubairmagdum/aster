CREATE TABLE IF NOT EXISTS strategy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  target_role TEXT DEFAULT '',
  whats_working TEXT DEFAULT '',
  whats_not TEXT DEFAULT '',
  weekly_brief JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE strategy ENABLE ROW LEVEL SECURITY;
CREATE POLICY "strategy_own_data" ON strategy FOR ALL USING (auth.uid() = user_id);
