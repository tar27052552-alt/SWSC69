-- Prepared locally only. Requires council workflow and verified check-in migrations.
alter table public.events add column attendance_by_day boolean not null default false;
create table public.event_attendance_days(
 event_id uuid not null references public.events(id) on delete cascade,
 date date not null, mode text not null check(mode in ('check','exempt')),
 opens_at time, late_at time, closes_at time,
 primary key(event_id,date),
 check(mode='exempt' or (opens_at is not null and late_at is not null and closes_at is not null and opens_at<=late_at and late_at<=closes_at and opens_at<closes_at))
);
create table public.event_day_participants(
 event_id uuid not null, date date not null, user_id uuid not null references public.users(id),
 primary key(event_id,date,user_id),unique(user_id,date),
 foreign key(event_id,date) references public.event_attendance_days(event_id,date) on delete cascade
);
create index event_day_date_idx on public.event_attendance_days(date,event_id);
alter table public.event_attendance_days enable row level security;
alter table public.event_day_participants enable row level security;
grant select on public.event_attendance_days,public.event_day_participants to authenticated;
grant all on public.event_attendance_days,public.event_day_participants to service_role;
create policy event_days_read on public.event_attendance_days for select to authenticated using((select private.current_council_user_id()) is not null);
create policy event_day_members_read on public.event_day_participants for select to authenticated using((select private.current_council_user_id()) is not null);
-- No client write grants: the calendar RPC owns validation and atomic writes.
alter table public.student_attendance add column event_id uuid references public.events(id) on delete restrict;
alter table public.student_attendance add column event_rule_snapshot jsonb;
create index student_attendance_event_idx on public.student_attendance(event_id) where event_id is not null;

-- Freeze pre-migration membership for historical exemptions; never rewrite old results.
create table private.event_attendance_legacy_snapshot as
 select e.id event_id,to_jsonb(e) event,coalesce((select array_agg(p.user_id) from public.event_participants p where p.event_id=e.id),'{}'::uuid[]) participants,
 (now() at time zone 'Asia/Bangkok')::date effective_date from public.events e;
alter table private.event_attendance_legacy_snapshot add primary key(event_id);
alter table private.event_attendance_legacy_snapshot enable row level security;
revoke all on private.event_attendance_legacy_snapshot from public,anon,authenticated;
-- Stop the migration rather than silently choosing a winner for existing overlaps.
do $$begin
 if exists(select 1 from public.events e join public.event_participants p on p.event_id=e.id
 cross join lateral generate_series(greatest(e.date::date,(now() at time zone 'Asia/Bangkok')::date),coalesce(e.end_date,e.date)::date,interval '1 day') g
 where e.type not in ('holiday','substitute') group by p.user_id,g having count(distinct e.id)>1) then
 raise exception 'รายชื่อกิจกรรมเดิมซ้อนกัน กรุณาตรวจรายงาน preflight และแก้ก่อนเปิดใช้';end if;
end $$;
insert into public.event_attendance_days(event_id,date,mode,opens_at,late_at,closes_at)
select e.id,g::date,case when e.check_attendance then 'check' else 'exempt' end,
 coalesce(nullif(e.attendance_start_time,''),'07:00')::time,
 coalesce(nullif(e.attendance_limit_time,''),'08:00')::time,
 coalesce(nullif(e.attendance_limit_time,''),'08:00')::time
from public.events e cross join lateral generate_series(greatest(e.date::date,(now() at time zone 'Asia/Bangkok')::date),coalesce(e.end_date,e.date)::date,interval '1 day') g
where e.type not in ('holiday','substitute') and exists(select 1 from public.event_participants p where p.event_id=e.id);
insert into public.event_day_participants select d.event_id,d.date,p.user_id from public.event_attendance_days d join public.event_participants p on p.event_id=d.event_id;

