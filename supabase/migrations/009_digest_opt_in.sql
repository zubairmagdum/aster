ALTER TABLE email_subscribers ADD COLUMN IF NOT EXISTS digest_opt_in BOOLEAN DEFAULT false;
