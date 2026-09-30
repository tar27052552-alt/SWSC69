alter table public.learning_enrollments
  add column phone text check (phone ~ '^0[689][0-9]{8}$'),
  add column certificate_name text,
  add column reissue_used_at timestamptz;
update public.learning_enrollments e set certificate_name = (
  select c.recipient_name from public.learning_certificates c
  where c.user_id = e.user_id and c.edition_id = e.edition_id
  order by c.issued_at, c.id limit 1
)
where e.edition_id = 'civic-dna-2026' and e.certificate_name is null
  and exists (select 1 from public.learning_certificates c
    where c.user_id = e.user_id and c.edition_id = e.edition_id);

create table public.learning_certificate_name_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  edition_id text not null references public.learning_editions(id),
  requested_name text not null check (char_length(trim(requested_name)) between 2 and 120),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid,
  admin_note text
);
create unique index learning_name_one_pending on public.learning_certificate_name_requests(user_id)
  where status = 'pending';
create index learning_name_pending_idx on public.learning_certificate_name_requests(edition_id, created_at)
  where status = 'pending';
alter table public.learning_certificate_name_requests enable row level security;
create policy learning_name_owner_read on public.learning_certificate_name_requests
  for select to authenticated using (user_id = auth.uid());
revoke all on public.learning_certificate_name_requests from public, anon, authenticated;
grant select on public.learning_certificate_name_requests to authenticated;

