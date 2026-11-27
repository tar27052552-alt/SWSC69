-- Add individual member submit & lock timestamp
ALTER TABLE public.recruitment_members
  ADD COLUMN IF NOT EXISTS member_submitted_at TIMESTAMPTZ DEFAULT NULL;
