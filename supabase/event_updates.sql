-- 1. เพิ่มคอลัมน์ในตาราง events เพื่อรองรับกิจกรรมหลายวันและหมวดหมู่สถานที่
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS end_date date;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS location_category text NOT NULL DEFAULT 'internal';

-- อัปเดตข้อมูลเก่าให้ end_date มีค่าเท่ากับ date (วันเริ่มต้น)
UPDATE public.events SET end_date = date WHERE end_date IS NULL;

-- 2. สร้างตารางเก็บข้อมูลผู้เข้าร่วมกิจกรรม (event_participants)
CREATE TABLE IF NOT EXISTS public.event_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_participants_unique UNIQUE (event_id, user_id)
);

-- 3. สร้างตารางเก็บข้อมูลการสลับเวรรายวัน (duty_swaps)
CREATE TABLE IF NOT EXISTS public.duty_swaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  duty_type text NOT NULL, -- เช่น 'greeting_gate1', 'greeting_gate2', 'greeting_gate3', 'national_flag', 'color_flag'
  original_nickname text NOT NULL,
  substitute_nickname text NOT NULL,
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT duty_swaps_unique UNIQUE (date, duty_type, original_nickname)
);

-- 4. มอบสิทธิ์การเข้าใช้งานตารางใหม่ให้ระบบและผู้ใช้
GRANT ALL ON public.event_participants TO anon, authenticated;
GRANT ALL ON public.duty_swaps TO anon, authenticated;
