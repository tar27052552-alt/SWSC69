create schema if not exists learning_private;
revoke all on schema learning_private from public, anon, authenticated;

create table public.learning_subjects (
  id text primary key,
  ordinal integer not null unique,
  title text not null,
  summary text not null default '',
  source_url text not null,
  sections jsonb not null default '[]'::jsonb,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table learning_private.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  subject_id text not null references public.learning_subjects(id) on delete cascade,
  phase text not null check (phase in ('pre', 'post')),
  ordinal integer not null,
  prompt text not null,
  options jsonb not null check (jsonb_typeof(options) = 'array'),
  correct_option integer not null check
    (correct_option >= 0 and correct_option < jsonb_array_length(options)),
  unique (subject_id, phase, ordinal)
);
revoke all on learning_private.quiz_questions from public, anon, authenticated;
grant usage on schema learning_private to service_role;
grant select on learning_private.quiz_questions to service_role;

create table public.learning_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.learning_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id text not null references public.learning_subjects(id),
  phase text not null check (phase in ('pre', 'post')),
  score integer not null check (score >= 0),
  total integer not null check (total > 0 and score <= total),
  passed boolean not null,
  submitted_at timestamptz not null default now()
);
create index learning_attempts_user_subject_idx
  on public.learning_attempts (user_id, subject_id, submitted_at desc);

create sequence public.learning_certificate_seq;
revoke all on sequence public.learning_certificate_seq from public, anon, authenticated;

create table public.learning_certificates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id text not null references public.learning_subjects(id),
  certificate_number text not null unique,
  recipient_name text not null,
  issued_at timestamptz not null default now(),
  pdf_path text,
  email_status text not null default 'pending'
    check (email_status in ('pending', 'ready', 'sent', 'failed')),
  emailed_at timestamptz,
  unique (user_id, subject_id)
);
create index learning_certificates_user_idx
  on public.learning_certificates (user_id, issued_at desc);

create table public.learning_delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  certificate_id uuid not null references public.learning_certificates(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'failed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  locked_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index learning_delivery_pending_idx
  on public.learning_delivery_jobs (available_at, created_at)
  where status in ('pending', 'failed');
create unique index learning_delivery_one_active_idx
  on public.learning_delivery_jobs (certificate_id)
  where status in ('pending', 'processing', 'failed');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('learning-certificates', 'learning-certificates', false, 10485760,
  array['application/pdf'])
on conflict (id) do nothing;

alter table public.learning_subjects enable row level security;
alter table public.learning_profiles enable row level security;
alter table public.learning_attempts enable row level security;
alter table public.learning_certificates enable row level security;
alter table public.learning_delivery_jobs enable row level security;

create policy learning_subjects_public_read on public.learning_subjects
  for select to anon, authenticated using (published);
create policy learning_profiles_owner_read on public.learning_profiles
  for select to authenticated using (user_id = auth.uid());
create policy learning_attempts_owner_read on public.learning_attempts
  for select to authenticated using (user_id = auth.uid());
create policy learning_certificates_owner_read on public.learning_certificates
  for select to authenticated using (user_id = auth.uid());

revoke all on public.learning_profiles, public.learning_attempts,
  public.learning_certificates, public.learning_delivery_jobs
  from public, anon, authenticated;
grant select on public.learning_profiles, public.learning_attempts,
  public.learning_certificates to authenticated;
grant select on public.learning_subjects to anon, authenticated;

create or replace function public.get_learning_question_bank(
  p_subject_id text,
  p_phase text
) returns jsonb
language sql
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'prompt', q.prompt,
      'options', q.options,
      'correctOption', q.correct_option
    ) order by q.ordinal
  ), '[]'::jsonb)
  from learning_private.quiz_questions q
  join public.learning_subjects s on s.id = q.subject_id
  where q.subject_id = p_subject_id
    and q.phase = p_phase
    and s.published;
$$;
revoke all on function public.get_learning_question_bank(text, text)
  from public, anon, authenticated;
grant execute on function public.get_learning_question_bank(text, text)
  to service_role;

