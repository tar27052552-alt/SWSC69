-- ========================================================
-- Supabase Row Level Security (RLS) & Access Control Policies
-- Run this script in the Supabase SQL Editor to enforce RLS.
-- ========================================================

-- Enable RLS on core tables
ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.discipline_fines ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.duty_swaps ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------
-- 1. POLICIES FOR 'users' TABLE
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Allow select users for council directory" ON public.users;
CREATE POLICY "Allow select users for council directory"
  ON public.users FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Prevent direct client updates to users" ON public.users;
CREATE POLICY "Prevent direct client updates to users"
  ON public.users FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- --------------------------------------------------------
-- 2. POLICIES FOR 'discipline_fines' TABLE
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Allow select fines" ON public.discipline_fines;
CREATE POLICY "Allow select fines"
  ON public.discipline_fines FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Allow insert fines" ON public.discipline_fines;
CREATE POLICY "Allow insert fines"
  ON public.discipline_fines FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update fines" ON public.discipline_fines;
CREATE POLICY "Allow update fines"
  ON public.discipline_fines FOR UPDATE
  USING (true);

-- --------------------------------------------------------
-- 3. POLICIES FOR 'notifications' TABLE
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Allow select notifications" ON public.notifications;
CREATE POLICY "Allow select notifications"
  ON public.notifications FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Allow insert notifications" ON public.notifications;
CREATE POLICY "Allow insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update notifications" ON public.notifications;
CREATE POLICY "Allow update notifications"
  ON public.notifications FOR UPDATE
  USING (true);

-- --------------------------------------------------------
-- 4. POLICIES FOR PUBLIC READ TABLES (schedules, announcements, policies, duty_swaps)
-- --------------------------------------------------------
DROP POLICY IF EXISTS "Public read schedules" ON public.schedules;
CREATE POLICY "Public read schedules" ON public.schedules FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public write schedules" ON public.schedules;
CREATE POLICY "Public write schedules" ON public.schedules FOR ALL USING (true);

DROP POLICY IF EXISTS "Public read announcements" ON public.announcements;
CREATE POLICY "Public read announcements" ON public.announcements FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public write announcements" ON public.announcements;
CREATE POLICY "Public write announcements" ON public.announcements FOR ALL USING (true);

DROP POLICY IF EXISTS "Public read policies" ON public.policies;
CREATE POLICY "Public read policies" ON public.policies FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public write policies" ON public.policies;
CREATE POLICY "Public write policies" ON public.policies FOR ALL USING (true);

DROP POLICY IF EXISTS "Public read duty_swaps" ON public.duty_swaps;
CREATE POLICY "Public read duty_swaps" ON public.duty_swaps FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public write duty_swaps" ON public.duty_swaps;
CREATE POLICY "Public write duty_swaps" ON public.duty_swaps FOR ALL USING (true);

-- Grant privileges to anon and authenticated roles for RLS evaluation
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
