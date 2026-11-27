-- Add council test mode toggle to recruitment_settings
-- When true, active council members in public.users + swscsappha@sappha.ac.th can test /apply/
-- Admins can switch this off in one click before official M.4 recruitment opens.

ALTER TABLE public.recruitment_settings
  ADD COLUMN IF NOT EXISTS allow_council_test BOOLEAN NOT NULL DEFAULT true;

UPDATE public.recruitment_settings
SET allow_council_test = true
WHERE academic_year = 2570;
