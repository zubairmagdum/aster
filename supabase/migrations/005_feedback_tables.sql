CREATE TABLE IF NOT EXISTS analysis_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  job_local_id TEXT,
  company TEXT,
  role TEXT,
  fit_score INTEGER,
  verdict TEXT,
  rating TEXT NOT NULL, -- 'up' or 'down'
  disagreement TEXT,    -- reason for thumbs down
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  type TEXT NOT NULL,   -- 'bug', 'feature', 'general'
  context TEXT,         -- which view/tab they were on
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE analysis_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Anyone can insert (including anonymous users with null user_id)
CREATE POLICY "anyone_can_insert_ratings" ON analysis_ratings FOR INSERT WITH CHECK (true);
CREATE POLICY "anyone_can_insert_feedback" ON feedback FOR INSERT WITH CHECK (true);

-- Only the user can read their own ratings
CREATE POLICY "users_read_own_ratings" ON analysis_ratings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_read_own_feedback" ON feedback FOR SELECT USING (auth.uid() = user_id);
