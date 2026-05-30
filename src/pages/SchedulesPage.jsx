import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Edit2, Lock, Unlock, ChevronDown } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { sendDiscordEmbedViaGAS } from '../lib/discordWebhook';
const ALL_NAMES = [
  'อ้วน', 'ใบหม่อน', 'กร', 'แปม', 'เจมส์', 'มิก', 'ณโม', 'โฟกัส', 'น้ำภัท', 'โนโน', 'คิว', 'พอใจ',
  'พี', 'ปาล์ม', 'จักร', 'ข้าวปุ้น', 'โต๋', 'น้ำขิง', 'มิวสิค', 'ยู', 'กัปตัน', 'ปลายฟ้า', 'ชัย', 'ใบเตย',
  'เฟรนด์', 'ต้น', 'สมชาย', 'กีปตัน', 'น้ำภัทร', 'ต้นต้น', 'มิกกี้', 'ชมพู่', 'เจม', 'น้ำนัน', '–'
].filter(name => name !== 'แอดมิน').sort();

/* ---- helpers ---- */
const TagList = ({ names }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, justifyContent: 'center' }}>
    {names.map((n, i) => (
      <span key={i} style={{
        background: n === '–' ? 'transparent' : '#e0f7fa',
        color: n === '–' ? '#bdbdbd' : '#00838f',
        border: n === '–' ? '1px dashed #e0e0e0' : '1px solid #b2ebf2',
        borderRadius: 4, padding: '2px 7px', fontSize: 12, fontWeight: 600,
      }}>{n}</span>
    ))}
  </div>
);

/* ---- Cell editor (Select dropdown) ---- */
const EditableCell = ({ names, onChange, candidates = ALL_NAMES }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div style={{ position: 'relative', textAlign: 'left' }}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          minHeight: 28, width: '100%', border: '1px solid #00bcd4', borderRadius: 4,
          padding: '4px 6px', fontSize: 12, background: '#f0fdff', cursor: 'pointer',
          display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', justifyContent: 'center'
        }}
      >
        {names.length === 0 ? <span style={{ color: '#aaa' }}>คลิกเพื่อเลือก</span> : names.map((n, i) => (
          <span key={i} style={{ background: '#00838f', color: 'white', padding: '2px 6px', borderRadius: 12, fontSize: 11 }}>{n}</span>
        ))}
        <ChevronDown size={14} color="#00bcd4" style={{ marginLeft: 'auto' }} />
      </div>
      {isOpen && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, minWidth: 140, zIndex: 999,
          background: 'white', border: '1px solid #00bcd4', borderRadius: 6,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)', maxHeight: 200, overflowY: 'auto',
          display: 'flex', flexDirection: 'column', padding: 4, marginTop: 4
        }}>
          {candidates.map(n => (
            <label key={n} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f0f0f0' }}>
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
            style={{ textAlign: 'center', padding: '6px', background: '#e0f7fa', color: '#00838f', marginTop: 4, cursor: 'pointer', fontSize: 12, borderRadius: 4, fontWeight: 600 }}
          >
            ปิด
          </div>
        </div>
      )}
    </div>
  );
};

/* ============================================================
   TABLE COMPONENTS PER DUTY TYPE
   ============================================================ */

