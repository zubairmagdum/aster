-- Ensure local_id column exists
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS local_id TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS estimated_comp_range TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS comp_warning TEXT;

-- Drop any old conflicting indexes
DROP INDEX IF EXISTS jobs_user_local_id_unique;

-- Create clean unique index for upsert conflict resolution
CREATE UNIQUE INDEX IF NOT EXISTS jobs_user_local_id_idx ON public.jobs (user_id, local_id);

-- Ensure resumes has unique constraint on user_id
DO $$ BEGIN
  ALTER TABLE public.resumes ADD CONSTRAINT resumes_user_id_unique UNIQUE (user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
