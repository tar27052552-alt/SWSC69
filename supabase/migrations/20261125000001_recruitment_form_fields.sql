-- Add official application form fields to recruitment_members
-- Matches "ใบสมัคร คณะกรรมการนักเรียน ปีการศึกษา 2570"

alter table public.recruitment_members
  add column if not exists study_plan text not null default '' check (length(study_plan) <= 120),
  add column if not exists birth_date date,
  add column if not exists nationality text not null default 'ไทย' check (length(nationality) <= 60),
  add column if not exists religion text not null default 'พุทธ' check (length(religion) <= 60),
  add column if not exists experience text not null default '' check (length(experience) <= 2000),
  add column if not exists photo_path text;
