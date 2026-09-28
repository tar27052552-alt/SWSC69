-- Supabase Auth + RLS migration for SWSC.
-- Run this after the existing schema/table setup scripts. It preserves legacy
-- passwords for one-time migration in the server-only legacy login function.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS banned boolean NOT NULL DEFAULT false;
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS users_auth_user_id_uq
  ON public.users (auth_user_id) WHERE auth_user_id IS NOT NULL;

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'users', 'departments', 'events', 'notifications', 'schedules', 'attendance_settings', 'duty_swaps',
    'event_participants', 'finance_requests', 'finance_fees', 'discipline_fines',
    'student_attendance', 'clean_duty_checks', 'greeting_duty_checks', 'pr_news',
    'pr_caption_queue', 'suggestions'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = tbl) THEN
      RAISE EXCEPTION 'Required public.% table is missing; apply the project table schema first', tbl;
    END IF;
  END LOOP;
END $$;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS user_id text;

CREATE TABLE IF NOT EXISTS private.legacy_login_attempts (
  student_key text NOT NULL,
  client_ip text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_key, client_ip)
);
REVOKE ALL ON private.legacy_login_attempts FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.verify_legacy_student_login(
  p_student_id text,
  p_password text,
  p_client_ip text
)
RETURNS TABLE (
  id uuid, name text, nickname text, student_id text, phone text,
  dept_id integer, role text, "position" text, avatar text,
  avatar_color text, banned boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_attempts integer;
BEGIN
  INSERT INTO private.legacy_login_attempts (student_key, client_ip, attempts, attempted_at)
  VALUES (md5(coalesce(p_student_id, '')), coalesce(nullif(p_client_ip, ''), 'unknown'), 1, now())
  ON CONFLICT (student_key, client_ip) DO UPDATE
    SET attempts = CASE
          WHEN private.legacy_login_attempts.attempted_at < now() - interval '15 minutes' THEN 1
          ELSE private.legacy_login_attempts.attempts + 1
        END,
        attempted_at = now()
  RETURNING attempts INTO v_attempts;

  IF v_attempts > 10 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT u.id, u.name, u.nickname, u.student_id, u.phone, u.dept_id,
         u.role, u."position", u.avatar, u.avatar_color, u.banned
  FROM public.users AS u
  WHERE u.student_id = p_student_id
    AND u.password_hash = extensions.crypt(p_password, u.password_hash)
    AND u.banned IS NOT TRUE
  LIMIT 1;
END;
$$;
REVOKE ALL ON FUNCTION public.verify_legacy_student_login(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_legacy_student_login(text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION private.current_council_user_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.id
  FROM public.users AS u
  WHERE u.auth_user_id = (SELECT auth.uid())
    AND u.banned IS NOT TRUE
    AND u.must_change_password IS NOT TRUE
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION private.current_council_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.role
  FROM public.users AS u
  WHERE u.auth_user_id = (SELECT auth.uid())
    AND u.banned IS NOT TRUE
    AND u.must_change_password IS NOT TRUE
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION private.current_council_dept_id()
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.dept_id
  FROM public.users AS u
  WHERE u.auth_user_id = (SELECT auth.uid())
    AND u.banned IS NOT TRUE
    AND u.must_change_password IS NOT TRUE
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION private.current_council_nickname()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.nickname
  FROM public.users AS u
  WHERE u.auth_user_id = (SELECT auth.uid())
    AND u.banned IS NOT TRUE
    AND u.must_change_password IS NOT TRUE
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION private.is_council_leader()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(private.current_council_role() IN ('admin', 'president'), false)
$$;

CREATE OR REPLACE FUNCTION private.can_manage_department(p_dept_id integer)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    private.current_council_role() IN ('admin', 'president')
    OR private.current_council_dept_id() = p_dept_id,
    false
  )
$$;

CREATE OR REPLACE FUNCTION public.get_my_council_profile()
RETURNS TABLE (
  id uuid, name text, nickname text, student_id text, phone text,
  dept_id integer, role text, "position" text, avatar text,
  avatar_color text, banned boolean, must_change_password boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.id, u.name, u.nickname, u.student_id, u.phone, u.dept_id,
         u.role, u."position", u.avatar, u.avatar_color, u.banned, u.must_change_password
  FROM public.users AS u
  WHERE u.auth_user_id = (SELECT auth.uid())
    AND u.banned IS NOT TRUE
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.get_my_council_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_council_profile() TO authenticated;

-- Trusted check-in: the identity and timestamp come from the Auth session and
-- database clock. The browser cannot choose another user or suppress a fine.
CREATE OR REPLACE FUNCTION public.record_my_checkin(p_photo text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user public.users%ROWTYPE;
  v_now timestamp;
  v_date text;
  v_time text;
  v_day text;
  v_limit_minute integer := 35;
  v_is_late boolean;
  v_minutes_late integer := 0;
  v_amount integer := 0;
  v_attendance_id uuid;
  v_settings jsonb;
  v_start_date text;
  v_substitute_day text;
BEGIN
  SELECT * INTO v_user
  FROM public.users
  WHERE auth_user_id = (SELECT auth.uid()) AND banned IS NOT TRUE
    AND must_change_password IS NOT TRUE;
  IF v_user.id IS NULL THEN RAISE EXCEPTION 'ไม่พบบัญชีสมาชิก'; END IF;

  v_now := now() AT TIME ZONE 'Asia/Bangkok';
  v_date := to_char(v_now, 'YYYY-MM-DD');
  v_time := to_char(v_now, 'HH24:MI') || ' น.';
  v_day := CASE extract(isodow FROM v_now)::integer
    WHEN 1 THEN 'จันทร์' WHEN 2 THEN 'อังคาร' WHEN 3 THEN 'พุธ'
    WHEN 4 THEN 'พฤหัส' WHEN 5 THEN 'ศุกร์' WHEN 6 THEN 'เสาร์' ELSE 'อาทิตย์' END;

  SELECT substitute_day ->> 'replaceDay' INTO v_substitute_day
  FROM public.attendance_settings s,
    LATERAL jsonb_array_elements(coalesce(s.value, '[]'::jsonb)) substitute_day
  WHERE s.key = 'substitute_dates' AND substitute_day ->> 'date' = v_date
  LIMIT 1;
  IF v_substitute_day IS NOT NULL THEN v_day := v_substitute_day; END IF;

  SELECT value INTO v_settings FROM public.attendance_settings WHERE key = 'check_in_active';
  IF coalesce(v_settings #>> '{}', 'true') = 'false' THEN
    RAISE EXCEPTION 'ระบบเช็คชื่อถูกปิด';
  END IF;
  SELECT value INTO v_settings FROM public.attendance_settings WHERE key = 'enabled_days';
  IF v_settings IS NOT NULL AND NOT (v_settings @> jsonb_build_array(v_day)) THEN
    RAISE EXCEPTION 'วันนี้ไม่ได้เปิดให้เช็คชื่อ';
  END IF;
  SELECT value INTO v_settings FROM public.attendance_settings WHERE key = 'disabled_dates';
  IF coalesce(v_settings, '[]'::jsonb) @> jsonb_build_array(v_date) THEN
    RAISE EXCEPTION 'วันนี้ปิดเช็คชื่อ';
  END IF;
  SELECT value #>> '{}' INTO v_start_date FROM public.attendance_settings WHERE key = 'start_date';
  IF nullif(v_start_date, '') IS NOT NULL AND v_date < v_start_date THEN
    RAISE EXCEPTION 'ระบบเช็คชื่อยังไม่เริ่มเปิด';
  END IF;

  -- Resolve school-day substitutes before looking up the day's duty roster.
  IF EXISTS (
    SELECT 1 FROM public.schedules s
    WHERE s.type = 'greeting' AND s.day = v_day
      AND (
        coalesce(s.data, '{}'::jsonb) @> jsonb_build_object('gate1', jsonb_build_array(v_user.nickname))
        OR coalesce(s.data, '{}'::jsonb) @> jsonb_build_object('gate2', jsonb_build_array(v_user.nickname))
        OR coalesce(s.data, '{}'::jsonb) @> jsonb_build_object('gate3', jsonb_build_array(v_user.nickname))
      )
  ) THEN v_limit_minute := 0; END IF;

  v_is_late := (extract(hour FROM v_now)::integer > 7)
    OR (extract(hour FROM v_now)::integer = 7 AND extract(minute FROM v_now)::integer > v_limit_minute);
  IF v_is_late THEN
    v_minutes_late := ceil(extract(epoch FROM (v_now - date_trunc('day', v_now) - make_interval(hours => 7, mins => v_limit_minute))) / 60)::integer;
    v_amount := 5 * greatest(v_minutes_late, 0) * CASE WHEN v_user.dept_id = 2 THEN 2 ELSE 1 END;
  END IF;

  INSERT INTO public.student_attendance (user_id, user_name, nickname, date, time, status, photo, is_manual)
  VALUES (v_user.id::text, v_user.name, v_user.nickname, v_date, v_time,
          CASE WHEN v_is_late THEN 'late' ELSE 'on_time' END, p_photo, false)
  ON CONFLICT (user_id, date) DO NOTHING
  RETURNING id INTO v_attendance_id;
  IF v_attendance_id IS NULL THEN RAISE EXCEPTION 'วันนี้เช็คชื่อแล้ว'; END IF;

  IF v_is_late AND v_minutes_late > 0 THEN
    INSERT INTO public.discipline_fines
      (user_id, user_name, nickname, violation, amount, date, note, by, paid)
    SELECT v_user.id::text, v_user.name, v_user.nickname, 'มาสาย (นาที)', v_amount,
           v_date, 'มาสาย ' || v_minutes_late || ' นาที (เวลาเช็คชื่อ ' || v_time || ')', 'ระบบอัตโนมัติ', false
    WHERE NOT EXISTS (
      SELECT 1 FROM public.discipline_fines f
      WHERE f.user_id = v_user.id::text AND f.date = v_date AND f.violation = 'มาสาย (นาที)'
    );
  END IF;

  INSERT INTO public.notifications (type, user_id, message)
  VALUES (CASE WHEN v_is_late THEN 'fine' ELSE 'task' END, v_user.id::text,
          CASE WHEN v_is_late
            THEN '⚠️ คุณเช็คชื่อเข้าโรงเรียนสาย (' || v_minutes_late || ' นาที) เมื่อเวลา ' || v_time || ' ค่าปรับ ' || v_amount || ' บาท'
            ELSE '📍 คุณเช็คชื่อเข้าโรงเรียนเรียบร้อยแล้ว เมื่อเวลา ' || v_time END);

  RETURN jsonb_build_object('success', true, 'date', v_date, 'time', v_time,
                            'is_late', v_is_late, 'minutes_late', v_minutes_late, 'amount', v_amount);
END;
$$;
REVOKE ALL ON FUNCTION public.record_my_checkin(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_my_checkin(text) TO authenticated;

-- A member can view only their own fee-payment entry from the shared JSON map.
CREATE OR REPLACE FUNCTION public.get_my_finance_fees()
RETURNS TABLE (id uuid, title text, amount integer, date text, payments jsonb, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT f.id, f.title, f.amount, f.date,
         jsonb_build_object(u.id::text, f.payments -> u.id::text), f.created_at
  FROM public.finance_fees AS f
  CROSS JOIN public.users AS u
  WHERE u.auth_user_id = (SELECT auth.uid())
    AND u.banned IS NOT TRUE
    AND u.must_change_password IS NOT TRUE
  ORDER BY f.created_at DESC
$$;
REVOKE ALL ON FUNCTION public.get_my_finance_fees() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_finance_fees() TO authenticated;

-- Client-side slip checks are useful feedback only. Record a submission as
-- pending; finance/discipline staff must approve it before it counts as paid.
CREATE OR REPLACE FUNCTION public.submit_my_fine_payment(p_fine_id uuid, p_payment_slip text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_user_id uuid := private.current_council_user_id();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'ไม่พบบัญชีสมาชิก'; END IF;
  UPDATE public.discipline_fines
  SET payment_status = 'slip_uploaded', paid = false, payment_slip = p_payment_slip
  WHERE id = p_fine_id AND user_id = v_user_id::text AND paid IS NOT TRUE;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_my_fine_payments(p_fine_ids uuid[], p_payment_slip text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_user_id uuid := private.current_council_user_id();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'ไม่พบบัญชีสมาชิก'; END IF;
  UPDATE public.discipline_fines
  SET payment_status = 'slip_uploaded', paid = false, payment_slip = p_payment_slip
  WHERE id = ANY(p_fine_ids) AND user_id = v_user_id::text AND paid IS NOT TRUE;
  RETURN (SELECT count(*)::integer FROM public.discipline_fines
    WHERE id = ANY(p_fine_ids) AND user_id = v_user_id::text AND payment_status = 'slip_uploaded');
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_my_fee_payment(p_fee_id uuid, p_payment_slip text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_user_id uuid := private.current_council_user_id();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'ไม่พบบัญชีสมาชิก'; END IF;
  UPDATE public.finance_fees AS f
  SET payments = jsonb_set(
    coalesce(f.payments, '{}'::jsonb), ARRAY[v_user_id::text],
    jsonb_build_object('paid', false, 'status', 'slip_uploaded', 'slip', p_payment_slip, 'date', now()), true
  )
  WHERE f.id = p_fee_id
    AND coalesce(f.payments -> v_user_id::text ->> 'status', '') <> 'paid'
    AND coalesce(f.payments -> v_user_id::text ->> 'paid', 'false') <> 'true'
    AND coalesce(f.payments -> v_user_id::text, 'false'::jsonb) <> 'true'::jsonb;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_my_fine_payment(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_my_fine_payments(uuid[], text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_my_fee_payment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_my_fine_payment(uuid, text),
  public.submit_my_fine_payments(uuid[], text), public.submit_my_fee_payment(uuid, text) TO authenticated;
-- These legacy RPCs may not exist in databases that did not run schema.sql first.
DO $$
BEGIN
  IF to_regprocedure('public.login_student(text,text)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.login_student(text, text) FROM PUBLIC, anon, authenticated';
  END IF;
  IF to_regprocedure('public.set_user_password(uuid,text)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.set_user_password(uuid, text) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.set_user_password(uuid, text) TO service_role';
  END IF;
  IF to_regprocedure('public.record_checkin_and_fine(uuid,text,text,integer,text,text,boolean,integer)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.record_checkin_and_fine(uuid, text, text, integer, text, text, boolean, integer) FROM PUBLIC, anon, authenticated';
  END IF;
END $$;

-- Remove permissive policies from all existing public tables before rebuilding.
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
  END LOOP;
END $$;

DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;

-- Public directory has no student id, phone number, auth id, or password hash.
REVOKE SELECT ON public.users FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, name, nickname, dept_id, role, "position", avatar_color)
  ON public.users TO anon, authenticated;
GRANT SELECT ON public.departments, public.events, public.schedules TO anon, authenticated;
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['web_news', 'web_policies', 'web_videos', 'obec_line'] LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = tbl) THEN
      EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated', tbl);
    END IF;
  END LOOP;
END $$;

CREATE POLICY users_directory_read ON public.users FOR SELECT TO anon, authenticated USING (banned IS NOT TRUE);
CREATE POLICY users_self_update ON public.users FOR UPDATE TO authenticated
  USING (id = (SELECT private.current_council_user_id()))
  WITH CHECK (id = (SELECT private.current_council_user_id()));
REVOKE UPDATE ON public.users FROM authenticated;
GRANT UPDATE (name, nickname, phone, avatar) ON public.users TO authenticated;
CREATE OR REPLACE VIEW public.user_directory WITH (security_invoker = true) AS
  SELECT id, name, nickname, dept_id, role, "position", avatar_color
  FROM public.users
  WHERE banned IS NOT TRUE;
GRANT SELECT ON public.user_directory TO anon, authenticated;
REVOKE ALL ON FUNCTION private.current_council_user_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.current_council_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.current_council_dept_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.current_council_nickname() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_council_leader() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.can_manage_department(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.current_council_user_id(), private.current_council_role(),
  private.current_council_dept_id(), private.current_council_nickname(),
  private.is_council_leader(), private.can_manage_department(integer) TO authenticated;

-- Shared, non-personal content is readable by everyone; writes require a member role.
CREATE POLICY departments_read ON public.departments FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY events_read ON public.events FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY events_manage ON public.events FOR ALL TO authenticated
  USING (private.is_council_leader() OR private.can_manage_department(2))
  WITH CHECK (private.is_council_leader() OR private.can_manage_department(2));
CREATE POLICY schedules_read ON public.schedules FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY schedules_manage ON public.schedules FOR ALL TO authenticated
  USING (private.is_council_leader() OR private.can_manage_department(2)
    OR (type = 'pr_news' AND private.can_manage_department(5)))
  WITH CHECK (private.is_council_leader() OR private.can_manage_department(2)
    OR (type = 'pr_news' AND private.can_manage_department(5)));
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='web_news') THEN
    CREATE POLICY web_news_read ON public.web_news FOR SELECT TO anon, authenticated USING (true);
    CREATE POLICY web_news_manage ON public.web_news FOR ALL TO authenticated
      USING (private.is_council_leader() OR private.can_manage_department(5))
      WITH CHECK (private.is_council_leader() OR private.can_manage_department(5));
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='web_policies') THEN
    CREATE POLICY web_policies_read ON public.web_policies FOR SELECT TO anon, authenticated USING (true);
    CREATE POLICY web_policies_manage ON public.web_policies FOR ALL TO authenticated
      USING (private.is_council_leader()) WITH CHECK (private.is_council_leader());
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='web_videos') THEN
    CREATE POLICY web_videos_read ON public.web_videos FOR SELECT TO anon, authenticated USING (true);
    CREATE POLICY web_videos_manage ON public.web_videos FOR ALL TO authenticated
      USING (private.is_council_leader() OR private.can_manage_department(9))
      WITH CHECK (private.is_council_leader() OR private.can_manage_department(9));
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='obec_line') THEN
    CREATE POLICY obec_line_read ON public.obec_line FOR SELECT TO anon, authenticated USING (true);
    CREATE POLICY obec_line_manage ON public.obec_line FOR ALL TO authenticated
      USING (private.is_council_leader() OR private.can_manage_department(5) OR private.can_manage_department(9))
      WITH CHECK (private.is_council_leader() OR private.can_manage_department(5) OR private.can_manage_department(9));
  END IF;
END $$;

CREATE POLICY attendance_settings_read ON public.attendance_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY attendance_settings_manage ON public.attendance_settings FOR ALL TO authenticated
  USING (private.is_council_leader() OR private.can_manage_department(2))
  WITH CHECK (private.is_council_leader() OR private.can_manage_department(2));
CREATE POLICY duty_swaps_read ON public.duty_swaps FOR SELECT TO authenticated USING (true);
CREATE POLICY duty_swaps_manage ON public.duty_swaps FOR ALL TO authenticated
  USING (private.is_council_leader() OR private.can_manage_department(2) OR private.can_manage_department(5))
  WITH CHECK (private.is_council_leader() OR private.can_manage_department(2) OR private.can_manage_department(5));

-- Department-managed operational data. Unknown/unmapped tables remain denied by RLS.
DO $$
DECLARE x record;
BEGIN
  FOR x IN SELECT * FROM (VALUES
    ('finance_fees', 1), ('finance_fee_payments', 1),
    ('discipline_fines', 2), ('academic_projects', 3), ('academic_docs', 3),
    ('office_usage_log', 4), ('pr_news', 5),
    ('recreation_events', 6), ('secretary_meetings', 7), ('secretary_docs', 7),
    ('facilities_requests', 8), ('facilities_equipment', 8), ('av_tasks', 9),
    ('reception_guests', 10), ('reception_breaks', 10)
  ) AS t(tablename, dept_id)
  LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=x.tablename) THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (private.can_manage_department(%s)) WITH CHECK (private.can_manage_department(%s))',
        x.tablename || '_dept_access', x.tablename, x.dept_id, x.dept_id);
    END IF;
  END LOOP;
END $$;

-- Members may submit their own expense requests; finance staff review all requests.
CREATE POLICY finance_requests_read ON public.finance_requests FOR SELECT TO authenticated
  USING (requester = (SELECT private.current_council_nickname()) OR private.can_manage_department(1));
CREATE POLICY finance_requests_submit ON public.finance_requests FOR INSERT TO authenticated
  WITH CHECK (requester = (SELECT private.current_council_nickname())
    AND dept_id = (SELECT private.current_council_dept_id()) AND status = 'pending');
CREATE POLICY finance_requests_manage ON public.finance_requests FOR UPDATE TO authenticated
  USING (private.can_manage_department(1)) WITH CHECK (private.can_manage_department(1));
REVOKE UPDATE ON public.finance_requests FROM authenticated;
GRANT UPDATE (status, note, approved_by) ON public.finance_requests TO authenticated;

CREATE POLICY pr_caption_department_access ON public.pr_caption_queue FOR ALL TO authenticated
  USING (private.can_manage_department(5) OR private.can_manage_department(9))
  WITH CHECK (private.can_manage_department(5) OR private.can_manage_department(9));

-- Private student records are restricted to their owner and the responsible team.
CREATE POLICY attendance_self_or_admin ON public.student_attendance FOR SELECT TO authenticated
  USING (user_id = (SELECT private.current_council_user_id())::text OR private.can_manage_department(2));
CREATE POLICY attendance_admin_insert ON public.student_attendance FOR INSERT TO authenticated
  WITH CHECK (private.can_manage_department(2));
GRANT INSERT ON public.student_attendance TO authenticated;
CREATE POLICY attendance_admin_update ON public.student_attendance FOR UPDATE TO authenticated
  USING (private.can_manage_department(2)) WITH CHECK (private.can_manage_department(2));
CREATE POLICY attendance_admin_delete ON public.student_attendance FOR DELETE TO authenticated
  USING (private.can_manage_department(2));
CREATE POLICY fines_self_or_admin ON public.discipline_fines FOR SELECT TO authenticated
  USING (user_id = (SELECT private.current_council_user_id())::text OR private.can_manage_department(2)
    OR private.can_manage_department(1));
CREATE POLICY fines_department_write ON public.discipline_fines FOR ALL TO authenticated
  USING (private.can_manage_department(2) OR private.can_manage_department(1))
  WITH CHECK (private.can_manage_department(2) OR private.can_manage_department(1));

CREATE POLICY notifications_self_read ON public.notifications FOR SELECT TO authenticated
  USING (user_id = (SELECT private.current_council_user_id())::text OR private.is_council_leader());
CREATE POLICY notifications_self_update ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = (SELECT private.current_council_user_id())::text)
  WITH CHECK (user_id = (SELECT private.current_council_user_id())::text);
CREATE POLICY notifications_self_insert ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT private.current_council_user_id())::text OR private.is_council_leader()
    OR private.can_manage_department(2) OR private.can_manage_department(5) OR private.can_manage_department(9));

CREATE POLICY event_participants_read ON public.event_participants FOR SELECT TO authenticated
  USING (user_id = (SELECT private.current_council_user_id()) OR private.can_manage_department(2)
    OR private.is_council_leader());
CREATE POLICY event_participants_insert ON public.event_participants FOR INSERT TO authenticated
  WITH CHECK (private.is_council_leader() OR private.can_manage_department(2));
CREATE POLICY event_participants_delete ON public.event_participants FOR DELETE TO authenticated
  USING (user_id = (SELECT private.current_council_user_id()) OR private.can_manage_department(2)
    OR private.is_council_leader());

CREATE POLICY clean_duty_read ON public.clean_duty_checks FOR SELECT TO authenticated
  USING (nickname = (SELECT private.current_council_nickname()) OR private.can_manage_department(2));
CREATE POLICY clean_duty_write ON public.clean_duty_checks FOR ALL TO authenticated
  USING (nickname = (SELECT private.current_council_nickname()) OR private.can_manage_department(2))
  WITH CHECK (nickname = (SELECT private.current_council_nickname()) OR private.can_manage_department(2));
CREATE POLICY greeting_duty_read ON public.greeting_duty_checks FOR SELECT TO authenticated
  USING (nickname = (SELECT private.current_council_nickname()) OR private.can_manage_department(2));
CREATE POLICY greeting_duty_write ON public.greeting_duty_checks FOR ALL TO authenticated
  USING (nickname = (SELECT private.current_council_nickname()) OR private.can_manage_department(2))
  WITH CHECK (nickname = (SELECT private.current_council_nickname()) OR private.can_manage_department(2));

CREATE POLICY suggestions_admin_read ON public.suggestions FOR SELECT TO authenticated
  USING (private.is_council_leader());
CREATE POLICY suggestions_auth_insert ON public.suggestions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY suggestions_admin_manage ON public.suggestions FOR ALL TO authenticated
  USING (private.is_council_leader()) WITH CHECK (private.is_council_leader());

-- Members may submit PR story ideas; only the PR department can process others' submissions.
CREATE POLICY pr_news_submitter_read ON public.pr_news FOR SELECT TO authenticated
  USING (submitter = (SELECT private.current_council_nickname()));
CREATE POLICY pr_news_submitter_insert ON public.pr_news FOR INSERT TO authenticated
  WITH CHECK (submitter = (SELECT private.current_council_nickname())
    OR submitter = (SELECT private.current_council_user_id())::text);

-- Page-view updates happen only through the existing controlled RPC.
REVOKE ALL ON FUNCTION public.increment_page_view(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_page_view(text) TO anon, authenticated;
