-- 1. เพิ่มคอลัมน์สำหรับการเช็คชื่อในกิจกรรมและกำหนดเวลาเช็คชื่อ
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS check_attendance BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS attendance_start_time TEXT NOT NULL DEFAULT '07:00';
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS attendance_limit_time TEXT NOT NULL DEFAULT '08:00';
