const fs = require('fs');
const path = require('path');

const filePath = path.join('d:/โปรเจคสภา/src/pages/DisciplinePage.jsx');
let content = fs.readFileSync(filePath, 'utf8');

const conflictFunctions = `

  const loadConflictsData = async () => {
    try {
      const today = new Date();
      const TH_DAYS = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัส','ศุกร์','เสาร์'];
      const toStr = (d) => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
      const [evRes, partRes, swapRes, schedRes] = await Promise.all([
        supabase.from('events').select('*'),
        supabase.from('event_participants').select('*'),
        supabase.from('duty_swaps').select('*'),
        supabase.from('schedules').select('*')
      ]);
      const eventsData = evRes.data || [];
      const partData = partRes.data || [];
      const swapData = swapRes.data || [];
      const schedulesData = schedRes.data || [];
      const { data: usersData } = await supabase.from('users').select('id, name, nickname, role');
      const allUsers = (usersData || []).filter(u => u.role !== 'admin' && u.nickname !== 'แอดมิน');
      const activeConflicts = [];
      for (let i = 0; i < 14; i++) {
        const d = new Date(today.getTime() + i * 86400000);
        const dateStr = toStr(d);
        const dayName = TH_DAYS[d.getDay()];
        allUsers.forEach(tUser => {
          if (!tUser.nickname) return;
          const myEventIds = partData.filter(p => String(p.user_id) === String(tUser.id)).map(p => p.event_id);
          const myExtEvents = eventsData.filter(ev =>
            (ev.check_attendance || ev.location_category === 'external') &&
            myEventIds.includes(ev.id) && dateStr >= ev.date && dateStr <= (ev.end_date || ev.date)
          );
          if (myExtEvents.length === 0) return;
          const activeEvent = myExtEvents[0];
          const greetSchedule = schedulesData.find(s => s.day === dayName && s.type === 'greeting');
          if (greetSchedule) {
            const sData = greetSchedule.data || {};
            ['gate1','gate2','gate3'].forEach(gate => {
              const members = sData[gate] || [];
              if (members.includes(tUser.nickname)) {
                const dutyType = 'greeting_' + gate;
                const swapExists = swapData.some(s => s.date === dateStr && s.duty_type === dutyType && s.original_nickname === tUser.nickname);
                if (!swapExists) {
                  const gateNames = { gate1: 'ประตูไหมไทย', gate2: 'ประตูอำเภอ', gate3: 'ประตูหน้า รร.' };
                  activeConflicts.push({ date: dateStr, dayName, dutyType, dutyLabel: 'เวรยืนไหว้ (' + (gateNames[gate] || gate) + ')', eventTitle: activeEvent.title, originalNickname: tUser.nickname, userFullName: tUser.name });
                }
              }
            });
          }
          schedulesData.filter(s => s.day === dayName && (s.type === 'national_flag' || s.type === 'color_flag')).forEach(fSched => {
            const members = (fSched.data || {}).members || [];
            if (members.includes(tUser.nickname)) {
              const swapExists = swapData.some(s => s.date === dateStr && s.duty_type === fSched.type && s.original_nickname === tUser.nickname);
              if (!swapExists) {
                activeConflicts.push({ date: dateStr, dayName, dutyType: fSched.type, dutyLabel: fSched.type === 'national_flag' ? 'เวรเชิญธงชาติ' : 'เวรเชิญธงสี', eventTitle: activeEvent.title, originalNickname: tUser.nickname, userFullName: tUser.name });
              }
            }
          });
        });
      }
      activeConflicts.sort((a, b) => a.date.localeCompare(b.date));
      setConflicts(activeConflicts);
    } catch (err) {
      console.error('Error loading conflicts:', err);
    }
  };

  const handleSaveSwap = async () => {
    if (!conflictModal || !selectedSub) return;
    try {
      const { error } = await supabase.from('duty_swaps').insert({
        date: conflictModal.date,
        duty_type: conflictModal.dutyType,
        original_nickname: conflictModal.originalNickname,
        substitute_nickname: selectedSub,
        created_at: new Date().toISOString()
      });
      if (error) throw error;
      alert('บันทึกการสลับเวรเรียบร้อย!');
      setConflictModal(null);
      setSelectedSub('');
      loadConflictsData();
    } catch (err) {
      console.error('Error swapping duty:', err);
      alert('เกิดข้อผิดพลาด: ' + err.message);
    }
  };
`;

// Find the anchor: the useEffect that starts loadAttendance
// We insert our functions BEFORE this useEffect
const ANCHOR = '\n  useEffect(() => {\n    loadAttendance();';
const ANCHOR_CRLF = '\r\n  useEffect(() => {\r\n    loadAttendance();';

let anchorIdx = content.indexOf(ANCHOR_CRLF);
let isCRLF = true;
if (anchorIdx === -1) {
  anchorIdx = content.indexOf(ANCHOR);
  isCRLF = false;
}

if (anchorIdx === -1) {
  console.error('Could not find anchor! Searching for nearby text...');
  const idx = content.indexOf('loadAttendance();');
  console.log('loadAttendance found at:', idx);
  console.log('Around that index:', JSON.stringify(content.substring(idx - 50, idx + 50)));
  process.exit(1);
}

console.log('Found anchor at index:', anchorIdx, '(CRLF:', isCRLF, ')');
const insertPoint = anchorIdx;
content = content.substring(0, insertPoint) + conflictFunctions + content.substring(insertPoint);
fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully injected conflict functions! Total lines:', content.split('\n').length);
