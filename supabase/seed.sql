-- Optional seed data for public.users
-- Run after `supabase/schema.sql`

insert into public.users (name, nickname, student_id, phone, dept_id, role, position, avatar, avatar_color, password_hash)
values
  ('ผู้ดูแลระบบ', 'แอดมิน', '00000', '0800000000', null, 'admin', 'System Admin', 'A', '#333333', crypt('admin', gen_salt('bf'))),
  ('นายธีรภัทร วงศ์สุวรรณ', 'เบ็นซ์', '12345', '0812345678', null, 'president', 'ประธานสภานักเรียน', 'ธ', '#6366f1', crypt('admin123', gen_salt('bf')));

