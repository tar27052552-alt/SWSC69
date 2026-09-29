-- Ensure the profile RPC only returns the caller's current council profile.
CREATE OR REPLACE FUNCTION public.get_my_council_profile()
RETURNS TABLE (
  id uuid, name text, nickname text, student_id text, phone text,
  dept_id integer, role text, "position" text, avatar text,
  avatar_color text, banned boolean, must_change_password boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT u.id, u.name, u.nickname, u.student_id, u.phone, u.dept_id,
         u.role, u."position", u.avatar, u.avatar_color, u.banned, u.must_change_password
  FROM public.users AS u
  WHERE u.auth_user_id = (SELECT auth.uid())
    AND u.banned IS NOT TRUE
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.get_my_council_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_council_profile() TO authenticated;
