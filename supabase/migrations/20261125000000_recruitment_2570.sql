-- Student Council Recruitment System (Academic Year 2570)
-- References: ระเบียบโรงเรียนสรรพวิทยาคมว่าด้วยสภานักเรียนฯ พ.ศ.2561 (ฉบับแก้ไข พ.ศ.2569) ข้อ 19-22, 36-37, 66
-- Target: 29 members per party (1 president + 28 committee members), @sappha.ac.th Google OAuth, private document bucket.

create table if not exists public.recruitment_settings (
  academic_year integer primary key check (academic_year between 2569 and 2650),
  is_open boolean not null default true,
  target_member_count integer not null default 29 check (target_member_count between 1 and 50),
  min_gpax numeric(3,2) not null default 3.00 check (min_gpax between 0.00 and 4.00),
  allowed_email_domain text not null default 'sappha.ac.th',
  max_per_special_room integer check (max_per_special_room is null or max_per_special_room >= 1),
  max_per_classroom integer check (max_per_classroom is null or max_per_classroom >= 1),
  deadline_at timestamptz,
  publish_approved_parties boolean not null default false,
  consent_template_url text not null default '',
  announcement_note text not null default '',
  timeline jsonb not null default '[
    {"step": 1, "title": "ประชาสัมพันธ์และรวมกลุ่มจัดตั้งพรรค (ม.4)", "dateRange": "ธันวาคม 2569", "description": "นักเรียนชั้น ม.4 ที่มีอุดมการณ์ร่วมกันรวมกลุ่มจัดตั้งพรรคครบ 29 คน ตามโครงสร้าง 16 ตำแหน่ง"},
    {"step": 2, "title": "เปิดรับสมัครและยื่นเอกสารผ่านระบบออนไลน์", "dateRange": "มกราคม 2570", "description": "ล็อกอินด้วยอีเมล @sappha.ac.th กรอกข้อมูลพรรคและแนบเอกสาร 3 รายการครบทุกคน"},
    {"step": 3, "title": "ตรวจสอบคุณสมบัติและประกาศรายชื่อพรรคผู้สมัคร", "dateRange": "มกราคม 2570", "description": "คณะกรรมการการเลือกตั้ง (กกต.) ตรวจสอบเอกสารและรับรองคุณสมบัติตามระเบียบข้อ 21-22"},
    {"step": 4, "title": "จับฉลากหมายเลขพรรค หาเสียง และดีเบตนโยบาย", "dateRange": "มกราคม – กุมภาพันธ์ 2570", "description": "จับฉลากหมายเลขพรรคบริเวณหน้าเสาธง ชี้แจงกติกาหาเสียง และจัดเวทีดีเบตระหว่างพรรค"},
    {"step": 5, "title": "วันเลือกตั้งคณะกรรมการสภานักเรียน ปี 2570", "dateRange": "กุมภาพันธ์ 2570 (09.00 – 15.30 น.)", "description": "นักเรียนโรงเรียนสรรพวิทยาคมทุกคนใช้สิทธิเลือกตั้ง 1 คน 1 เสียง และประกาศผลอย่างเป็นทางการ"}
  ]'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.recruitment_settings (academic_year)
values (2570)
on conflict (academic_year) do nothing;

create table if not exists public.recruitment_parties (
  id uuid primary key default gen_random_uuid(),
  academic_year integer not null default 2570 references public.recruitment_settings(academic_year) on delete restrict,
  party_name text not null check (length(trim(party_name)) between 1 and 160),
  slogan text not null default '' check (length(slogan) <= 300),
  ideology text not null default '' check (length(ideology) <= 2000),
  policies jsonb not null default '[]'::jsonb,
  invite_code text not null unique check (length(trim(invite_code)) between 6 and 20),
  leader_auth_user_id uuid not null,
  leader_email text not null check (lower(leader_email) like '%@sappha.ac.th'),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'revision_requested', 'approved', 'rejected')),
  review_note text not null default '' check (length(review_note) <= 2000),
  party_number integer check (party_number is null or party_number >= 1),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recruitment_parties_year_status_idx
  on public.recruitment_parties(academic_year, status, created_at desc);

