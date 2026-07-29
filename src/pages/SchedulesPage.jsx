import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Edit2, Lock, Unlock, ChevronDown, Camera } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { sendDiscordEmbedViaGAS } from '../lib/discordWebhook';
import logoUrl from '../assets/logo.png';
const ALL_NAMES = [
  'อ้วน', 'ใบหม่อน', 'กร', 'แปม', 'เจมส์', 'มิก', 'ณโม', 'โฟกัส', 'น้ำภัท', 'โนโน', 'คิว', 'พอใจ',
  'พี', 'ปาล์ม', 'จักร', 'ข้าวปุ้น', 'โต๋', 'น้ำขิง', 'มิวสิค', 'ยู', 'กัปตัน', 'ปลายฟ้า', 'ชัย', 'ใบเตย',
  'เฟรนด์', 'ต้น', 'สมชาย', 'กีปตัน', 'น้ำภัทร', 'ต้นต้น', 'มิกกี้', 'ชมพู่', 'เจม', 'น้ำนัน', '–'
].filter(name => name !== 'แอดมิน').sort();

/* ---- helpers ---- */
const DAY_COLOR_MAP = {
  'จันทร์':  { bg: '#fff7ed', text: '#9a3412', border: '#ffedd5' },
  'อังคาร': { bg: '#fdf2f8', text: '#831843', border: '#fbcfe8' },
  'พุธ':     { bg: '#f0fdf4', text: '#14532d', border: '#bbf7d0' },
  'พฤหัส':  { bg: '#fff7ed', text: '#7c2d12', border: '#fed7aa' },
  'ศุกร์':   { bg: '#eff6ff', text: '#1e3a8a', border: '#bfdbfe' },
};

const DayBadge = ({ day }) => {
  const style = DAY_COLOR_MAP[day] || { bg: '#f1f5f9', text: '#475569', border: '#e2e8f0' };
  return (
    <span style={{
      background: style.bg,
      color: style.text,
      border: `1px solid ${style.border}`,
      borderRadius: 10,
      padding: '4px 12px',
      fontSize: 13,
      fontWeight: 800,
      display: 'inline-block',
      boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
    }}>
      {day}
    </span>
  );
};

const TagList = ({ names, day, dutyType, swaps = [] }) => {
  const getThaiDayFromDate = (dateStr) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const daysTh = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์'];
    return daysTh[dateObj.getDay()] || '';
  };

  const todayStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
      {names.map((n, i) => {
        const activeSwap = swaps.find(s => {
          if (s.original_nickname !== n) return false;
          if (dutyType && s.duty_type !== dutyType && !s.duty_type.startsWith(dutyType)) return false;
          const sDay = getThaiDayFromDate(s.date);
          return sDay === day && s.date >= todayStr;
        });

        if (n === '–') {
          return <span key={i} style={{ color: '#cbd5e1', fontSize: 13 }}>–</span>;
        }

        return (
          <span key={i} style={{
            background: activeSwap ? '#fff3e0' : '#e0f2fe',
            color: activeSwap ? '#e65100' : '#0369a1',
            border: activeSwap ? '1px solid #ffcc80' : '1px solid #bae6fd',
            borderRadius: 20, padding: '3px 10px', fontSize: 12.5, fontWeight: 700,
            display: 'inline-flex', alignItems: 'center', gap: 4,
            boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
          }}>
            {n}
            {activeSwap && (
              <span style={{ fontSize: 11, color: '#c62828', fontWeight: 800 }}>
                ➡️ {activeSwap.substitute_nickname} (แทน)
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
};

/* ---- Cell editor (Select dropdown) ---- */
const EditableCell = ({ names, onChange, candidates = ALL_NAMES }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div style={{ position: 'relative', textAlign: 'left' }}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          minHeight: 32, width: '100%', border: '1.5px solid var(--primary)', borderRadius: 8,
          padding: '5px 10px', fontSize: 12, background: 'var(--primary-light)', cursor: 'pointer',
          display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', justifyContent: 'center'
        }}
      >
        {names.length === 0 ? <span style={{ color: '#94a3b8' }}>คลิกเพื่อเลือก</span> : names.map((n, i) => (
          <span key={i} style={{ background: 'var(--primary)', color: 'white', padding: '2px 8px', borderRadius: 12, fontSize: 11.5, fontWeight: 600 }}>{n}</span>
        ))}
        <ChevronDown size={14} color="var(--primary)" style={{ marginLeft: 'auto' }} />
      </div>
      {isOpen && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, minWidth: 160, zIndex: 999,
          background: 'white', border: '1px solid var(--border)', borderRadius: 10,
          boxShadow: 'var(--shadow-lg)', maxHeight: 220, overflowY: 'auto',
          display: 'flex', flexDirection: 'column', padding: 6, marginTop: 4
        }}>
          {candidates.map(n => (
            <label key={n} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f1f5f9' }}>
              <input
                type="checkbox"
                checked={names.includes(n)}
                onChange={() => {
                  if (names.includes(n)) onChange(names.filter(x => x !== n));
                  else onChange([...names, n]);
                }}
                style={{ cursor: 'pointer' }}
              />
              {n}
            </label>
          ))}
          <div
            onClick={() => setIsOpen(false)}
            style={{ textAlign: 'center', padding: '6px', background: 'var(--primary-light)', color: 'var(--primary)', marginTop: 6, cursor: 'pointer', fontSize: 12, borderRadius: 6, fontWeight: 700 }}
          >
            ปิด
          </div>
        </div>
      )}
    </div>
  );
};

/* ============================================================
   TABLE COMPONENTS PER DUTY TYPE (MODERNIZED)
   ============================================================ */

