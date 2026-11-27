-- Only the admin Edge Function may call this transaction.
create or replace function public.retry_learning_certificate_pdf(p_certificate_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_user_id uuid;
  v_job public.learning_delivery_jobs;
  v_certificate public.learning_certificates;
begin
  select user_id into v_user_id from public.learning_certificates
    where id = p_certificate_id and edition_id = 'civic-dna-2026';
  if v_user_id is null then raise exception 'ไม่พบเกียรติบัตรปัจจุบัน'; end if;
  -- Same lock order as certificate name changes: enrollment, jobs, certificates.
  perform 1 from public.learning_enrollments
    where user_id = v_user_id and edition_id = 'civic-dna-2026' for update;
  select * into v_job from public.learning_delivery_jobs
    where certificate_id = p_certificate_id and status in ('pending', 'processing', 'failed')
    order by created_at desc limit 1 for update;
  select * into v_certificate from public.learning_certificates
    where id = p_certificate_id and edition_id = 'civic-dna-2026' for update;
  if v_certificate.id is null or v_certificate.pdf_path is not null then
    raise exception 'ใบนี้พร้อมดาวน์โหลดแล้วหรือไม่ใช่ใบปัจจุบัน';
  end if;
  if v_job.id is null or v_job.status <> 'failed' then
    raise exception 'ลองใหม่ได้เฉพาะงานสร้าง PDF ที่ล้มเหลว';
  end if;
  update public.learning_delivery_jobs set status = 'pending', available_at = now(),
    locked_until = null, last_error = null where id = v_job.id;
  update public.learning_certificates set email_status = 'pending' where id = p_certificate_id;
  return jsonb_build_object('queued', true);
end;
$$;
revoke all on function public.retry_learning_certificate_pdf(uuid) from public, anon, authenticated;
grant execute on function public.retry_learning_certificate_pdf(uuid) to service_role;

-- A single course template is stored on the final subject for compatibility.
create or replace function public.activate_learning_v2_certificates()
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_count integer := 0; v_row record; v_id uuid;
begin
  if not exists (select 1 from public.learning_subject_editions
    where edition_id = 'civic-dna-2026' and ordinal = 5 and template_approved
      and nullif(template_path, '') is not null) then
    raise exception 'ต้องอนุมัติแบบเกียรติบัตรรวมก่อน';
  end if;
  update public.learning_editions set certificates_enabled = true
    where id = 'civic-dna-2026' and published;
  if not found then raise exception 'Course not published'; end if;
  for v_row in select distinct user_id from public.learning_attempts
    where edition_id = 'civic-dna-2026' and phase = 'post' and score >= 8
    order by user_id
  loop
    v_id := public.issue_learning_v2_certificate(v_row.user_id, 'civic-5');
    if v_id is not null then v_count := v_count + 1; end if;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.activate_learning_v2_certificates() from public, anon, authenticated;
grant execute on function public.activate_learning_v2_certificates() to service_role;