create table if not exists public.recruitment_members (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.recruitment_parties(id) on delete cascade,
  academic_year integer not null default 2570 references public.recruitment_settings(academic_year) on delete restrict,
  auth_user_id uuid,
  email text not null check (lower(email) like '%@sappha.ac.th'),
  student_id text not null default '' check (length(student_id) <= 20),
  prefix text not null default 'นาย' check (prefix in ('นาย', 'นางสาว', 'เด็กชาย', 'เด็กหญิง')),
  full_name text not null default '' check (length(full_name) <= 160),
  nickname text not null default '' check (length(nickname) <= 60),
  classroom text not null default '' check (length(classroom) <= 20),
  is_special_room boolean not null default false,
  special_room_or_club text not null default '' check (length(special_room_or_club) <= 120),
  gpax numeric(3,2) check (gpax is null or (gpax between 0.00 and 4.00)),
  phone text not null default '' check (length(phone) <= 30),
  position_key text not null check (length(trim(position_key)) between 1 and 60),
  position_label text not null check (length(trim(position_label)) between 1 and 160),
  is_leader boolean not null default false,
  doc_grade_path text,
  doc_conduct_path text,
  doc_consent_path text,
  doc_grade_status text not null default 'pending' check (doc_grade_status in ('pending', 'approved', 'revision_requested')),
  doc_conduct_status text not null default 'pending' check (doc_conduct_status in ('pending', 'approved', 'revision_requested')),
  doc_consent_status text not null default 'pending' check (doc_consent_status in ('pending', 'approved', 'revision_requested')),
  member_status text not null default 'pending' check (member_status in ('pending', 'approved', 'revision_requested')),
  review_note text not null default '' check (length(review_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enforce 1 school email = 1 party per academic year
create unique index if not exists recruitment_members_year_email_uidx
  on public.recruitment_members(academic_year, lower(email));

-- Enforce 1 auth user = 1 party per academic year (when linked)
create unique index if not exists recruitment_members_year_auth_uidx
  on public.recruitment_members(academic_year, auth_user_id)
  where auth_user_id is not null;

-- Enforce 1 student_id = 1 party per academic year (when provided)
create unique index if not exists recruitment_members_year_student_id_uidx
  on public.recruitment_members(academic_year, trim(student_id))
  where length(trim(student_id)) > 0;

create index if not exists recruitment_members_party_idx
  on public.recruitment_members(party_id, is_leader desc, created_at asc);

alter table public.recruitment_settings enable row level security;
alter table public.recruitment_parties enable row level security;
alter table public.recruitment_members enable row level security;

grant select on public.recruitment_settings to anon, authenticated;
grant all on public.recruitment_settings, public.recruitment_parties, public.recruitment_members to service_role;

-- Public can read settings (timeline, open status, quotas); admins can manage directly if needed
drop policy if exists recruitment_settings_public on public.recruitment_settings;
create policy recruitment_settings_public on public.recruitment_settings
  for select to anon, authenticated using (true);

drop policy if exists recruitment_settings_admin on public.recruitment_settings;
create policy recruitment_settings_admin on public.recruitment_settings
  for all to authenticated
  using ((select private.current_council_role()) = 'admin')
  with check ((select private.current_council_role()) = 'admin');

-- Parties and members are accessed through the recruitment Edge Function (service_role)
-- and admins can also read/manage directly via RLS.
drop policy if exists recruitment_parties_admin on public.recruitment_parties;
create policy recruitment_parties_admin on public.recruitment_parties
  for all to authenticated
  using ((select private.current_council_role()) = 'admin')
  with check ((select private.current_council_role()) = 'admin');

drop policy if exists recruitment_members_admin on public.recruitment_members;
create policy recruitment_members_admin on public.recruitment_members
  for all to authenticated
  using ((select private.current_council_role()) = 'admin')
  with check ((select private.current_council_role()) = 'admin');

-- Private storage bucket for student recruitment documents (grade transcript, conduct proof, parental consent)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recruitment-docs',
  'recruitment-docs',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
  set public = false,
      file_size_limit = 10485760,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

-- Only service_role (Edge Function signed URLs) and council admins may access objects in recruitment-docs
drop policy if exists recruitment_docs_admin on storage.objects;
create policy recruitment_docs_admin on storage.objects
  for all to authenticated
  using (bucket_id = 'recruitment-docs' and (select private.current_council_role()) = 'admin')
  with check (bucket_id = 'recruitment-docs' and (select private.current_council_role()) = 'admin');
