-- ============================================================================
-- สคริปต์ฐานข้อมูลรวมสำหรับทุกฝ่าย (Student Council Portal Database Schema)
-- สำหรับสร้างตารางเปล่าใน Supabase เพื่อเชื่อมระบบจริง (ไม่มีการใส่ข้อมูลสุ่ม/ตัวอย่าง)
-- ============================================================================

-- ล้างตารางเก่าเพื่อเริ่มต้นใหม่ (ถ้ามี)
DROP TABLE IF EXISTS public.finance_requests;
DROP TABLE IF EXISTS public.finance_fees;
DROP TABLE IF EXISTS public.discipline_fines;
DROP TABLE IF EXISTS public.student_attendance;
DROP TABLE IF EXISTS public.clean_duty_checks;
DROP TABLE IF EXISTS public.attendance_settings;
DROP TABLE IF EXISTS public.academic_projects;
DROP TABLE IF EXISTS public.academic_docs;
DROP TABLE IF EXISTS public.office_usage_log;
DROP TABLE IF EXISTS public.pr_caption_queue;
DROP TABLE IF EXISTS public.pr_news;
DROP TABLE IF EXISTS public.recreation_events;
DROP TABLE IF EXISTS public.secretary_meetings;
DROP TABLE IF EXISTS public.secretary_docs;
DROP TABLE IF EXISTS public.facilities_requests;
DROP TABLE IF EXISTS public.facilities_equipment;
DROP TABLE IF EXISTS public.reception_guests;
DROP TABLE IF EXISTS public.reception_breaks;
DROP TABLE IF EXISTS public.av_tasks;

-- ----------------------------------------------------------------------------
-- 1. ฝ่ายการเงินและพัสดุ (Finance)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL,
  amount integer NOT NULL,
  requester text NOT NULL,
  dept_id integer NOT NULL,
  date text NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  note text NOT NULL DEFAULT '',
  approved_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.finance_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  amount integer NOT NULL,
  date text NOT NULL,
  payments jsonb NOT NULL DEFAULT '{}', -- เก็บข้อมูล { "user_uuid_string": true }
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 2. ฝ่ายปกครอง (Discipline)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.discipline_fines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL, -- เก็บ id ของสมาชิกสภา
  user_name text NOT NULL,
  nickname text NOT NULL,
  violation text NOT NULL,
  amount integer NOT NULL,
  date text NOT NULL,
  note text NOT NULL DEFAULT '',
  by text NOT NULL, -- บันทึกโดยใคร
  paid boolean NOT NULL DEFAULT false,
  payment_status text NOT NULL DEFAULT 'unpaid', -- 'unpaid', 'slip_uploaded', 'paid'
  payment_slip text, -- base64 หรือ url ของสลิปการโอนเงิน
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Migration: เพิ่มคอลัมน์ payment_status และ payment_slip (สำหรับตารางที่มีอยู่แล้ว)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='discipline_fines' AND column_name='payment_status') THEN
    ALTER TABLE public.discipline_fines ADD COLUMN payment_status text NOT NULL DEFAULT 'unpaid';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='discipline_fines' AND column_name='payment_slip') THEN
    ALTER TABLE public.discipline_fines ADD COLUMN payment_slip text;
  END IF;
END $$;
-- อัปเดตสถานะเก่าให้สอดคล้อง
UPDATE public.discipline_fines SET payment_status = 'paid' WHERE paid = true AND payment_status = 'unpaid';

