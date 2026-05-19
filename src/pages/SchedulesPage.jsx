import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Edit2, Lock, Unlock, ChevronDown } from 'lucide-react';
import { supabase } from '../supabaseClient';
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

  // สิทธิ์แก้ไขตามแต่ละ tab
  const canEditTab = (tabId) => {
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

  const [candidates, setCandidates] = useState(ALL_NAMES);

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
      } catch (err) {
        console.error('Error loading schedules:', err);
      }
    }
    loadSchedules();
  }, []);

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
          {!canEdit && (
            <span style={{ fontSize: 11, color: '#9e9e9e', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Lock size={12}/>
              {tab === 'pr_news' ? 'แก้ไขได้เฉพาะฝ่าย PR / ปกครอง' : 'แก้ไขได้เฉพาะฝ่ายปกครอง'}
            </span>
          )}
        </div>

        <div style={{ padding: '8px 0', overflowX: 'auto' }}>
          {tab === 'greeting'      && <GreetingTable     data={greeting}     editMode={editMode} onChange={makeUpdater(setGreeting)} candidates={candidates} />}
          {tab === 'national_flag' && <SimpleTable       data={nationalFlag} editMode={editMode} onChange={makeUpdater(setNationalFlag)} label="ผู้เชิญธงชาติ" candidates={candidates} />}
          {tab === 'color_flag'    && <SimpleTable       data={colorFlag}    editMode={editMode} onChange={makeUpdater(setColorFlag)} label="ผู้เชิญธงสี" candidates={candidates} />}
          {tab === 'clean_room'    && <CleanTable        data={cleanRoom}    editMode={editMode} onChange={makeUpdater(setCleanRoom)} candidates={candidates} />}
          {tab === 'pr_news'       && <PRNewsTable       data={prNews}       editMode={editMode} onChange={makeUpdater(setPRNews)} candidates={candidates} />}
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 18px', borderTop: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#9e9e9e' }}>
            📌 ถ้าไม่สามารถมาเวรได้ กรุณาแจ้งฝ่ายปกครองล่วงหน้า 1 วัน
          </span>
          <span style={{ fontSize: 11, color: '#9e9e9e' }}>ปีการศึกษา 2569</span>
        </div>
      </div>
    </div>
  );
}
