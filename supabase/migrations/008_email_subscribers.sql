CREATE TABLE IF NOT EXISTS email_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  source TEXT DEFAULT 'website',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE email_subscribers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone_can_subscribe" ON email_subscribers FOR INSERT WITH CHECK (true);