/** เวรยืนไหว้ — วัน × 3 ประตู */
function GreetingTable({ data, editMode, onChange, candidates, swaps }) {
  return (
    <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid #e2e8f0', boxShadow: '0 4px 16px rgba(0,0,0,0.03)', background: '#ffffff' }}>
      <table className="simple-table schedule-grid" style={{ textAlign: 'center', width: '100%', margin: 0, borderCollapse: 'separate', borderSpacing: 0 }}>
        <thead>
          <tr style={{ background: 'linear-gradient(135deg, #4f46e5, #6366f1)', color: '#ffffff' }}>
            <th style={{ width: 100, padding: '14px 16px', color: '#ffffff', fontWeight: 800, fontSize: 13, borderBottom: 'none' }}>วัน</th>
            <th style={{ padding: '14px 16px', color: '#ffffff', fontWeight: 800, fontSize: 13, borderBottom: 'none' }}>🏫 ประตูไหมไทย</th>
            <th style={{ padding: '14px 16px', color: '#ffffff', fontWeight: 800, fontSize: 13, borderBottom: 'none' }}>🏛️ ประตูอำเภอ</th>
            <th style={{ padding: '14px 16px', color: '#ffffff', fontWeight: 800, fontSize: 13, borderBottom: 'none' }}>🚪 ประตูหน้า รร.</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, ri) => (
            <tr key={row.day} style={{ background: ri % 2 === 0 ? '#ffffff' : '#f8fafc', transition: 'background 0.2s ease' }}>
              <td style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' }}>
                <DayBadge day={row.day} />
              </td>
              {['gate1', 'gate2', 'gate3'].map(g => (
                <td key={g} style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' }}>
                  {editMode
                    ? <EditableCell names={row[g]} onChange={v => onChange(ri, g, v)} candidates={candidates} />
                    : <TagList names={row[g]} day={row.day} dutyType={`greeting_${g}`} swaps={swaps} />}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** เวรเชิญธงชาติ / ธงสี — วัน × รายชื่อ */
function SimpleTable({ data, editMode, onChange, label, candidates, swaps, dutyType }) {
  return (
    <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid #e2e8f0', boxShadow: '0 4px 16px rgba(0,0,0,0.03)', background: '#ffffff', maxWidth: 560, margin: '0 auto' }}>
      <table className="simple-table schedule-grid" style={{ textAlign: 'center', width: '100%', margin: 0, borderCollapse: 'separate', borderSpacing: 0 }}>
        <thead>
          <tr style={{ background: 'linear-gradient(135deg, #4f46e5, #6366f1)', color: '#ffffff' }}>
            <th style={{ width: 100, padding: '14px 16px', color: '#ffffff', fontWeight: 800, fontSize: 13, borderBottom: 'none' }}>วัน</th>
            <th style={{ padding: '14px 16px', color: '#ffffff', fontWeight: 800, fontSize: 13, borderBottom: 'none' }}>{label}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, ri) => (
            <tr key={row.day} style={{ background: ri % 2 === 0 ? '#ffffff' : '#f8fafc', transition: 'background 0.2s ease' }}>
              <td style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' }}>
                <DayBadge day={row.day} />
              </td>
              <td style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' }}>
                {editMode
                  ? <EditableCell names={row.members} onChange={v => onChange(ri, 'members', v)} candidates={candidates} />
                  : <TagList names={row.members} day={row.day} dutyType={dutyType} swaps={swaps} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** เวรทำความสะอาด — วัน × รายชื่อ (หลายคน) */
function CleanTable({ data, editMode, onChange, candidates, swaps }) {
  return (
    <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid #e2e8f0', boxShadow: '0 4px 16px rgba(0,0,0,0.03)', background: '#ffffff', maxWidth: 640, margin: '0 auto' }}>
      <table className="simple-table schedule-grid" style={{ textAlign: 'center', width: '100%', margin: 0, borderCollapse: 'separate', borderSpacing: 0 }}>
        <thead>
          <tr style={{ background: 'linear-gradient(135deg, #4f46e5, #6366f1)', color: '#ffffff' }}>
            <th style={{ width: 100, padding: '14px 16px', color: '#ffffff', fontWeight: 800, fontSize: 13, borderBottom: 'none' }}>วัน</th>
            <th style={{ padding: '14px 16px', color: '#ffffff', fontWeight: 800, fontSize: 13, borderBottom: 'none' }}>🧹 สมาชิกสภาที่รับผิดชอบทำความสะอาด</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, ri) => (
            <tr key={row.day} style={{ background: ri % 2 === 0 ? '#ffffff' : '#f8fafc', transition: 'background 0.2s ease' }}>
              <td style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' }}>
                <DayBadge day={row.day} />
              </td>
              <td style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' }}>
                {editMode
                  ? <EditableCell names={row.members} onChange={v => onChange(ri, 'members', v)} candidates={candidates} />
                  : <TagList names={row.members} day={row.day} dutyType="clean_room" swaps={swaps} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** เวรส่งข่าว PR — วัน × week1 / week2 */
function PRNewsTable({ data, editMode, onChange, candidates, swaps }) {
  return (
    <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid #e2e8f0', boxShadow: '0 4px 16px rgba(0,0,0,0.03)', background: '#ffffff' }}>
      <table className="simple-table schedule-grid" style={{ textAlign: 'center', width: '100%', margin: 0, borderCollapse: 'separate', borderSpacing: 0 }}>
        <thead>
          <tr style={{ background: 'linear-gradient(135deg, #4f46e5, #6366f1)', color: '#ffffff' }}>
            <th style={{ width: 100, padding: '14px 16px', color: '#ffffff', fontWeight: 800, fontSize: 13, borderBottom: 'none' }}>วัน</th>
            <th style={{ padding: '14px 16px', color: '#ffffff', fontWeight: 800, fontSize: 13, borderBottom: 'none' }}>📅 สัปดาห์คี่ (Week 1)</th>
            <th style={{ padding: '14px 16px', color: '#ffffff', fontWeight: 800, fontSize: 13, borderBottom: 'none' }}>📅 สัปดาห์คู่ (Week 2)</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, ri) => (
            <tr key={row.day} style={{ background: ri % 2 === 0 ? '#ffffff' : '#f8fafc', transition: 'background 0.2s ease' }}>
              <td style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' }}>
                <DayBadge day={row.day} />
              </td>
              {['week1', 'week2'].map(w => (
                <td key={w} style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' }}>
                  {editMode
                    ? <EditableCell names={row[w]} onChange={v => onChange(ri, w, v)} candidates={candidates} />
                    : <TagList names={row[w]} day={row.day} dutyType="pr_news" swaps={swaps} />}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}



/* ============================================================
   MAIN PAGE
   ============================================================ */
const TABS = [
  { id: 'greeting',     label: '🙏 เวรยืนไหว้',        note: 'แบ่งตามประตู 3 ประตู' },
  { id: 'national_flag',label: '🚩 เวรเชิญธงชาติ',      note: '2 คน/วัน' },
  { id: 'color_flag',   label: '🎌 เวรเชิญธงสี',        note: '2 คน/วัน' },
  { id: 'clean_room',   label: '🧹 เวรทำความสะอาด',     note: 'ทำความสะอาดห้องสภา' },
  { id: 'pr_news',      label: '📢 เวรส่งข่าว PR',      note: 'สลับทุก 2 สัปดาห์' },
];


export default function SchedulesPage() {
  const { user, isAdmin, isPresident } = useAuth();
  const isDiscipline = user?.deptId === 2;
  const isPR        = user?.deptId === 5;

  const canEditTab = (tabId) => {
    if (tabId === 'swaps') return false;
    if (isAdmin || isDiscipline) return true;   // admin / ปกครอง แก้ได้ทุก tab
    if (isPR && tabId === 'pr_news') return true; // PR แก้ได้เฉพาะเวรส่งข่าว
    return false;
  };

  const visibleTabs = TABS;

  const [tab, setTab] = useState('greeting');
  const [editMode, setEditMode] = useState(false);

  const canEdit = canEditTab(tab);

  const BLANK_DAYS = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์'];
  const BLANK_GREETING = BLANK_DAYS.map(day => ({ day, gate1: [], gate2: [], gate3: [] }));
  const BLANK_SIMPLE = BLANK_DAYS.map(day => ({ day, members: [] }));
  const BLANK_PR = BLANK_DAYS.map(day => ({ day, week1: [], week2: [] }));

  // ข้อมูลแต่ละตาราง (state แยก) - เริ่มต้นเป็นตารางเปล่าถ้าเชื่อม Supabase
  const [greeting,     setGreeting]     = useState(BLANK_GREETING);
  const [nationalFlag, setNationalFlag] = useState(BLANK_SIMPLE);
  const [colorFlag,    setColorFlag]    = useState(BLANK_SIMPLE);
  const [cleanRoom,    setCleanRoom]    = useState(BLANK_SIMPLE);
  const [prNews,       setPRNews]       = useState(BLANK_PR);
  const [swaps,        setSwaps]        = useState([]);
  const [usersList,    setUsersList]    = useState([]);
  const [startDate, setStartDate] = useState('');
  const [cleanDutyStartDate, setCleanDutyStartDate] = useState('');
  const [greetingDutyStartDate, setGreetingDutyStartDate] = useState('');

  const [showSwapModal, setShowSwapModal] = useState(false);
  const [newSwap, setNewSwap] = useState({ date: '', duty_type: 'greeting_gate1', original_nickname: '', substitute_nickname: '' });
  const [submittingSwap, setSubmittingSwap] = useState(false);

  const [candidates, setCandidates] = useState(ALL_NAMES);

  const getThaiDayFromDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const day = d.getDay(); // 0: Sunday, 1: Monday, etc.
    const daysTh = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์'];
    return daysTh[day] || '';
  };

  const getNicknameDutiesOnDay = (nickname, thDay) => {
    if (!nickname || !thDay) return [];
    const duties = [];

    // Check greeting
    const greetRow = greeting.find(s => s.day === thDay);
    if (greetRow) {
      if ((greetRow.gate1 || []).includes(nickname)) duties.push('greeting_gate1');
      if ((greetRow.gate2 || []).includes(nickname)) duties.push('greeting_gate2');
      if ((greetRow.gate3 || []).includes(nickname)) duties.push('greeting_gate3');
    }

    // Check national flag
    const natRow = nationalFlag.find(s => s.day === thDay);
    if (natRow && (natRow.members || []).includes(nickname)) {
      duties.push('national_flag');
    }

    // Check color flag
    const colRow = colorFlag.find(s => s.day === thDay);
    if (colRow && (colRow.members || []).includes(nickname)) {
      duties.push('color_flag');
    }

    return duties;
  };

  useEffect(() => {
    async function loadSchedules() {
      try {
        const [
          usersRes,
          schedulesRes,
          swapsRes,
          settingsRes
        ] = await Promise.all([
          supabase.from('users').select('id, nickname, name, dept_id, role'),
          supabase.from('schedules').select('*'),
          supabase.from('duty_swaps').select('*').order('date', { ascending: false }),
          supabase.from('attendance_settings').select('*')
        ]);

        if (usersRes.error) throw usersRes.error;
        if (schedulesRes.error) throw schedulesRes.error;

        const usersData = usersRes.data;
        const data = schedulesRes.data;
        const swapsData = swapsRes.data;
        const settingsData = settingsRes.data;

        if (usersData && usersData.length > 0) {
          setUsersList(usersData);
          const nicknames = usersData
            .filter(u => u.role !== 'admin' && u.nickname !== 'แอดมิน')
            .map(u => u.nickname)
            .filter(Boolean);
          const sortedCandidates = Array.from(new Set([...nicknames, '–'])).sort();
          setCandidates(sortedCandidates);
        }

        if (data && data.length > 0) {
          const grouped = {
            greeting: [],
            national_flag: [],
            color_flag: [],
            clean_room: [],
            pr_news: [],
          };

          data.forEach(row => {
            if (grouped[row.type]) {
              grouped[row.type].push({
                day: row.day,
                ...row.data
              });
            }
          });

          const dayOrder = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์'];
          const sortDays = (arr) => {
            return arr.sort((a, b) => dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day));
          };

          if (grouped.greeting.length > 0) setGreeting(sortDays(grouped.greeting));
          if (grouped.national_flag.length > 0) setNationalFlag(sortDays(grouped.national_flag));
          if (grouped.color_flag.length > 0) setColorFlag(sortDays(grouped.color_flag));
          if (grouped.clean_room.length > 0) setCleanRoom(sortDays(grouped.clean_room));
          if (grouped.pr_news.length > 0) setPRNews(sortDays(grouped.pr_news));
        }

        if (!swapsRes.error && swapsData) {
          setSwaps(swapsData);
        } else if (swapsRes.error) {
          console.log("duty_swaps table not found or error loading swaps:", swapsRes.error);
        }

        if (settingsData) {
          const startD = settingsData.find(d => d.key === 'start_date')?.value || '';
          const cleanStartD = settingsData.find(d => d.key === 'clean_duty_start_date')?.value || '';
          const greetingStartD = settingsData.find(d => d.key === 'greeting_duty_start_date')?.value || '';
          setStartDate(startD);
          setCleanDutyStartDate(cleanStartD);
          setGreetingDutyStartDate(greetingStartD);
        }
      } catch (err) {
        console.error('Error loading schedules:', err);
      }
    }
    loadSchedules();
  }, []);

  // Auto-fill and warning logic for swap modal based on schedule
  useEffect(() => {
    if (!newSwap.date) return;

    const thDay = getThaiDayFromDate(newSwap.date);
    const isAdminOrDiscipline = isAdmin || isDiscipline;

    if (!isAdminOrDiscipline) {
      // Normal user: check their duties on this day
      const myNickname = user?.nickname || '';
      const myDuties = getNicknameDutiesOnDay(myNickname, thDay);

      if (myDuties.length > 0) {
        // If current duty_type is not in my duties, auto-select the first one
        if (!myDuties.includes(newSwap.duty_type)) {
          setNewSwap(prev => ({ ...prev, duty_type: myDuties[0], original_nickname: myNickname }));
        } else {
          setNewSwap(prev => ({ ...prev, original_nickname: myNickname }));
        }
      } else {
        // No duties: keep nickname but don't force duty_type change
        setNewSwap(prev => ({ ...prev, original_nickname: myNickname }));
      }
    } else {
      // Admin/Discipline: auto-fill original_nickname with scheduled person for selected date + duty_type
      let scheduled = [];
      if (newSwap.duty_type === 'greeting_gate1') {
        scheduled = greeting.find(s => s.day === thDay)?.gate1 || [];
      } else if (newSwap.duty_type === 'greeting_gate2') {
        scheduled = greeting.find(s => s.day === thDay)?.gate2 || [];
      } else if (newSwap.duty_type === 'greeting_gate3') {
        scheduled = greeting.find(s => s.day === thDay)?.gate3 || [];
      } else if (newSwap.duty_type === 'national_flag') {
        scheduled = nationalFlag.find(s => s.day === thDay)?.members || [];
      } else if (newSwap.duty_type === 'color_flag') {
        scheduled = colorFlag.find(s => s.day === thDay)?.members || [];
      }

      const cleanScheduled = scheduled.filter(x => x !== '–' && x !== '');
      if (cleanScheduled.length > 0) {
        // Only override if the current selection is empty or not in the scheduled list
        if (!cleanScheduled.includes(newSwap.original_nickname)) {
          setNewSwap(prev => ({ ...prev, original_nickname: cleanScheduled[0] }));
        }
      }
    }
  }, [newSwap.date, newSwap.duty_type]);


  const handleOpenSwapModal = () => {
    let defaultOriginal = '';
    if (!isAdmin && !isDiscipline) {
      defaultOriginal = user?.nickname || '';
    }
    setNewSwap({
      date: new Date().toISOString().split('T')[0],
      duty_type: 'greeting_gate1',
      original_nickname: defaultOriginal,
      substitute_nickname: ''
    });
    setShowSwapModal(true);
  };

  const handleCreateSwap = async (e) => {
    e.preventDefault();
    if (!newSwap.date || !newSwap.duty_type || !newSwap.original_nickname || !newSwap.substitute_nickname) {
      alert('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }
    if (newSwap.original_nickname === newSwap.substitute_nickname) {
      alert('ผู้รับผิดชอบเดิมและผู้ปฏิบัติหน้าที่แทนต้องไม่เป็นคนเดียวกัน');
      return;
    }

    setSubmittingSwap(true);
    try {
      const { error } = await supabase
        .from('duty_swaps')
        .insert([{
          date: newSwap.date,
          duty_type: newSwap.duty_type,
          original_nickname: newSwap.original_nickname,
          substitute_nickname: newSwap.substitute_nickname,
          created_by: user?.nickname || user?.name || 'สภานักเรียน'
        }]);

      if (error) throw error;

      alert('ขอสลับเวรสำเร็จ!');
      setShowSwapModal(false);
      
      // Send Discord Alert
      const dutyLabels = {
        greeting_gate1: 'ยืนไหว้ - ประตูไหมไทย',
        greeting_gate2: 'ยืนไหว้ - ประตูอำเภอ',
        greeting_gate3: 'ยืนไหว้ - ประตูหน้า รร.',
        national_flag: 'เชิญธงชาติ',
        color_flag: 'เชิญธงสี'
      };
      
      const embedTitle = `🔄 มีการสลับเวรปฏิบัติหน้าที่สภานักเรียน`;
      const formattedDate = new Date(newSwap.date).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
      const embedDesc = `วันที่: **${formattedDate}**\nเวร: **${dutyLabels[newSwap.duty_type] || newSwap.duty_type}**\n**${newSwap.original_nickname}** ➡️ ให้ **${newSwap.substitute_nickname}** ปฏิบัติหน้าที่แทน\nบันทึกโดย: **${user?.nickname || user?.name || 'ระบบ'}** 📝`;
      
      let targetUserIds = [];
      const origUser = usersList.find(u => u.nickname === newSwap.original_nickname);
      const subUser = usersList.find(u => u.nickname === newSwap.substitute_nickname);
      if (origUser) targetUserIds.push(String(origUser.id));
      if (subUser) targetUserIds.push(String(subUser.id));
      
      usersList
        .filter(u => u.dept_id === 2 || u.role === 'admin')
        .forEach(u => {
          const uid = String(u.id);
          if (!targetUserIds.includes(uid)) targetUserIds.push(uid);
        });
        
      sendDiscordEmbedViaGAS(embedTitle, embedDesc, 3447003, [], null, 'attendance_alerts', targetUserIds.length > 0 ? targetUserIds : null);

      // Reload swaps
      const { data: swapsData } = await supabase
        .from('duty_swaps')
        .select('*')
        .order('date', { ascending: false });
      if (swapsData) setSwaps(swapsData);

      // Reset form
      setNewSwap({
        date: '',
        duty_type: 'greeting_gate1',
        original_nickname: '',
        substitute_nickname: ''
      });
    } catch (err) {
      console.error('Error creating swap:', err);
      alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setSubmittingSwap(false);
    }
  };

  const handleDeleteSwap = async (swapId) => {
    if (!window.confirm('คุณต้องการยกเลิกการสลับเวรนี้ใช่หรือไม่?')) return;
    try {
      const { error } = await supabase
        .from('duty_swaps')
        .delete()
        .eq('id', swapId);
      if (error) throw error;
      alert('ยกเลิกการสลับเวรเรียบร้อยแล้ว');
      setSwaps(prev => prev.filter(s => s.id !== swapId));
    } catch (e) {
      console.error('Error deleting swap:', e);
      alert('ไม่สามารถยกเลิกได้: ' + e.message);
    }
  };

  const handleToggleEdit = async () => {
    if (editMode) {
      // Transitioning from edit to lock: SAVE!
      try {
        let currentData = [];
        let typeStr = '';

        if (tab === 'greeting') { currentData = greeting; typeStr = 'greeting'; }
        else if (tab === 'national_flag') { currentData = nationalFlag; typeStr = 'national_flag'; }
        else if (tab === 'color_flag') { currentData = colorFlag; typeStr = 'color_flag'; }
        else if (tab === 'clean_room') { currentData = cleanRoom; typeStr = 'clean_room'; }
        else if (tab === 'pr_news') { currentData = prNews; typeStr = 'pr_news'; }

        // 1. Fetch current schedule from DB to detect differences
        const { data: dbSchedules } = await supabase
          .from('schedules')
          .select('*')
          .eq('type', typeStr);

        // 2. Load schedules history from settings
        const { data: settingsData } = await supabase
          .from('attendance_settings')
          .select('*');
        
        const historyRow = settingsData?.find(d => d.key === 'schedules_history');
        let history = [];
        if (historyRow?.value) {
          try {
            history = JSON.parse(historyRow.value);
          } catch (e) {
            console.error('Error parsing schedules_history:', e);
          }
        }

        const tzOffset = 7 * 60 * 60 * 1000;
        const todayStr = new Date(Date.now() + tzOffset).toISOString().split('T')[0];
        const yesterdayStr = new Date(Date.now() + tzOffset - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        let defaultStart = startDate || '2026-05-01';
        if (typeStr === 'clean_room' && cleanDutyStartDate) defaultStart = cleanDutyStartDate;
        if (typeStr === 'greeting' && greetingDutyStartDate) defaultStart = greetingDutyStartDate;

        let historyChanged = false;

        for (const row of currentData) {
          const { day, ...restData } = row;
          const oldRow = dbSchedules?.find(s => s.day === day);
          const oldData = oldRow?.data;
          const newData = restData;

          // Check if data changed
          if (oldData && JSON.stringify(oldData) !== JSON.stringify(newData)) {
            // Find latest active history entry for this type and day
            const lastHistIdx = history.findIndex(h => h.type === typeStr && h.day === day && h.end_date === null);
            
            let oldStart = defaultStart;
            if (lastHistIdx !== -1) {
              oldStart = history[lastHistIdx].start_date;
              history[lastHistIdx].end_date = yesterdayStr;
            } else {
              // Archive the old version
              history.push({
                type: typeStr,
                day: day,
                data: oldData,
                start_date: oldStart,
                end_date: yesterdayStr
              });
            }

            // Push the new version starting today
            history.push({
              type: typeStr,
              day: day,
              data: newData,
              start_date: todayStr,
              end_date: null
            });
            historyChanged = true;
          } else if (!oldData) {
            // No old data, register the first history entry
            history.push({
              type: typeStr,
              day: day,
              data: newData,
              start_date: defaultStart,
              end_date: null
            });
            historyChanged = true;
          }

          const { error } = await supabase
            .from('schedules')
            .upsert({
              type: typeStr,
              day: day,
              data: restData
            }, { onConflict: 'type,day' });
          if (error) throw error;
        }

        if (historyChanged) {
          const { error: histErr } = await supabase
            .from('attendance_settings')
            .upsert([{ key: 'schedules_history', value: JSON.stringify(history) }], { onConflict: 'key' });
          if (histErr) throw histErr;
        }

        // Notify Discord (pr channel)
        const typeLabels = {
          greeting: 'ตารางเวรยืนต้อนรับหน้าประตูโรงเรียน',
          national_flag: 'ตารางเวรเชิญธงชาติ (ธงใหญ่)',
          color_flag: 'ตารางเวรเชิญธงสีประจำโรงเรียน',
          clean_room: 'ตารางเวรทำความสะอาดห้องสภานักเรียน',
          pr_news: 'ตารางเวรหาข่าวประชาสัมพันธ์'
        };
        const embedTitle = `📅 มีการอัปเดตตารางเวรปฏิบัติหน้าที่สภานักเรียน`;
        const embedDesc = `ปรับปรุงตารางเวร: **${typeLabels[typeStr] || typeStr}** เรียบร้อยแล้ว\nกรุณาเข้าสู่ระบบ SWSC69 เพื่อตรวจสอบหน้าที่และวันปฏิบัติงานของท่านครับ 🏫`;
        
        const targetUserIds = usersList.map(u => String(u.id));
        sendDiscordEmbedViaGAS(embedTitle, embedDesc, 15814656, [], null, 'pr', targetUserIds.length > 0 ? targetUserIds : null);
      } catch (err) {
        console.error('Error saving schedule:', err);
        alert('บันทึกตารางลงฐานข้อมูลล้มเหลว: ' + err.message);
      }
    }
    setEditMode(prev => !prev);
  };

  // generic updater
  const makeUpdater = (setter) => (rowIndex, field, value) => {
    setter(prev => prev.map((r, i) => i === rowIndex ? { ...r, [field]: value } : r));
  };

  const activeTab = visibleTabs.find(t => t.id === tab) || visibleTabs[0];

  const thDay = getThaiDayFromDate(newSwap.date);
  const myNickname = user?.nickname || '';
  const myDuties = getNicknameDutiesOnDay(myNickname, thDay);

  let scheduled = [];
  if (newSwap.duty_type === 'greeting_gate1') {
    scheduled = greeting.find(s => s.day === thDay)?.gate1 || [];
  } else if (newSwap.duty_type === 'greeting_gate2') {
    scheduled = greeting.find(s => s.day === thDay)?.gate2 || [];
  } else if (newSwap.duty_type === 'greeting_gate3') {
    scheduled = greeting.find(s => s.day === thDay)?.gate3 || [];
  } else if (newSwap.duty_type === 'national_flag') {
    scheduled = nationalFlag.find(s => s.day === thDay)?.members || [];
  } else if (newSwap.duty_type === 'color_flag') {
    scheduled = colorFlag.find(s => s.day === thDay)?.members || [];
  }

  const exportSchedulePNG = () => {
    const logoImg = new Image();
    logoImg.crossOrigin = 'anonymous';
    logoImg.src = logoUrl;
    logoImg.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      const activeTabObj = visibleTabs.find(t => t.id === tab);
      const tabName = activeTabObj ? activeTabObj.label : 'ตารางเวร';

      let currentTableData = [];
      if (tab === 'greeting') currentTableData = greeting;
      else if (tab === 'national_flag') currentTableData = nationalFlag;
      else if (tab === 'color_flag') currentTableData = colorFlag;
      else if (tab === 'clean_room') currentTableData = cleanRoom;
      else if (tab === 'pr_news') currentTableData = prNews;

      const width = 900;
      const headerHeight = 160;
      const tableHeaderHeight = 44;
      const rowHeight = 54;
      const footerHeight = 65;
      const totalRows = currentTableData.length > 0 ? currentTableData.length : 5;
      const height = headerHeight + tableHeaderHeight + (totalRows * rowHeight) + footerHeight;

      canvas.width = width;
      canvas.height = height;

      const drawRoundRect = (x, y, w, h, r) => {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
      };

      // Background
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, width, height);

      // Header Gradient
      const gradient = ctx.createLinearGradient(0, 0, width, headerHeight);
      gradient.addColorStop(0, '#4f46e5');
      gradient.addColorStop(1, '#6366f1');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, headerHeight);

      // Header Logo & Texts
      ctx.drawImage(logoImg, 35, 25, 105, 105);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px "Noto Sans Thai", sans-serif';
      ctx.fillText(`ตารางเวรปฏิบัติหน้าที่สภานักเรียน`, 155, 62);

      ctx.fillStyle = '#e0e7ff';
      ctx.font = 'bold 15px "Noto Sans Thai", sans-serif';
      ctx.fillText(`${tabName} - ปีการศึกษา 2569`, 155, 90);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.font = 'normal 12px "Noto Sans Thai", sans-serif';
      const dateStr = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
      ctx.fillText(`ข้อมูล ณ วันที่: ${dateStr}`, 155, 115);

      // Table Container
      const startY = headerHeight + 15;
      const tableX = 35;
      const tableW = width - 70;

      // Table Header
      ctx.fillStyle = '#1e1b4b';
      drawRoundRect(tableX, startY, tableW, tableHeaderHeight, 8);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 13px "Noto Sans Thai", sans-serif';
      ctx.textAlign = 'center';

      if (tab === 'greeting') {
        ctx.fillText('วัน', tableX + 65, startY + 27);
        ctx.fillText('ประตูไหมไทย', tableX + 250, startY + 27);
        ctx.fillText('ประตูอำเภอ', tableX + 490, startY + 27);
        ctx.fillText('ประตูหน้า รร.', tableX + 710, startY + 27);
      } else {
        ctx.fillText('วัน', tableX + 85, startY + 27);
        ctx.fillText('รายชื่อผู้รับผิดชอบปฏิบัติหน้าที่', tableX + 480, startY + 27);
      }

      // Rows
      let currentY = startY + tableHeaderHeight;
      const DAY_COLORS = {
        'จันทร์': '#ea580c',
        'อังคาร': '#db2777',
        'พุธ': '#16a34a',
        'พฤหัส': '#d97706',
        'ศุกร์': '#2563eb'
      };

      currentTableData.forEach((row, idx) => {
        ctx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
        ctx.fillRect(tableX, currentY, tableW, rowHeight);
        ctx.strokeStyle = '#e2e8f0';
        ctx.strokeRect(tableX, currentY, tableW, rowHeight);

        // Day badge
        const dayColor = DAY_COLORS[row.day] || '#475569';
        ctx.fillStyle = dayColor;
        drawRoundRect(tableX + 20, currentY + 12, 90, 30, 8);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 13px "Noto Sans Thai", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(row.day, tableX + 65, currentY + 32);

        // Members
        ctx.font = 'normal 13px "Noto Sans Thai", sans-serif';
        ctx.fillStyle = '#1e293b';

        if (tab === 'greeting') {
          const g1 = (row.gate1 || []).filter(x => x !== '–').join(', ') || '–';
          const g2 = (row.gate2 || []).filter(x => x !== '–').join(', ') || '–';
          const g3 = (row.gate3 || []).filter(x => x !== '–').join(', ') || '–';

          ctx.fillText(g1, tableX + 250, currentY + 32);
          ctx.fillText(g2, tableX + 490, currentY + 32);
          ctx.fillText(g3, tableX + 710, currentY + 32);
        } else {
          const members = (row.members || []).filter(x => x !== '–').join(', ') || '–';
          ctx.fillText(members, tableX + 480, currentY + 32);
        }

        currentY += rowHeight;
      });

      // Footer
      const footerY = height - 30;
      ctx.fillStyle = '#64748b';
      ctx.font = 'normal 11px "Noto Sans Thai", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('สภานักเรียนโรงเรียน (SWSC69)', 35, footerY);
      ctx.textAlign = 'right';
      ctx.fillText('ใช้สำหรับแจ้งเตือนและสลับเวรปฏิบัติหน้าที่สภาฯ เท่านั้น', width - 35, footerY);

      // Download PNG
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `SWSC_Duty_Schedule_${tabName}.png`;
      link.href = dataUrl;
      link.click();
    };
  };

  const exportAllCombinedSchedulePNG = () => {
    const logoImg = new Image();
    logoImg.crossOrigin = 'anonymous';
    logoImg.src = logoUrl;
    logoImg.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      const width = 1200;
      const headerHeight = 160;
      const secHeaderHeight = 40;
      const tableHeaderHeight = 38;
      const rowHeight = 44;
      const daysCount = 5; // จันทร์ - ศุกร์
      const tableBlockHeight = secHeaderHeight + tableHeaderHeight + (daysCount * rowHeight) + 20;
      const footerHeight = 60;
      const height = headerHeight + (tableBlockHeight * 3) + footerHeight;

      canvas.width = width;
      canvas.height = height;

      const drawRoundRect = (x, y, w, h, r) => {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
      };

      // 1. Background
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, width, height);

      // 2. Main Header Gradient
      const gradient = ctx.createLinearGradient(0, 0, width, headerHeight);
      gradient.addColorStop(0, '#3730a3');
      gradient.addColorStop(1, '#4f46e5');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, headerHeight);

      // Logo & Header Text
      ctx.drawImage(logoImg, 40, 25, 110, 110);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px "Noto Sans Thai", sans-serif';
      ctx.fillText('ตารางเวรปฏิบัติหน้าที่สภานักเรียน (รวม 3 เวรหลัก)', 170, 62);

      ctx.fillStyle = '#e0e7ff';
      ctx.font = 'bold 15px "Noto Sans Thai", sans-serif';
      ctx.fillText('เวรยืนไหว้ต้อนรับ • เวรเชิญธงชาติ • เวรเชิญธงสีประจำโรงเรียน', 170, 92);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.font = 'normal 12.5px "Noto Sans Thai", sans-serif';
      const dateStr = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
      ctx.fillText(`ข้อมูล ณ วันที่: ${dateStr}`, 170, 118);

      const DAY_COLORS = {
        'จันทร์': '#ea580c',
        'อังคาร': '#db2777',
        'พุธ': '#16a34a',
        'พฤหัส': '#d97706',
        'ศุกร์': '#2563eb'
      };

      const tableX = 40;
      const tableW = width - 80;
      let currentY = headerHeight + 20;

      const renderSectionTable = (title, icon, type, dataRows) => {
        // Section Title Banner
        ctx.fillStyle = '#ffffff';
        drawRoundRect(tableX, currentY, tableW, secHeaderHeight, 10);
        ctx.fill();
        ctx.strokeStyle = '#cbd5e1';
        ctx.stroke();

        ctx.textAlign = 'left';
        ctx.fillStyle = '#1e1b4b';
        ctx.font = 'bold 15px "Noto Sans Thai", sans-serif';
        ctx.fillText(`${icon} ${title}`, tableX + 16, currentY + 25);

        currentY += secHeaderHeight + 6;

        // Table Header
        ctx.fillStyle = '#312e81';
        drawRoundRect(tableX, currentY, tableW, tableHeaderHeight, 6);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12.5px "Noto Sans Thai", sans-serif';
        ctx.textAlign = 'center';

        if (type === 'greeting') {
          ctx.fillText('วัน', tableX + 70, currentY + 24);
          ctx.fillText('🏫 ประตูไหมไทย', tableX + 320, currentY + 24);
          ctx.fillText('🏛️ ประตูอำเภอ', tableX + 640, currentY + 24);
          ctx.fillText('🚪 ประตูหน้า รร.', tableX + 960, currentY + 24);
        } else {
          ctx.fillText('วัน', tableX + 90, currentY + 24);
          ctx.fillText('รายชื่อผู้รับผิดชอบปฏิบัติหน้าที่', tableX + 640, currentY + 24);
        }

        currentY += tableHeaderHeight;

        // Rows
        const days = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์'];
        days.forEach((dName, idx) => {
          const rowData = dataRows.find(r => r.day === dName) || {};

          ctx.fillStyle = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
          ctx.fillRect(tableX, currentY, tableW, rowHeight);
          ctx.strokeStyle = '#e2e8f0';
          ctx.strokeRect(tableX, currentY, tableW, rowHeight);

          // Day badge
          const dayColor = DAY_COLORS[dName] || '#475569';
          ctx.fillStyle = dayColor;
          drawRoundRect(tableX + 20, currentY + 8, 90, 28, 6);
          ctx.fill();

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 12.5px "Noto Sans Thai", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(dName, tableX + 65, currentY + 26);

          // Content Text
          ctx.font = 'normal 12.5px "Noto Sans Thai", sans-serif';
          ctx.fillStyle = '#1e293b';

          if (type === 'greeting') {
            const g1 = (rowData.gate1 || []).filter(x => x !== '–').join(', ') || '–';
            const g2 = (rowData.gate2 || []).filter(x => x !== '–').join(', ') || '–';
            const g3 = (rowData.gate3 || []).filter(x => x !== '–').join(', ') || '–';

            ctx.fillText(g1, tableX + 320, currentY + 26);
            ctx.fillText(g2, tableX + 640, currentY + 26);
            ctx.fillText(g3, tableX + 960, currentY + 26);
          } else {
            const members = (rowData.members || []).filter(x => x !== '–').join(', ') || '–';
            ctx.fillText(members, tableX + 640, currentY + 26);
          }

          currentY += rowHeight;
        });

        currentY += 18;
      };

      // Render 3 Sections
      renderSectionTable('ตารางเวรยืนต้อนรับหน้าประตูโรงเรียน (07:00 - 07:35 น.)', '🙏', 'greeting', greeting);
      renderSectionTable('ตารางเวรเชิญธงชาติ (ธงใหญ่)', '🚩', 'national_flag', nationalFlag);
      renderSectionTable('ตารางเวรเชิญธงสีประจำโรงเรียน', '🎌', 'color_flag', colorFlag);

      // Footer
      const footerY = height - 25;
      ctx.fillStyle = '#64748b';
      ctx.font = 'normal 11px "Noto Sans Thai", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('สภานักเรียนโรงเรียน (SWSC69)', 40, footerY);
      ctx.textAlign = 'right';
      ctx.fillText('เอกสารตารางเวรปฏิบัติหน้าที่ ใช้สำหรับประสานงานภายในสภานักเรียนเท่านั้น', width - 40, footerY);

      // Download
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `SWSC_Combined_Duties_Schedule_${new Date().toISOString().split('T')[0]}.png`;
      link.href = dataUrl;
      link.click();
    };
  };

  return (
    <div>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="page-title">📋 ตารางเวร</div>
          <div className="page-subtitle">คณะกรรมการสภานักเรียน ปีการศึกษา 2569</div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="btn btn-primary"
            onClick={exportAllCombinedSchedulePNG}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, borderRadius: 10, background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}
          >
            <Camera size={16} />
            <span>🌟 บันทึกรวม 3 เวร (PNG)</span>
          </button>

          <button
            className="btn btn-gray"
            onClick={exportSchedulePNG}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, borderRadius: 10 }}
          >
            <Camera size={16} />
            <span>📸 บันทึกเฉพาะเวรนี้ (PNG)</span>
          </button>

          {canEdit && (
            <button
              className={`btn ${editMode ? 'btn-danger' : 'btn-primary'}`}
              onClick={handleToggleEdit}
              style={{ borderRadius: 10 }}
            >
              {editMode ? <><Lock size={14}/> ล็อกตาราง</> : <><Unlock size={14}/> แก้ไขตาราง</>}
            </button>
          )}
        </div>
      </div>

      {/* Edit mode banner */}
      {editMode && (
        <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 6, padding: '10px 16px', marginBottom: 14, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Edit2 size={14} color="#f57f17"/>
          <span><strong>โหมดแก้ไข:</strong> คลิกที่ช่องเพื่อเลือกหรือลบรายชื่อผู้รับผิดชอบจากระบบ</span>
        </div>
      )}

      {/* Tabs */}
      <div className="tab-bar">
        {visibleTabs.map(t => (
          <button
            key={t.id}
            className={`tab-btn${(activeTab?.id || tab) === t.id ? ' active' : ''}`}
            onClick={() => { setTab(t.id); setEditMode(false); }}
          >
            {t.label}
            {t.id === 'pr_news' && <span style={{ fontSize: 10, opacity: 0.7, marginLeft: 4 }}>(PR)</span>}
          </button>
        ))}
      </div>

      {/* Banner for Active Duty Swaps */}
      {swaps.filter(s => s.date >= `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`).length > 0 && (
        <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#e65100', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>🔄</span> <span>รายการสลับเวรปฏิบัติหน้าที่ (จัดการโดยฝ่ายปกครอง):</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {swaps.filter(s => s.date >= `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`).map(s => {
              const dutyLabels = {
                greeting_gate1: 'ยืนไหว้-ประตูไหมไทย',
                greeting_gate2: 'ยืนไหว้-ประตูอำเภอ',
                greeting_gate3: 'ยืนไหว้-ประตูหน้า รร.',
                clean_room: 'เวรห้องสภา',
                national_flag: 'เชิญธงชาติ',
                color_flag: 'เชิญธงสี'
              };
              const dStr = new Date(s.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
              return (
                <span key={s.id} style={{ background: 'white', border: '1px solid #ffcc80', borderRadius: 6, padding: '4px 10px', fontSize: 12, color: '#bf360c', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                  📅 <strong>{dStr}</strong> ({dutyLabels[s.duty_type] || s.duty_type}): <span style={{ textDecoration: 'line-through', opacity: 0.7 }}>{s.original_nickname}</span> ➡️ <strong style={{ color: '#2e7d32' }}>{s.substitute_nickname}</strong> (แทน)
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Table card */}
      <div className="card">
        <div className="card-header">
          <div>
            <span className="card-title">{activeTab?.label}</span>
            <span style={{ fontSize: 12, color: '#9e9e9e', marginLeft: 8 }}>{activeTab?.note}</span>
          </div>
          {!canEdit && (
            <span style={{ fontSize: 11, color: '#9e9e9e', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Lock size={12}/>
              {tab === 'pr_news' ? 'แก้ไขได้เฉพาะฝ่าย PR / ปกครอง' : 'แก้ไขได้เฉพาะฝ่ายปกครอง'}
            </span>
          )}
        </div>

        <div style={{ padding: '8px 0', overflowX: 'auto' }}>
          {tab === 'greeting'      && <GreetingTable     data={greeting}     editMode={editMode} onChange={makeUpdater(setGreeting)} candidates={candidates} swaps={swaps} />}
          {tab === 'national_flag' && <SimpleTable       data={nationalFlag} editMode={editMode} onChange={makeUpdater(setNationalFlag)} label="ผู้เชิญธงชาติ" candidates={candidates} swaps={swaps} dutyType="national_flag" />}
          {tab === 'color_flag'    && <SimpleTable       data={colorFlag}    editMode={editMode} onChange={makeUpdater(setColorFlag)} label="ผู้เชิญธงสี" candidates={candidates} swaps={swaps} dutyType="color_flag" />}
          {tab === 'clean_room'    && <CleanTable        data={cleanRoom}    editMode={editMode} onChange={makeUpdater(setCleanRoom)} candidates={candidates} swaps={swaps} />}
          {tab === 'pr_news'       && <PRNewsTable       data={prNews}       editMode={editMode} onChange={makeUpdater(setPRNews)} candidates={candidates} swaps={swaps} />}
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 18px', borderTop: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#9e9e9e' }}>
            📌 ถ้าไม่สามารถมาเวรได้ กรุณาแจ้งฝ่ายปกครองล่วงหน้า 1 วัน
          </span>
          <span style={{ fontSize: 11, color: '#9e9e9e' }}>ปีการศึกษา 2569</span>
        </div>
      </div>

      {/* Modal ขอสลับเวร */}
      {showSwapModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 16
        }}>
          <div className="card" style={{ maxWidth: 450, width: '100%', margin: 0, boxShadow: '0 8px 30px rgba(0,0,0,0.3)', background: 'white' }}>
            <div className="card-header" style={{ background: '#f57c00', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="card-title" style={{ color: 'white', margin: 0 }}>🔄 คำขอสลับเวรปฏิบัติหน้าที่</span>
              <button 
                type="button" 
                onClick={() => setShowSwapModal(false)}
                style={{ background: 'none', border: 'none', color: 'white', fontSize: 20, cursor: 'pointer', fontWeight: 'bold' }}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleCreateSwap} style={{ padding: '16px 20px' }}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600, color: '#37474f', textAlign: 'left' }}>📅 วันที่ปฏิบัติหน้าที่</label>
                <input
                  type="date"
                  required
                  className="input-field"
                  value={newSwap.date}
                  onChange={e => setNewSwap(prev => ({ ...prev, date: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #ccc', borderRadius: 4, boxSizing: 'border-box' }}
                />
                {newSwap.date && myDuties.length === 0 && !isAdmin && !isDiscipline && (
                  <div style={{ color: '#d32f2f', background: '#ffebee', border: '1px solid #ffcdd2', padding: '8px 12px', borderRadius: 4, fontSize: 12, marginTop: 6, textAlign: 'left', lineHeight: 1.4 }}>
                    ⚠️ ตามตารางปกติ คุณไม่มีเวรยืนไหว้หรือเวรเชิญธงในวัน{thDay}
                  </div>
                )}
                {newSwap.date && myDuties.length > 0 && !isAdmin && !isDiscipline && (
                  <div style={{ color: '#2e7d32', background: '#e8f5e9', border: '1px solid #c8e6c9', padding: '8px 12px', borderRadius: 4, fontSize: 12, marginTop: 6, textAlign: 'left', lineHeight: 1.4 }}>
                    📅 วัน{thDay} คุณมีเวรตามตาราง: <strong>{myDuties.map(d => {
                      const dutyLabels = {
                        greeting_gate1: 'ยืนไหว้ (ประตูไหมไทย)',
                        greeting_gate2: 'ยืนไหว้ (ประตูอำเภอ)',
                        greeting_gate3: 'ยืนไหว้ (ประตูหน้า รร.)',
                        national_flag: 'เชิญธงชาติ',
                        color_flag: 'เชิญธงสี'
                      };
                      return dutyLabels[d] || d;
                    }).join(', ')}</strong>
                  </div>
                )}
                {newSwap.date && (isAdmin || isDiscipline) && (
                  <div style={{ background: '#f5f5f5', border: '1px solid #e0e0e0', padding: '8px 12px', borderRadius: 4, fontSize: 12, marginTop: 6, textAlign: 'left', color: '#455a64', lineHeight: 1.4 }}>
                    📌 สมาชิกที่มีเวรในวัน{thDay} ({
                      (() => {
                        const dutyLabels = {
                          greeting_gate1: 'ยืนไหว้ - ประตูไหมไทย',
                          greeting_gate2: 'ยืนไหว้ - ประตูอำเภอ',
                          greeting_gate3: 'ยืนไหว้ - ประตูหน้า รร.',
                          national_flag: 'เชิญธงชาติ',
                          color_flag: 'เชิญธงสี'
                        };
                        return dutyLabels[newSwap.duty_type] || newSwap.duty_type;
                      })()
                    }): <strong>{
                      scheduled.filter(x => x !== '–' && x !== '').length > 0
                        ? scheduled.filter(x => x !== '–' && x !== '').join(', ')
                        : 'ไม่มี (ว่าง)'
                    }</strong>
                  </div>
                )}
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600, color: '#37474f', textAlign: 'left' }}>🛡️ ประเภทเวร</label>
                <select
                  className="input-field"
                  value={newSwap.duty_type}
                  onChange={e => setNewSwap(prev => ({ ...prev, duty_type: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #ccc', borderRadius: 4, boxSizing: 'border-box' }}
                >
                  <option value="greeting_gate1">🙏 ยืนไหว้ - ประตูไหมไทย</option>
                  <option value="greeting_gate2">🙏 ยืนไหว้ - ประตูอำเภอ</option>
                  <option value="greeting_gate3">🙏 ยืนไหว้ - ประตูหน้า รร.</option>
                  <option value="national_flag">🚩 เชิญธงชาติ</option>
                  <option value="color_flag">🎌 เชิญธงสี</option>
                </select>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600, color: '#37474f', textAlign: 'left' }}>👤 ผู้รับผิดชอบเดิม</label>
                {(isAdmin || isDiscipline) ? (
                  <select
                    required
                    className="input-field"
                    value={newSwap.original_nickname}
                    onChange={e => setNewSwap(prev => ({ ...prev, original_nickname: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #ccc', borderRadius: 4, boxSizing: 'border-box' }}
                  >
                    <option value="">-- เลือกสมาชิก --</option>
                    {candidates.filter(n => n !== '–').map(n => {
                      const isScheduled = scheduled.filter(x => x !== '–').includes(n);
                      return (
                        <option key={n} value={n}>
                          {n} {isScheduled ? '📌 (มีเวรตามตาราง)' : ''}
                        </option>
                      );
                    })}
                  </select>
                ) : (
                  <input
                    type="text"
                    readOnly
                    className="input-field"
                    value={newSwap.original_nickname}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #ccc', borderRadius: 4, background: '#f5f5f5', color: '#666', boxSizing: 'border-box' }}
                  />
                )}
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600, color: '#37474f', textAlign: 'left' }}>🤝 ผู้ปฏิบัติหน้าที่แทน</label>
                <select
                  required
                  className="input-field"
                  value={newSwap.substitute_nickname}
                  onChange={e => setNewSwap(prev => ({ ...prev, substitute_nickname: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #ccc', borderRadius: 4, boxSizing: 'border-box' }}
                >
                  <option value="">-- เลือกสมาชิกที่จะมาแทน --</option>
                  {candidates
                    .filter(n => n !== '–' && n !== newSwap.original_nickname)
                    .map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowSwapModal(false)}
                  style={{ background: '#9e9e9e', border: 'none', padding: '8px 16px', borderRadius: 4, cursor: 'pointer', color: 'white' }}
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submittingSwap}
                  style={{ background: '#f57c00', border: 'none', padding: '8px 16px', borderRadius: 4, cursor: 'pointer', color: 'white' }}
                >
                  {submittingSwap ? 'กำลังบันทึก...' : 'บันทึกการสลับเวร'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
