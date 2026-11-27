-- Add guardian_comment and Clause 14 verification checklist (8 items + overall) to recruitment_members

ALTER TABLE public.recruitment_members
  ADD COLUMN IF NOT EXISTS guardian_comment TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS clause14_checks JSONB NOT NULL DEFAULT '{}'::jsonb;
