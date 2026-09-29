-- Admin Edge Function validates council-admin rights before invoking this service-only RPC.
create or replace function public.correct_learning_v2_certificate_name(
  p_certificate_id uuid, p_full_name text
) returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid;
  v_name text := trim(regexp_replace(p_full_name, '\s+', ' ', 'g'));
  v_cert_id uuid;
  v_count integer := 0;
begin
  if char_length(v_name) not between 2 and 120 then
    raise exception 'Invalid learner name';
  end if;
  select user_id into v_user_id from public.learning_certificates
  where id = p_certificate_id and edition_id = 'civic-dna-2026' for update;
  if v_user_id is null then raise exception 'Certificate not found'; end if;
  if exists (
    select 1 from public.learning_delivery_jobs j
    join public.learning_certificates c on c.id = j.certificate_id
    where c.user_id = v_user_id and c.edition_id = 'civic-dna-2026'
      and j.status in ('pending', 'processing')
  ) then raise exception 'Wait for current delivery to finish'; end if;

  update public.learning_enrollments set full_name = v_name
  where user_id = v_user_id and edition_id = 'civic-dna-2026';
  update public.learning_certificates
    set recipient_name = v_name, pdf_path = null,
      email_status = 'pending', emailed_at = null
    where user_id = v_user_id and edition_id = 'civic-dna-2026';
  for v_cert_id in
    select id from public.learning_certificates
    where user_id = v_user_id and edition_id = 'civic-dna-2026'
  loop
    update public.learning_delivery_jobs
      set status = 'pending', available_at = now(), locked_until = null,
        last_error = null
      where certificate_id = v_cert_id and status = 'failed';
    if not found then
      insert into public.learning_delivery_jobs (certificate_id) values (v_cert_id);
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.correct_learning_v2_certificate_name(uuid, text)
  from public, anon, authenticated;
grant execute on function public.correct_learning_v2_certificate_name(uuid, text)
  to service_role;
