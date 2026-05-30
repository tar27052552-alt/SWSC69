import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { NavLink } from 'react-router-dom';
import { Camera, MapPin, X, CheckCircle, AlertTriangle, Sparkles, HandHeart } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { sendDiscordEmbedViaGAS } from '../lib/discordWebhook';

const TYPE_LABEL = { meeting: 'ประชุม', event: 'กิจกรรม', deadline: 'กำหนดส่ง' };
const TYPE_BADGE = { meeting: 'badge-purple', event: 'badge-green', deadline: 'badge-yellow' };
const MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const DAYS_TH = ['อา','จ','อ','พ','พฤ','ศ','ส'];

async function fetchServerDate() {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (supabaseUrl && supabaseKey) {
      const res = await fetch(`${supabaseUrl}/rest/v1/`, {
        method: 'HEAD',
        headers: { apikey: supabaseKey }
      });
      const serverDateStr = res.headers.get('date');
      if (serverDateStr) return new Date(serverDateStr);
    }
  } catch (e) {
    console.error('Failed to fetch server date, falling back to client date:', e);
  }
  return new Date();
}

function formatRelativeTime(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'เมื่อสักครู่';
  if (diffMins < 60) return `${diffMins} นาทีที่แล้ว`;
  if (diffHours < 24) return `${diffHours} ชั่วโมงที่แล้ว`;
  if (diffDays === 1) return 'เมื่อวาน';
  if (diffDays < 7) return `${diffDays} วันที่แล้ว`;
  return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

export default function Dashboard() {
  const { user, isAdmin, checkInState, cleanDutyState, greetingDutyState } = useAuth();
  
  const [events, setEvents] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [usersCount, setUsersCount] = useState(0);
  const [deptsCount, setDeptsCount] = useState(0);
  const [cleanSchedules, setCleanSchedules] = useState([]);
  const [greetingSchedules, setGreetingSchedules] = useState([]);
  const [startDate, setStartDate] = useState('');
  const [cleanDutyStartDate, setCleanDutyStartDate] = useState('');
  const [greetingDutyStartDate, setGreetingDutyStartDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [eventParticipants, setEventParticipants] = useState([]);
  const [dutySwaps, setDutySwaps] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [conflicts, setConflicts] = useState([]);
  const [conflictModal, setConflictModal] = useState(null);
  const [selectedSub, setSelectedSub] = useState('');

  const handleSaveSwap = async () => {
    if (!selectedSub || !conflictModal) return;
    try {
      const { error } = await supabase
        .from('duty_swaps')
        .insert([{
          date: conflictModal.date,
          duty_type: conflictModal.dutyType,
          original_nickname: conflictModal.originalNickname,
          substitute_nickname: selectedSub,
          created_by: user?.name || 'สภานักเรียน'
        }]);

      if (error) throw error;

      alert('สลับเวรเสร็จสิ้นเรียบร้อยแล้ว!');
      setConflictModal(null);
      setSelectedSub('');
      window.location.reload();
    } catch (err) {
      console.error('Error swapping duty:', err);
      alert('เกิดข้อผิดพลาดในการสลับเวร: ' + err.message);
    }
  };

  const today = new Date();
  
  // Calendar states
  const [yr, setYr] = useState(today.getFullYear());
  const [mo, setMo] = useState(today.getMonth());
  const [sel, setSel] = useState(null);
  
  const firstDay = new Date(yr, mo, 1).getDay();
  const daysInMonth = new Date(yr, mo + 1, 0).getDate();

  const prevMonth = () => { if (mo===0){setMo(11);setYr(y=>y-1);}else setMo(m=>m-1); };
  const nextMonth = () => { if (mo===11){setMo(0);setYr(y=>y+1);}else setMo(m=>m+1); };

  const getEvents = (day) => {
    const ds = `${yr}-${String(mo+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    return events.filter(e => e.date === ds);
  };

  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  const runAutoGreetingFinesCheck = async (schedulesList, startDateValue, eventsList, participantsList, swapsList, serverNow = new Date()) => {
    try {
      const { data: usersData } = await supabase.from('users').select('id, name, nickname, dept_id');
      if (!usersData) return;

      const now = serverNow;
      const tzOffset = 7 * 60 * 60 * 1000;
      const todayStr = new Date(now.getTime() + tzOffset).toISOString().split('T')[0];
      const datesToCheck = [];

      for (let i = 0; i < 7; i++) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const dateStr = new Date(d.getTime() + tzOffset).toISOString().split('T')[0];
        
        if (startDateValue && dateStr < startDateValue) continue;

        const dateObj = new Date(`${dateStr}T00:00:00.000Z`);
        const dayOfWeek = dateObj.getUTCDay(); // 0 = Sunday, 6 = Saturday
        if (dayOfWeek === 0 || dayOfWeek === 6) continue; // Skip weekends

        // If it is today, only check if it is past 07:10 AM
        if (dateStr === todayStr) {
          const localHours = new Date(now.getTime() + tzOffset).getUTCHours();
          const localMinutes = new Date(now.getTime() + tzOffset).getUTCMinutes();
          if (localHours < 7 || (localHours === 7 && localMinutes < 10)) {
            continue;
          }
        }

        datesToCheck.push(dateStr);
      }

      const TH_DAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์"];

      for (const dateStr of datesToCheck) {
        // Find exempt users for this date (external events participants)
        const activeExtEventIds = (eventsList || [])
          .filter(ev => {
            const start = ev.date;
            const end = ev.end_date || ev.date;
            return ev.location_category === 'external' && dateStr >= start && dateStr <= end;
          })
          .map(ev => ev.id);
        
        const exemptUserIds = (participantsList || [])
          .filter(p => activeExtEventIds.includes(p.event_id))
          .map(p => String(p.user_id));

        const dateObj = new Date(`${dateStr}T00:00:00.000Z`);
        const dayName = TH_DAYS[dateObj.getUTCDay()];

        const schedule = schedulesList.find(s => s.day === dayName);
        if (!schedule) continue;

        const scheduleData = schedule.data || {};
        const dutyMembers = [];
        ['gate1', 'gate2', 'gate3'].forEach(gate => {
          const members = scheduleData[gate] || [];
          members.forEach(nickname => {
            if (nickname && nickname !== '–') {
              // Apply swaps logic
              const swap = (swapsList || []).find(s => s.date === dateStr && s.duty_type === `greeting_${gate}` && s.original_nickname === nickname);
              if (swap) {
                dutyMembers.push({ nickname: swap.substitute_nickname, gate });
              } else {
                dutyMembers.push({ nickname, gate });
              }
            }
          });
        });

        if (dutyMembers.length === 0) continue;

        // Fetch submissions for this day
        const { data: checks } = await supabase
          .from('greeting_duty_checks')
          .select('nickname')
          .eq('date', dateStr);

        const submittedNicknames = (checks || []).map(c => c.nickname);

        // Fetch existing fines for "ไม่ปฏิบัติเวรไหว้"
        const { data: existingFines } = await supabase
          .from('discipline_fines')
          .select('nickname')
          .eq('date', dateStr)
          .eq('violation', 'ไม่ปฏิบัติเวรไหว้');

        const finedNicknames = (existingFines || []).map(f => f.nickname);

        for (const { nickname, gate } of dutyMembers) {
          const u = usersData.find(usr => usr.nickname === nickname);
          if (!u) continue;

          // Exempt if traveling to external event
          if (exemptUserIds.includes(String(u.id))) {
            console.log(`Exempting ${nickname} from greeting fine on ${dateStr} due to external event`);
            continue;
          }

          const submitted = submittedNicknames.includes(nickname);
          const alreadyFined = finedNicknames.includes(nickname);

          if (!submitted && !alreadyFined) {
            const baseAmount = 100; // 100 Baht fine
            let finalAmount = baseAmount;
            if (u.dept_id === 2) {
              finalAmount *= 2; // 2x for discipline dept
            }

            const gateNames = { gate1: 'ประตูไหมไทย', gate2: 'ประตูอำเภอ', gate3: 'ประตูหน้า รร.' };
            const gateTh = gateNames[gate] || 'ไม่ระบุ';

            const fineRecord = {
              user_id: String(u.id),
              user_name: u.name,
              nickname: u.nickname,
              violation: 'ไม่ปฏิบัติเวรไหว้',
              amount: finalAmount,
              date: dateStr,
              note: `ไม่รายงานเวรยืนไหว้ (${gateTh}) ภายในเวลา 07:10 น.${u.dept_id === 2 ? ' - ปรับ 2 เท่าเนื่องจากเป็นสารวัตรนักเรียน' : ''}`,
              by: 'ระบบอัตโนมัติ',
              paid: false
            };

            const { data: insertedData, error: insertError } = await supabase
              .from('discipline_fines')
              .insert([fineRecord])
              .select();

            if (insertError) {
              console.error(`Failed to insert auto-fine for ${nickname} on ${dateStr}:`, insertError);
              continue;
            }

            console.log(`Auto-fined ${nickname} for greeting duty on ${dateStr}`);

            // Notify Discord (discipline_fines channel)
            const embedTitle = `🔴 [ปรับอัตโนมัติ] ${nickname} ขาดรายงานเวรยืนไหว้`;
            const embedDesc = `โดนปรับเงิน **${finalAmount}** บาท เนื่องจากไม่รายงานตัว/ส่งรูปปฏิบัติหน้าที่เวรยืนไหว้ ณ **${gateTh}** ประจำวันที่ **${dateStr}** ภายในเวลา 07:10 น.`;
            sendDiscordEmbedViaGAS(embedTitle, embedDesc, 15158332, [], null, 'discipline_fines');
          }
        }
      }
    } catch (err) {
      console.error('Error in runAutoGreetingFinesCheck:', err);
    }
  };

  const runAutoCleanFinesCheck = async (schedulesList, startDateValue, eventsList, participantsList, serverNow = new Date()) => {
    try {
      const { data: usersData } = await supabase.from('users').select('id, name, nickname, dept_id');
      if (!usersData) return;

      const now = serverNow;
      const tzOffset = 7 * 60 * 60 * 1000;
      const todayStr = new Date(now.getTime() + tzOffset).toISOString().split('T')[0];
      const datesToCheck = [];

      for (let i = 0; i < 7; i++) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const dateStr = new Date(d.getTime() + tzOffset).toISOString().split('T')[0];
        
        if (startDateValue && dateStr < startDateValue) continue;

        const dateObj = new Date(`${dateStr}T00:00:00.000Z`);
        const dayOfWeek = dateObj.getUTCDay(); // 0 = Sunday, 6 = Saturday
        if (dayOfWeek === 0 || dayOfWeek === 6) continue; // Skip weekends

        // If it is today, only check if it is past 18:00 (6:00 PM)
        if (dateStr === todayStr) {
          const localHours = new Date(now.getTime() + tzOffset).getUTCHours();
          if (localHours < 18) continue;
        }

        datesToCheck.push(dateStr);
      }

      const TH_DAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์"];

      for (const dateStr of datesToCheck) {
        // Find exempt users for this date (external events participants)
        const activeExtEventIds = (eventsList || [])
          .filter(ev => {
            const start = ev.date;
            const end = ev.end_date || ev.date;
            return ev.location_category === 'external' && dateStr >= start && dateStr <= end;
          })
          .map(ev => ev.id);
        
        const exemptUserIds = (participantsList || [])
          .filter(p => activeExtEventIds.includes(p.event_id))
          .map(p => String(p.user_id));

        const dateObj = new Date(`${dateStr}T00:00:00.000Z`);
        const dayName = TH_DAYS[dateObj.getUTCDay()];

        const schedule = schedulesList.find(s => s.day === dayName);
        if (!schedule) continue;

        const dutyMembers = schedule.data?.members || [];
        if (dutyMembers.length === 0 || dutyMembers[0] === '–') continue;

        const { data: checks } = await supabase
          .from('clean_duty_checks')
          .select('nickname')
          .eq('date', dateStr);

        const submittedNicknames = (checks || []).map(c => c.nickname);

        const { data: existingFines } = await supabase
          .from('discipline_fines')
          .select('nickname')
          .eq('date', dateStr)
          .eq('violation', 'ไม่ทำเวรห้องสภา');

        const finedNicknames = (existingFines || []).map(f => f.nickname);

        for (const nickname of dutyMembers) {
          if (nickname === '–') continue;

          const u = usersData.find(usr => usr.nickname === nickname);
          if (!u) continue;

          // Exempt if traveling to external event
          if (exemptUserIds.includes(String(u.id))) {
            console.log(`Exempting ${nickname} from clean fine on ${dateStr} due to external event`);
            continue;
          }

          const submitted = submittedNicknames.includes(nickname);
          const alreadyFined = finedNicknames.includes(nickname);

          if (!submitted && !alreadyFined) {
            const baseAmount = 30; // 30 Baht fine
            let finalAmount = baseAmount;
            if (u.dept_id === 2) {
              finalAmount *= 2; // 2x for discipline dept
            }

            const fineRecord = {
              user_id: String(u.id),
              user_name: u.name,
              nickname: u.nickname,
              violation: 'ไม่ทำเวรห้องสภา',
              amount: finalAmount,
              date: dateStr,
              note: `ไม่รายงานเวรห้องสภาภายในเวลา 18:00 น.${u.dept_id === 2 ? ' - ปรับ 2 เท่าเนื่องจากเป็นสารวัตรนักเรียน' : ''}`,
              by: 'ระบบอัตโนมัติ',
              paid: false
            };

            const { data: insertedData, error: insertError } = await supabase
              .from('discipline_fines')
              .insert([fineRecord])
              .select();

            if (insertError) {
              console.error(`Failed to insert clean auto-fine for ${nickname} on ${dateStr}:`, insertError);
              continue;
            }

            console.log(`Auto-fined ${nickname} for clean duty on ${dateStr}`);
          }
        }
      }
    } catch (err) {
      console.error('Error in runAutoCleanFinesCheck:', err);
    }
  };

  const checkAndDoubleOverdueFines = async (serverNow = new Date()) => {
    try {
      const { data: unpaidFines, error } = await supabase
        .from('discipline_fines')
        .select('*')
        .eq('payment_status', 'unpaid');

      if (error) throw error;
      if (!unpaidFines || unpaidFines.length === 0) return;

      const tzOffset = 7 * 60 * 60 * 1000;
      const todayStr = new Date(serverNow.getTime() + tzOffset).toISOString().split('T')[0];
      const updates = [];

      for (const fine of unpaidFines) {
        if (!fine.date) continue;
        
        // Parse dates in UTC to avoid local timezone skew/fluctuation
        const d1 = new Date(`${todayStr}T00:00:00.000Z`);
        const d2 = new Date(`${fine.date}T00:00:00.000Z`);
        const diffDays = Math.floor((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24));

        const expectedDoubledCount = Math.floor(diffDays / 7);
        if (expectedDoubledCount <= 0) continue;

        let currentDoubledCount = 0;
        const noteStr = fine.note || '';
        const match = noteStr.match(/\[คูณ 2 ครั้งที่ (\d+)\]/);
        if (match) {
          currentDoubledCount = parseInt(match[1], 10);
        } else if (noteStr.includes('ปรับคูณ 2 เนื่องจากค้างชำระเกิน 7 วัน') || noteStr.includes('(ปรับคูณ 2)')) {
          currentDoubledCount = 1;
        }

        if (expectedDoubledCount > currentDoubledCount) {
          const multiplier = Math.pow(2, expectedDoubledCount - currentDoubledCount);
          const doubledAmount = fine.amount * multiplier;
          
          let updatedNote = noteStr
            .replace(/\s*\(ปรับคูณ 2 เนื่องจากค้างชำระเกิน 7 วัน\)/g, '')
            .replace(/\s*\(ปรับคูณ 2\)/g, '')
            .replace(/\s*\[คูณ 2 ครั้งที่ \d+\]/g, '');
            
          updatedNote = updatedNote ? `${updatedNote} [คูณ 2 ครั้งที่ ${expectedDoubledCount}]` : `[คูณ 2 ครั้งที่ ${expectedDoubledCount}]`;
          
          updates.push({
            id: fine.id,
            amount: doubledAmount,
            note: updatedNote,
            fine: fine,
            doubledAmount: doubledAmount,
            expectedDoubledCount: expectedDoubledCount
          });
        }
      }

      for (const update of updates) {
        const { data: updatedRows, error: updateError } = await supabase
          .from('discipline_fines')
          .update({ amount: update.amount, note: update.note })
          .eq('id', update.id)
          .not('note', 'like', `%[คูณ 2 ครั้งที่ ${update.expectedDoubledCount}]%`)
          .select();
        
        if (updateError) {
          console.error(`Failed to double fine ${update.id}:`, updateError);
        } else if (!updatedRows || updatedRows.length === 0) {
          console.log(`Fine ${update.id} was already updated by another session.`);
        } else {
          console.log(`Successfully doubled fine ${update.id} to ${update.amount}`);
          
          // Send Discord notification
          const embedTitle = `⚠️ ค่าปรับเพิ่มขึ้นเป็น 2 เท่า (ครั้งที่ ${update.expectedDoubledCount})`;
          const embedDesc = `สมาชิกสภานักเรียนค้างชำระค่าปรับเกินกำหนด ${update.expectedDoubledCount * 7} วัน ระบบจึงทำการปรับคูณ 2 อัตโนมัติ (ครั้งที่ ${update.expectedDoubledCount})`;
          const fields = [
            { name: '👤 สมาชิก', value: `${update.fine.user_name || 'ไม่ระบุ'} (${update.fine.nickname})`, inline: true },
            { name: '⚖️ ข้อหาความผิด', value: update.fine.violation, inline: true },
            { name: '💰 ยอดค่าปรับใหม่', value: `~~${update.fine.amount} บาท~~ ➡️ **${update.doubledAmount} บาท**`, inline: true },
            { name: '📅 วันที่บันทึกความผิด', value: update.fine.date, inline: true }
          ];
          sendDiscordEmbedViaGAS(embedTitle, embedDesc, 16711680, fields, null, 'discipline_fines');
        }
      }
    } catch (err) {
      console.error('Error in checkAndDoubleOverdueFines:', err);
    }
  };

  useEffect(() => {
    async function loadDashboardData() {
      try {
        // Fetch events
        const { data: eventsData, error: err1 } = await supabase
          .from('events')
          .select('*')
          .order('date', { ascending: true });
        if (err1) throw err1;

        // Fetch notifications
        const { data: notifData, error: err2 } = await supabase
          .from('notifications')
          .select('*')
          .order('created_at', { ascending: false });
        if (err2) throw err2;

        // Fetch users count
        const { count: uCount, error: err3 } = await supabase
          .from('users')
          .select('*', { count: 'exact', head: true });
        if (err3) throw err3;

        // Fetch departments count
        const { count: dCount, error: err4 } = await supabase
          .from('departments')
          .select('*', { count: 'exact', head: true });
        if (err4) throw err4;

        // Fetch clean schedules and all schedules
        const { data: schedulesData, error: err5 } = await supabase
          .from('schedules')
          .select('*');
        if (err5) throw err5;
        const cleanData = (schedulesData || []).filter(s => s.type === 'clean_room');
        const greetingData = (schedulesData || []).filter(s => s.type === 'greeting');

        // Fetch users details
        const { data: usersData, error: err6 } = await supabase
          .from('users')
          .select('id, name, nickname, dept_id');
        if (err6) throw err6;
        setUsersList(usersData || []);

        // Fetch event participants
        const { data: partData, error: err7 } = await supabase
          .from('event_participants')
          .select('*');
        if (err7) throw err7;
        setEventParticipants(partData || []);

        // Fetch duty swaps
        const { data: swapData, error: err8 } = await supabase
          .from('duty_swaps')
          .select('*');
        if (err8) throw err8;
        setDutySwaps(swapData || []);

        // Fetch settings
        let startD = '';
        let cleanStartD = '';
        let greetingStartD = '';
        const { data: settingsData } = await supabase
          .from('attendance_settings')
          .select('*');
        if (settingsData) {
          startD = settingsData.find(d => d.key === 'start_date')?.value || '';
          setStartDate(startD);

          cleanStartD = settingsData.find(d => d.key === 'clean_duty_start_date')?.value || '';
          setCleanDutyStartDate(cleanStartD);

          greetingStartD = settingsData.find(d => d.key === 'greeting_duty_start_date')?.value || '';
          setGreetingDutyStartDate(greetingStartD);
        }

        setEvents(eventsData || []);
        setNotifications(notifData || []);
        setUsersCount(uCount || 0);
        setDeptsCount(dCount || 0);
        setCleanSchedules(cleanData || []);
        setGreetingSchedules(greetingData || []);

        // Compute conflicts for the logged-in user (or all users for admin/discipline)
        if (user && user.nickname) {
          const showAllConflicts = isAdmin || isDiscipline;
          const targetUsers = showAllConflicts 
            ? (usersData || []) 
            : (usersData || []).filter(u => String(u.id) === String(user.id));

          const activeConflicts = [];
          const TH_DAYS_WEEK = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์"];

          targetUsers.forEach(tUser => {
            if (!tUser.nickname) return;

            const myEventIds = (partData || []).filter(p => String(p.user_id) === String(tUser.id)).map(p => p.event_id);
            const myExtEvents = (eventsData || []).filter(ev => ev.location_category === 'external' && myEventIds.includes(ev.id));

            for (let i = 0; i < 14; i++) {
              const d = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
              const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
              const dayName = TH_DAYS_WEEK[d.getDay()];

              const activeEvent = myExtEvents.find(ev => {
                const start = ev.date;
                const end = ev.end_date || ev.date;
                return dateStr >= start && dateStr <= end;
              });

              if (activeEvent) {
                const greetSchedule = (schedulesData || []).find(s => s.day === dayName && s.type === 'greeting');
                if (greetSchedule) {
                  const sData = greetSchedule.data || {};
                  ['gate1', 'gate2', 'gate3'].forEach(gate => {
                    const members = sData[gate] || [];
                    if (members.includes(tUser.nickname)) {
                      const swapExists = (swapData || []).some(s => s.date === dateStr && s.duty_type === `greeting_${gate}` && s.original_nickname === tUser.nickname);
                      if (!swapExists) {
                        const gateNames = { gate1: 'ประตูไหมไทย', gate2: 'ประตูอำเภอ', gate3: 'ประตูหน้า รร.' };
                        activeConflicts.push({
                          date: dateStr,
                          dayName,
                          dutyType: `greeting_${gate}`,
                          dutyLabel: `เวรยืนไหว้ (${gateNames[gate] || gate})`,
                          eventTitle: activeEvent.title,
                          originalNickname: tUser.nickname,
                          userFullName: tUser.name
                        });
                      }
                    }
                  });
                }

                const flagSchedules = (schedulesData || []).filter(s => s.day === dayName && (s.type === 'national_flag' || s.type === 'color_flag'));
                flagSchedules.forEach(fSched => {
                  const fData = fSched.data || {};
                  const members = fData.members || [];
                  if (members.includes(tUser.nickname)) {
                    const swapExists = (swapData || []).some(s => s.date === dateStr && s.duty_type === fSched.type && s.original_nickname === tUser.nickname);
                    if (!swapExists) {
                      activeConflicts.push({
                        date: dateStr,
                        dayName,
                        dutyType: fSched.type,
                        dutyLabel: fSched.type === 'national_flag' ? 'เวรเชิญธงชาติ' : 'เวรเชิญธงสี',
                        eventTitle: activeEvent.title,
                        originalNickname: tUser.nickname,
                        userFullName: tUser.name
                      });
                    }
                  }
                });
              }
            }
          });
          
          // Sort conflicts by date ascending
          activeConflicts.sort((a, b) => a.date.localeCompare(b.date));
          setConflicts(activeConflicts);
        }

        if (user && isAdmin) {
          const serverNow = await fetchServerDate();
          if (cleanData) {
            await runAutoCleanFinesCheck(cleanData, cleanStartD, eventsData || [], partData || [], serverNow);
          }
          if (greetingData) {
            await runAutoGreetingFinesCheck(greetingData, greetingStartD, eventsData || [], partData || [], swapData || [], serverNow);
          }
          await checkAndDoubleOverdueFines(serverNow);
        }
      } catch (e) {
        console.error('Error loading dashboard data:', e);
      } finally {
        setLoading(false);
      }
    }
    loadDashboardData();
  }, [user, isAdmin]);

  const upcoming = events
    .filter(e => new Date(e.date) >= today)
    .slice(0, 4)
    .map(e => ({ ...e, desc: e.description || e.desc }));
    
  const unread = notifications.filter(n => !n.read);
  const hour = today.getHours();
  const greet = hour < 12 ? 'อรุณสวัสดิ์' : hour < 17 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น';

  const dayIndex = today.getDay();
  const daysTh = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์'];
  const todayName = daysTh[dayIndex];
  
  const cleanSchedule = cleanSchedules.find(s => s.day === todayName);
  const cleanScheduleData = cleanSchedule?.data || {};
  const cleanMembers = cleanScheduleData.members || [];
  const isCleanBeforeStart = cleanDutyStartDate && todayStr < cleanDutyStartDate;
  const hasCleanDuty = cleanSchedule && user?.nickname && cleanMembers.includes(user.nickname) && !isCleanBeforeStart;

  const greetingSchedule = greetingSchedules.find(s => s.day === todayName);
  const greetingScheduleData = greetingSchedule?.data || {};
  let myGreetingGate = '';
  let myGreetingGateLabel = '';
  if (greetingSchedule && user?.nickname) {
    if (greetingScheduleData.gate1?.includes(user.nickname)) { myGreetingGate = 'gate1'; myGreetingGateLabel = 'ประตูไหมไทย'; }
    else if (greetingScheduleData.gate2?.includes(user.nickname)) { myGreetingGate = 'gate2'; myGreetingGateLabel = 'ประตูอำเภอ'; }
    else if (greetingScheduleData.gate3?.includes(user.nickname)) { myGreetingGate = 'gate3'; myGreetingGateLabel = 'ประตูหน้า รร.'; }
  }
  const isGreetingBeforeStart = greetingDutyStartDate && todayStr < greetingDutyStartDate;
  const hasGreetingDutyToday = myGreetingGate !== '' && !isGreetingBeforeStart;

  return (
    <div>
      {/* Welcome */}
      <div className="card" style={{ marginBottom: 16, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderLeft: '4px solid #00bcd4' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{greet}, {user?.nickname || user?.name?.split(' ')[0]}! 👋</div>
          <div style={{ fontSize: 12, color: '#757575', marginTop: 2 }}>{user?.position} · {user?.dept?.name || (user?.role === 'admin' ? 'ผู้ดูแลระบบ' : 'ส่วนกลาง')}</div>
        </div>
        <div style={{ fontSize: 12, color: '#9e9e9e', textAlign: 'right' }}>
          {today.toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </div>

      {/* Duty Conflict Alerts */}
      {conflicts.length > 0 && conflicts.map(c => (
        <div key={`${c.date}-${c.dutyType}`} style={{ background: 'linear-gradient(to right, #fff3e0, #ffe0b2)', borderRadius: 8, padding: '16px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid #ffcc80' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#e65100', display: 'flex', alignItems: 'center', gap: 6 }}>
              ⚠️ ตารางงานทับซ้อน (เวรทับซ้อนกิจกรรมภายนอก)
            </div>
            <div style={{ fontSize: 13, color: '#e65100', marginTop: 4 }}>
              {c.originalNickname === user?.nickname ? (
                <span>คุณมีหน้าที่ <strong>{c.dutyLabel}</strong></span>
              ) : (
                <span><strong>{c.originalNickname} ({c.userFullName})</strong> มีหน้าที่ <strong>{c.dutyLabel}</strong></span>
              )} ในวันที่ <strong>{new Date(c.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })} ({c.dayName})</strong> ซึ่งตรงกับวันที่เดินทางไปกิจกรรม <strong>{c.eventTitle}</strong> นอกสถานที่
            </div>
          </div>
          <button className="btn btn-warning" onClick={() => { setConflictModal(c); setSelectedSub(''); }} style={{ background: '#e65100', border: 'none', color: 'white', cursor: 'pointer', padding: '8px 16px', borderRadius: 6, fontWeight: 600 }}>
            🔄 สลับเปลี่ยนเวร
          </button>
        </div>
      ))}

      {/* Check-in Banner */}
      {!checkInState ? (
        <div style={{ background: 'linear-gradient(to right, #e0f7fa, #b2ebf2)', borderRadius: 8, padding: '16px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid #80deea' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#00838f', display: 'flex', alignItems: 'center', gap: 6 }}>
              <MapPin size={18} /> เช็คชื่อมาโรงเรียน
            </div>
            <div style={{ fontSize: 12, color: '#006064', marginTop: 4 }}>กรุณาเช็คชื่อก่อนเวลา 07:35 น. (เวรยืนไหว้ 07:00 น.)</div>
          </div>
          <NavLink to="/checkin" className="btn btn-primary" style={{ background: '#00838f', border: 'none', textDecoration: 'none' }}>
            📍 เช็คชื่อตอนนี้
          </NavLink>
        </div>
      ) : (
        (() => {
          let bannerBg = '#ffebee';
          let borderCol = '#ffcdd2';
          let textCol = '#c62828';
          let icon = <AlertTriangle size={24} color="#c62828" />;
          let statusText = 'บันทึกการเช็คชื่อแล้ว (มาสาย)';

          if (checkInState.status === 'on_time') {
            bannerBg = '#e8f5e9';
            borderCol = '#c8e6c9';
            textCol = '#2e7d32';
            icon = <CheckCircle size={24} color="#2e7d32" />;
            statusText = 'บันทึกการเช็คชื่อแล้ว (มาปกติ)';
          } else if (checkInState.status === 'leave') {
            bannerBg = '#fff8e1';
            borderCol = '#ffe082';
            textCol = '#f57f17';
            icon = <AlertTriangle size={24} color="#f57f17" />;
            statusText = 'บันทึกการเช็คชื่อแล้ว (ลากิจ/ลาป่วย)';
          } else if (checkInState.status === 'missing') {
            bannerBg = '#f5f5f5';
            borderCol = '#e0e0e0';
            textCol = '#616161';
            icon = <AlertTriangle size={24} color="#616161" />;
            statusText = 'ระบบบันทึกว่า (ขาดแถว)';
          } else if (checkInState.status === 'not_required') {
            bannerBg = '#eceff1';
            borderCol = '#cfd8dc';
            textCol = '#455a64';
            icon = <CheckCircle size={24} color="#455a64" />;
            statusText = 'ไม่มีการเช็คชื่อในวันนี้ (ไม่บังคับ)';
          }

          return (
            <div style={{ background: bannerBg, borderRadius: 8, padding: '16px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, border: `1px solid ${borderCol}` }}>
              {icon}
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: textCol }}>
                  {statusText}
                </div>
                <div style={{ fontSize: 12, color: '#757575', marginTop: 4 }}>
                  เวลาที่บันทึก: {checkInState.time || '-'}
                </div>
              </div>
            </div>
          );
        })()
      )}

      {/* Greeting Duty Banner */}
      {hasGreetingDutyToday && (
        !greetingDutyState ? (
          !checkInState ? (
            <div style={{ background: 'linear-gradient(to right, #eceff1, #cfd8dc)', borderRadius: 8, padding: '16px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid #b0bec5' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#455a64', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <HandHeart size={18} /> ส่งรายงานเวรยืนไหว้ (ยังไม่พร้อมใช้งาน)
                </div>
                <div style={{ fontSize: 12, color: '#546e7a', marginTop: 4 }}>วันนี้คุณมีเวรยืนไหว้ที่ **{myGreetingGateLabel}** แต่กรุณา<strong>เช็คชื่อเข้าโรงเรียนปกติก่อน</strong> จึงจะสามารถส่งรูปเวรได้</div>
              </div>
              <NavLink to="/checkin" className="btn btn-primary" style={{ background: '#546e7a', border: 'none', textDecoration: 'none' }}>
                📍 เช็คชื่อก่อน
              </NavLink>
            </div>
          ) : (
            <div style={{ background: 'linear-gradient(to right, #e0f7fa, #b2ebf2)', borderRadius: 8, padding: '16px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid #80deea' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#00838f', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <HandHeart size={18} /> ส่งรายงานเวรยืนไหว้
                </div>
                <div style={{ fontSize: 12, color: '#006064', marginTop: 4 }}>วันนี้คุณมีเวรยืนไหว้ต้อนรับที่ **{myGreetingGateLabel}** อย่าลืมถ่ายรูปรายงานตัวก่อนเวลา 07:10 น. ด้วยนะ!</div>
              </div>
              <NavLink to="/greeting-duty" className="btn btn-primary" style={{ background: '#00838f', border: 'none', textDecoration: 'none' }}>
                📍 ส่งรูปเวร
              </NavLink>
            </div>
          )
        ) : (
          <div style={{ background: '#e8f5e9', borderRadius: 8, padding: '16px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, border: '1px solid #c8e6c9' }}>
            <CheckCircle size={24} color="#2e7d32" />
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#2e7d32' }}>
                ส่งรูปรายงานเวรยืนไหว้เรียบร้อยแล้ว
              </div>
              <div style={{ fontSize: 12, color: '#2e7d32', marginTop: 4 }}>
                ประตู: {myGreetingGateLabel} | เวลาที่ส่ง: {greetingDutyState.time}
              </div>
            </div>
          </div>
        )
      )}

      {/* Clean Duty Banner */}
      {hasCleanDuty && (
        !cleanDutyState ? (
          <div style={{ background: 'linear-gradient(to right, #fff3e0, #ffe0b2)', borderRadius: 8, padding: '16px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid #ffcc80' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#e65100', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Sparkles size={18} /> ส่งเวรทำความสะอาดห้องสภา
              </div>
              <div style={{ fontSize: 12, color: '#ef6c00', marginTop: 4 }}>วันนี้คุณมีเวรทำความสะอาด อย่าลืมถ่ายรูปส่งหลังทำเสร็จด้วยนะ!</div>
            </div>
            <NavLink to="/clean-duty" className="btn btn-primary" style={{ background: '#f57c00', border: 'none', textDecoration: 'none' }}>
              📸 ส่งรูปเวร
            </NavLink>
          </div>
        ) : (
          <div style={{ background: '#f1f8e9', borderRadius: 8, padding: '16px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, border: '1px solid #dcedc8' }}>
            <CheckCircle size={24} color="#558b2f" />
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#558b2f' }}>
                ส่งรูปเวรทำความสะอาดห้องสภาแล้ว
              </div>
              <div style={{ fontSize: 12, color: '#7cb342', marginTop: 4 }}>
                เวลาที่ส่ง: {cleanDutyState.time}
              </div>
            </div>
          </div>
        )
      )}

      {/* Stats */}
      <div className="stats-row">
        {[
          { label: 'สมาชิกทั้งหมด', value: usersCount, icon: '👥', bg: '#e3f2fd', color: '#1565c0' },
          { label: 'ฝ่ายทั้งหมด',   value: deptsCount, icon: '🏢', bg: '#e8f5e9', color: '#2e7d32' },
          { label: 'กิจกรรมที่กำลังจะมา', value: upcoming.length, icon: '📅', bg: '#fff8e1', color: '#f57f17' },
          { label: 'การแจ้งเตือนใหม่', value: unread.length, icon: '🔔', bg: '#fce4ec', color: '#880e4f' },
        ].map(s => (
          <div key={s.label} className="stat-box">
            <div className="stat-icon-box" style={{ background: s.bg }}>{s.icon}</div>
            <div>
              <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Upcoming events */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">📅 กิจกรรมที่กำลังจะมาถึง</span>
            <NavLink to="/calendar" style={{ fontSize: 12, color: '#00bcd4', textDecoration: 'none' }}>ดูทั้งหมด</NavLink>
          </div>
          <div>
            {upcoming.map((ev, i) => (
              <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: i < upcoming.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: ev.color, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{ev.title}</div>
                  <div style={{ fontSize: 11, color: '#9e9e9e' }}>{ev.desc}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <span className={`badge ${TYPE_BADGE[ev.type]}`}>{TYPE_LABEL[ev.type]}</span>
                  <div style={{ fontSize: 11, color: '#9e9e9e', marginTop: 3 }}>
                    {new Date(ev.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Notifications */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">🔔 การแจ้งเตือน</span>
            {unread.length > 0 && <span className="badge badge-red">{unread.length} ใหม่</span>}
          </div>
          <div>
            {notifications.map((n, i) => (
              <div key={n.id} style={{
                display: 'flex', gap: 12, padding: '10px 16px',
                borderBottom: i < notifications.length - 1 ? '1px solid #f0f0f0' : 'none',
                background: n.read ? 'white' : '#f3f4ff',
              }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>
                  {n.type === 'fine' ? '💸' : n.type === 'task' ? '📋' : n.type === 'event' ? '📅' : '🔔'}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, lineHeight: 1.5 }}>{n.message}</div>
                  <div style={{ fontSize: 11, color: '#9e9e9e', marginTop: 2 }}>{n.created_at ? formatRelativeTime(n.created_at) : n.time}</div>
                </div>
                {!n.read && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#00bcd4', flexShrink: 0, marginTop: 4 }} />}
              </div>
            ))}
          </div>
        </div>

        {/* Quick access */}
        <div className="card">
          <div className="card-header"><span className="card-title">⚡ เข้าถึงด่วน</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
            {[
              { to: '/schedules', icon: '🙏', label: 'ตารางเวรยืนไหว้' },
              { to: '/schedules', icon: '🚩', label: 'เวรเชิญธง' },
              { to: '/calendar',  icon: '📅', label: 'ปฏิทินกิจกรรม' },
            ].map(q => (
              <NavLink key={q.label} to={q.to} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', color: '#212121', borderBottom: '1px solid #f0f0f0', borderRight: '1px solid #f0f0f0' }}>
                <span style={{ fontSize: 18 }}>{q.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{q.label}</span>
              </NavLink>
            ))}
          </div>
        </div>

        {/* Calendar */}
        <div className="card">
          <div style={{ padding:'12px 16px', borderBottom:'1px solid #f0f0f0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <button className="btn btn-gray btn-sm" onClick={prevMonth}>← ก่อนหน้า</button>
            <span style={{ fontWeight:700, fontSize:15, color:'#00bcd4' }}>
              {MONTHS[mo]} {yr + 543}
            </span>
            <button className="btn btn-gray btn-sm" onClick={nextMonth}>ถัดไป →</button>
          </div>
          <div style={{ padding:'12px' }}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', marginBottom:6 }}>
              {DAYS_TH.map(d => (
                <div key={d} style={{ textAlign:'center', fontSize:12, fontWeight:700, color:'#9e9e9e', padding:'4px 0' }}>{d}</div>
              ))}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2 }}>
              {Array.from({length:firstDay}).map((_,i)=><div key={`e${i}`}/>)}
              {Array.from({length:daysInMonth}).map((_,i)=>{
                const day = i+1;
                const evs = getEvents(day);
                const ds  = `${yr}-${String(mo+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                const isToday = ds === todayStr;
                const isSel   = sel === day;
                return (
                  <div key={day} onClick={()=>setSel(day)} style={{
                    minHeight:52, padding:'4px', borderRadius:4, cursor:'pointer',
                    border:`1px solid ${isSel?'#00bcd4': isToday?'#80deea':'#f0f0f0'}`,
                    background: isSel?'#e0f7fa': isToday?'#f3f4ff':'white',
                  }}>
                    <div style={{
                      fontSize:12, fontWeight: isToday?700:400,
                      width:22, height:22, borderRadius:'50%',
                      background: isToday?'#00bcd4':'transparent',
                      color: isToday?'white':'#212121',
                      display:'flex', alignItems:'center', justifyContent:'center',
                    }}>{day}</div>
                    <div style={{ display:'flex', flexDirection:'column', gap:1, marginTop:2 }}>
                      {evs.slice(0,2).map(ev=>(
                        <div key={ev.id} style={{ fontSize:10, background: ev.color+'22', color: ev.color, borderRadius:2, padding:'1px 4px', overflow:'hidden', whiteSpace:'nowrap', textOverflow:'ellipsis' }}>
                          {ev.title}
                        </div>
                      ))}
                      {evs.length>2 && <div style={{fontSize:10,color:'#9e9e9e'}}>+{evs.length-2}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Swap Modal */}
      {conflictModal && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex: 1000 }}>
          <div className="card" style={{ width:'100%', maxWidth:400, padding: 20, background: 'white' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 16 }}>
              <span style={{ fontWeight:700, fontSize:16 }}>🔄 ขอสลับเปลี่ยนเวร</span>
              <button onClick={()=>setConflictModal(null)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color: '#9e9e9e' }}>&times;</button>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div style={{ fontSize: 13, background: '#fff3e0', padding: 10, borderRadius: 6, color: '#e65100', lineHeight: 1.4 }}>
                ระบบจะทำการเปลี่ยนผู้รับผิดชอบเวร <strong>{conflictModal.dutyLabel}</strong> ประจำวันที่ <strong>{conflictModal.date}</strong> แทน <strong>{conflictModal.originalNickname === user?.nickname ? 'คุณ' : conflictModal.originalNickname}</strong> ชั่วคราว
              </div>
              <div>
                <label style={{ fontSize:13, fontWeight:600 }}>ผู้ปฏิบัติหน้าที่แทน</label>
                <select 
                  className="select-field" 
                  value={selectedSub} 
                  onChange={e=>setSelectedSub(e.target.value)} 
                  style={{ width: '100%', marginTop: 4, padding: '8px', borderRadius: 6, border: '1px solid #ccc', boxSizing: 'border-box' }}
                >
                  <option value="">-- เลือกสมาชิกที่จะมาทำเวรแทน --</option>
                  {usersList
                    .filter(u => u.nickname !== conflictModal.originalNickname && u.nickname !== 'แอดมิน')
                    .map(u => (
                      <option key={u.id} value={u.nickname}>{u.name} ({u.nickname})</option>
                    ))
                  }
                </select>
              </div>
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:16, paddingTop: 16, borderTop: '1px solid #f0f0f0' }}>
              <button className="btn btn-gray" onClick={()=>setConflictModal(null)}>ยกเลิก</button>
              <button className="btn btn-primary" onClick={handleSaveSwap} disabled={!selectedSub} style={{ background: '#e65100', border: 'none' }}>บันทึกการสลับเวร</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
