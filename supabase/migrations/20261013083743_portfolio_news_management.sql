-- Prepared locally. News stays a single record; portfolio presentation is admin-only.
alter table public.web_news add column portfolio_academic_year integer check(portfolio_academic_year between 2400 and 2800);
alter table public.web_news add column portfolio_featured boolean not null default false;
alter table public.web_news add column portfolio_hidden boolean not null default false;
create function private.guard_news_portfolio_metadata() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if current_user in ('anon','authenticated') and (
  (tg_op='INSERT' and (new.portfolio_academic_year is not null or new.portfolio_featured or new.portfolio_hidden))
  or (tg_op='UPDATE' and (new.portfolio_academic_year is distinct from old.portfolio_academic_year
   or new.portfolio_featured is distinct from old.portfolio_featured or new.portfolio_hidden is distinct from old.portfolio_hidden))
 ) and private.current_council_role() is distinct from 'admin' then
  raise exception 'เฉพาะผู้ดูแลระบบเท่านั้น';
 end if;
 return new;
end $$;
revoke all on function private.guard_news_portfolio_metadata() from public,anon;
create trigger guard_news_portfolio_metadata before insert or update on public.web_news
for each row execute function private.guard_news_portfolio_metadata();
create function public.manage_news_portfolio(p_id text,p_year integer,p_featured boolean,p_hidden boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_count integer;
begin
 if private.current_council_role() is distinct from 'admin' then raise exception 'เฉพาะผู้ดูแลระบบเท่านั้น'; end if;
 if p_year is null or p_year not between 2400 and 2800 or p_featured is null or p_hidden is null then raise exception 'ข้อมูลผลงานไม่ถูกต้อง'; end if;
 update public.web_news set portfolio_academic_year=p_year,portfolio_featured=p_featured,portfolio_hidden=p_hidden
 where id::text=p_id and category='ผลงาน';
 get diagnostics v_count=row_count;
 if v_count<>1 then raise exception 'ไม่พบข่าวหมวดผลงาน หรือข่าวถูกเปลี่ยนหมวดแล้ว'; end if;
 return jsonb_build_object('saved',true);
end $$;
revoke all on function public.manage_news_portfolio(text,integer,boolean,boolean) from public,anon;
grant execute on function public.manage_news_portfolio(text,integer,boolean,boolean) to authenticated;

-- A year can also be public when its only published works come from tagged news.
drop policy portfolio_years_public on public.council_portfolio_years;
create policy portfolio_years_public on public.council_portfolio_years for select to anon,authenticated using(
 exists(select 1 from public.council_portfolio_items i where i.academic_year=council_portfolio_years.academic_year and i.status='published')
 or exists(select 1 from public.web_news n where n.category='ผลงาน' and not n.portfolio_hidden and
 coalesce(n.portfolio_academic_year,
   substring(translate(n.headline,'๐๑๒๓๔๕๖๗๘๙','0123456789') from 'ปีการศึกษา\s*(?:พ\.?ศ\.?\s*)?([0-9]{4})')::integer,
   substring(translate(n.detail,'๐๑๒๓๔๕๖๗๘๙','0123456789') from 'ปีการศึกษา\s*(?:พ\.?ศ\.?\s*)?([0-9]{4})')::integer,
   extract(year from n.created_at::timestamptz at time zone 'Asia/Bangkok')::integer+543-case when extract(month from n.created_at::timestamptz at time zone 'Asia/Bangkok')<5 then 1 else 0 end
 )=council_portfolio_years.academic_year));
drop policy portfolio_images_public on storage.objects;
create policy portfolio_images_public on storage.objects for select to anon,authenticated using(
 bucket_id='council-portfolios' and (
 exists(select 1 from public.council_portfolio_items i where i.status='published' and (i.cover_path=name or name=any(i.image_paths)))
 or exists(select 1 from public.council_portfolio_years y where y.cover_path=name)));
