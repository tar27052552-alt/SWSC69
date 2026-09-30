-- Reporting reads existing course activity without changing learner progress.
create or replace function public.learning_admin_roster(
  p_search text default '', p_subject_id text default null,
  p_status text default 'all', p_offset integer default 0, p_limit integer default 20
) returns jsonb language sql stable security invoker set search_path = public, auth as $$
  with attempt_data as (
    select a.user_id, a.subject_id,
      bool_or(a.phase = 'pre') as pre_completed,
      max(a.score) filter (where a.phase = 'post') as best_post_score,
      count(*) filter (where a.phase = 'post') as post_attempts,
      max(a.submitted_at) as last_attempt
    from public.learning_attempts a
    where a.edition_id = 'civic-dna-2026'
    group by a.user_id, a.subject_id
  ), topic_data as (
    select c.user_id, c.subject_id, count(*) as completed_topics,
      max(c.completed_at) as last_completion
    from public.learning_topic_completions c
    where c.edition_id = 'civic-dna-2026'
    group by c.user_id, c.subject_id
  ), learners as (
    select e.user_id, u.email, e.full_name, e.phone,
      e.created_at as enrolled_at,
      greatest(e.created_at,
        coalesce((select max(a.last_attempt) from attempt_data a where a.user_id = e.user_id), e.created_at),
        coalesce((select max(t.last_completion) from topic_data t where t.user_id = e.user_id), e.created_at)
      ) as last_activity,
      (select count(*) from attempt_data a where a.user_id = e.user_id and a.best_post_score >= 6) as passed_subjects,
      (select count(*) from attempt_data a where a.user_id = e.user_id and a.best_post_score >= 8) as eligible_subjects,
      coalesce((select jsonb_agg(jsonb_build_object(
        'subjectId', s.subject_id, 'ordinal', s.ordinal, 'title', s.title,
        'preCompleted', coalesce(a.pre_completed, false),
        'bestPostScore', a.best_post_score,
        'postAttempts', coalesce(a.post_attempts, 0),
        'completedTopics', coalesce(t.completed_topics, 0)
      ) order by s.ordinal)
      from public.learning_subject_editions s
      left join attempt_data a on a.user_id = e.user_id and a.subject_id = s.subject_id
      left join topic_data t on t.user_id = e.user_id and t.subject_id = s.subject_id
      where s.edition_id = 'civic-dna-2026'), '[]'::jsonb) as progress
    from public.learning_enrollments e
    join auth.users u on u.id = e.user_id
    where e.edition_id = 'civic-dna-2026'
      and (trim(coalesce(p_search, '')) = '' or e.full_name ilike '%' || trim(p_search) || '%'
        or u.email ilike '%' || trim(p_search) || '%'
        or e.phone like '%' || trim(p_search) || '%')
  ), filtered as (
    select l.* from learners l
    where p_status = 'all' or exists (
      select 1 from jsonb_array_elements(l.progress) item
      where (p_subject_id is null or item->>'subjectId' = p_subject_id)
        and case p_status
          when 'not_started' then item->>'preCompleted' = 'false'
          when 'learning' then item->>'preCompleted' = 'true'
            and coalesce((item->>'bestPostScore')::integer, -1) < 6
          when 'passed' then (item->>'bestPostScore')::integer >= 6
          when 'eligible' then (item->>'bestPostScore')::integer >= 8
          else false
        end
    )
  ), selected as (
    select f.* from filtered f
    where p_subject_id is null or exists (
      select 1 from jsonb_array_elements(f.progress) item
      where item->>'subjectId' = p_subject_id and (
        item->>'preCompleted' = 'true' or (item->>'completedTopics')::integer > 0
        or (item->>'postAttempts')::integer > 0)
    ) or p_status = 'not_started'
  )
  select jsonb_build_object(
    'total', (select count(*) from selected),
    'rows', coalesce((select jsonb_agg(to_jsonb(page) order by page.last_activity desc, page.user_id)
      from (select * from selected order by last_activity desc, user_id
        offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 50)) page), '[]'::jsonb)
  );
$$;

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
    'eligible', (select count(*) from totals where eligible_count > 0),
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

create or replace function public.learning_admin_detail(p_user_id uuid)
returns jsonb language sql stable security invoker set search_path = public, auth as $$
  select jsonb_build_object(
    'userId', e.user_id, 'email', u.email, 'fullName', e.full_name, 'phone', e.phone,
    'enrolledAt', e.created_at,
    'attempts', coalesce((select jsonb_agg(jsonb_build_object(
      'subjectId', a.subject_id, 'phase', a.phase, 'score', a.score,
      'total', a.total, 'submittedAt', a.submitted_at
    ) order by a.submitted_at desc) from public.learning_attempts a
      where a.edition_id = e.edition_id and a.user_id = e.user_id), '[]'::jsonb),
    'completions', coalesce((select jsonb_agg(jsonb_build_object(
      'subjectId', c.subject_id, 'topicId', c.topic_id, 'completedAt', c.completed_at
    ) order by c.completed_at desc) from public.learning_topic_completions c
      where c.edition_id = e.edition_id and c.user_id = e.user_id), '[]'::jsonb)
  ) from public.learning_enrollments e join auth.users u on u.id = e.user_id
  where e.edition_id = 'civic-dna-2026' and e.user_id = p_user_id;
$$;

revoke all on function public.learning_admin_roster(text,text,text,integer,integer) from public, anon, authenticated;
revoke all on function public.learning_admin_summary() from public, anon, authenticated;
revoke all on function public.learning_admin_detail(uuid) from public, anon, authenticated;
grant execute on function public.learning_admin_roster(text,text,text,integer,integer) to service_role;
grant execute on function public.learning_admin_summary() to service_role;
grant execute on function public.learning_admin_detail(uuid) to service_role;
