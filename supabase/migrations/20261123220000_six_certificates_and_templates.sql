-- Support 6 certificates: 5 per-chapter certificates (civic-1..civic-5) + 1 combined course completion certificate (civic-all).
-- Also configure the 6 approved Google Slides template IDs and queue PDF regeneration / retroactive issuance.

alter table public.learning_editions
  add column if not exists course_template_path text,
  add column if not exists course_template_approved boolean not null default false;

alter table public.learning_certificates
  drop constraint if exists learning_certificates_subject_id_fkey;

alter table public.learning_certificates
  drop constraint if exists learning_certificates_subject_id_check;

alter table public.learning_certificates
  add constraint learning_certificates_subject_id_check
  check (subject_id in ('civic-1', 'civic-2', 'civic-3', 'civic-4', 'civic-5', 'civic-all'));

-- Configure the 6 new Google Slides certificate templates
update public.learning_subject_editions
set template_path = '1sRQXwOmYZFoag3s5ZMC0Q8LyBQ6euuQ3MGRloLjZr-0',
    template_approved = true,
    updated_at = now()
where edition_id = 'civic-dna-2026' and subject_id = 'civic-1';

update public.learning_subject_editions
set template_path = '1iZCcQL2N7lvWc7Eg4s-abS94zfXSHPLeMlllUIo0EO0',
    template_approved = true,
    updated_at = now()
where edition_id = 'civic-dna-2026' and subject_id = 'civic-2';

update public.learning_subject_editions
set template_path = '1SW06QmRhMthVywTxK5gqic3LG3WE7-e-C1jPaXCJPhU',
    template_approved = true,
    updated_at = now()
where edition_id = 'civic-dna-2026' and subject_id = 'civic-3';

update public.learning_subject_editions
set template_path = '1mDOYUeHHxnVa2nN8mtmui3ZjZicUw1-FrcR_PuBAXcM',
    template_approved = true,
    updated_at = now()
where edition_id = 'civic-dna-2026' and subject_id = 'civic-4';

update public.learning_subject_editions
set template_path = '1MiTllJOZWl-5vb0LTC8xWkTr-GpdGYyc-JDEoz6pkIg',
    template_approved = true,
    updated_at = now()
where edition_id = 'civic-dna-2026' and subject_id = 'civic-5';

update public.learning_editions
set course_template_path = '1qLThJkZy0U4Md50EdAq9eT2Ei-W2OZNJd_U1pnj8qRc',
    course_template_approved = true
where id = 'civic-dna-2026';

