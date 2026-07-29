const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Parse .env file
const envPath = 'd:/โปรเจคสภา/.env';
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w\.\-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    env[match[1]] = match[2].replace(/(^['"]|['"]$)/g, '');
  }
});

const supabase = createClient(env['VITE_SUPABASE_URL'], env['VITE_SUPABASE_ANON_KEY']);

async function testConflicts() {
  const [schedRes, eventsRes, partRes, swapRes, usersRes] = await Promise.all([
    supabase.from('schedules').select('*'),
    supabase.from('events').select('*'),
    supabase.from('event_participants').select('*'),
    supabase.from('duty_swaps').select('*'),
    supabase.from('users').select('*')
  ]);

  const schedulesData = schedRes.data || [];
  const eventsData = eventsRes.data || [];
  const partData = partRes.data || [];
  const swapData = swapRes.data || [];
  const usersData = usersRes.data || [];

  console.log('Events:', eventsData.length, 'Schedules:', schedulesData.length, 'Participants:', partData.length);

  const activeConflicts = [];
  const TH_DAYS_WEEK = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์"];
  const td = new Date();
  
  usersData.forEach(tUser => {
    if (!tUser.nickname) return;
    const myEventIds = partData.filter(p => String(p.user_id) === String(tUser.id)).map(p => p.event_id);
    const myExtEvents = eventsData.filter(ev => (ev.check_attendance || ev.location_category === 'external') && myEventIds.includes(ev.id));
    
    for (let i = 0; i < 14; i++) {
      const d = new Date(td.getTime() + i * 24 * 60 * 60 * 1000);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const dayName = TH_DAYS_WEEK[d.getDay()];
      
      const activeEvent = myExtEvents.find(ev => {
        const start = ev.date;
        const end = ev.end_date || ev.date;
        return dateStr >= start && dateStr <= end;
      });
      
      if (activeEvent) {
        const greetSchedule = schedulesData.find(s => s.day === dayName && s.type === 'greeting');
        if (greetSchedule) {
          const sData = greetSchedule.data || {};
          ['gate1', 'gate2', 'gate3'].forEach(gate => {
            const members = sData[gate] || [];
            if (members.includes(tUser.nickname)) {
              const swapExists = swapData.some(s => s.date === dateStr && s.duty_type === `greeting_${gate}` && s.original_nickname === tUser.nickname);
              if (!swapExists) {
                activeConflicts.push({
                  date: dateStr,
                  dutyType: `greeting_${gate}`,
                  userFullName: tUser.name
                });
              }
            }
          });
        }
        
        const flagSchedules = schedulesData.filter(s => s.day === dayName && (s.type === 'national_flag' || s.type === 'color_flag'));
        flagSchedules.forEach(fSched => {
          const fData = fSched.data || {};
          const members = fData.members || [];
          if (members.includes(tUser.nickname)) {
            const swapExists = swapData.some(s => s.date === dateStr && s.duty_type === fSched.type && s.original_nickname === tUser.nickname);
            if (!swapExists) {
              activeConflicts.push({
                date: dateStr,
                dutyType: fSched.type,
                userFullName: tUser.name
              });
            }
          }
        });
      }
    }
  });
  console.log('Active conflicts found:', activeConflicts.length);
  console.log(activeConflicts);
}
testConflicts();
