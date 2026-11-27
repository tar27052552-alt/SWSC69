-- Prepared locally only. Requires auth_rls_migration.sql and private.current_council_role().
create table public.council_portfolio_years (
 academic_year integer primary key check(academic_year between 2400 and 2800),
 cohort_name text not null check(length(trim(cohort_name)) between 1 and 160),
 summary text not null default '' check(length(summary)<=5000),
 cover_path text,
 updated_at timestamptz not null default now()
);
create table public.council_portfolio_items (
 id uuid primary key default gen_random_uuid(),
 academic_year integer not null references public.council_portfolio_years on delete restrict,
 title text not null check(length(trim(title)) between 1 and 250),
 description text not null check(length(trim(description)) between 1 and 20000),
 outcomes text not null default '' check(length(outcomes)<=10000),
 activity_date date not null,
 department_id integer check(department_id between 1 and 10),
 cover_path text,
 image_paths text[] not null default '{}' check(cardinality(image_paths)<=20),
 status text not null default 'draft' check(status in ('draft','published')),
 featured boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(status='draft' or (cover_path is not null and length(cover_path)>0))
);
create index council_portfolio_year_status_idx on public.council_portfolio_items(academic_year,status,featured desc,activity_date desc,id);
alter table public.council_portfolio_years enable row level security;
alter table public.council_portfolio_items enable row level security;
grant select on public.council_portfolio_years,public.council_portfolio_items to anon,authenticated;
grant insert,update,delete on public.council_portfolio_years,public.council_portfolio_items to authenticated;
create policy portfolio_items_public on public.council_portfolio_items for select to anon,authenticated using(status='published');
create policy portfolio_items_admin on public.council_portfolio_items for all to authenticated
 using((select private.current_council_role())='admin') with check((select private.current_council_role())='admin');
create policy portfolio_years_public on public.council_portfolio_years for select to anon,authenticated
 using(exists(select 1 from public.council_portfolio_items i where i.academic_year=council_portfolio_years.academic_year and i.status='published'));
create policy portfolio_years_admin on public.council_portfolio_years for all to authenticated
 using((select private.current_council_role())='admin') with check((select private.current_council_role())='admin');
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('council-portfolios','council-portfolios',false,10485760,array['image/jpeg','image/png','image/webp']);
create policy portfolio_images_public on storage.objects for select to anon,authenticated using(
 bucket_id='council-portfolios' and (
 exists(select 1 from public.council_portfolio_items i where i.status='published' and (i.cover_path=name or name=any(i.image_paths)))
 or exists(select 1 from public.council_portfolio_years y where y.cover_path=name and exists(
 select 1 from public.council_portfolio_items i where i.academic_year=y.academic_year and i.status='published'))));
create policy portfolio_images_admin on storage.objects for all to authenticated
 using(bucket_id='council-portfolios' and (select private.current_council_role())='admin')
 with check(bucket_id='council-portfolios' and (select private.current_council_role())='admin');