-- Issue per-chapter certificate (civic-1..civic-5) when passing >= 8/10 on that chapter,
-- and also issue the combined certificate (civic-all) once all 5 chapters are passed >= 8/10.
create or replace function public.issue_learning_v2_certificate(p_user_id uuid, p_subject_id text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
  v_id uuid;
  v_all_id uuid;
  v_all_passed boolean;
begin
  if not exists (
    select 1 from public.learning_editions
    where id = 'civic-dna-2026' and certificates_enabled
  ) then
    return null;
  end if;

  select coalesce(certificate_name, full_name) into v_name
  from public.learning_enrollments
  where user_id = p_user_id and edition_id = 'civic-dna-2026' and phone is not null
  for update;

  if v_name is null then
    raise exception 'Learner profile required';
  end if;

  update public.learning_enrollments
  set certificate_name = v_name
  where user_id = p_user_id and edition_id = 'civic-dna-2026' and certificate_name is null;

  -- 1. Issue chapter certificate if p_subject_id is civic-1..civic-5 and learner passed >= 8
  if p_subject_id in ('civic-1', 'civic-2', 'civic-3', 'civic-4', 'civic-5') and exists (
    select 1 from public.learning_attempts a
    where a.user_id = p_user_id
      and a.edition_id = 'civic-dna-2026'
      and a.subject_id = p_subject_id
      and a.phase = 'post'
      and a.score >= 8
  ) then
    insert into public.learning_certificates
      (user_id, edition_id, subject_id, certificate_number, recipient_name)
    values (
      p_user_id, 'civic-dna-2026', p_subject_id,
      'SWSC-DNA-' || (extract(year from timezone('Asia/Bangkok', now()))::integer + 543) || '-' ||
        lpad(nextval('public.learning_certificate_seq')::text, 6, '0'),
      v_name
    )
    on conflict (edition_id, user_id, subject_id) do nothing
    returning id into v_id;

    if v_id is not null then
      insert into public.learning_delivery_jobs(certificate_id) values (v_id);
    end if;
  end if;

  -- 2. Check if learner passed >= 8/10 on all 5 chapters; if so, issue combined certificate (civic-all)
  v_all_passed := (
    select count(*) = 5
    from public.learning_subject_editions s
    where s.edition_id = 'civic-dna-2026'
      and exists (
        select 1 from public.learning_attempts a
        where a.user_id = p_user_id
          and a.edition_id = s.edition_id
          and a.subject_id = s.subject_id
          and a.phase = 'post'
          and a.score >= 8
      )
  );

  if v_all_passed then
    insert into public.learning_certificates
      (user_id, edition_id, subject_id, certificate_number, recipient_name)
    values (
      p_user_id, 'civic-dna-2026', 'civic-all',
      'SWSC-DNA-' || (extract(year from timezone('Asia/Bangkok', now()))::integer + 543) || '-' ||
        lpad(nextval('public.learning_certificate_seq')::text, 6, '0'),
      v_name
    )
    on conflict (edition_id, user_id, subject_id) do nothing
    returning id into v_all_id;

    if v_all_id is not null then
      insert into public.learning_delivery_jobs(certificate_id) values (v_all_id);
    end if;
  end if;

  return coalesce(v_id, v_all_id);
end;
$$;
revoke all on function public.issue_learning_v2_certificate(uuid, text) from public, anon, authenticated;
grant execute on function public.issue_learning_v2_certificate(uuid, text) to service_role;

-- Require all 5 chapter templates + combined course template to be approved before activating certificates.
create or replace function public.activate_learning_v2_certificates()
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  v_count integer := 0;
  v_row record;
  v_id uuid;
begin
  if (select count(*) from public.learning_subject_editions
      where edition_id = 'civic-dna-2026' and template_approved
        and nullif(template_path, '') is not null) <> 5 then
    raise exception 'ต้องอนุมัติแบบเกียรติบัตรครบทั้ง 5 บทก่อน';
  end if;

  if not exists (
    select 1 from public.learning_editions
    where id = 'civic-dna-2026' and course_template_approved
      and nullif(course_template_path, '') is not null
  ) then
    raise exception 'ต้องอนุมัติแบบเกียรติบัตรรวมก่อน';
  end if;

  update public.learning_editions set certificates_enabled = true
  where id = 'civic-dna-2026' and published;
  if not found then raise exception 'Course not published'; end if;

  for v_row in
    select distinct a.user_id, a.subject_id
    from public.learning_attempts a
    join public.learning_enrollments e on e.user_id = a.user_id and e.edition_id = a.edition_id
    where a.edition_id = 'civic-dna-2026' and a.phase = 'post' and a.score >= 8
      and e.phone is not null
    order by a.user_id, a.subject_id
  loop
    v_id := public.issue_learning_v2_certificate(v_row.user_id, v_row.subject_id);
    if v_id is not null then v_count := v_count + 1; end if;
  end loop;

  return v_count;
end;
$$;
revoke all on function public.activate_learning_v2_certificates() from public, anon, authenticated;
grant execute on function public.activate_learning_v2_certificates() to service_role;

-- Update admin summary statistics to count all ready/pending certificates across all 6 certificate types.
create or replace function public.learning_admin_summary()
returns jsonb language sql stable security invoker set search_path = public as $$
  with enrolled as (
    select user_id from public.learning_enrollments where edition_id = 'civic-dna-2026'
  ), scores as (
    select user_id, subject_id,
      bool_or(phase = 'pre') as started,
      max(score) filter (where phase = 'post') as best_post
    from public.learning_attempts where edition_id = 'civic-dna-2026'
    group by user_id, subject_id
  ), totals as (
    select e.user_id, count(s.subject_id) filter (where s.started) as started_count,
      count(s.subject_id) filter (where s.best_post >= 6) as passed_count,
      count(s.subject_id) filter (where s.best_post >= 8) as eligible_count
    from enrolled e left join scores s on s.user_id = e.user_id group by e.user_id
  )
  select jsonb_build_object(
    'learners', (select count(*) from enrolled),
    'started', (select count(*) from totals where started_count > 0),
    'completed', (select count(*) from totals where passed_count = 5),
    'eligible', (select count(*) from totals where eligible_count = 5),
    'certificatesReady', (select count(*) from public.learning_certificates c
      where c.edition_id = 'civic-dna-2026' and nullif(c.pdf_path, '') is not null),
    'certificatesPending', (select count(*) from public.learning_certificates c
      where c.edition_id = 'civic-dna-2026' and nullif(c.pdf_path, '') is null),
    'subjects', coalesce((select jsonb_agg(jsonb_build_object(
      'id', se.subject_id, 'title', se.title, 'ordinal', se.ordinal,
      'started', (select count(*) from scores s join enrolled e on e.user_id = s.user_id
        where s.subject_id = se.subject_id and s.started),
      'passed', (select count(*) from scores s join enrolled e on e.user_id = s.user_id
        where s.subject_id = se.subject_id and s.best_post >= 6),
      'eligible', (select count(*) from scores s join enrolled e on e.user_id = s.user_id
        where s.subject_id = se.subject_id and s.best_post >= 8)
    ) order by se.ordinal) from public.learning_subject_editions se
      where se.edition_id = 'civic-dna-2026'), '[]'::jsonb)
  );
$$;
revoke all on function public.learning_admin_summary() from public, anon, authenticated;
grant execute on function public.learning_admin_summary() to service_role;

-- Retroactively regenerate existing civic-dna-2026 certificates with the new templates
-- and issue any missing chapter / combined certificates for learners who already passed >= 8/10.
do $$
declare
  v_cert record;
  v_row record;
begin
  -- 1. Queue PDF regeneration for any already-issued certificates in civic-dna-2026
  for v_cert in
    select id from public.learning_certificates
    where edition_id = 'civic-dna-2026'
    order by id
  loop
    update public.learning_certificates
    set pdf_path = null, email_status = 'pending'
    where id = v_cert.id;

    update public.learning_delivery_jobs
    set status = 'pending', available_at = now(), locked_until = null, last_error = null
    where certificate_id = v_cert.id and status in ('pending', 'processing', 'failed');

    if not found then
      insert into public.learning_delivery_jobs(certificate_id) values (v_cert.id);
    end if;
  end loop;

  -- 2. If certificates are already enabled, issue missing per-chapter & combined certificates now
  if exists (select 1 from public.learning_editions where id = 'civic-dna-2026' and certificates_enabled) then
    for v_row in
      select distinct a.user_id, a.subject_id
      from public.learning_attempts a
      join public.learning_enrollments e on e.user_id = a.user_id and e.edition_id = a.edition_id
      where a.edition_id = 'civic-dna-2026' and a.phase = 'post' and a.score >= 8
        and e.phone is not null
      order by a.user_id, a.subject_id
    loop
      perform public.issue_learning_v2_certificate(v_row.user_id, v_row.subject_id);
    end loop;
  end if;
end;
$$;
