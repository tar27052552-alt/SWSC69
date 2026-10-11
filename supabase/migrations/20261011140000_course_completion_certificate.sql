-- One certificate after passing all five subjects. Internal identifiers remain private.
create or replace function public.issue_learning_v2_certificate(p_user_id uuid, p_subject_id text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_name text; v_id uuid; v_final_subject text;
begin
  if not exists (select 1 from public.learning_editions where id='civic-dna-2026' and certificates_enabled) then return null; end if;
  if (select count(*) from public.learning_subject_editions where edition_id='civic-dna-2026') <> 5 then return null; end if;
  if exists (
    select 1 from public.learning_subject_editions s where s.edition_id='civic-dna-2026'
    and not exists (select 1 from public.learning_attempts a where a.user_id=p_user_id
      and a.edition_id=s.edition_id and a.subject_id=s.subject_id and a.phase='post' and a.score>=8)
  ) then return null; end if;
  select subject_id into v_final_subject from public.learning_subject_editions where edition_id='civic-dna-2026' and ordinal=5;
  select coalesce(certificate_name, full_name) into v_name
  from public.learning_enrollments where user_id = p_user_id and edition_id = 'civic-dna-2026'
  and phone is not null for update;
  if v_name is null then raise exception 'Learner profile required'; end if;
  update public.learning_enrollments set certificate_name = v_name
  where user_id = p_user_id and edition_id = 'civic-dna-2026' and certificate_name is null;
  insert into public.learning_certificates
    (user_id, edition_id, subject_id, certificate_number, recipient_name)
  values (p_user_id, 'civic-dna-2026', v_final_subject,
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

