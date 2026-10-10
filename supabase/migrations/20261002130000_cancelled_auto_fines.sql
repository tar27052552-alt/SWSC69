-- A deleted duty fine is an explicit cancellation, not an unpaid missing record.
create table private.cancelled_duty_fines (
  id bigint generated always as identity primary key,
  user_id text,
  nickname text,
  fine_date text not null,
  violation text not null,
  cancelled_at timestamptz not null default now(),
  cancelled_by uuid default auth.uid()
);
alter table private.cancelled_duty_fines enable row level security;
revoke all on private.cancelled_duty_fines from public, anon, authenticated;
create index cancelled_duty_fines_lookup on private.cancelled_duty_fines(fine_date, violation, user_id);

create or replace function private.remember_cancelled_duty_fine()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.violation in ('ไม่ปฏิบัติเวรไหว้', 'ไม่ทำเวรห้องสภา') then
    insert into private.cancelled_duty_fines(user_id,nickname,fine_date,violation)
    values(nullif(old.user_id::text,''),old.nickname,old.date::text,old.violation);
  end if;
  return old;
end $$;

create or replace function private.prevent_cancelled_duty_fine()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.violation in ('ไม่ปฏิบัติเวรไหว้', 'ไม่ทำเวรห้องสภา') and exists (
    select 1 from private.cancelled_duty_fines c
    where c.fine_date = new.date::text and c.violation = new.violation
    and (c.user_id = nullif(new.user_id::text,'')
      or (c.user_id is null and c.nickname = new.nickname))
  ) then
    raise exception 'รายการค่าปรับนี้ถูกยกเลิกแล้ว ไม่สามารถสร้างซ้ำได้'
      using errcode = '23505';
  end if;
  return new;
end $$;
revoke all on function private.remember_cancelled_duty_fine(), private.prevent_cancelled_duty_fine() from public, anon, authenticated;
create trigger remember_cancelled_duty_fine before delete on public.discipline_fines
for each row execute function private.remember_cancelled_duty_fine();
create trigger prevent_cancelled_duty_fine before insert or update on public.discipline_fines
for each row execute function private.prevent_cancelled_duty_fine();
