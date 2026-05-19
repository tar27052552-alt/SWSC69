-- Supabase DB schema (custom users table)
-- Run in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  nickname text not null,
  student_id text not null unique,
  phone text,
  dept_id integer,
  role text not null default 'member',
  "position" text,
  avatar text,
  avatar_color text,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists users_student_id_idx on public.users (student_id);

-- Password helpers
create or replace function public.set_user_password(p_user_id uuid, p_password text)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  update public.users
  set password_hash = crypt(p_password, gen_salt('bf')),
      updated_at = now()
  where id = p_user_id;
$$;

create or replace function public.login_student(p_student_id text, p_password text)
returns table (
  id uuid,
  name text,
  nickname text,
  student_id text,
  phone text,
  dept_id integer,
  role text,
  "position" text,
  avatar text,
  avatar_color text
)
language sql
security definer
set search_path = public, extensions
as $$
  select
    u.id, u.name, u.nickname, u.student_id, u.phone, u.dept_id, u.role, u."position", u.avatar, u.avatar_color
  from public.users u
  where u.student_id = p_student_id
    and u.password_hash = crypt(p_password, u.password_hash)
  limit 1;
$$;

-- Minimal grants for REST/RPC
grant usage on schema public to anon, authenticated;
grant execute on function public.login_student(text, text) to anon, authenticated;
grant execute on function public.set_user_password(uuid, text) to anon, authenticated;

-- NOTE: For production, enable RLS + policies and avoid exposing write access to anon.
-- This repo currently keeps access simple for internal use.
