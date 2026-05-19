-- สร้างตารางเก็บตารางเวรต่างๆ (เริ่มต้นแบบไม่มีข้อมูล เพื่อให้ผู้ใช้สามารถเพิ่มรายชื่อใหม่เองทั้งหมดผ่านหน้าเว็บได้)
CREATE TABLE IF NOT EXISTS public.schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL, -- 'greeting', 'national_flag', 'color_flag', 'clean_room', 'pr_news'
  day text NOT NULL, -- 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์'
  data jsonb NOT NULL, -- เก็บรายละเอียดผู้รับผิดชอบเป็น JSON
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT schedules_type_day_unique UNIQUE (type, day)
);

GRANT ALL ON public.schedules TO anon, authenticated;
