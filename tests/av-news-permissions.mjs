import fs from 'node:fs';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(pathToFileURL(process.env.PGLITE_MODULE || '.learning-source/pg-runtime/node_modules/@electric-sql/pglite/dist/index.js').href);
const db = new PGlite();
try {
 await db.exec(`create role authenticated;create role anon;create schema private;
 create table web_news(id integer primary key,category text,headline text);
 alter table web_news enable row level security;
 grant select on web_news to anon,authenticated;grant insert,update,delete on web_news to authenticated;
 grant usage on schema private to authenticated;
 create function private.is_council_leader() returns boolean language sql stable as $$select coalesce(current_setting('test.role',true) in ('admin','president') and current_setting('test.blocked',true)='false',false)$$;
 create function private.can_manage_department(integer) returns boolean language sql stable as $$select (private.is_council_leader() or current_setting('test.dept',true)=$1::text) and current_setting('test.blocked',true)='false'$$;
 create policy web_news_read on web_news for select to anon,authenticated using(true);
 create policy web_news_manage on web_news for all to authenticated using(private.is_council_leader() or private.can_manage_department(5)) with check(private.is_council_leader() or private.can_manage_department(5));
 set role authenticated;set test.role='member';set test.dept='9';set test.blocked='false';`);
 await assert.rejects(db.exec("insert into web_news values(1,'ผลงาน','ก่อนแก้')"),/row-level security/);
 await db.exec('reset role');await db.exec(fs.readFileSync('supabase/migrations/20261025152239_fix_av_news_write_permissions.sql','utf8'));
 await db.exec("set role authenticated;insert into web_news values(1,'ผลงาน','ฝ่ายโสต');update web_news set headline='แก้ไขได้' where id=1;delete from web_news where id=1;");
 await assert.rejects(db.exec("insert into web_news values(2,'ประกาศ','AV ห้ามลงประกาศ')"),/row-level security/);
 await db.exec("insert into web_news values(3,'ข่าวโรงเรียน','ข่าวปกติ')");
 await assert.rejects(db.exec("update web_news set category='ประกาศ' where id=3"),/row-level security/);
 for(const dept of [1,2,3,4,6,7,8,10]) {await db.exec(`set test.dept='${dept}'`);await assert.rejects(db.exec(`insert into web_news values(${dept+10},'ผลงาน','ฝ่ายอื่น')`),/row-level security/);}
 await db.exec("set test.dept='5';insert into web_news values(50,'ข่าวโรงเรียน','PR');set test.blocked='true'");
 await assert.rejects(db.exec("insert into web_news values(51,'ผลงาน','บัญชีถูกระงับ')"),/row-level security/);
 await db.exec("set test.blocked='false';set test.role='admin';set test.dept='';insert into web_news values(60,'ประกาศ','admin');set test.role='president';insert into web_news values(61,'ประกาศ','president');reset role;set role anon");
 await assert.rejects(db.exec("insert into web_news values(70,'ผลงาน','anonymous')"),/permission denied/);
 console.log('PASS: reproduces AV RLS rejection before fix; AV news CRUD succeeds after fix; announcements, other departments, blocked accounts and anon remain restricted; PR/admin/president preserved');
} finally {await db.close();}
