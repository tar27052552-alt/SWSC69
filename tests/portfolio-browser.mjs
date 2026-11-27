// All Supabase and Google requests are intercepted; this never writes live data.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const modulePath = process.env.PLAYWRIGHT_MODULE || 'C:/Users/papu/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright-core/index.mjs';
const { chromium } = await import(pathToFileURL(modulePath).href);
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || 'C:/Users/papu/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe' });
const base = process.env.PORTFOLIO_TEST_URL || 'http://127.0.0.1:5175/SWSC69/';
const ctx = await browser.newContext();
const id = '00000000-0000-4000-8000-000000000001';
let role = 'admin', fail = false, publicUsedAdmin = false, uploads = 0, archiveMissing = false, newsRows = [];
const exp = Math.floor(Date.now()/1000)+3600, b = x => Buffer.from(JSON.stringify(x)).toString('base64url');
const auth = {access_token:b({alg:'HS256',typ:'JWT'})+'.'+b({sub:id,exp,aud:'authenticated',role:'authenticated'})+'.fixture',refresh_token:'fixture',expires_at:exp,expires_in:3600,token_type:'bearer',user:{id,email:'admin@example.test',identities:[],app_metadata:{},user_metadata:{}}};
await ctx.addInitScript(s => localStorage.setItem('sb-pzlcxctnnhjqpbhwcxqx-auth-token',JSON.stringify(s)), auth);
let years = [{academic_year:2569,cohort_name:'รุ่นปัจจุบัน',summary:'เรื่องราวปีนี้',cover_path:'2569/year.jpg'},{academic_year:2568,cohort_name:'รุ่นพี่',summary:'สรุปผลงานรุ่นพี่',cover_path:'2568/year.jpg'}];
const make = (n,year,title,date,featured=false,status='published') => ({id:`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,academic_year:year,title,description:'รายละเอียดผลงาน\n'.repeat(30),outcomes:'ผลสำเร็จที่เกิดขึ้น',activity_date:date,department_id:5,cover_path:`${year}/${n}.jpg`,image_paths:[`${year}/gallery.jpg`],status,featured});
let items = [make(11,2569,'งานใหม่','2026-08-01'),make(12,2569,'งานเด่น','2026-06-01',true),make(13,2568,'ผลงานรุ่นพี่','2025-07-01'),make(14,2569,'ร่างไม่เผยแพร่','2026-09-01',false,'draft')];
await ctx.route('**/*.supabase.co/**', async r => {
  const req = r.request(), url = new URL(req.url()), path = url.pathname, q = url.searchParams;
  const admin = (req.headers().authorization || '').includes('.fixture') && role === 'admin';
  if (path.includes('/auth/v1/')) return r.fulfill({json:path.endsWith('/user')?auth.user:auth});
  if (path.includes('/rpc/get_my_council_profile')) return r.fulfill({json:[{id,name:'ผู้ดูแลทดสอบ',nickname:'ทดสอบ',student_id:'99999',dept_id:9,role,avatar:'T',avatar_color:'#673ab7'}]});
  if (path.includes('/storage/v1/object/sign/') && req.method() === 'POST') {
    const body = req.postDataJSON();
    return r.fulfill({json:(body.paths || []).map(path => ({path,signedURL:'/object/sign/council-portfolios/'+path+'?token=fixture',error:null}))});
  }
  if (path.includes('/storage/v1/object/') && req.method() === 'POST') {uploads++;return r.fulfill({json:{Key:path.split('/object/')[1],Id:id}});}
  if (path.includes('/storage/v1/object/')) return r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="#6e3c94"/><text x="100" y="250" fill="#f7ce72" font-size="60">SWSC ARCHIVE</text></svg>'});
  const isYears=path.endsWith('/council_portfolio_years'), isItems=path.endsWith('/council_portfolio_items');
  if (path.endsWith('/web_news')) return r.fulfill({json:newsRows.filter(n=>n.category==='ผลงาน')});
  if (archiveMissing && (isYears || isItems)) return r.fulfill({status:404,json:{code:'PGRST205',message:'archive not installed'}});
  if (!isYears && !isItems) return r.fulfill({json:[]});
  if (req.frame().url().includes('/portfolios/') && admin) publicUsedAdmin=true;
  if (fail && req.method()==='GET') return r.fulfill({status:503,json:{message:'fixture unavailable'}});
  let data = (isYears?years:items).filter(x => {
    if (!admin && isItems && x.status!=='published')return false;
    if (!admin && isYears && !items.some(i=>i.academic_year===x.academic_year && i.status==='published'))return false;
    for (const key of ['academic_year','id','status']) {const value=q.get(key);if(value?.startsWith('eq.') && String(x[key])!==value.slice(3))return false;}
    return true;
  });
  if (req.method()!=='GET') {
    assert.equal(admin,true,'nonadmin fixture write');
    let body=req.postDataJSON();if(Array.isArray(body))body=body[0];
    if(req.method()==='POST'){if(isYears)years.push(body);else items.push(body);data=[body];}
    if(req.method()==='PATCH'){data.forEach(x=>Object.assign(x,body));}
    if(req.method()==='DELETE'){if(isYears && items.some(i=>data.some(y=>y.academic_year===i.academic_year)))return r.fulfill({status:409,json:{message:'ปีนี้ยังมีผลงานอยู่'}});if(isYears)years=years.filter(x=>!data.includes(x));}
  }
  if(isYears)data.sort((a,b)=>b.academic_year-a.academic_year);
  if(q.get('select')==='academic_year')data=data.map(x=>({academic_year:x.academic_year}));
  return r.fulfill({json:req.headers().accept?.includes('vnd.pgrst.object') ? data[0] || null : data,headers:{'access-control-allow-origin':'*'}});
});
await ctx.route('**/script.google.com/**',r=>r.fulfill({json:{success:true,data:[]}}));
await ctx.route('**/cdn.onesignal.com/**',r=>r.abort());
const page=await ctx.newPage(), errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
  await page.goto(base+'portfolios/');await page.getByRole('heading',{name:'ผลงานของปี 2569'}).waitFor();
  assert.equal(await page.locator('.pf-card h3').first().innerText(),'งานเด่น');
  assert.equal(await page.getByText('ร่างไม่เผยแพร่').count(),0);
  assert.equal(publicUsedAdmin,false);
  await page.setViewportSize({width:1440,height:900});await page.screenshot({path:'.learning-source/portfolio-desktop.png',fullPage:true});
  for(const [width,height] of [[320,800],[390,844],[768,1024],[1440,900],[844,390]]){
    await page.setViewportSize({width,height});await page.waitForTimeout(100);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'public overflow '+width);
  }
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.learning-source/portfolio-mobile.png',fullPage:true});
  await page.getByLabel('เลือกปีการศึกษา').selectOption('2568');await page.getByRole('heading',{name:'ผลงานรุ่นพี่'}).waitFor();
  await page.locator('.pf-card a').first().click();await page.locator('.pf-detail h1').waitFor();assert(page.url().includes('id='));
  await page.reload();await page.locator('.pf-detail h1').waitFor();
  await page.getByRole('button',{name:'← ผลงานทั้งหมดของปี 2568'}).click();await page.locator('.pf-card').waitFor();
  fail=true;await page.getByRole('button',{name:'รีเฟรช',exact:true}).click();await page.getByRole('alert').waitFor();
  fail=false;await page.getByRole('button',{name:'ลองใหม่',exact:true}).click();await page.locator('.pf-card').waitFor();
  await page.goto(base+'portfolios/?year=2566');await page.getByRole('heading',{name:'ยังไม่มีผลงานเผยแพร่ในปีนี้'}).waitFor();
  await page.goto(base+'admin/#/admin-portfolios');await page.getByText('ร่างไม่เผยแพร่',{exact:true}).waitFor();
  await page.getByRole('button',{name:'＋ เพิ่มปี',exact:true}).click();
  await page.getByLabel('ปีการศึกษา พ.ศ.').fill('2567');await page.getByLabel('ชื่อรุ่น').fill('สภารุ่นพี่ 2567');await page.getByLabel('สรุปเรื่องราวของปี').fill('ผลงานของรุ่นก่อน');
  await page.getByRole('button',{name:'บันทึกปีการศึกษา',exact:true}).click();await page.getByRole('heading',{name:'ผลงานปี 2567'}).waitFor();
  await page.getByRole('button',{name:'＋ เพิ่มผลงาน',exact:true}).click();await page.getByLabel('ชื่อผลงาน').fill('กิจกรรมรุ่นพี่ 2567');await page.getByLabel('วันที่กิจกรรม').fill('2024-07-01');await page.getByLabel('รายละเอียด *',{exact:true}).fill('รายละเอียด'.repeat(100));await page.getByLabel('ผลสำเร็จ',{exact:true}).fill('ผลสำเร็จของรุ่นพี่');
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/RkAAAAASUVORK5CYII=','base64');
  await page.getByLabel('ภาพปก (ไม่เกิน 10 MB)').setInputFiles({name:'ภาพปกไทย.png',mimeType:'image/png',buffer:png});
  await page.getByLabel('ภาพเพิ่มเติม (สูงสุด 20 ภาพ ภาพละไม่เกิน 10 MB)').setInputFiles([{name:'1.png',mimeType:'image/png',buffer:png},{name:'2.png',mimeType:'image/png',buffer:png}]);
  for(const [width,height] of [[320,800],[390,844],[768,1024],[1440,900]]){
    await page.setViewportSize({width,height});await page.waitForTimeout(450);
    assert(await page.locator('.pf-form').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'admin form overflow '+width);
  }
  await page.getByRole('button',{name:'บันทึกผลงาน',exact:true}).click();await page.locator('.pf-admin-list article').filter({hasText:'กิจกรรมรุ่นพี่ 2567'}).waitFor();assert.equal(uploads,3);
  let row=page.locator('.pf-admin-list article').filter({hasText:'กิจกรรมรุ่นพี่ 2567'});
  await row.getByRole('button',{name:'ดูตัวอย่าง',exact:true}).click();await page.getByRole('dialog').waitFor();assert.equal(await page.locator('.pf-gallery figure').count(),2);
  await page.keyboard.press('Tab');await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'ปิดตัวอย่าง ✕');await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);
  await row.getByRole('button',{name:'เผยแพร่',exact:true}).click();await row.getByText('เผยแพร่แล้ว',{exact:true}).waitFor();
  await row.getByRole('button',{name:'ถอนเผยแพร่',exact:true}).click();await row.getByText('ฉบับร่าง',{exact:true}).waitFor();
  await row.getByRole('button',{name:'เผยแพร่',exact:true}).click();await row.getByText('เผยแพร่แล้ว',{exact:true}).waitFor();
  await page.getByRole('button',{name:'แก้ไขปี',exact:true}).click();page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'ลบปีที่ว่าง'}).click();await page.getByRole('alert').filter({hasText:'ปีนี้ยังมีผลงานอยู่'}).waitFor();
  await page.goto(base+'portfolios/?year=2567');await page.getByRole('heading',{name:'กิจกรรมรุ่นพี่ 2567'}).waitFor();
  newsRows=[{id:77,headline:'ข่าวแท็กผลงาน',detail:'ผลงานจากข่าว',category:'ผลงาน',created_at:'2026-10-07T00:00:00Z',supporting_images:[]}];
  archiveMissing=true;
  await page.goto(base+'portfolios/');await page.getByRole('heading',{name:'ข่าวแท็กผลงาน'}).waitFor();
  await page.locator('.pf-card a').click();assert(page.url().includes('id=news-77'));await page.reload();await page.locator('.pf-detail h1').waitFor();
  newsRows[0].category='ข่าวโรงเรียน';await page.getByRole('button',{name:'รีเฟรช',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal(await page.locator('.pf-detail').count(),0);
  archiveMissing=false;
  role='member';await page.goto(base+'admin/#/admin-portfolios');await page.getByText('เฉพาะผู้ดูแลระบบเท่านั้น',{exact:true}).waitFor();
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('PASS: latest published year, featured ordering, old-year direct links, public session separation, drafts hidden, retry/empty states, 320/390/768/1440/landscape, admin year+item+3 images, preview keyboard, publish/withdraw, occupied-year deletion rejected, member blocked');
} finally { await browser.close(); }