-- ----------------------------------------------------------------------------
-- 3. ฝ่ายวิชาการ (Academic)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.academic_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL,
  owner text NOT NULL,
  budget integer NOT NULL DEFAULT 0,
  due_date text NOT NULL,
  status text NOT NULL DEFAULT 'planning', -- 'planning', 'in_progress', 'review', 'done', 'cancelled'
  description text NOT NULL DEFAULT '', -- เปลี่ยนชื่อจาก desc เป็น description เพื่อหลีกเลี่ยง reserved word ใน SQL
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.academic_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  type text NOT NULL, -- 'PDF', 'DOCX', 'XLSX'
  uploaded_by text NOT NULL,
  date text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 4. สนง.กรรมการ (Office)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.office_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date text NOT NULL,
  time text NOT NULL,
  by text NOT NULL,
  purpose text NOT NULL,
  clean boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 5. ฝ่ายประชาสัมพันธ์ (PR)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pr_caption_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  type text NOT NULL,
  platform text NOT NULL,
  due_date text NOT NULL,
  caption text NOT NULL DEFAULT '',
  song text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending', -- 'pending', 'done'
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pr_news (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  for_day text NOT NULL,
  for_date text NOT NULL,
  submitter text NOT NULL,
  category text NOT NULL,
  headline text NOT NULL,
  detail text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  submitted_at text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 6. ฝ่ายนันทนาการ (Recreation)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recreation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  date text NOT NULL,
  host text NOT NULL,
  games jsonb NOT NULL DEFAULT '[]', -- เก็บอาร์เรย์รายชื่อเกม ["เกม1", "เกม2"]
  status text NOT NULL DEFAULT 'planning', -- 'planning', 'upcoming', 'done'
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 7. ฝ่ายเลขานุการ (Secretary)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.secretary_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  date text NOT NULL,
  time text NOT NULL,
  location text NOT NULL,
  attendees jsonb NOT NULL DEFAULT '[]', -- รายชื่อผู้เข้าร่วม ["ชื่อ1", "ชื่อ2"]
  absent jsonb NOT NULL DEFAULT '[]', -- รายชื่อคนขาด ["ชื่อ1"]
  agenda jsonb NOT NULL DEFAULT '[]', -- หัวข้อวาระ ["วาระ1", "วาระ2"]
  resolutions jsonb NOT NULL DEFAULT '[]', -- มติประชุม ["มติ1"]
  status text NOT NULL DEFAULT 'upcoming', -- 'upcoming', 'done'
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.secretary_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  type text NOT NULL,
  size text NOT NULL,
  uploaded_by text NOT NULL,
  date text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 8. ฝ่ายอาคารสถานที่ (Facilities)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.facilities_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  requester text NOT NULL,
  event_date text NOT NULL,
  time text NOT NULL,
  chairs integer NOT NULL DEFAULT 0,
  tables integer NOT NULL DEFAULT 0,
  other text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending', -- 'pending', 'approved'
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.facilities_equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  total integer NOT NULL,
  available integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 9. ฝ่ายปฏิคม (Reception)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reception_guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  role text NOT NULL,
  org text NOT NULL,
  event text NOT NULL,
  date text NOT NULL,
  gift boolean NOT NULL DEFAULT false,
  meal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.reception_breaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event text NOT NULL,
  date text NOT NULL,
  items jsonb NOT NULL DEFAULT '[]', -- [{ "name": "...", "qty": 10 }]
  budget integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'upcoming', -- 'upcoming', 'done'
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 10. ฝ่ายโสตทัศนศึกษา (AV)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.av_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  type text NOT NULL,
  platform text NOT NULL,
  priority text NOT NULL,
  assignee text NOT NULL,
  due_date text NOT NULL,
  status text NOT NULL DEFAULT 'backlog', -- 'backlog', 'designing', 'review', 'wait_pr', 'done'
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 11. ตารางการเช็คชื่อเข้าโรงเรียน (Student Attendance)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  user_name text NOT NULL,
  nickname text NOT NULL,
  date text NOT NULL, -- 'YYYY-MM-DD'
  time text NOT NULL, -- '07:25 น.'
  status text NOT NULL, -- 'on_time', 'late', 'leave', 'missing'
  photo text, -- base64 หรือ url
  is_manual boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_attendance_user_date_unique UNIQUE (user_id, date)
);


-- ----------------------------------------------------------------------------
-- 12. ตารางบันทึกเวรทำความสะอาดห้องสภา (Clean Duty Checks)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clean_duty_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nickname text NOT NULL,
  date text NOT NULL, -- 'YYYY-MM-DD'
  status text NOT NULL, -- 'done', 'missing'
  photo text, -- base64 หรือ url
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clean_duty_checks_nickname_date_unique UNIQUE (nickname, date)
);

-- ----------------------------------------------------------------------------
-- 13. ตารางการตั้งค่าวันเช็คชื่อ (Attendance Settings)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.attendance_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- เมล็ดพันธุ์ตั้งค่าเริ่มต้น (Default Configuration Seed)
INSERT INTO public.attendance_settings (key, value) VALUES
('enabled_days', '["จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์"]'::jsonb),
('disabled_dates', '[]'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- ============================================================================
-- ตั้งค่าสิทธิ์การเข้าถึง (Grants) สำหรับตารางทั้งหมด
-- ============================================================================
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