alter function public.save_council_event(jsonb,uuid[],uuid) set schema private;
alter function private.save_council_event(jsonb,uuid[],uuid) rename to save_council_event_legacy;
revoke all on function private.save_council_event_legacy(jsonb,uuid[],uuid) from public,anon,authenticated;
create function public.save_council_event(p_event jsonb,p_participants uuid[],p_event_id uuid default null,p_days jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_start date;v_end date;v_today date:=(now() at time zone 'Asia/Bangkok')::date;
 v_days jsonb;v_day jsonb;v_old jsonb;v_new jsonb;v_all uuid[];v_conflict text;v_result jsonb;
begin
 if not coalesce(private.can_manage_department(2),false) then raise exception 'ไม่มีสิทธิ์จัดการปฏิทิน' using errcode='42501';end if;
 perform pg_advisory_xact_lock(7169001);
 v_start=(p_event->>'date')::date;v_end=coalesce(nullif(p_event->>'end_date','')::date,v_start);
 if v_start is null or v_end<v_start or v_end-v_start>365 then raise exception 'ช่วงวันที่กิจกรรมไม่ถูกต้อง';end if;
 if p_days is null then
  -- Older callers retain their whole-event roster contract.
  select coalesce(jsonb_agg(jsonb_build_object('date',g::date,'mode',case when coalesce((p_event->>'check_attendance')::boolean,false) then 'check' else 'exempt' end,
  'opens_at',coalesce(p_event->>'attendance_start_time','07:00'),'late_at',coalesce(p_event->>'attendance_limit_time','08:00'),'closes_at',coalesce(p_event->>'attendance_limit_time','08:00'),
  'participants',to_jsonb(coalesce(p_participants,'{}'::uuid[]))) order by g),'[]'::jsonb) into v_days
  from generate_series(v_start,v_end,interval '1 day') g where p_event->>'type' not in ('holiday','substitute');
 else v_days=p_days;end if;
 if jsonb_typeof(v_days)<>'array' then raise exception 'กติการายวันไม่ถูกต้อง';end if;
 if p_event->>'type' in ('holiday','substitute') and jsonb_array_length(v_days)>0 then raise exception 'วันหยุดและวันชดเชยไม่ใช้รายชื่อกิจกรรม';end if;
 if p_event->>'type' not in ('holiday','substitute') and jsonb_array_length(v_days)<>v_end-v_start+1 then raise exception 'กรุณากำหนดกติกาให้ครบทุกวัน';end if;
 if exists(select 1 from jsonb_array_elements(v_days) x group by x->>'date' having count(*)>1) then raise exception 'วันที่กิจกรรมซ้ำ';end if;
 for v_day in select value from jsonb_array_elements(v_days) loop
  if v_day->>'date' is null or (v_day->>'date')::date not between v_start and v_end or coalesce(v_day->>'mode','') not in ('check','exempt') or jsonb_typeof(v_day->'participants') is distinct from 'array' then raise exception 'กติกาหรือรายชื่อกิจกรรมไม่ถูกต้อง';end if;
  if v_day->>'mode'='check' and (coalesce(v_day->>'opens_at','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(v_day->>'late_at','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(v_day->>'closes_at','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
   or (v_day->>'opens_at')::time>(v_day->>'late_at')::time or (v_day->>'late_at')::time>(v_day->>'closes_at')::time or (v_day->>'opens_at')::time>=(v_day->>'closes_at')::time) then raise exception 'เวลาเช็คชื่อไม่ถูกต้อง';end if;
  if exists(select 1 from jsonb_array_elements_text(v_day->'participants') x where not exists(select 1 from public.users u where u.id=x::uuid and u.role<>'admin' and (not coalesce(u.banned,false) or exists(select 1 from public.event_day_participants old_member where old_member.event_id=p_event_id and old_member.date=(v_day->>'date')::date and old_member.user_id=u.id)))) then raise exception 'รายชื่อสมาชิกไม่ถูกต้องหรือถูกระงับ';end if;
  if (select count(*)<>count(distinct x) from jsonb_array_elements_text(v_day->'participants') x) then raise exception 'สมาชิกซ้ำในวันเดียวกัน';end if;
 end loop;
 -- Compare normalized snapshots; immutable dates are not rewritten or recalculated.
 for v_day in select value from jsonb_array_elements(v_days) union all select jsonb_build_object('date',d.date) from public.event_attendance_days d where d.event_id=p_event_id and not exists(select 1 from jsonb_array_elements(v_days) x where (x->>'date')::date=d.date) loop
  select jsonb_build_object('mode',d.mode,'opens_at',case when d.mode='check' then to_char(d.opens_at,'HH24:MI') end,'late_at',case when d.mode='check' then to_char(d.late_at,'HH24:MI') end,'closes_at',case when d.mode='check' then to_char(d.closes_at,'HH24:MI') end,
   'location',e.location_category,'members',coalesce((select jsonb_agg(p.user_id::text order by p.user_id::text) from public.event_day_participants p where p.event_id=d.event_id and p.date=d.date),'[]'::jsonb)) into v_old
  from public.event_attendance_days d join public.events e on e.id=d.event_id where d.event_id=p_event_id and d.date=(v_day->>'date')::date;
  if v_old is null and (v_day->>'date')::date<v_today then
   select jsonb_build_object('mode',case when coalesce((l.event->>'check_attendance')::boolean,false) then 'check' else 'exempt' end,
    'opens_at',case when coalesce((l.event->>'check_attendance')::boolean,false) then coalesce(l.event->>'attendance_start_time','07:00') end,
    'late_at',case when coalesce((l.event->>'check_attendance')::boolean,false) then coalesce(l.event->>'attendance_limit_time','08:00') end,
    'closes_at',case when coalesce((l.event->>'check_attendance')::boolean,false) then coalesce(l.event->>'attendance_limit_time','08:00') end,
    'location',coalesce(l.event->>'location_category','internal'),'members',(select coalesce(jsonb_agg(x::text order by x::text),'[]'::jsonb) from unnest(l.participants) x)) into v_old
   from private.event_attendance_legacy_snapshot l where l.event_id=p_event_id and (v_day->>'date')::date between (l.event->>'date')::date and coalesce(l.event->>'end_date',l.event->>'date')::date;
  end if;
  v_new=case when v_day ? 'participants' then jsonb_build_object('mode',v_day->>'mode','opens_at',case when v_day->>'mode'='check' then v_day->>'opens_at' end,'late_at',case when v_day->>'mode'='check' then v_day->>'late_at' end,'closes_at',case when v_day->>'mode'='check' then v_day->>'closes_at' end,
   'location',coalesce(p_event->>'location_category','internal'),'members',(select coalesce(jsonb_agg(x order by x),'[]'::jsonb) from jsonb_array_elements_text(v_day->'participants') x)) end;
  if v_old is distinct from v_new and ((v_day->>'date')::date<v_today or exists(select 1 from public.student_attendance a where a.date::date=(v_day->>'date')::date and (a.user_id in(select jsonb_array_elements_text(coalesce(v_day->'participants','[]'::jsonb))) or a.user_id in(select p.user_id::text from public.event_day_participants p where p.event_id=p_event_id and p.date=(v_day->>'date')::date)))) then raise exception 'กติกาวันที่ผ่านมา หรือสมาชิกที่เช็คชื่อแล้ว ถูกล็อกไม่ให้แก้ไข';end if;
 end loop;
 select string_agg(distinct u.name||' · '||p.date||' · '||e.title,E'\n') into v_conflict
 from jsonb_array_elements(v_days) d cross join lateral jsonb_array_elements_text(d->'participants') x
 join public.event_day_participants p on p.user_id=x::uuid and p.date=(d->>'date')::date and (p_event_id is null or p.event_id<>p_event_id)
 join public.events e on e.id=p.event_id join public.users u on u.id=p.user_id;
 if v_conflict is not null then raise exception 'รายชื่อซ้อนกับกิจกรรมอื่น:%',E'\n'||v_conflict;end if;
 select coalesce(array_agg(distinct x::uuid),'{}'::uuid[]) into v_all from jsonb_array_elements(v_days) d cross join lateral jsonb_array_elements_text(d->'participants') x;
 v_result=private.save_council_event_legacy(p_event,v_all,p_event_id);v_id=(v_result->>'id')::uuid;
 update public.events set attendance_by_day=true,check_attendance=exists(select 1 from jsonb_array_elements(v_days) x where x->>'mode'='check') where id=v_id;
 delete from public.event_attendance_days d where d.event_id=v_id and d.date>=v_today and not exists(select 1 from public.student_attendance a join public.event_day_participants p on a.user_id=p.user_id::text and a.date::date=p.date where p.event_id=d.event_id and p.date=d.date);
 for v_day in select value from jsonb_array_elements(v_days) loop
  if (v_day->>'date')::date>=v_today and not exists(select 1 from public.event_attendance_days d where d.event_id=v_id and d.date=(v_day->>'date')::date) then
   insert into public.event_attendance_days values(v_id,(v_day->>'date')::date,v_day->>'mode',case when v_day->>'mode'='check' then (v_day->>'opens_at')::time end,case when v_day->>'mode'='check' then (v_day->>'late_at')::time end,case when v_day->>'mode'='check' then (v_day->>'closes_at')::time end);
   insert into public.event_day_participants select v_id,(v_day->>'date')::date,x::uuid from jsonb_array_elements_text(v_day->'participants') x;
  end if;
 end loop;
 return v_result;
end $$;
revoke all on function public.save_council_event(jsonb,uuid[],uuid,jsonb) from public,anon;
grant execute on function public.save_council_event(jsonb,uuid[],uuid,jsonb) to authenticated;

alter function public.delete_council_event(uuid) set schema private;
alter function private.delete_council_event(uuid) rename to delete_council_event_legacy;
revoke all on function private.delete_council_event_legacy(uuid) from public,anon,authenticated;
create function public.delete_council_event(p_event_id uuid) returns void language plpgsql security definer set search_path='' as $$begin
 if not coalesce(private.can_manage_department(2),false) then raise exception 'ไม่มีสิทธิ์จัดการปฏิทิน';end if;
 perform pg_advisory_xact_lock(7169001);
 if exists(select 1 from public.event_attendance_days d where d.event_id=p_event_id and (d.date<(now() at time zone 'Asia/Bangkok')::date or exists(select 1 from public.student_attendance a join public.event_day_participants p on a.user_id=p.user_id::text and a.date::date=p.date where p.event_id=d.event_id and p.date=d.date))) then raise exception 'กิจกรรมมีวันที่ล็อกหรือมีผลเช็คชื่อแล้ว ไม่สามารถลบได้';end if;
 if exists(select 1 from private.event_attendance_legacy_snapshot l where l.event_id=p_event_id and cardinality(l.participants)>0 and (l.event->>'date')::date<(now() at time zone 'Asia/Bangkok')::date) then raise exception 'กิจกรรมมีวันที่ผ่านมาแล้ว ไม่สามารถลบได้';end if;
 perform private.delete_council_event_legacy(p_event_id);
end $$;
revoke all on function public.delete_council_event(uuid) from public,anon;grant execute on function public.delete_council_event(uuid) to authenticated;

create function private.event_checkin_context(p_user uuid,p_date date,p_now timestamp)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d record;a record;v_active boolean;begin
 select coalesce((value#>>'{}')<>'false',true) into v_active from public.attendance_settings where key='check_in_active';v_active=coalesce(v_active,true);
 select r.*,e.title,e.location_category into d from public.event_day_participants p join public.event_attendance_days r using(event_id,date) join public.events e on e.id=p.event_id where p.user_id=p_user and p.date=p_date;
 if not found then
  if exists(select 1 from private.event_attendance_legacy_snapshot l where p_user=any(l.participants) and p_date<l.effective_date and p_date between (l.event->>'date')::date and coalesce(l.event->>'end_date',l.event->>'date')::date and l.event->>'location_category'='external' and not coalesce((l.event->>'check_attendance')::boolean,false)) then
   return jsonb_build_object('mode','exempt','date',p_date,'status','activity','system_active',v_active,'can_checkin',false,'title','กิจกรรมเดิม');
  end if;
  return jsonb_build_object('mode','regular','system_active',v_active);end if;
 select * into a from public.student_attendance where user_id=p_user::text and date::date=p_date;
 return jsonb_build_object('mode',d.mode,'event_id',d.event_id,'title',d.title,'date',p_date,'opens_at',to_char(d.opens_at,'HH24:MI'),'late_at',to_char(d.late_at,'HH24:MI'),'closes_at',to_char(d.closes_at,'HH24:MI'),'location',d.location_category,'requires_gps',d.location_category='internal','system_active',v_active,
 'status',case when a.id is not null then a.status when not v_active then 'not_required' when d.mode='exempt' then 'activity' when p_date<p_now::date or (p_date=p_now::date and p_now::time>d.closes_at) then 'missing' else 'pending' end,
 'can_checkin',v_active and d.mode='check' and p_date=p_now::date and p_now::time between d.opens_at and d.closes_at and a.id is null);
end $$;
revoke all on function private.event_checkin_context(uuid,date,timestamp) from public,anon,authenticated;
create function public.get_my_checkin_context(p_date date default (now() at time zone 'Asia/Bangkok')::date)
returns jsonb language plpgsql stable security definer set search_path='' as $$declare v_user uuid;begin
 v_user=private.current_council_user_id();if v_user is null then raise exception 'ไม่พบบัญชีสมาชิก' using errcode='42501';end if;
 return private.event_checkin_context(v_user,p_date,now() at time zone 'Asia/Bangkok');end $$;
revoke all on function public.get_my_checkin_context(date) from public,anon;grant execute on function public.get_my_checkin_context(date) to authenticated;
create function public.get_my_event_attendance(p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path='' as $$declare v_user uuid;begin
 v_user=private.current_council_user_id();if v_user is null then raise exception 'ไม่พบบัญชีสมาชิก' using errcode='42501';end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'ช่วงวันที่ไม่ถูกต้อง';end if;
 return coalesce((select jsonb_agg(private.event_checkin_context(v_user,dates.date,now() at time zone 'Asia/Bangkok') order by dates.date) from (
 select p.date from public.event_day_participants p where p.user_id=v_user and p.date between p_from and p_to
 union select g::date from private.event_attendance_legacy_snapshot l cross join lateral generate_series(greatest((l.event->>'date')::date,p_from),least(coalesce(l.event->>'end_date',l.event->>'date')::date,p_to,l.effective_date-1),interval '1 day') g
 where v_user=any(l.participants) and l.event->>'location_category'='external' and not coalesce((l.event->>'check_attendance')::boolean,false)
 ) dates),'[]'::jsonb);end $$;
revoke all on function public.get_my_event_attendance(date,date) from public,anon;grant execute on function public.get_my_event_attendance(date,date) to authenticated;
create function public.get_event_attendance_report(p_date date) returns jsonb
language plpgsql stable security definer set search_path='' as $$begin
 if not coalesce(private.can_manage_department(2),false) then raise exception 'ไม่มีสิทธิ์ดูรายงาน' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('user_id',p.user_id,'name',u.name,'nickname',u.nickname,'context',private.event_checkin_context(p.user_id,p.date,now() at time zone 'Asia/Bangkok')) order by u.name) from public.event_day_participants p join public.users u on u.id=p.user_id where p.date=p_date),'[]'::jsonb);end $$;
revoke all on function public.get_event_attendance_report(date) from public,anon;grant execute on function public.get_event_attendance_report(date) to authenticated;

alter function public.record_my_checkin(text) set schema private;
alter function private.record_my_checkin(text) rename to record_regular_checkin;
revoke all on function private.record_regular_checkin(text) from public,anon,authenticated;
create function private.record_event_checkin(p_user uuid,p_photo text,p_lat double precision,p_lng double precision,p_now timestamp)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c jsonb;u public.users%rowtype;v_id uuid;v_late boolean;v_minutes integer;v_amount integer;v_lat double precision;v_lng double precision;v_radius double precision;v_distance double precision;
begin
 select * into u from public.users where id=p_user and banned is not true and must_change_password is not true;
 if u.id is null then raise exception 'ไม่พบบัญชีสมาชิก';end if;
 perform pg_advisory_xact_lock(7169001);
 c=private.event_checkin_context(p_user,p_now::date,p_now);
 if c->>'mode'='regular' then return private.record_regular_checkin(p_photo);end if;
 if not (c->>'system_active')::boolean then raise exception 'ระบบเช็คชื่อถูกปิด';end if;
 if c->>'mode'='exempt' then raise exception 'วันนี้ได้รับยกเว้นเช็คชื่อ';end if;
 if not (c->>'can_checkin')::boolean then raise exception 'ยังไม่ถึงเวลา หมดเวลา หรือวันนี้เช็คชื่อแล้ว';end if;
 if nullif(trim(p_photo),'') is null then raise exception 'กรุณาถ่ายภาพยืนยันตัวตน';end if;
 if (c->>'requires_gps')::boolean then
  if p_lat is null or p_lng is null or not (p_lat between -90 and 90 and p_lng between -180 and 180) then raise exception 'กรุณาเปิด GPS เพื่อเช็คชื่อในโรงเรียน';end if;
  select coalesce((value#>>'{}')::double precision,16.713228) into v_lat from public.attendance_settings where key='school_center_lat';
  select coalesce((value#>>'{}')::double precision,98.573082) into v_lng from public.attendance_settings where key='school_center_lng';
  select coalesce((value#>>'{}')::double precision,100) into v_radius from public.attendance_settings where key='school_radius';
  v_lat=coalesce(v_lat,16.713228);v_lng=coalesce(v_lng,98.573082);v_radius=coalesce(v_radius,100);
  v_distance=6371000*2*asin(sqrt(least(1,power(sin(radians(p_lat-v_lat)/2),2)+cos(radians(v_lat))*cos(radians(p_lat))*power(sin(radians(p_lng-v_lng)/2),2))));
  if v_distance>v_radius then raise exception 'พิกัดอยู่นอกรัศมีโรงเรียน';end if;
 end if;
 v_late=p_now::time>(c->>'late_at')::time;
 v_minutes=case when v_late then ceil(extract(epoch from(p_now-(p_now::date+(c->>'late_at')::time)))/60)::integer else 0 end;
 v_amount=v_minutes*5*case when u.dept_id=2 then 2 else 1 end;
 insert into public.student_attendance(user_id,user_name,nickname,date,time,status,photo,is_manual,event_id,event_rule_snapshot)
 values(u.id::text,u.name,u.nickname,p_now::date::text,to_char(p_now,'HH24:MI')||' น.',case when v_late then 'late' else 'on_time' end,p_photo,false,(c->>'event_id')::uuid,c)
 on conflict(user_id,date) do nothing returning id into v_id;
 if v_id is null then raise exception 'วันนี้เช็คชื่อแล้ว';end if;
 if v_amount>0 then insert into public.discipline_fines(user_id,user_name,nickname,violation,amount,date,note,by,paid)
 select u.id::text,u.name,u.nickname,'มาสาย (นาที)',v_amount,p_now::date::text,'กิจกรรม '||(c->>'title')||' สาย '||v_minutes||' นาที','ระบบอัตโนมัติ',false
 where not exists(select 1 from public.discipline_fines f where f.user_id=u.id::text and f.date=p_now::date::text and f.violation='มาสาย (นาที)');end if;
 insert into public.notifications(type,user_id,message) values(case when v_late then 'fine' else 'task' end,u.id::text,'เช็คชื่อกิจกรรม '||(c->>'title')||' เวลา '||to_char(p_now,'HH24:MI'));
 return jsonb_build_object('success',true,'date',p_now::date,'time',to_char(p_now,'HH24:MI')||' น.','is_late',v_late,'minutes_late',v_minutes,'amount',v_amount,'event_id',c->>'event_id','event_title',c->>'title','late_at',c->>'late_at');
end $$;
revoke all on function private.record_event_checkin(uuid,text,double precision,double precision,timestamp) from public,anon,authenticated;
create function public.record_my_checkin(p_photo text default null,p_lat double precision default null,p_lng double precision default null)
returns jsonb language plpgsql security definer set search_path='' as $$declare v_user uuid;begin
 v_user=private.current_council_user_id();if v_user is null then raise exception 'ไม่พบบัญชีสมาชิก' using errcode='42501';end if;
 return private.record_event_checkin(v_user,p_photo,p_lat,p_lng,now() at time zone 'Asia/Bangkok');end $$;
revoke all on function public.record_my_checkin(text,double precision,double precision) from public,anon;grant execute on function public.record_my_checkin(text,double precision,double precision) to authenticated;

create function public.get_event_attendance_editor(p_event_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$declare v_event public.events%rowtype;v_result jsonb;begin
 if not coalesce(private.can_manage_department(2),false) then raise exception 'ไม่มีสิทธิ์จัดการปฏิทิน' using errcode='42501';end if;
 select * into v_event from public.events where id=p_event_id;if not found then raise exception 'ไม่พบกิจกรรม';end if;
 select coalesce(jsonb_agg(jsonb_build_object('date',g::date,'mode',coalesce(d.mode,case when v_event.check_attendance then 'check' else 'exempt' end),
 'opens_at',coalesce(to_char(d.opens_at,'HH24:MI'),v_event.attendance_start_time,'07:00'),
 'late_at',coalesce(to_char(d.late_at,'HH24:MI'),v_event.attendance_limit_time,'08:00'),
 'closes_at',coalesce(to_char(d.closes_at,'HH24:MI'),v_event.attendance_limit_time,'08:00'),
 'participants',case when d.event_id is not null then coalesce((select jsonb_agg(p.user_id::text order by p.user_id::text) from public.event_day_participants p where p.event_id=d.event_id and p.date=d.date),'[]'::jsonb)
 else coalesce((select to_jsonb(l.participants) from private.event_attendance_legacy_snapshot l where l.event_id=p_event_id),'[]'::jsonb) end,
 'locked',g::date<(now() at time zone 'Asia/Bangkok')::date or exists(select 1 from public.student_attendance a join public.event_day_participants p on a.user_id=p.user_id::text and a.date::date=p.date where p.event_id=p_event_id and p.date=g::date)
 ) order by g),'[]'::jsonb) into v_result
 from generate_series(v_event.date::date,coalesce(v_event.end_date,v_event.date)::date,interval '1 day') g
 left join public.event_attendance_days d on d.event_id=p_event_id and d.date=g::date;
 return v_result;end $$;
revoke all on function public.get_event_attendance_editor(uuid) from public,anon;grant execute on function public.get_event_attendance_editor(uuid) to authenticated;
