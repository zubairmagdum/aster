-- 010: Security fixes — email dedup, RLS tightening, performance indexes
-- Run manually: supabase db push or apply via dashboard SQL editor

-- ─── Email subscriber uniqueness ────────────────────────────────────────────
-- Prevent duplicate email subscriptions at the DB level
ALTER TABLE email_subscribers ADD CONSTRAINT email_subscribers_email_unique UNIQUE (email);
CREATE INDEX IF NOT EXISTS idx_email_subscribers_email ON email_subscribers (email);

-- ─── Tighten RLS on analysis_ratings ────────────────────────────────────────
-- Drop the overly permissive insert policy and replace with one that checks user_id
DROP POLICY IF EXISTS "Anyone can insert ratings" ON analysis_ratings;
CREATE POLICY "ratings_insert_own" ON analysis_ratings
  FOR INSERT WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- ─── Tighten RLS on feedback ────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can insert feedback" ON feedback;
CREATE POLICY "feedback_insert_own" ON feedback
  FOR INSERT WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- ─── Performance: index for digest query ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_jobs_user_date ON jobs (user_id, date_added);
