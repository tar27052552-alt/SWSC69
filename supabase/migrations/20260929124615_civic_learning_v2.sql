-- A new course edition keeps historic attempts and certificates untouched.
create table public.learning_editions (
  id text primary key,
  published boolean not null default false,
  certificates_enabled boolean not null default false,
  created_at timestamptz not null default now()
);
insert into public.learning_editions (id) values ('civic-dna-2026');

create table public.learning_subject_editions (
  edition_id text not null references public.learning_editions(id),
  subject_id text not null references public.learning_subjects(id),
  ordinal integer not null check (ordinal between 1 and 5),
  title text not null,
  summary text not null default '',
  draft_title text not null,
  draft_summary text not null default '',
  draft_topics jsonb not null default '[]'::jsonb,
  published_topics jsonb not null default '[]'::jsonb,
  draft_revision integer not null default 0,
  published_revision integer not null default 0,
  content_reviewed boolean not null default false,
  quiz_reviewed boolean not null default false,
  template_path text,
  template_approved boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (edition_id, subject_id),
  unique (edition_id, ordinal)
);
insert into public.learning_subject_editions
  (edition_id, subject_id, ordinal, title, summary, draft_title, draft_summary)
select 'civic-dna-2026', id, ordinal, title, summary, title, summary
from public.learning_subjects;

create table learning_private.quiz_questions_v2 (
  id uuid primary key default gen_random_uuid(),
  edition_id text not null,
  subject_id text not null,
  ordinal integer not null check (ordinal between 1 and 10),
  prompt text not null,
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) >= 2),
  correct_option integer not null check (correct_option >= 0 and correct_option < jsonb_array_length(options)),
  foreign key (edition_id, subject_id) references public.learning_subject_editions(edition_id, subject_id),
  unique (edition_id, subject_id, ordinal)
);
create table learning_private.quiz_questions_v2_draft
  (like learning_private.quiz_questions_v2 including all);
alter table learning_private.quiz_questions_v2_draft
  add foreign key (edition_id, subject_id)
  references public.learning_subject_editions(edition_id, subject_id);

create table public.learning_enrollments (
  user_id uuid not null references auth.users(id) on delete cascade,
  edition_id text not null references public.learning_editions(id),
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  created_at timestamptz not null default now(),
  primary key (user_id, edition_id)
);

create table public.learning_topic_completions (
  user_id uuid not null references auth.users(id) on delete cascade,
  edition_id text not null,
  subject_id text not null,
  topic_id text not null,
  completed_at timestamptz not null default now(),
  foreign key (edition_id, subject_id) references public.learning_subject_editions(edition_id, subject_id),
  primary key (user_id, edition_id, subject_id, topic_id)
);

create table public.learning_review_notes (
  id uuid primary key default gen_random_uuid(),
  edition_id text not null,
  subject_id text not null,
  source_reference text not null,
  proposed_change text not null,
  rationale text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  foreign key (edition_id, subject_id) references public.learning_subject_editions(edition_id, subject_id)
);

alter table public.learning_attempts add column edition_id text not null default 'legacy';
create index learning_attempts_edition_user_idx
  on public.learning_attempts (edition_id, user_id, subject_id, phase);
create unique index learning_v2_one_pretest
  on public.learning_attempts (edition_id, user_id, subject_id)
  where edition_id = 'civic-dna-2026' and phase = 'pre';
alter table public.learning_certificates add column edition_id text not null default 'legacy';
alter table public.learning_certificates drop constraint if exists learning_certificates_user_id_subject_id_key;
create unique index learning_certificates_edition_owner_subject_key
  on public.learning_certificates (edition_id, user_id, subject_id);

create or replace function public.get_learning_course_access(
  p_user_id uuid, p_subject_id text, p_phase text
) returns boolean language sql security definer set search_path = '' as $$
  select exists (
    select 1 from public.learning_subjects current_subject
    where current_subject.id = p_subject_id and current_subject.published
      and p_phase in ('pre', 'post')
      and (current_subject.ordinal = 1 or exists (
        select 1 from public.learning_subjects previous_subject
        join public.learning_attempts previous_attempt
          on previous_attempt.subject_id = previous_subject.id
        where previous_subject.ordinal = current_subject.ordinal - 1
          and previous_attempt.user_id = p_user_id
          and previous_attempt.edition_id = 'legacy'
          and previous_attempt.phase = 'post'
          and previous_attempt.score * 100 >= previous_attempt.total * 60
      ))
      and (p_phase = 'pre' or exists (
        select 1 from public.learning_attempts pre_attempt
        where pre_attempt.user_id = p_user_id
          and pre_attempt.edition_id = 'legacy'
          and pre_attempt.subject_id = p_subject_id and pre_attempt.phase = 'pre'
      ))
  );
$$;

