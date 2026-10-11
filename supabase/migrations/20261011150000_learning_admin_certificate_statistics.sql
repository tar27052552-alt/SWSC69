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
    'certificatesReady', (select count(distinct c.user_id) from public.learning_certificates c
      join totals t on t.user_id=c.user_id and t.eligible_count=5
      where c.edition_id='civic-dna-2026' and nullif(c.pdf_path,'') is not null
      and c.subject_id=(select subject_id from public.learning_subject_editions where edition_id='civic-dna-2026' and ordinal=5)),
    'certificatesPending', (select count(distinct c.user_id) from public.learning_certificates c
      join totals t on t.user_id=c.user_id and t.eligible_count=5
      where c.edition_id='civic-dna-2026' and nullif(c.pdf_path,'') is null
      and c.subject_id=(select subject_id from public.learning_subject_editions where edition_id='civic-dna-2026' and ordinal=5)),
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


revoke all on function public.learning_admin_summary() from public,anon,authenticated;
grant execute on function public.learning_admin_summary() to service_role;