/** เวรยืนไหว้ — วัน × 3 ประตู */
function GreetingTable({ data, editMode, onChange, candidates }) {
  return (
    <table className="simple-table schedule-grid" style={{ textAlign: 'center' }}>
      <thead>
        <tr>
          <th style={{ width: 80 }}>วัน</th>
          <th>🏫 ประตูไหมไทย</th>
          <th>🏛️ ประตูอำเภอ</th>
          <th>🚪 ประตูหน้า รร.</th>
        </tr>
      </thead>
      <tbody>
        {data.map((row, ri) => (
          <tr key={row.day}>
            <td style={{ fontWeight: 700, color: '#00838f', whiteSpace: 'nowrap' }}>{row.day}</td>
            {['gate1', 'gate2', 'gate3'].map(g => (
              <td key={g} style={{ padding: '8px 10px' }}>
                {editMode
                  ? <EditableCell names={row[g]} onChange={v => onChange(ri, g, v)} candidates={candidates} />
                  : <TagList names={row[g]} />}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** เวรเชิญธงชาติ / ธงสี — วัน × รายชื่อ */
function SimpleTable({ data, editMode, onChange, label, candidates }) {
  return (
    <table className="simple-table schedule-grid" style={{ textAlign: 'center', maxWidth: 500, margin: '0 auto' }}>
      <thead>
        <tr>
          <th style={{ width: 80 }}>วัน</th>
          <th>{label}</th>
        </tr>
      </thead>
      <tbody>
        {data.map((row, ri) => (
          <tr key={row.day}>
            <td style={{ fontWeight: 700, color: '#00838f', whiteSpace: 'nowrap' }}>{row.day}</td>
            <td style={{ padding: '8px 10px' }}>
              {editMode
                ? <EditableCell names={row.members} onChange={v => onChange(ri, 'members', v)} candidates={candidates} />
                : <TagList names={row.members} />}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** เวรทำความสะอาด — วัน × รายชื่อ (หลายคน) */
function CleanTable({ data, editMode, onChange, candidates }) {
  return (
    <table className="simple-table schedule-grid" style={{ textAlign: 'center', maxWidth: 600, margin: '0 auto' }}>
      <thead>
        <tr>
          <th style={{ width: 80 }}>วัน</th>
          <th>สมาชิกที่รับผิดชอบ</th>
        </tr>
      </thead>
      <tbody>
        {data.map((row, ri) => (
          <tr key={row.day}>
            <td style={{ fontWeight: 700, color: '#00838f', whiteSpace: 'nowrap' }}>{row.day}</td>
            <td style={{ padding: '10px 16px' }}>
              {editMode
                ? <EditableCell names={row.members} onChange={v => onChange(ri, 'members', v)} candidates={candidates} />
                : <TagList names={row.members} />}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** เวรส่งข่าว PR — วัน × week1 / week2 */
function PRNewsTable({ data, editMode, onChange, candidates }) {
  return (
    <table className="simple-table schedule-grid" style={{ textAlign: 'center' }}>
      <thead>
        <tr>
          <th style={{ width: 80 }}>วัน</th>
          <th>📅 สัปดาห์คี่ (Week 1)</th>
          <th>📅 สัปดาห์คู่ (Week 2)</th>
        </tr>
      </thead>
      <tbody>
        {data.map((row, ri) => (
          <tr key={row.day}>
            <td style={{ fontWeight: 700, color: '#00838f', whiteSpace: 'nowrap' }}>{row.day}</td>
            {['week1', 'week2'].map(w => (
              <td key={w} style={{ padding: '8px 10px' }}>
                {editMode
                  ? <EditableCell names={row[w]} onChange={v => onChange(ri, w, v)} candidates={candidates} />
                  : <TagList names={row[w]} />}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ---- ตารางการสลับเวร (Duty Swaps Table) ---- */
function SwapsTable({ data, onDelete, currentUser, isAdmin, isDiscipline }) {
  const dutyLabels = {
    greeting_gate1: '🙏 ยืนไหว้ - ประตูไหมไทย',
    greeting_gate2: '🙏 ยืนไหว้ - ประตูอำเภอ',
    greeting_gate3: '🙏 ยืนไหว้ - ประตูหน้า รร.',
    national_flag: '🚩 เชิญธงชาติ',
    color_flag: '🎌 เชิญธงสี'
  };

  const getRowStyle = (dateStr) => {
    const todayStr = new Date().toISOString().split('T')[0];
    if (dateStr < todayStr) return { opacity: 0.6 }; // past swaps
    return {};
  };

  return (
    <div style={{ padding: '10px 16px' }}>
      {data.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '30px', color: '#9e9e9e', fontSize: 14 }}>
          📭 ยังไม่มีการบันทึกข้อมูลการสลับเวรปฏิบัติหน้าที่
        </div>
      ) : (
        <table className="simple-table schedule-grid" style={{ width: '100%', textAlign: 'center' }}>
          <thead>
            <tr>
              <th>📅 วันที่</th>
              <th>🛡️ ประเภทเวร</th>
              <th>👤 คนเดิม</th>
              <th>➡️</th>
              <th>🤝 คนแทน</th>
              <th>📝 ผู้ขอสลับ / ผู้บันทึก</th>
              <th>⚙️ จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {data.map((swap) => {
              const formattedDate = new Date(swap.date).toLocaleDateString('th-TH', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                weekday: 'short'
              });
              
              const canDelete = isAdmin || isDiscipline || 
                (currentUser && (
                  currentUser.nickname === swap.original_nickname || 
                  currentUser.nickname === swap.created_by || 
                  currentUser.name === swap.created_by
                ));

              return (
                <tr key={swap.id} style={getRowStyle(swap.date)}>
                  <td style={{ fontWeight: 600 }}>{formattedDate}</td>
                  <td>
                    <span style={{
                      background: swap.duty_type?.startsWith('greeting') ? '#fff3e0' : '#e8f5e9',
                      color: swap.duty_type?.startsWith('greeting') ? '#e65100' : '#2e7d32',
                      padding: '4px 8px',
                      borderRadius: 12,
                      fontSize: 11,
                      fontWeight: 600
                    }}>
                      {dutyLabels[swap.duty_type] || swap.duty_type}
                    </span>
                  </td>
                  <td style={{ color: '#c62828', fontWeight: 600 }}>{swap.original_nickname}</td>
                  <td style={{ color: '#757575' }}>➡️</td>
                  <td style={{ color: '#2e7d32', fontWeight: 600 }}>{swap.substitute_nickname}</td>
                  <td style={{ fontSize: 12, color: '#616161' }}>{swap.created_by}</td>
                  <td>
                    {canDelete ? (
                      <button
                        onClick={() => onDelete(swap.id)}
                        className="btn btn-danger"
                        style={{ padding: '2px 8px', fontSize: 11, background: '#c62828' }}
                      >
                        ยกเลิก
                      </button>
                    ) : (
                      <span style={{ fontSize: 11, color: '#bdbdbd' }}>-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
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
  { id: 'swaps',        label: '🔄 การสลับเวร',        note: 'ประวัติและรายการสลับเวรปฏิบัติหน้าที่' },
];


export default function SchedulesPage() {
  const { user, isAdmin, isPresident } = useAuth();
  const isDiscipline = user?.deptId === 2;
  const isPR        = user?.deptId === 5;

  // สิทธิ์แก้ไขตามแต่ละ tab
  const canEditTab = (tabId) => {
    if (tabId === 'swaps') return false;
    if (isAdmin || isDiscipline) return true;   // admin / ปกครอง แก้ได้ทุก tab
    if (isPR && tabId === 'pr_news') return true; // PR แก้ได้เฉพาะเวรส่งข่าว
    return false;
  };

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
        // โหลดรายชื่อเล่นทั้งหมดจากตาราง users ใน Supabase เพื่อใช้ในดรอปดาวน์เลือกเวร
        const { data: usersData, error: usersErr } = await supabase
          .from('users')
          .select('nickname, role');
        if (usersErr) throw usersErr;
        
        if (usersData && usersData.length > 0) {
          const nicknames = usersData
            .filter(u => u.role !== 'admin' && u.nickname !== 'แอดมิน')
            .map(u => u.nickname)
            .filter(Boolean);
          const sortedCandidates = Array.from(new Set([...nicknames, '–'])).sort();
          setCandidates(sortedCandidates);
        }

        // โหลดข้อมูลตารางเวร
        const { data, error } = await supabase
          .from('schedules')
          .select('*');
        if (error) throw error;

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

        // โหลดข้อมูลการสลับเวร (duty_swaps)
        try {
          const { data: swapsData, error: swapsErr } = await supabase
            .from('duty_swaps')
            .select('*')
            .order('date', { ascending: false });
          if (!swapsErr && swapsData) {
            setSwaps(swapsData);
          }
        } catch (swapsTableErr) {
          console.log("duty_swaps table not found or error loading swaps:", swapsTableErr);
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
      
      sendDiscordEmbedViaGAS(embedTitle, embedDesc, 3447003, [], null, 'attendance_alerts');

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

        for (const row of currentData) {
          const { day, ...restData } = row;
          const { error } = await supabase
            .from('schedules')
            .upsert({
              type: typeStr,
              day: day,
              data: restData
            }, { onConflict: 'type,day' });
          if (error) throw error;
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
        const embedDesc = `ปรับปรุงตารางเวร: **${typeLabels[typeStr] || typeStr}** เรียบร้อยแล้ว\nกรุณาเข้าสู่ระบบพอร์ทัลสภาเพื่อตรวจสอบหน้าที่และวันปฏิบัติงานของท่านครับ 🏫`;
        sendDiscordEmbedViaGAS(embedTitle, embedDesc, 15814656, [], null, 'pr');
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

  const activeTab = TABS.find(t => t.id === tab);

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

  return (
    <div>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="page-title">📋 ตารางเวร</div>
          <div className="page-subtitle">คณะกรรมการสภานักเรียน ปีการศึกษา 2569</div>
        </div>
        {canEdit && (
          <button
            className={`btn ${editMode ? 'btn-danger' : 'btn-primary'}`}
            onClick={handleToggleEdit}
          >
            {editMode ? <><Lock size={14}/> ล็อกตาราง</> : <><Unlock size={14}/> แก้ไขตาราง</>}
          </button>
        )}
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
        {TABS.map(t => (
          <button
            key={t.id}
            className={`tab-btn${tab === t.id ? ' active' : ''}`}
            onClick={() => { setTab(t.id); setEditMode(false); }}
          >
            {t.label}
            {t.id === 'pr_news' && <span style={{ fontSize: 10, opacity: 0.7, marginLeft: 4 }}>(PR)</span>}
          </button>
        ))}
      </div>

      {/* Table card */}
      <div className="card">
        <div className="card-header">
          <div>
            <span className="card-title">{activeTab?.label}</span>
            <span style={{ fontSize: 12, color: '#9e9e9e', marginLeft: 8 }}>{activeTab?.note}</span>
          </div>
          {tab === 'swaps' ? (
            <button
              className="btn btn-primary"
              onClick={handleOpenSwapModal}
              style={{ background: '#f57c00', border: 'none', display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', fontSize: 13 }}
            >
              ➕ ขอสลับเวร
            </button>
          ) : (
            !canEdit && (
              <span style={{ fontSize: 11, color: '#9e9e9e', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Lock size={12}/>
                {tab === 'pr_news' ? 'แก้ไขได้เฉพาะฝ่าย PR / ปกครอง' : 'แก้ไขได้เฉพาะฝ่ายปกครอง'}
              </span>
            )
          )}
        </div>

        <div style={{ padding: '8px 0', overflowX: 'auto' }}>
          {tab === 'greeting'      && <GreetingTable     data={greeting}     editMode={editMode} onChange={makeUpdater(setGreeting)} candidates={candidates} />}
          {tab === 'national_flag' && <SimpleTable       data={nationalFlag} editMode={editMode} onChange={makeUpdater(setNationalFlag)} label="ผู้เชิญธงชาติ" candidates={candidates} />}
          {tab === 'color_flag'    && <SimpleTable       data={colorFlag}    editMode={editMode} onChange={makeUpdater(setColorFlag)} label="ผู้เชิญธงสี" candidates={candidates} />}
          {tab === 'clean_room'    && <CleanTable        data={cleanRoom}    editMode={editMode} onChange={makeUpdater(setCleanRoom)} candidates={candidates} />}
          {tab === 'pr_news'       && <PRNewsTable       data={prNews}       editMode={editMode} onChange={makeUpdater(setPRNews)} candidates={candidates} />}
          {tab === 'swaps'         && <SwapsTable        data={swaps}        onDelete={handleDeleteSwap} currentUser={user} isAdmin={isAdmin} isDiscipline={isDiscipline} />}
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
