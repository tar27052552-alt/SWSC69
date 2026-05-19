-- 1. สร้างตารางฝ่ายการทำงาน (Departments)
CREATE TABLE IF NOT EXISTS public.departments (
  id integer PRIMARY KEY,
  name text NOT NULL,
  short text NOT NULL,
  color text,
  bg text
);

-- 2. อัปเดตตาราง Users (สมมติว่าสร้างไปแล้วใน schema.sql)
-- เพิ่ม Foreign Key ให้เชื่อมกับตาราง departments
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'users_dept_id_fkey'
    ) THEN
        ALTER TABLE public.users ADD CONSTRAINT users_dept_id_fkey FOREIGN KEY (dept_id) REFERENCES public.departments(id);
    END IF;
END $$;

-- 3. สร้างตาราง Events (ปฏิทินกิจกรรม)
CREATE TABLE IF NOT EXISTS public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  date date NOT NULL,
  type text NOT NULL,
  color text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. สร้างตาราง Notifications (การแจ้งเตือน)
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  message text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. อนุญาตให้อ่าน/เขียนข้อมูล
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
