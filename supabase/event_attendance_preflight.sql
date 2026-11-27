-- READ ONLY. Resolve every returned conflict before applying daily_event_attendance.
select p.user_id,u.name,g::date as date,array_agg(e.id) as event_ids,array_agg(e.title) as event_titles
from public.events e join public.event_participants p on p.event_id=e.id join public.users u on u.id=p.user_id
cross join lateral generate_series(greatest(e.date::date,(now() at time zone 'Asia/Bangkok')::date),coalesce(e.end_date,e.date)::date,interval '1 day') g
where e.type not in ('holiday','substitute') group by p.user_id,u.name,g having count(distinct e.id)>1;

select e.id,e.title,e.attendance_start_time,e.attendance_limit_time from public.events e
where coalesce(e.end_date,e.date)::date>=(now() at time zone 'Asia/Bangkok')::date and e.check_attendance
and (e.attendance_start_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or e.attendance_limit_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
or e.attendance_start_time>=e.attendance_limit_time);
