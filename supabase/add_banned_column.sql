-- 1. เพิ่มคอลัมน์ banned ในตาราง users หากยังไม่มี
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS banned boolean NOT NULL DEFAULT false;

-- 2. ลบฟังก์ชันเดิมที่มีลักษณะการ Return แบบเก่าก่อน (เนื่องจาก Postgres ไม่อนุญาตให้เปลี่ยนโครงสร้างแถวที่คืนค่าด้วย CREATE OR REPLACE)
DROP FUNCTION IF EXISTS public.login_student(text, text);

-- 3. สร้างฟังก์ชันใหม่ที่เพิ่มคอลัมน์ banned ในตารางที่ Return
CREATE OR REPLACE FUNCTION public.login_student(p_student_id text, p_password text)
RETURNS TABLE (
  id uuid,
  name text,
  nickname text,
  student_id text,
  phone text,
  dept_id integer,
  role text,
  "position" text,
  avatar text,
  avatar_color text,
  banned boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    u.id, u.name, u.nickname, u.student_id, u.phone, u.dept_id, u.role, u."position", u.avatar, u.avatar_color, u.banned
  FROM public.users u
  WHERE u.student_id = p_student_id
    AND u.password_hash = crypt(p_password, u.password_hash)
  LIMIT 1;
$$;

-- 4. มอบสิทธิ์ให้เว็บแอป (anon) สามารถเรียกใช้งาน RPC ฟังก์ชันนี้ได้อีกครั้ง (สำคัญมาก!)
GRANT EXECUTE ON FUNCTION public.login_student(text, text) TO anon, authenticated;
