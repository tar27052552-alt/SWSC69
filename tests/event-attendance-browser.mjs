// Local mocked API only: no requests can write to real Supabase, Drive or push services.
import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || 'C:/Users/papu/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright-core/index.mjs').href);
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH || 'C:/Users/papu/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe'});
const base=process.env.EVENT_TEST_URL || 'http://127.0.0.1:5175/SWSC69/';
const ctx=await browser.newContext({timezoneId:'Asia/Bangkok'}),id='00000000-0000-4000-8000-000000000001',a='00000000-0000-4000-8000-000000000002',b='00000000-0000-4000-8000-000000000003',eventId='00000000-0000-4000-8000-000000000009';
const exp=Math.floor(Date.now()/1000)+86400,enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const session={access_token:enc({alg:'HS256'})+'.'+enc({sub:id,exp,role:'authenticated'})+'.fixture',refresh_token:'fixture',expires_at:exp,expires_in:86400,token_type:'bearer',user:{id,email:'test@example.test',identities:[],app_metadata:{},user_metadata:{}}};
await ctx.addInitScript(s=>localStorage.setItem('sb-pzlcxctnnhjqpbhwcxqx-auth-token',JSON.stringify(s)),session);
let events=[],saveBody,policy={mode:'regular',system_active:true},rpcFailure=false;
const users=[{id,name:'ผู้จัดกิจกรรม',nickname:'ผู้จัด',dept_id:2,role:'dept_head'},{id:a,name:'สมาชิกหนึ่ง',nickname:'หนึ่ง',dept_id:1,role:'member'},{id:b,name:'สมาชิกสอง',nickname:'สอง',dept_id:3,role:'member'}];
await ctx.route('**/*.supabase.co/**',async r=>{
 const req=r.request(),url=new URL(req.url()),path=url.pathname;let data=[];
 if(path.includes('/auth/'))data=path.endsWith('/user')?session.user:session;
 if(path.endsWith('/rpc/get_my_council_profile'))data=[{...users[0],student_id:'99999',avatar:'T',avatar_color:'#673ab7'}];
 if(path.endsWith('/rpc/get_my_checkin_context'))data=policy;
 if(path.endsWith('/rpc/get_my_event_attendance'))data=policy.mode==='regular'?[]:[{...policy,date:'2026-10-25'}];
 if(path.endsWith('/user_directory'))data=users;
 if(path.endsWith('/events'))data=events;
 if(path.endsWith('/attendance_settings'))data=[{key:'check_in_active',value:true},{key:'enabled_days',value:['จันทร์','อังคาร','พุธ','พฤหัส','ศุกร์']}];
 if(path.endsWith('/rpc/save_council_event')) {
  if(rpcFailure)return r.fulfill({status:400,json:{message:'รายชื่อซ้อนกับกิจกรรมอื่น: สมาชิกหนึ่ง · กิจกรรมทดสอบ'}});
  saveBody=req.postDataJSON();events=[{...saveBody.p_event,id:eventId,attendance_by_day:true}];data={id:eventId};
 }
 if(path.endsWith('/rpc/get_event_attendance_editor'))data=saveBody?.p_days || [];
 if(path.endsWith('/event_day_participants'))data=(saveBody?.p_days || []).flatMap(d=>d.participants.map(user_id=>({user_id,date:d.date,event_id:eventId})));
 if(path.endsWith('/event_participants'))data=[...new Set((saveBody?.p_days || []).flatMap(d=>d.participants))].map(user_id=>({user_id,event_id:eventId}));
 await r.fulfill({json:data,headers:{'access-control-allow-origin':'*'}});
});
await ctx.route('**/script.google.com/**',r=>r.fulfill({json:{success:true,data:[]}}));await ctx.route('**/cdn.onesignal.com/**',r=>r.abort());
const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
 await page.clock.install({time:new Date('2026-10-25T05:00:00+07:00')});
 await page.goto(base+'admin/#/calendar');
 await page.getByRole('button',{name:/เพิ่มกิจกรรม/}).click();
 const modal=page.locator('.modal-box');await modal.locator('input:not([type])').first().fill('กิจกรรมรายวันทดสอบ');
 await modal.locator('input[type=date]').first().fill('2026-10-26');await modal.locator('input[type=date]').nth(1).fill('2026-10-27');
 const editor=page.locator('.event-attendance-editor');await editor.getByLabel('สมาชิกหนึ่ง',{exact:false}).check();
 await editor.getByLabel('เปิดรับ',{exact:true}).fill('09:00');await editor.getByLabel('เริ่มสายหลังเวลา').fill('09:30');await editor.getByLabel('ปิดรับ',{exact:true}).fill('10:00');
 await editor.getByRole('button',{name:'คัดลอกรายชื่อและเวลาวันนี้ไปทุกวันที่ยังไม่ล็อก'}).click();
 await editor.getByLabel('วันที่ตั้งค่า').selectOption('2026-10-27');assert.equal(await editor.getByLabel('สมาชิกหนึ่ง',{exact:false}).isChecked(),true);
 await editor.getByRole('button',{name:'ล้างรายชื่อวันนี้'}).click();await editor.getByLabel('สมาชิกสอง',{exact:false}).check();await editor.getByLabel('การเช็คชื่อ',{exact:true}).selectOption('exempt');
 for(const [width,height] of [[320,800],[390,844],[768,1024],[1440,900],[844,390]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(450);assert(await modal.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'modal overflow '+width);assert(await editor.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'editor overflow '+width);
 }
 await modal.getByRole('button',{name:'บันทึกรายการ',exact:true}).click();await page.getByRole('alertdialog').waitFor();await page.getByRole('button',{name:'ตกลง',exact:true}).click();
 assert.equal(saveBody.p_days[0].opens_at,'09:00');assert.deepEqual(saveBody.p_days[0].participants,[a]);assert.deepEqual(saveBody.p_days[1].participants,[b]);assert.equal(saveBody.p_days[1].mode,'exempt');
 await page.getByText('26',{exact:true}).first().click();await page.getByRole('button',{name:'แก้ไขกิจกรรม',exact:true}).first().click();await page.locator('.event-attendance-editor').waitFor();await page.waitForTimeout(150);assert.equal(await editor.getByLabel('เปิดรับ',{exact:true}).inputValue(),'09:00');await editor.getByLabel('วันที่ตั้งค่า').selectOption('2026-10-27');assert.equal(await editor.getByLabel('การเช็คชื่อ',{exact:true}).inputValue(),'exempt');await modal.locator('.modal-header button').click();
 await page.goto(base+'admin/#/checkin');policy={mode:'check',title:'กิจกรรมวันหยุด',system_active:true,status:'pending',requires_gps:false,opens_at:'09:00',late_at:'09:30',closes_at:'10:00',can_checkin:false};
 await page.reload();await page.getByRole('heading',{name:'กิจกรรมวันหยุด'}).waitFor();await page.getByText('ยังไม่ถึงเวลาเปิดรับเช็คชื่อ',{exact:true}).waitFor();
 policy={...policy,mode:'exempt',status:'activity'};await page.reload();await page.getByText('วันนี้คุณได้รับยกเว้นเช็คชื่อจากกิจกรรม',{exact:true}).waitFor();
 policy={...policy,mode:'check',status:'missing'};await page.reload();await page.getByText('หมดเวลาเช็คชื่อแล้ว สถานะขาดให้ฝ่ายปกครองพิจารณา',{exact:true}).waitFor();
 policy={...policy,mode:'exempt',status:'activity'};await page.goto(base+'admin/#/dashboard');await page.getByText('ได้รับยกเว้นเช็คชื่อจากกิจกรรม',{exact:true}).waitFor();
 await page.goto(base+'admin/#/my-attendance');await page.getByText('ยกเว้นจากกิจกรรม',{exact:true}).waitFor();
 await page.goto(base+'admin/#/discipline');await page.getByRole('button',{name:'บันทึกความผิด',exact:true}).waitFor();
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS: daily member selection, three times, copy then customize each day, atomic payload, modal responsive 320/390/768/1440/landscape, pending/exempt/closed check-in screens, no JS errors');
} finally {await browser.close();}
