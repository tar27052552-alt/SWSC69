import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import { eventDates, defaultEventDay, validateEventDays, thaiToday } from '../src/lib/eventAttendance.js';
test('daily rules enumerate dates and validate independent windows',()=>{
 assert.deepEqual(eventDates('2026-10-30','2026-11-01'),['2026-10-30','2026-10-31','2026-11-01']);
 assert.deepEqual(eventDates('2026-11-01','2026-10-30'),[]);
 assert.equal(thaiToday(new Date('2026-10-25T17:00:00Z')),'2026-10-26');
 const d=defaultEventDay('2026-10-30');assert.equal(validateEventDays([d])[0].mode,'check');
 assert.throws(()=>validateEventDays([{...d,closes_at:'06:00'}]),/ไม่ถูกต้อง/);
 assert.throws(()=>validateEventDays([{...d,participants:['a','a']}]),/ซ้ำ/);
 assert.equal(validateEventDays([{...d,mode:'exempt',opens_at:null,late_at:null,closes_at:null}]).length,1);
});
test('Apps Script event reminders honor windows, exemption, checked users and successful delivery only',()=>{
 const source=fs.readFileSync('google-apps-script/Code.gs','utf8');const start=source.indexOf('function remindDailyEventAttendance_('),end=source.indexOf('function runMorningPeriodicReminders()',start);
 const store={},pushes=[];let success=true;
 const days=[{event_id:'e1',mode:'check',opens_at:'10:00:00',late_at:'10:30:00',closes_at:'11:00:00',events:{title:'กิจกรรม'}},{event_id:'e2',mode:'exempt'}];
 const members=[{event_id:'e1',user_id:'a'},{event_id:'e1',user_id:'b'},{event_id:'e2',user_id:'c'}];
 const context={fetchFromSupabase:table=>table==='event_attendance_days'?days:table==='event_day_participants'?members:[{user_id:'b'}],PropertiesService:{getScriptProperties:()=>({getProperties:()=>({...store}),getProperty:k=>store[k],setProperty:(k,v)=>{store[k]=v;},deleteProperty:k=>{delete store[k];}})},sendOneSignalPush:(title,msg,ids)=>{pushes.push(ids);return{success};}};
 vm.createContext(context);vm.runInContext(source.slice(start,end),context);
 assert.equal(context.remindDailyEventAttendance_('2026-10-25',599).length,3);assert.equal(pushes.length,0);
 success=false;context.remindDailyEventAttendance_('2026-10-25',600);assert.equal(Object.keys(store).length,0);
 success=true;context.remindDailyEventAttendance_('2026-10-25',600);assert.deepEqual(Array.from(pushes.at(-1)),['a']);
 context.remindDailyEventAttendance_('2026-10-25',610);assert.equal(pushes.length,2);
 context.remindDailyEventAttendance_('2026-10-25',631);assert.equal(pushes.length,3);
 context.remindDailyEventAttendance_('2026-10-25',661);assert.equal(pushes.length,3);
});
