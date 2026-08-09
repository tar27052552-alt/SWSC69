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

-- Secure RPC for recording attendance check-in and server-side tamper-proof fine computation
create or replace function public.record_checkin_and_fine(
  p_user_id uuid,
  p_user_name text,
  p_nickname text,
  p_dept_id integer,
  p_date text,
  p_time text,
  p_is_late boolean,
  p_minutes_late integer
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_base_rate integer := 5;
  v_final_amount integer := 0;
  v_note text;
  v_fine_id uuid;
begin
  if p_is_late and p_minutes_late > 0 then
    v_final_amount := v_base_rate * p_minutes_late;
    if p_dept_id = 2 then
      v_final_amount := v_final_amount * 2;
    end if;

    v_note := 'มาสาย ' || p_minutes_late || ' นาที (เวลาเช็คชื่อ ' || p_time || ')';
    if p_dept_id = 2 then
      v_note := v_note || ' - ปรับ 2 เท่าเนื่องจากเป็นสารวัตรนักเรียน';
    end if;

    -- Prevent duplicate fines for same user on same date & violation
    if not exists (
      select 1 from public.discipline_fines
      where user_id = p_user_id::text
        and date = p_date
        and violation = 'มาสาย (นาที)'
    ) then
      insert into public.discipline_fines (
        user_id, user_name, nickname, violation, amount, date, note, by, paid
      ) values (
        p_user_id::text, p_user_name, p_nickname, 'มาสาย (นาที)', v_final_amount, p_date, v_note, 'ระบบอัตโนมัติ', false
      );
    end if;
  end if;

  -- Create notification record
  insert into public.notifications (type, user_id, message)
  values (
    case when p_is_late then 'fine' else 'task' end,
    p_user_id::text,
    case when p_is_late
      then '⚠️ คุณเช็คชื่อเข้าโรงเรียนสาย (' || p_minutes_late || ' นาที) เมื่อเวลา ' || p_time || ' ค่าปรับ ' || v_final_amount || ' บาท'
      else '📍 คุณเช็คชื่อเข้าโรงเรียนเรียบร้อยแล้ว เมื่อเวลา ' || p_time
    end
  );

  return json_build_object(
    'success', true,
    'amount', v_final_amount,
    'is_late', p_is_late
  );
end;
$$;

grant execute on function public.record_checkin_and_fine(uuid, text, text, integer, text, text, boolean, integer) to anon, authenticated;

