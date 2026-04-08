CREATE TABLE IF NOT EXISTS candidate_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  linkedin_text TEXT,
  proof_library JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE candidate_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_own_data" ON candidate_profiles FOR ALL USING (auth.uid() = user_id);
