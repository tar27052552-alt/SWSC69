import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync('src/lib/portfolio.js', 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
const { validatePortfolioImage, sortPortfolioItems, portfolioDeadline } = new Function('supabase', source + '\nreturn {validatePortfolioImage, sortPortfolioItems, portfolioDeadline};')({});
test('image size/type boundaries and featured/date sorting', () => {
  for (const size of [10*1024*1024-1, 10*1024*1024]) validatePortfolioImage({ type:'image/jpeg',size });
  assert.throws(() => validatePortfolioImage({type:'image/jpeg',size:10*1024*1024+1}), /10 MB/);
  assert.throws(() => validatePortfolioImage({type:'image/svg+xml',size:100}), /JPG/);
  assert.throws(() => validatePortfolioImage({type:'image/png',size:0}), /10 MB/);
  const rows=[{id:'c',featured:false,activity_date:'2026-09-01'},{id:'b',featured:true,activity_date:'2026-06-01'},{id:'a',featured:true,activity_date:'2026-06-01'}];
  assert.deepEqual(sortPortfolioItems(rows).map(x=>x.id),['a','b','c']);
  assert.equal(rows[0].id,'c');
});
test('image deadlines report uncertain upload without retrying', async () => {
  let calls=0;
  const request=()=>{calls++;return new Promise(()=>{});};
  await assert.rejects(portfolioDeadline(request(),5,true),/ผลอาจสำเร็จแล้ว/);
  assert.equal(calls,1);
  await assert.rejects(portfolioDeadline(request(),5,false),/หมดเวลารอรูป/);
});
