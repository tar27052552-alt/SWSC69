-- Local preparation only. Apply after reviewing the legacy calendar source mapping.
-- All writes below require a valid, unbanned council account through private helpers.
create or replace function private.council_academic_year(p_date date default (now() at time zone 'Asia/Bangkok')::date)
returns integer language sql stable set search_path='' as $$
 select extract(year from p_date)::integer + 543 - case when extract(month from p_date)<5 then 1 else 0 end
$$;

-- Keep the original source arrays for review/recovery; legacy data did not track provenance.
create table public.council_calendar_legacy_settings(key text primary key,value jsonb not null,captured_at timestamptz not null default now());
alter table public.council_calendar_legacy_settings enable row level security;
create policy calendar_legacy_read on public.council_calendar_legacy_settings for select to authenticated using(private.can_manage_department(2));
grant select on public.council_calendar_legacy_settings to authenticated;
insert into public.council_calendar_legacy_settings(key,value) select key,value from public.attendance_settings where key in ('disabled_dates','substitute_dates') on conflict do nothing;

alter table public.events add column if not exists substitute_for_day text;
update public.events e set substitute_for_day=coalesce((select x->>'replaceDay' from public.attendance_settings s,
 jsonb_array_elements(s.value) x where s.key='substitute_dates' and x->>'date'=e.date::text limit 1),
 substring(e.description from 'แทนตารางวัน(จันทร์|อังคาร|พุธ|พฤหัส|ศุกร์|เสาร์|อาทิตย์)'), 'จันทร์')
where type='substitute' and substitute_for_day is null;
create table public.council_calendar_manual_dates (
 kind text not null check(kind in ('holiday','substitute')), date date not null,
 replace_day text, primary key(kind,date)
);
alter table public.council_calendar_manual_dates enable row level security;
create policy calendar_manual_read on public.council_calendar_manual_dates for select to authenticated
 using(private.can_manage_department(2));
grant select on public.council_calendar_manual_dates to authenticated;
-- Old dates outside any calendar event are treated as manually configured dates.
insert into public.council_calendar_manual_dates(kind,date)
select 'holiday',d::date from public.attendance_settings s,jsonb_array_elements_text(s.value) d
where s.key='disabled_dates' and d ~ '^\d{4}-\d{2}-\d{2}$' and not exists(
 select 1 from public.events e where e.type='holiday' and d::date between e.date and coalesce(e.end_date,e.date))
on conflict do nothing;
insert into public.council_calendar_manual_dates(kind,date,replace_day)
select 'substitute',coalesce(x->>'date',trim(both '"' from x::text))::date,coalesce(x->>'replaceDay','จันทร์')
from public.attendance_settings s,jsonb_array_elements(s.value) x where s.key='substitute_dates'
and coalesce(x->>'date',trim(both '"' from x::text)) ~ '^\d{4}-\d{2}-\d{2}$'
and not exists(select 1 from public.events e where e.type='substitute'
 and e.date=coalesce(x->>'date',trim(both '"' from x::text))::date) on conflict do nothing;

create or replace function private.refresh_council_calendar_settings()
returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(7169001);
 insert into public.attendance_settings(key,value) select 'disabled_dates',coalesce(jsonb_agg(d::text order by d),'[]'::jsonb)
 from (select date d from public.council_calendar_manual_dates where kind='holiday'
 union select gs::date from public.events e cross join lateral generate_series(e.date::timestamp,coalesce(e.end_date,e.date)::timestamp,interval '1 day') gs where e.type='holiday') dates
 on conflict(key) do update set value=excluded.value;
 insert into public.attendance_settings(key,value) select 'substitute_dates',coalesce(jsonb_agg(jsonb_build_object('date',d::text,'replaceDay',replace_day) order by d),'[]'::jsonb)
 from (select distinct on(d) d,replace_day from (
 select date d,replace_day,0 priority,null::timestamptz created_at from public.council_calendar_manual_dates where kind='substitute'
 union all select date,coalesce(substitute_for_day,'จันทร์'),1,created_at from public.events where type='substitute') items
 order by d,priority,created_at desc,replace_day) dates
 on conflict(key) do update set value=excluded.value;
