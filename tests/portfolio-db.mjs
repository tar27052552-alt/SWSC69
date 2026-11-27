// Local-only PostgreSQL test. PGLITE_MODULE may point to an installed PGlite module.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE || '.learning-source/pg-runtime/node_modules/@electric-sql/pglite/dist/index.js').href);
const db = new PGlite();
try {
  await db.exec(`create role anon; create role authenticated; create schema private; create schema storage;
    create function private.current_council_role() returns text language sql stable as $$select current_setting('test.council_role',true)$$;
    grant usage on schema private,storage to anon,authenticated; grant execute on function private.current_council_role() to authenticated;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security; grant select on storage.objects to anon,authenticated; grant insert,update,delete on storage.objects to authenticated;`);
  await db.exec(fs.readFileSync('supabase/migrations/20261013063513_council_portfolios.sql', 'utf8'));
  await db.exec(`set role authenticated; set test.council_role='admin';
    insert into council_portfolio_years values(2567,'รุ่นพี่','เก็บเรื่องราว','2567/year.jpg',now()),(2568,'ปีก่อน','ย้อนหลัง',null,now()),(2569,'ปีปัจจุบัน','ยังไม่เผยแพร่',null,now());
    insert into council_portfolio_items(id,academic_year,title,description,activity_date,cover_path,image_paths,status,featured) values
    ('00000000-0000-4000-8000-000000000001',2567,'เก่าเด่น','เรื่องราว','2024-06-01','2567/old.jpg',array['2567/gallery.jpg'],'published',true),
    ('00000000-0000-4000-8000-000000000002',2568,'ปีก่อน','ผลสำเร็จ','2025-06-01','2568/cover.jpg','{}','published',false),
    ('00000000-0000-4000-8000-000000000003',2569,'ร่างลับ','ยังไม่เผยแพร่','2026-06-01','2569/draft.jpg','{}','draft',false);
    insert into storage.objects(bucket_id,name) values('council-portfolios','2567/year.jpg'),('council-portfolios','2567/old.jpg'),('council-portfolios','2567/gallery.jpg'),('council-portfolios','2569/draft.jpg');`);
  await assert.rejects(db.exec('delete from council_portfolio_years where academic_year=2567'), /foreign key/);
  await assert.rejects(db.exec("update council_portfolio_items set cover_path=null where status='published'"), /check constraint/);
  await db.exec("reset role; set role anon");
  assert.deepEqual((await db.query('select academic_year from council_portfolio_years order by academic_year desc')).rows.map(x => x.academic_year), [2568, 2567]);
  assert.equal((await db.query('select * from council_portfolio_items')).rows.length, 2);
  assert.equal((await db.query('select * from storage.objects')).rows.length, 3);
  await assert.rejects(db.exec("insert into council_portfolio_years(academic_year,cohort_name) values(2570,'ปลอม')"), /permission denied/);
  await db.exec("reset role; set role authenticated; set test.council_role='member'");
  assert.equal((await db.query('select * from council_portfolio_items')).rows.length, 2);
  assert.equal((await db.query("update council_portfolio_items set title='ปลอม' where academic_year=2567 returning id")).rows.length, 0);
  await assert.rejects(db.exec("insert into storage.objects(bucket_id,name) values('council-portfolios','bad.jpg')"), /row-level security/);
  await db.exec("set test.council_role='admin'; update council_portfolio_items set status='draft' where academic_year=2567;");
  assert.equal((await db.query("select * from storage.objects where name like '2567/%'")).rows.length, 3);
  await db.exec("reset role; set role anon");
  assert.equal((await db.query('select * from council_portfolio_items')).rows.length, 1);
  assert.equal((await db.query('select * from storage.objects')).rows.length, 0);
  assert.equal((await db.query('select * from council_portfolio_years')).rows.length, 1);
  await db.exec("reset role; set role authenticated; set test.council_role='admin'; update council_portfolio_items set status='published' where academic_year=2567;");
  assert.equal((await db.query('select * from council_portfolio_items')).rows.length, 3);
  await db.exec("insert into council_portfolio_years(academic_year,cohort_name) values(2566,'ว่าง'); delete from council_portfolio_years where academic_year=2566;");
  console.log('PASS: year/item RLS, anonymous draft images denied, admin-only writes, restrictive year deletion, withdraw/republish preserves content and images');
} finally { await db.close(); }
