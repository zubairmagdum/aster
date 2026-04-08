-- Add local_id column to jobs for client-generated string IDs
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS local_id TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS estimated_comp_range TEXT;

-- Create unique constraint on (user_id, local_id) for upsert conflict resolution
CREATE UNIQUE INDEX IF NOT EXISTS jobs_user_local_id_unique ON jobs(user_id, local_id);

-- Add unique constraint on resumes.user_id for upsert conflict resolution
ALTER TABLE resumes ADD CONSTRAINT resumes_user_id_unique UNIQUE (user_id);