create or replace function public.record_learning_result(
  p_user_id uuid,
  p_subject_id text,
  p_phase text,
  p_score integer,
  p_total integer
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_attempt_id uuid;
  v_certificate_id uuid;
  v_passed boolean;
begin
  if p_phase not in ('pre', 'post') or p_total <= 0
    or p_score < 0 or p_score > p_total then
    raise exception 'Invalid quiz result';
  end if;
  if not exists (
    select 1 from public.learning_subjects
    where id = p_subject_id and published
  ) then
    raise exception 'Subject is unavailable';
  end if;

  select full_name into v_name from public.learning_profiles
  where user_id = p_user_id;
  if v_name is null then raise exception 'Learner name is required'; end if;

  v_passed := p_phase = 'post' and p_score * 100 >= p_total * 80;
  insert into public.learning_attempts
    (user_id, subject_id, phase, score, total, passed)
  values (p_user_id, p_subject_id, p_phase, p_score, p_total, v_passed)
  returning id into v_attempt_id;

  if v_passed then
    insert into public.learning_certificates
      (user_id, subject_id, certificate_number, recipient_name)
    values (
      p_user_id,
      p_subject_id,
      'SWSC-DNA-' || (extract(year from timezone('Asia/Bangkok', now()))::integer + 543) || '-' ||
        lpad(nextval('public.learning_certificate_seq')::text, 6, '0'),
      v_name
    )
    on conflict (user_id, subject_id) do nothing
    returning id into v_certificate_id;

    if v_certificate_id is not null then
      insert into public.learning_delivery_jobs (certificate_id)
      values (v_certificate_id);
    else
      select id into v_certificate_id from public.learning_certificates
      where user_id = p_user_id and subject_id = p_subject_id;
    end if;
  end if;

  return jsonb_build_object(
    'attemptId', v_attempt_id,
    'passed', v_passed,
    'certificateId', v_certificate_id
  );
end;
$$;
revoke all on function public.record_learning_result(uuid, text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.record_learning_result(uuid, text, text, integer, integer)
  to service_role;

create or replace function public.claim_learning_delivery()
returns table (job_id uuid, certificate_id uuid, user_id uuid, subject_id text,
  recipient_name text, certificate_number text, issued_at timestamptz, pdf_path text)
language plpgsql security definer set search_path = ''
as $$
declare v_job uuid;
begin
  select j.id into v_job
  from public.learning_delivery_jobs j
  where (j.status in ('pending', 'failed') and j.available_at <= now())
    or (j.status = 'processing' and j.locked_until < now())
  order by j.created_at
  for update skip locked limit 1;
  if v_job is null then return; end if;
  update public.learning_delivery_jobs
  set status = 'processing', attempts = attempts + 1,
    locked_until = now() + interval '5 minutes'
  where id = v_job;
  return query
    select v_job, c.id, c.user_id, c.subject_id, c.recipient_name,
      c.certificate_number, c.issued_at, c.pdf_path
    from public.learning_delivery_jobs j
    join public.learning_certificates c on c.id = j.certificate_id
    where j.id = v_job;
end;
$$;
revoke all on function public.claim_learning_delivery() from public, anon, authenticated;
grant execute on function public.claim_learning_delivery() to service_role;

create or replace function public.import_learning_subject(
  p_subject_id text, p_title text, p_summary text,
  p_sections jsonb, p_quiz jsonb
) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_phase text; v_item jsonb; v_ordinal integer;
begin
  if jsonb_typeof(p_sections) <> 'array' or
    jsonb_array_length(p_sections) = 0 then raise exception 'Missing sections'; end if;
  update public.learning_subjects set title = p_title, summary = p_summary,
    sections = p_sections, published = false, updated_at = now()
  where id = p_subject_id;
  if not found then raise exception 'Unknown subject'; end if;
  delete from learning_private.quiz_questions where subject_id = p_subject_id;
  if jsonb_typeof(p_quiz) <> 'array' or jsonb_array_length(p_quiz) = 0 then
    raise exception 'Missing questions';
  end if;
  foreach v_phase in array array['pre', 'post'] loop
    v_ordinal := 0;
    for v_item in select value from jsonb_array_elements(p_quiz) loop
      v_ordinal := v_ordinal + 1;
      insert into learning_private.quiz_questions
        (subject_id, phase, ordinal, prompt, options, correct_option)
      values (p_subject_id, v_phase, v_ordinal, v_item->>'prompt',
        v_item->'options', (v_item->>'correctOption')::integer);
    end loop;
  end loop;
end;
$$;
revoke all on function public.import_learning_subject(text, text, text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.import_learning_subject(text, text, text, jsonb, jsonb)
  to service_role;

create or replace function public.correct_learning_certificate_name(
  p_certificate_id uuid, p_full_name text
) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_user_id uuid; v_name text := trim(regexp_replace(p_full_name, '\s+', ' ', 'g'));
begin
  if not exists (select 1 from public.users u where u.auth_user_id = auth.uid()
    and u.role = 'admin' and u.banned is not true) then
    raise exception 'Admin access required';
  end if;
  if char_length(v_name) not between 2 and 120 then raise exception 'Invalid name'; end if;
  select user_id into v_user_id from public.learning_certificates
  where id = p_certificate_id for update;
  if v_user_id is null then raise exception 'Certificate not found'; end if;
  if exists (select 1 from public.learning_delivery_jobs where certificate_id = p_certificate_id
    and status in ('pending', 'processing')) then
    raise exception 'Wait for current delivery to finish';
  end if;
  update public.learning_profiles set full_name = v_name, updated_at = now()
  where user_id = v_user_id;
  update public.learning_certificates set recipient_name = v_name,
    pdf_path = null, email_status = 'pending', emailed_at = null
  where id = p_certificate_id;
  update public.learning_delivery_jobs set status = 'pending', available_at = now(),
    last_error = null where certificate_id = p_certificate_id and status = 'failed';
  if not found then
    insert into public.learning_delivery_jobs (certificate_id)
    values (p_certificate_id);
  end if;
end;
$$;
revoke all on function public.correct_learning_certificate_name(uuid, text)
  from public, anon, authenticated;
grant execute on function public.correct_learning_certificate_name(uuid, text)
  to authenticated;

insert into public.learning_subjects (id, ordinal, title, source_url) values
('civic-1', 1, 'การปกครองระบอบประชาธิปไตยอันมีพระมหากษัตริย์ทรงเป็นประมุข',
 'https://sites.google.com/sappha.ac.th/swscstudentcouncil/แนะนำวิชาที่-1'),
('civic-2', 2, 'การเป็นพลเมืองคุณภาพ',
 'https://sites.google.com/sappha.ac.th/swscstudentcouncil/แนะนำวิชาที่-2'),
('civic-3', 3, 'การมีส่วนร่วมทางการเมืองของพลเมือง',
 'https://sites.google.com/sappha.ac.th/swscstudentcouncil/แนะนำวิชาที่-3'),
('civic-4', 4, 'การขับเคลื่อนศูนย์ส่งเสริมพัฒนาประชาธิปไตย (ศส.ปชต.)',
 'https://sites.google.com/sappha.ac.th/swscstudentcouncil/แนะนำวิชาที่-4'),
('civic-5', 5, 'ฝึกปฏิบัติ ศส.ปชต. สู่ กปน.มืออาชีพ',
 'https://sites.google.com/sappha.ac.th/swscstudentcouncil/แนะนำวิชาที่-5');
