import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { NavLink } from 'react-router-dom';
import { Camera, MapPin, X, CheckCircle, AlertTriangle, Sparkles } from 'lucide-react';
import { supabase } from '../supabaseClient';

const TYPE_LABEL = { meeting: 'ประชุม', event: 'กิจกรรม', deadline: 'กำหนดส่ง' };
const TYPE_BADGE = { meeting: 'badge-purple', event: 'badge-green', deadline: 'badge-yellow' };
const MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const DAYS_TH = ['อา','จ','อ','พ','พฤ','ศ','ส'];

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
  const { user, isAdmin, checkInState, cleanDutyState } = useAuth();
  
  const [events, setEvents] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [usersCount, setUsersCount] = useState(0);
  const [deptsCount, setDeptsCount] = useState(0);
  const [cleanSchedules, setCleanSchedules] = useState([]);
  const [startDate, setStartDate] = useState('');
  const [loading, setLoading] = useState(true);

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

  const runAutoCleanFinesCheck = async (schedulesList, startDateValue) => {
    try {
      const { data: usersData } = await supabase.from('users').select('id, name, nickname, dept_id');
      if (!usersData) return;

      const now = new Date();
      const datesToCheck = [];

      for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(now.getDate() - i);
        
        // Skip if date is before start date
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (startDateValue && dateStr < startDateValue) continue;

        const dayOfWeek = d.getDay(); // 0 = Sunday, 6 = Saturday
        if (dayOfWeek === 0 || dayOfWeek === 6) continue; // Skip weekends

        // If it is today, only check if it is past 18:00 (6:00 PM)
        if (i === 0) {
          if (now.getHours() < 18) continue;
        }

        datesToCheck.push(d);
      }

      const TH_DAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์"];

      for (const d of datesToCheck) {
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const dayName = TH_DAYS[d.getDay()];

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

          const submitted = submittedNicknames.includes(nickname);
          const alreadyFined = finedNicknames.includes(nickname);

          if (!submitted && !alreadyFined) {
            const u = usersData.find(usr => usr.nickname === nickname);
            if (u) {
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

              await supabase.from('discipline_fines').insert([fineRecord]);
              console.log(`Auto-fined ${nickname} for clean duty on ${dateStr}`);
            }
          }
        }
      }
    } catch (err) {
      console.error('Error in runAutoCleanFinesCheck:', err);
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

        // Fetch clean schedules
        const { data: cleanData } = await supabase
          .from('schedules')
          .select('*')
          .eq('type', 'clean_room');

        // Fetch settings
        let startD = '';
        const { data: settingsData } = await supabase
          .from('attendance_settings')
          .select('*');
        if (settingsData) {
          startD = settingsData.find(d => d.key === 'start_date')?.value || '';
          setStartDate(startD);
        }

        setEvents(eventsData || []);
        setNotifications(notifData || []);
        setUsersCount(uCount || 0);
        setDeptsCount(dCount || 0);
        setCleanSchedules(cleanData || []);

        if (cleanData) {
          await runAutoCleanFinesCheck(cleanData, startD);
        }
      } catch (e) {
        console.error('Error loading dashboard data:', e);
      } finally {
        setLoading(false);
      }
    }
    loadDashboardData();
  }, []);

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
  const isBeforeStart = startDate && todayStr < startDate;
  const hasCleanDuty = cleanSchedule && user?.nickname && cleanMembers.includes(user.nickname) && !isBeforeStart;

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
        <div style={{ background: checkInState.status === 'on_time' ? '#e8f5e9' : '#ffebee', borderRadius: 8, padding: '16px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, border: `1px solid ${checkInState.status === 'on_time' ? '#c8e6c9' : '#ffcdd2'}` }}>
          {checkInState.status === 'on_time' ? <CheckCircle size={24} color="#2e7d32" /> : <AlertTriangle size={24} color="#c62828" />}
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: checkInState.status === 'on_time' ? '#2e7d32' : '#c62828' }}>
              {checkInState.status === 'on_time' ? 'บันทึกการเช็คชื่อแล้ว (มาปกติ)' : 'บันทึกการเช็คชื่อแล้ว (มาสาย)'}
            </div>
            <div style={{ fontSize: 12, color: '#757575', marginTop: 4 }}>
              เวลาที่บันทึก: {checkInState.time}
            </div>
          </div>
        </div>
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
    </div>
  );
}