create table public.learning_certificate_history (
  id uuid primary key default gen_random_uuid(),
  certificate_id uuid not null references public.learning_certificates(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  edition_id text not null,
  subject_id text not null,
  certificate_number text not null unique,
  status text not null default 'revoked' check (status = 'revoked'),
  recipient_name text not null,
  issued_at timestamptz not null,
  pdf_path text,
  revoked_at timestamptz not null default now(),
  reissue_request_id uuid not null references public.learning_certificate_name_requests(id)
);
alter table public.learning_certificate_history enable row level security;
revoke all on public.learning_certificate_history from public, anon, authenticated;

create or replace function public.save_learning_v2_profile(p_user_id uuid, p_full_name text, p_phone text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_name text := trim(regexp_replace(p_full_name, '\s+', ' ', 'g'));
begin
  if v_name is null or char_length(v_name) not between 2 and 120
    or p_phone is null or p_phone !~ '^0[689][0-9]{8}$' then
    raise exception 'Invalid learner profile';
  end if;
  insert into public.learning_enrollments(user_id, edition_id, full_name, phone)
  values (p_user_id, 'civic-dna-2026', v_name, p_phone)
  on conflict (user_id, edition_id) do update
    set full_name = excluded.full_name, phone = excluded.phone;
end;
$$;
revoke all on function public.save_learning_v2_profile(uuid, text, text) from public, anon, authenticated;
grant execute on function public.save_learning_v2_profile(uuid, text, text) to service_role;

create or replace function public.issue_learning_v2_certificate(p_user_id uuid, p_subject_id text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_name text; v_id uuid;
begin
  select coalesce(certificate_name, full_name) into v_name
  from public.learning_enrollments where user_id = p_user_id and edition_id = 'civic-dna-2026'
  and phone is not null for update;
  if v_name is null then raise exception 'Learner profile required'; end if;
  update public.learning_enrollments set certificate_name = v_name
  where user_id = p_user_id and edition_id = 'civic-dna-2026' and certificate_name is null;
  insert into public.learning_certificates
    (user_id, edition_id, subject_id, certificate_number, recipient_name)
  values (p_user_id, 'civic-dna-2026', p_subject_id,
    'SWSC-DNA-' || (extract(year from timezone('Asia/Bangkok', now()))::integer + 543) || '-' ||
      lpad(nextval('public.learning_certificate_seq')::text, 6, '0'), v_name)
  on conflict (edition_id, user_id, subject_id) do nothing returning id into v_id;
  if v_id is not null then
    insert into public.learning_delivery_jobs(certificate_id) values (v_id);
  end if;
  return v_id;
end;
$$;
revoke all on function public.issue_learning_v2_certificate(uuid, text) from public, anon, authenticated;
grant execute on function public.issue_learning_v2_certificate(uuid, text) to service_role;

create or replace function public.request_learning_v2_name_change(p_user_id uuid, p_full_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_name text := trim(regexp_replace(p_full_name, '\s+', ' ', 'g')); v_id uuid; v_current text;
begin
  select certificate_name into v_current from public.learning_enrollments
  where user_id = p_user_id and edition_id = 'civic-dna-2026' and reissue_used_at is null for update;
  if v_current is null then raise exception 'No eligible certificate or reissue already used'; end if;
  if exists (select 1 from public.learning_enrollments where user_id = p_user_id
    and reissue_used_at is not null) then raise exception 'Reissue already used'; end if;
  if v_name is null or char_length(v_name) not between 2 and 120 or v_name = v_current then
    raise exception 'Invalid replacement name';
  end if;
  insert into public.learning_certificate_name_requests(user_id, edition_id, requested_name)
  values (p_user_id, 'civic-dna-2026', v_name) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.request_learning_v2_name_change(uuid, text) from public, anon, authenticated;
grant execute on function public.request_learning_v2_name_change(uuid, text) to service_role;

create or replace function public.decide_learning_v2_name_change(
  p_request_id uuid, p_approve boolean, p_admin_id uuid, p_note text default null
) returns integer language plpgsql security definer set search_path = '' as $$
declare v_request public.learning_certificate_name_requests%rowtype; v_cert public.learning_certificates%rowtype;
  v_count integer := 0;
begin
  select * into v_request from public.learning_certificate_name_requests
  where id = p_request_id and edition_id = 'civic-dna-2026' and status = 'pending' for update;
  if not found then raise exception 'Pending request not found'; end if;
  perform 1 from public.learning_enrollments where user_id = v_request.user_id
    and edition_id = v_request.edition_id and reissue_used_at is null for update;
  if not found then raise exception 'Reissue already used'; end if;
  if exists (select 1 from public.learning_enrollments where user_id = v_request.user_id
    and reissue_used_at is not null) then raise exception 'Reissue already used'; end if;
  if p_approve then
    perform 1 from public.learning_delivery_jobs j
      join public.learning_certificates c on c.id = j.certificate_id
      where c.user_id = v_request.user_id and c.edition_id = v_request.edition_id
      order by j.id for update of j;
    if exists (select 1 from public.learning_delivery_jobs j
      join public.learning_certificates c on c.id = j.certificate_id
      where c.user_id = v_request.user_id and c.edition_id = v_request.edition_id
        and j.status in ('pending', 'processing')) then
      raise exception 'Wait for current delivery to finish';
    end if;
    for v_cert in select * from public.learning_certificates
      where user_id = v_request.user_id and edition_id = v_request.edition_id
      order by id for update
    loop
      insert into public.learning_certificate_history
        (certificate_id, user_id, edition_id, subject_id, certificate_number,
         recipient_name, issued_at, pdf_path, reissue_request_id)
      values (v_cert.id, v_cert.user_id, v_cert.edition_id, v_cert.subject_id,
        v_cert.certificate_number, v_cert.recipient_name, v_cert.issued_at,
        v_cert.pdf_path, p_request_id);
      update public.learning_certificates set
        certificate_number = 'SWSC-DNA-' ||
          (extract(year from timezone('Asia/Bangkok', now()))::integer + 543) || '-' ||
          lpad(nextval('public.learning_certificate_seq')::text, 6, '0'),
        recipient_name = v_request.requested_name, issued_at = now(),
        pdf_path = null, email_status = 'pending', emailed_at = null
      where id = v_cert.id;
      update public.learning_delivery_jobs set status = 'pending', available_at = now(),
        locked_until = null, last_error = null
      where certificate_id = v_cert.id and status = 'failed';
      if not found then
        insert into public.learning_delivery_jobs(certificate_id) values (v_cert.id);
      end if;
      v_count := v_count + 1;
    end loop;
    if v_count = 0 then raise exception 'No certificates to reissue'; end if;
    update public.learning_enrollments set certificate_name = v_request.requested_name,
      reissue_used_at = now() where user_id = v_request.user_id and edition_id = v_request.edition_id;
  end if;
  update public.learning_certificate_name_requests set status = case when p_approve then 'approved' else 'rejected' end,
    decided_at = now(), decided_by = p_admin_id, admin_note = p_note where id = p_request_id;
  return v_count;
end;
$$;
revoke all on function public.decide_learning_v2_name_change(uuid, boolean, uuid, text)
  from public, anon, authenticated;
grant execute on function public.decide_learning_v2_name_change(uuid, boolean, uuid, text) to service_role;

drop function public.correct_learning_v2_certificate_name(uuid, text);

create or replace function public.record_learning_v2_result(
  p_user_id uuid, p_subject_id text, p_phase text, p_score integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_edition constant text := 'civic-dna-2026';
  v_ordinal integer;
  v_topics jsonb;
  v_certificate_id uuid;
  v_attempt_id uuid;
begin
  if p_phase not in ('pre', 'post') or p_score not between 0 and 10 then
    raise exception 'Invalid result';
  end if;
  select s.ordinal, s.published_topics into v_ordinal, v_topics
  from public.learning_subject_editions s
  join public.learning_editions e on e.id = s.edition_id
  where s.edition_id = v_edition and s.subject_id = p_subject_id and e.published;
  if v_ordinal is null then raise exception 'Subject unavailable'; end if;
  if not exists (select 1 from public.learning_enrollments
    where user_id = p_user_id and edition_id = v_edition and phone is not null) then
    raise exception 'Learner name required';
  end if;
  if v_ordinal > 1 and not exists (
    select 1 from public.learning_attempts a
    join public.learning_subject_editions previous
      on previous.subject_id = a.subject_id and previous.edition_id = v_edition
    where a.user_id = p_user_id and a.edition_id = v_edition
      and a.phase = 'post' and a.score >= 6 and previous.ordinal = v_ordinal - 1
  ) then raise exception 'Subject locked'; end if;
  if p_phase = 'pre' then
    if exists (select 1 from public.learning_attempts
      where user_id = p_user_id and edition_id = v_edition
        and subject_id = p_subject_id and phase = 'pre') then
      raise exception 'Pretest already completed';
    end if;
  else
    if not exists (select 1 from public.learning_attempts
      where user_id = p_user_id and edition_id = v_edition
        and subject_id = p_subject_id and phase = 'pre') then
      raise exception 'Pretest required';
    end if;
    if exists (
      select 1 from jsonb_array_elements(v_topics) topic
      where not exists (
        select 1 from public.learning_topic_completions c
        where c.user_id = p_user_id and c.edition_id = v_edition
          and c.subject_id = p_subject_id and c.topic_id = topic->>'id'
      )
    ) then raise exception 'Complete every topic first'; end if;
  end if;

  insert into public.learning_attempts
    (user_id, edition_id, subject_id, phase, score, total, passed)
  values (p_user_id, v_edition, p_subject_id, p_phase, p_score, 10,
    p_phase = 'post' and p_score >= 8)
  returning id into v_attempt_id;

  if p_phase = 'post' and p_score >= 8 and exists (
    select 1 from public.learning_editions where id = v_edition and certificates_enabled
  ) then
    v_certificate_id := public.issue_learning_v2_certificate(p_user_id, p_subject_id);
  end if;
  return jsonb_build_object('attemptId', v_attempt_id,
    'passed', p_phase = 'post' and p_score >= 8,
    'certificateId', v_certificate_id);
end;
$$;
revoke all on function public.record_learning_v2_result(uuid, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.record_learning_v2_result(uuid, text, text, integer)
  to service_role;



create or replace function public.activate_learning_v2_certificates()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer := 0; v_row record; v_id uuid;
begin
  if (select count(*) from public.learning_subject_editions
      where edition_id = 'civic-dna-2026' and template_approved
        and nullif(template_path, '') is not null) <> 5 then
    raise exception 'Five approved signed templates required';
  end if;
  update public.learning_editions set certificates_enabled = true
    where id = 'civic-dna-2026' and published;
  if not found then raise exception 'Course not published'; end if;

  for v_row in
    select distinct a.user_id, a.subject_id from public.learning_attempts a
    join public.learning_enrollments e on e.user_id = a.user_id and e.edition_id = a.edition_id
    where a.edition_id = 'civic-dna-2026' and a.phase = 'post' and a.score >= 8
      and e.phone is not null order by a.user_id, a.subject_id
  loop
    v_id := public.issue_learning_v2_certificate(v_row.user_id, v_row.subject_id);
    if v_id is not null then v_count := v_count + 1; end if;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.activate_learning_v2_certificates()
  from public, anon, authenticated;
grant execute on function public.activate_learning_v2_certificates() to service_role;