end $$;
create or replace function private.council_calendar_event_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin perform private.refresh_council_calendar_settings(); return null; end $$;
create trigger council_calendar_event_sync after insert or update or delete on public.events
 for each statement execute function private.council_calendar_event_trigger();
select private.refresh_council_calendar_settings();

create or replace function public.save_council_event(p_event jsonb,p_participants uuid[],p_event_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_date date; v_end date; v_type text;
begin
 if not coalesce(private.can_manage_department(2),false) then raise exception 'ไม่มีสิทธิ์จัดการปฏิทิน' using errcode='42501'; end if;
 v_date=(p_event->>'date')::date;v_end=coalesce(nullif(p_event->>'end_date','')::date,v_date);v_type=p_event->>'type';
 if v_date is null or v_end<v_date or v_end-v_date>366 or nullif(trim(p_event->>'title'),'') is null
 or v_type is null or v_type not in ('meeting','event','deadline','holiday','substitute') then raise exception 'ข้อมูลกิจกรรมหรือช่วงวันที่ไม่ถูกต้อง';end if;
 if coalesce(p_event->>'location_category','internal') not in ('internal','external') then raise exception 'สถานที่กิจกรรมไม่ถูกต้อง';end if;
 if coalesce(p_event->>'attendance_start_time','07:00') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
 or coalesce(p_event->>'attendance_limit_time','08:00') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
 or coalesce(p_event->>'attendance_limit_time','08:00')<coalesce(p_event->>'attendance_start_time','07:00') then raise exception 'เวลาเช็คชื่อไม่ถูกต้อง';end if;
 if v_type='substitute' and coalesce(p_event->>'substitute_for_day','') not in ('จันทร์','อังคาร','พุธ','พฤหัส','ศุกร์','เสาร์','อาทิตย์') then raise exception 'วันที่เรียนแทนไม่ถูกต้อง';end if;
 if exists(select 1 from unnest(coalesce(p_participants,'{}'::uuid[])) x where not exists(select 1 from public.users u where u.id=x and not coalesce(u.banned,false))) then raise exception 'ผู้เข้าร่วมบางคนไม่อยู่ในระบบหรือถูกปิดใช้งาน'; end if;
 perform pg_advisory_xact_lock(7169001);
 if p_event_id is not null then
  select id into v_id from public.events where id=p_event_id for update;
  if v_id is null then raise exception 'ไม่พบกิจกรรม';end if;
 else insert into public.events(title,date,type) values(trim(p_event->>'title'),v_date,v_type) returning id into v_id;end if;
 update public.events set title=trim(p_event->>'title'),date=v_date,end_date=v_end,type=v_type,
 color=p_event->>'color',description=coalesce(p_event->>'description',''),
 location_category=coalesce(p_event->>'location_category','internal'),
 check_attendance=coalesce(p_event->>'location_category','internal')<>'external' and coalesce((p_event->>'check_attendance')::boolean,false),
 attendance_start_time=coalesce(p_event->>'attendance_start_time','07:00'),attendance_limit_time=coalesce(p_event->>'attendance_limit_time','08:00'),
 substitute_for_day=case when v_type='substitute' then p_event->>'substitute_for_day' else null end where id=v_id;
 delete from public.event_participants where event_id=v_id;
 insert into public.event_participants(event_id,user_id) select v_id,x from (select distinct unnest(coalesce(p_participants,'{}'::uuid[])) x) ids;
 return jsonb_build_object('id',v_id);
end $$;
create or replace function public.delete_council_event(p_event_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not coalesce(private.can_manage_department(2),false) then raise exception 'ไม่มีสิทธิ์จัดการปฏิทิน' using errcode='42501';end if;
 perform pg_advisory_xact_lock(7169001);
 if not exists(select 1 from public.events where id=p_event_id) then raise exception 'ไม่พบกิจกรรม';end if;
 delete from public.event_participants where event_id=p_event_id;
 delete from public.events where id=p_event_id;
end $$;
create or replace function public.set_council_calendar_exception(p_kind text,p_date date,p_remove boolean default false,p_replace_day text default 'จันทร์')
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not coalesce(private.can_manage_department(2),false) then raise exception 'ไม่มีสิทธิ์ตั้งค่าวันเรียน' using errcode='42501';end if;
 if p_kind not in ('holiday','substitute') or p_date is null then raise exception 'วันเรียนไม่ถูกต้อง';end if;
 if p_kind='substitute' and (p_replace_day is null or p_replace_day not in ('จันทร์','อังคาร','พุธ','พฤหัส','ศุกร์','เสาร์','อาทิตย์')) then raise exception 'วันที่เรียนแทนไม่ถูกต้อง';end if;
 perform pg_advisory_xact_lock(7169001);
 if p_remove and exists(select 1 from public.events where type=p_kind and p_date between date and coalesce(end_date,date)) then raise exception 'วันนี้มาจากกิจกรรมปฏิทิน กรุณาแก้หรือลบกิจกรรมต้นทาง';end if;
 if p_remove then delete from public.council_calendar_manual_dates where kind=p_kind and date=p_date;
 else insert into public.council_calendar_manual_dates values(p_kind,p_date,p_replace_day) on conflict(kind,date) do update set replace_day=excluded.replace_day;end if;
 perform private.refresh_council_calendar_settings();
 return (select jsonb_object_agg(key,value) from public.attendance_settings where key in ('disabled_dates','substitute_dates'));
end $$;

alter table public.finance_requests add column if not exists requester_id uuid;
alter table public.finance_requests add column if not exists approved_by_id uuid;
alter table public.finance_requests add column if not exists disbursed_by_id uuid;
alter table public.finance_requests add column if not exists disbursed_at timestamptz;
alter table public.finance_requests add column if not exists academic_year integer;
update public.finance_requests set academic_year=private.council_academic_year((created_at at time zone 'Asia/Bangkok')::date) where academic_year is null;
alter table public.finance_requests alter column academic_year set default private.council_academic_year();
alter table public.finance_requests alter column academic_year set not null;
alter table public.finance_requests alter column requester_id set default private.current_council_user_id();
-- Link only unambiguous legacy names; preserve uncertain records without guessing.
update public.finance_requests r set requester_id=(select (array_agg(u.id))[1] from public.users u where u.nickname=r.requester having count(*)=1) where requester_id is null;
update public.finance_requests r set approved_by_id=(select (array_agg(u.id))[1] from public.users u where u.nickname=r.approved_by having count(*)=1) where approved_by_id is null and approved_by<>'';
create index finance_requests_year_idx on public.finance_requests(academic_year);
create table public.council_finance_budgets(academic_year integer primary key,amount integer not null check(amount>=0),updated_by uuid,updated_at timestamptz not null default now());
alter table public.council_finance_budgets enable row level security;
create policy finance_budget_read on public.council_finance_budgets for select to authenticated using(private.can_manage_department(1));
grant select on public.council_finance_budgets to authenticated;
-- Seed existing years at the previously configured amount; staff can correct them.
insert into public.council_finance_budgets(academic_year,amount) select distinct academic_year,15000 from public.finance_requests
union select private.council_academic_year(),15000 on conflict do nothing;
drop policy if exists finance_requests_read on public.finance_requests;
drop policy if exists finance_requests_submit on public.finance_requests;
drop policy if exists finance_requests_manage on public.finance_requests;
create policy finance_requests_read on public.finance_requests for select to authenticated using(requester_id=private.current_council_user_id() or private.can_manage_department(1));
create policy finance_requests_submit on public.finance_requests for insert to authenticated with check(requester_id=private.current_council_user_id() and requester=private.current_council_nickname() and dept_id=private.current_council_dept_id() and status='pending' and approved_by='' and approved_by_id is null and disbursed_at is null and disbursed_by_id is null and academic_year=private.council_academic_year() and amount>0);
-- All review/disbursement/payment updates must pass the locked RPCs below.
revoke update on public.finance_requests from authenticated;
revoke update(status,note,approved_by) on public.finance_requests from authenticated;
revoke update on public.finance_fees from authenticated;
create table public.council_fee_payment_audit(id uuid primary key default gen_random_uuid(),fee_id uuid not null,member_id uuid not null,paid boolean not null,actor_id uuid not null,created_at timestamptz not null default now());
alter table public.council_fee_payment_audit enable row level security;
create policy fee_audit_read on public.council_fee_payment_audit for select to authenticated using(private.can_manage_department(1));
grant select on public.council_fee_payment_audit to authenticated;
create or replace function public.record_council_fee_payments(p_fee_id uuid,p_user_ids uuid[],p_paid boolean default true)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_payments jsonb;v_patch jsonb;v_id uuid;v_old jsonb;
begin
 if not coalesce(private.can_manage_department(1),false) then raise exception 'ไม่มีสิทธิ์รับเงิน' using errcode='42501';end if;
 if coalesce(cardinality(p_user_ids),0)=0 or exists(select 1 from unnest(p_user_ids) id where not exists(select 1 from public.users where users.id=id)) then raise exception 'กรุณาเลือกสมาชิกที่มีอยู่ในระบบ';end if;
 select payments into v_payments from public.finance_fees where id=p_fee_id for update;
 if not found then raise exception 'ไม่พบรายการเก็บเงิน';end if;
 v_payments=coalesce(v_payments,'{}');
 foreach v_id in array p_user_ids loop
  v_old=v_payments->v_id::text;
  if p_paid then
   if jsonb_typeof(v_old)='object' then v_patch=jsonb_build_object(v_id::text,v_old||jsonb_build_object('paid',true,'status','paid'));
   else v_patch=jsonb_build_object(v_id::text,true);end if;
   v_payments=v_payments||v_patch;
  else v_payments=v_payments-v_id::text;end if;
  if v_old is distinct from (v_payments->v_id::text) then
   insert into public.council_fee_payment_audit(fee_id,member_id,paid,actor_id) values(p_fee_id,v_id,p_paid,private.current_council_user_id());
  end if;
 end loop;
 update public.finance_fees set payments=v_payments where id=p_fee_id;
 return v_payments;
end $$;
create or replace function public.review_council_finance_request(p_request_id uuid,p_status text,p_note text default '')
returns void language plpgsql security definer set search_path='' as $$
declare v public.finance_requests%rowtype;
begin
 if not coalesce(private.can_manage_department(1),false) then raise exception 'ไม่มีสิทธิ์ตรวจคำขอ' using errcode='42501';end if;
 if p_status is null or p_status not in ('approved','rejected') then raise exception 'สถานะไม่ถูกต้อง';end if;
 select * into v from public.finance_requests where id=p_request_id for update;
 if not found or v.status<>'pending' then raise exception 'คำขอนี้ถูกดำเนินการแล้ว กรุณาโหลดข้อมูลใหม่';end if;
 update public.finance_requests set status=p_status,note=case when p_status='rejected' then p_note else note end,
 approved_by=private.current_council_nickname(),approved_by_id=private.current_council_user_id() where id=p_request_id;
end $$;
create or replace function public.disburse_council_finance_request(p_request_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v public.finance_requests%rowtype;v_budget integer;v_paid bigint;
begin
 if not coalesce(private.can_manage_department(1),false) then raise exception 'ไม่มีสิทธิ์จ่ายเงิน' using errcode='42501';end if;
 perform pg_advisory_xact_lock(7169002);
 select * into v from public.finance_requests where id=p_request_id for update;
 if not found or v.status<>'approved' or v.disbursed_at is not null then raise exception 'คำขอยังไม่อนุมัติหรือจ่ายแล้ว';end if;
 select amount into v_budget from public.council_finance_budgets where academic_year=v.academic_year;
 if v_budget is null then raise exception 'กรุณาตั้งงบประมาณของปีนี้ก่อน';end if;
 select coalesce(sum(amount),0) into v_paid from public.finance_requests where academic_year=v.academic_year and disbursed_at is not null;
 if v_paid+v.amount>v_budget then raise exception 'ยอดจ่ายเกินงบประมาณคงเหลือ';end if;
 update public.finance_requests set disbursed_at=now(),disbursed_by_id=private.current_council_user_id() where id=p_request_id;
end $$;
create or replace function public.set_council_finance_budget(p_year integer,p_amount integer)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not coalesce(private.can_manage_department(1),false) then raise exception 'ไม่มีสิทธิ์ตั้งงบประมาณ' using errcode='42501';end if;
 if p_year<2500 or p_year>2700 or p_amount<0 or p_amount is null then raise exception 'งบประมาณไม่ถูกต้อง';end if;
 perform pg_advisory_xact_lock(7169002);
 if p_amount<(select coalesce(sum(amount),0) from public.finance_requests where academic_year=p_year and disbursed_at is not null) then raise exception 'งบต้องไม่น้อยกว่ายอดที่จ่ายแล้ว';end if;
 insert into public.council_finance_budgets values(p_year,p_amount,private.current_council_user_id(),now()) on conflict(academic_year) do update set amount=excluded.amount,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
end $$;

create table public.council_notification_outbox(id uuid primary key default gen_random_uuid(),sender_auth_id uuid not null default auth.uid(),payload jsonb not null,status text not null default 'pending' check(status in ('pending','sending','sent','failed','uncertain')),attempt_started_at timestamptz,last_error text,created_at timestamptz not null default now());
alter table public.council_notification_outbox enable row level security;
create policy outbox_owner on public.council_notification_outbox for all to authenticated using(sender_auth_id=auth.uid() and private.current_council_user_id() is not null) with check(sender_auth_id=auth.uid() and private.current_council_user_id() is not null);
grant select,insert,update on public.council_notification_outbox to authenticated;
revoke all on function private.refresh_council_calendar_settings(),private.council_calendar_event_trigger() from public,anon,authenticated;
revoke all on function public.save_council_event(jsonb,uuid[],uuid),public.delete_council_event(uuid),public.set_council_calendar_exception(text,date,boolean,text),public.record_council_fee_payments(uuid,uuid[],boolean),public.review_council_finance_request(uuid,text,text),public.disburse_council_finance_request(uuid),public.set_council_finance_budget(integer,integer) from public,anon;
grant execute on function public.save_council_event(jsonb,uuid[],uuid),public.delete_council_event(uuid),public.set_council_calendar_exception(text,date,boolean,text),public.record_council_fee_payments(uuid,uuid[],boolean),public.review_council_finance_request(uuid,text,text),public.disburse_council_finance_request(uuid),public.set_council_finance_budget(integer,integer) to authenticated;

create or replace function public.create_council_announcement(p_target_ids uuid[],p_message text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not coalesce(private.is_council_leader(),false) then raise exception 'ไม่มีสิทธิ์ประกาศ' using errcode='42501';end if;
 if nullif(trim(p_message),'') is null or length(p_message)>10000 or coalesce(cardinality(p_target_ids),0)=0 then raise exception 'กรุณาระบุข้อความและผู้รับ';end if;
 if exists(select 1 from unnest(p_target_ids) target where not exists(select 1 from public.users where id=target and not coalesce(banned,false))) then raise exception 'ผู้รับบางคนไม่อยู่ในระบบ';end if;
 insert into public.notifications(type,user_id,message) select 'announcement',target::text,
 '📢 ประกาศด่วนโดย '||private.current_council_nickname()||': '||trim(p_message) from (select distinct unnest(p_target_ids) target) ids;
end $$;
revoke all on function public.create_council_announcement(uuid[],text) from public,anon;
grant execute on function public.create_council_announcement(uuid[],text) to authenticated;

-- Calendar writes must lock before changing either events or their participants.
revoke insert, update, delete on public.events, public.event_participants from authenticated;