-- Keep the legacy endpoint working after the certificate key becomes edition-aware.
create or replace function public.record_learning_result(
  p_user_id uuid, p_subject_id text, p_phase text,
  p_score integer, p_total integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
  v_attempt_id uuid;
  v_certificate_id uuid;
  v_passed boolean;
begin
  if p_phase not in ('pre', 'post') or p_total <> 10
    or p_score < 0 or p_score > p_total then
    raise exception 'Invalid quiz result';
  end if;
  if not public.get_learning_course_access(p_user_id, p_subject_id, p_phase) then
    raise exception 'Lesson is locked';
  end if;
  select full_name into v_name from public.learning_profiles
  where user_id = p_user_id;
  if v_name is null then raise exception 'Learner name is required'; end if;

  v_passed := p_phase = 'post' and p_score >= 8;
  insert into public.learning_attempts
    (user_id, subject_id, phase, score, total, passed)
  values (p_user_id, p_subject_id, p_phase, p_score, p_total, v_passed)
  returning id into v_attempt_id;

  if v_passed then
    insert into public.learning_certificates
      (user_id, subject_id, edition_id, certificate_number, recipient_name)
    values (p_user_id, p_subject_id, 'legacy',
      'SWSC-DNA-' || (extract(year from timezone('Asia/Bangkok', now()))::integer + 543) || '-' ||
        lpad(nextval('public.learning_certificate_seq')::text, 6, '0'), v_name)
    on conflict (edition_id, user_id, subject_id) do nothing
    returning id into v_certificate_id;
    if v_certificate_id is not null then
      insert into public.learning_delivery_jobs (certificate_id)
      values (v_certificate_id);
    else
      select id into v_certificate_id from public.learning_certificates
      where edition_id = 'legacy' and user_id = p_user_id and subject_id = p_subject_id;
    end if;
  end if;
  return jsonb_build_object('attemptId', v_attempt_id,
    'passed', v_passed, 'certificateId', v_certificate_id);
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('learning-materials', 'learning-materials', false, 104857600,
  array['application/pdf', 'image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;

alter table public.learning_editions enable row level security;
alter table public.learning_subject_editions enable row level security;
alter table public.learning_enrollments enable row level security;
alter table public.learning_topic_completions enable row level security;
alter table public.learning_review_notes enable row level security;
alter table learning_private.quiz_questions_v2 enable row level security;
alter table learning_private.quiz_questions_v2_draft enable row level security;

create policy learning_editions_public_read on public.learning_editions
  for select to anon, authenticated using (published);
create policy learning_subject_editions_public_read on public.learning_subject_editions
  for select to anon, authenticated using (
    exists (select 1 from public.learning_editions e where e.id = edition_id and e.published)
  );
create policy learning_enrollments_owner_read on public.learning_enrollments
  for select to authenticated using (user_id = (select auth.uid()));
create policy learning_topic_completions_owner_read on public.learning_topic_completions
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.learning_editions, public.learning_subject_editions,
  public.learning_enrollments, public.learning_topic_completions,
  public.learning_review_notes from public, anon, authenticated;
grant select on public.learning_editions to anon, authenticated;
grant select on public.learning_enrollments, public.learning_topic_completions to authenticated;
revoke all on learning_private.quiz_questions_v2 from public, anon, authenticated;
grant select, insert, update, delete on learning_private.quiz_questions_v2 to service_role;
revoke all on learning_private.quiz_questions_v2_draft from public, anon, authenticated;
grant select, insert, update, delete on learning_private.quiz_questions_v2_draft to service_role;
grant usage on schema learning_private to service_role;

create or replace function public.get_learning_v2_questions(p_subject_id text)
returns table(id uuid, prompt text, options jsonb, correct_option integer)
language sql security definer set search_path = '' as $$
  select q.id, q.prompt, q.options, q.correct_option
  from learning_private.quiz_questions_v2 q
  where q.edition_id = 'civic-dna-2026' and q.subject_id = p_subject_id
  order by q.ordinal;
$$;
revoke all on function public.get_learning_v2_questions(text) from public, anon, authenticated;
grant execute on function public.get_learning_v2_questions(text) to service_role;

create or replace function public.get_learning_v2_draft_questions(p_subject_id text)
returns table(id uuid, prompt text, options jsonb, correct_option integer)
language sql security definer set search_path = '' as $$
  select q.id, q.prompt, q.options, q.correct_option
  from learning_private.quiz_questions_v2_draft q
  where q.edition_id = 'civic-dna-2026' and q.subject_id = p_subject_id
  order by q.ordinal;
$$;
revoke all on function public.get_learning_v2_draft_questions(text)
  from public, anon, authenticated;
grant execute on function public.get_learning_v2_draft_questions(text) to service_role;

create or replace function public.import_learning_v2_questions(p_subject_id text, p_questions jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_item jsonb; v_ordinal integer := 0;
begin
  if jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) <> 10 then
    raise exception 'Exactly ten questions required';
  end if;
  delete from learning_private.quiz_questions_v2_draft
    where edition_id = 'civic-dna-2026' and subject_id = p_subject_id;
  for v_item in select value from jsonb_array_elements(p_questions) loop
    v_ordinal := v_ordinal + 1;
    insert into learning_private.quiz_questions_v2_draft
      (edition_id, subject_id, ordinal, prompt, options, correct_option)
    values ('civic-dna-2026', p_subject_id, v_ordinal,
      trim(v_item->>'prompt'), v_item->'options', (v_item->>'correctOption')::integer);
  end loop;
  update public.learning_subject_editions
    set quiz_reviewed = false, draft_revision = draft_revision + 1, updated_at = now()
    where edition_id = 'civic-dna-2026' and subject_id = p_subject_id;
end;
$$;
revoke all on function public.import_learning_v2_questions(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.import_learning_v2_questions(text, jsonb) to service_role;

create or replace function public.increment_learning_draft_revision(p_subject_id text)
returns void language sql security definer set search_path = '' as $$
  update public.learning_subject_editions
    set draft_revision = draft_revision + 1
    where edition_id = 'civic-dna-2026' and subject_id = p_subject_id;
$$;
revoke all on function public.increment_learning_draft_revision(text)
  from public, anon, authenticated;
grant execute on function public.increment_learning_draft_revision(text) to service_role;

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
    where user_id = p_user_id and edition_id = v_edition) then
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
    insert into public.learning_certificates
      (user_id, edition_id, subject_id, certificate_number, recipient_name)
    select p_user_id, v_edition, p_subject_id,
      'SWSC-DNA-' || (extract(year from timezone('Asia/Bangkok', now()))::integer + 543) || '-' ||
        lpad(nextval('public.learning_certificate_seq')::text, 6, '0'),
      e.full_name
    from public.learning_enrollments e
    where e.user_id = p_user_id and e.edition_id = v_edition
    on conflict (edition_id, user_id, subject_id) do nothing
    returning id into v_certificate_id;
    if v_certificate_id is not null then
      insert into public.learning_delivery_jobs (certificate_id) values (v_certificate_id);
    end if;
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

create or replace function public.publish_learning_v2()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.learning_subject_editions
      where edition_id = 'civic-dna-2026' and content_reviewed and quiz_reviewed
        and jsonb_array_length(draft_topics) = 4) <> 5 then
    raise exception 'Review all five subjects and four topics per subject';
  end if;
  if (select count(*) from learning_private.quiz_questions_v2_draft
      where edition_id = 'civic-dna-2026') <> 50 then
    raise exception 'Review all 50 quiz questions';
  end if;
  delete from learning_private.quiz_questions_v2
    where edition_id = 'civic-dna-2026';
  insert into learning_private.quiz_questions_v2
    (edition_id, subject_id, ordinal, prompt, options, correct_option)
  select edition_id, subject_id, ordinal, prompt, options, correct_option
  from learning_private.quiz_questions_v2_draft
  where edition_id = 'civic-dna-2026';
  update public.learning_subject_editions
    set title = draft_title, summary = draft_summary,
      published_topics = draft_topics, published_revision = draft_revision,
      updated_at = now()
    where edition_id = 'civic-dna-2026';
  update public.learning_editions set published = true
    where id = 'civic-dna-2026';
end;
$$;
revoke all on function public.publish_learning_v2() from public, anon, authenticated;
grant execute on function public.publish_learning_v2() to service_role;

create or replace function public.activate_learning_v2_certificates()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if (select count(*) from public.learning_subject_editions
      where edition_id = 'civic-dna-2026' and template_approved
        and nullif(template_path, '') is not null) <> 5 then
    raise exception 'Five approved signed templates required';
  end if;
  update public.learning_editions set certificates_enabled = true
    where id = 'civic-dna-2026' and published;
  if not found then raise exception 'Course not published'; end if;

  with eligible as (
    select distinct a.user_id, a.subject_id, e.full_name
    from public.learning_attempts a
    join public.learning_enrollments e on e.user_id = a.user_id
      and e.edition_id = a.edition_id
    where a.edition_id = 'civic-dna-2026' and a.phase = 'post' and a.score >= 8
  ), inserted as (
    insert into public.learning_certificates
      (user_id, edition_id, subject_id, certificate_number, recipient_name)
    select user_id, 'civic-dna-2026', subject_id,
      'SWSC-DNA-' || (extract(year from timezone('Asia/Bangkok', now()))::integer + 543) || '-' ||
        lpad(nextval('public.learning_certificate_seq')::text, 6, '0'),
      full_name from eligible
    on conflict (edition_id, user_id, subject_id) do nothing
    returning id
  )
  insert into public.learning_delivery_jobs (certificate_id)
  select id from inserted;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.activate_learning_v2_certificates()
  from public, anon, authenticated;
grant execute on function public.activate_learning_v2_certificates() to service_role;
