-- The lesson order is enforced on the server, including direct API requests.
create or replace function public.get_learning_course_access(
  p_user_id uuid, p_subject_id text, p_phase text
) returns boolean
language sql security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.learning_subjects current_subject
    where current_subject.id = p_subject_id
      and current_subject.published
      and p_phase in ('pre', 'post')
      and (
        current_subject.ordinal = 1
        or exists (
          select 1
          from public.learning_subjects previous_subject
          join public.learning_attempts previous_attempt
            on previous_attempt.subject_id = previous_subject.id
          where previous_subject.ordinal = current_subject.ordinal - 1
            and previous_attempt.user_id = p_user_id
            and previous_attempt.phase = 'post'
            and previous_attempt.score * 100 >= previous_attempt.total * 60
        )
      )
      and (
        p_phase = 'pre'
        or exists (
          select 1 from public.learning_attempts pre_attempt
          where pre_attempt.user_id = p_user_id
            and pre_attempt.subject_id = p_subject_id
            and pre_attempt.phase = 'pre'
        )
      )
  );
$$;
revoke all on function public.get_learning_course_access(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.get_learning_course_access(uuid, text, text)
  to service_role;

create or replace function public.record_learning_result(
  p_user_id uuid, p_subject_id text, p_phase text,
  p_score integer, p_total integer
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
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
