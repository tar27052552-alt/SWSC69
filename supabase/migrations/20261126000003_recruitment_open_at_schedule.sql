-- Add open_at (registration opening timestamp) to recruitment_settings
-- Default schedule for Academic Year 2570: 30 Nov 2026 00:00 (+07) to 18 Dec 2026 23:59:59 (+07)

ALTER TABLE public.recruitment_settings
  ADD COLUMN IF NOT EXISTS open_at TIMESTAMPTZ;

UPDATE public.recruitment_settings
SET
  open_at = '2026-11-30T00:00:00+07:00',
  deadline_at = '2026-12-18T23:59:59+07:00',
  updated_at = NOW()
WHERE academic_year = 2570;
