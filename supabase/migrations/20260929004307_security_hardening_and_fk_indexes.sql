-- The application uses complete-password-migration instead of this legacy RPC.
-- It verifies caller-supplied student credentials and permits four-character
-- passwords, so it must not remain callable through the public Data API.
REVOKE EXECUTE ON FUNCTION public.change_student_password(text, text, text)
  FROM PUBLIC, anon, authenticated;

-- Pin the search path and schema-qualify the table used by this public counter.
CREATE OR REPLACE FUNCTION public.increment_page_view(page_path text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF page_path IS NULL OR page_path NOT IN (
    '/', '/login', '/dashboard', '/suggestions', '/schedules', '/calendar',
    '/checkin', '/clean-duty', '/greeting-duty', '/my-attendance', '/profile',
    '/settings', '/submit-news', '/admin', '/admin-announcements',
    '/admin-videos', '/admin-policies', '/discipline', '/my-fines', '/finance',
    '/pr', '/av', '/secretary', '/academic', '/office', '/recreation',
    '/facilities', '/reception'
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.page_views AS existing (path, view_count)
  VALUES (page_path, 1)
  ON CONFLICT (path) DO UPDATE
  SET view_count = existing.view_count + 1,
      updated_at = pg_catalog.now();
END;
$function$;

-- The aggregate helper is invoker-rights; pin its search path as well.
CREATE OR REPLACE FUNCTION public.get_total_views()
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = ''
AS $function$
  SELECT COALESCE(SUM(view_count), 0)::integer
  FROM public.page_views;
$function$;

CREATE INDEX IF NOT EXISTS event_participants_user_id_idx
  ON public.event_participants (user_id);

CREATE INDEX IF NOT EXISTS user_face_descriptors_user_id_idx
  ON public.user_face_descriptors (user_id);

CREATE INDEX IF NOT EXISTS users_dept_id_idx
  ON public.users (dept_id);
