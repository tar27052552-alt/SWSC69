import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Plus, X, Save, Edit2, Search } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { sendDiscordEmbedViaGAS } from '../lib/discordWebhook';

const CONTENT_TYPES = ['กราฟิก', 'วิดีโอ', 'Reel', 'ถ่ายภาพ', 'Live Stream', 'อินโฟกราฟิก'];
const PLATFORMS     = ['Instagram', 'Facebook Page', 'LINE Official', 'ทั้งหมด'];
const PRIORITY      = ['สูง', 'ปานกลาง', 'ต่ำ'];

const STATUS_CFG = {
  backlog:     { label: 'คิดคอนเทนต์',   color: '#9e9e9e', bg: '#f5f5f5'  },
  designing:   { label: 'กำลังทำกราฟิก', color: '#1565c0', bg: '#e3f2fd'  },
  review:      { label: 'รอตรวจสอบ',     color: '#7e57c2', bg: '#ede7f6'  },
  wait_pr:     { label: 'รอ PR ใส่แคปชั่น', color: '#f57f17', bg: '#fff8e1' },
  done:        { label: 'เสร็จ/โพสต์แล้ว', color: '#2e7d32', bg: '#e8f5e9' },
};

const PRIORITY_BADGE = { สูง: 'badge-red', ปานกลาง: 'badge-yellow', ต่ำ: 'badge-green' };

const MONTHS_FULL = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

const AV_TYPE_COLORS = {
  'กราฟิก': '#ff6b8b',
  'อินโฟกราฟิก': '#ff6b8b',
  'วิดีโอ': '#ffa726',
  'Reel': '#ffa726',
  'ถ่ายภาพ': '#29b6f6',
  'Live Stream': '#29b6f6',
  'คอนเทนต์': '#66bb6a',
  'ประชาสัมพันธ์': '#f57c00',
  'นัดประชุม': '#ab47bc'
};

const INIT_TASKS = [];

const initForm = { title:'', type:CONTENT_TYPES[0], platform:PLATFORMS[0], priority:'ปานกลาง', assignee:'', dueDate:'', note:'' };

export default function AVPage() {
  const { user } = useAuth();
  const [tasks, setTasks]   = useState(INIT_TASKS);
  const [tab, setTab]       = useState('kanban');
  const [modal, setModal]   = useState(false);
  const [editTask, setEdit] = useState(null);
  const [avMembers, setAvMembers] = useState([]);
  const [form, setForm]     = useState(initForm);
  const [search, setSearch] = useState('');
  const today = new Date();
  const [yr, setYr] = useState(today.getFullYear());
  const [mo, setMo] = useState(today.getMonth());

  useEffect(() => {
    async function loadTasks() {
      try {
        const { data, error } = await supabase
          .from('av_tasks')
          .select('*')
          .order('created_at', { ascending: false });
        if (error) throw error;
        if (data) {
          setTasks(data.map(d => ({
            id: d.id,
            title: d.title,
            type: d.type,
            platform: d.platform,
            priority: d.priority,
            assignee: d.assignee,
            dueDate: d.due_date,
            status: d.status,
            note: d.note
          })));
        }
      } catch (err) {
        console.error('Error loading AV tasks:', err);
      }
    }
    async function loadAVMembers() {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('nickname, name')
          .eq('dept_id', 9);
        if (!error && data) {
          const names = data.map(u => u.nickname || u.name).filter(Boolean);
          setAvMembers(names);
        }
      } catch (err) {
        console.error('Error loading AV members:', err);
      }
    }
    loadTasks();
    loadAVMembers();
  }, []);

  const handleSave = async () => {
    const taskObj = {
      title: form.title,
      type: form.type,
      platform: form.platform,
      priority: form.priority,
      assignee: form.assignee,
      due_date: form.dueDate,
      note: form.note
    };

    try {
      if (editTask) {
        const { error } = await supabase
          .from('av_tasks')
          .update(taskObj)
          .eq('id', editTask.id);
        if (error) throw error;

        // Also update pr_caption_queue if it exists
        await supabase
          .from('pr_caption_queue')
          .update({
            title: form.title,
            type: form.type,
            platform: form.platform,
            due_date: form.dueDate
          })
          .eq('id', editTask.id);

        setTasks(p => p.map(t => t.id===editTask.id ? { ...t, ...form } : t));
      } else {
        const { data, error } = await supabase
          .from('av_tasks')
          .insert([{ ...taskObj, status: 'backlog' }])
          .select();
        if (error) throw error;
        if (data && data[0]) {
          const inserted = {
            id: data[0].id,
            title: data[0].title,
            type: data[0].type,
            platform: data[0].platform,
            priority: data[0].priority,
            assignee: data[0].assignee,
            dueDate: data[0].due_date,
            status: data[0].status,
            note: data[0].note
          };
          setTasks(p => [...p, inserted]);

          // Insert into notifications
          await supabase
            .from('notifications')
            .insert([{
              type: 'task',
              message: `📋 มอบหมายงานฝ่ายโสตฯ ใหม่: "${inserted.title}" ให้กับ ${inserted.assignee || 'ไม่ระบุ'} (กำหนดส่ง ${new Date(inserted.dueDate).toLocaleDateString('th-TH', {day:'numeric',month:'short'})})`
            }]);

          // Notify Discord (general)
          const embedTitle = `🎥 มอบหมายงานฝ่ายโสตทัศนูปกรณ์ (AV Task) ใหม่`;
          const embedDesc = `ชื่องาน: **${inserted.title}**`;
          const fields = [
            { name: "👤 ผู้รับผิดชอบ", value: inserted.assignee || "ไม่ระบุ", inline: true },
            { name: "🎬 ประเภทงาน", value: inserted.type, inline: true },
            { name: "📱 แพลตฟอร์ม", value: inserted.platform, inline: true },
            { name: "🚨 ความสำคัญ", value: inserted.priority, inline: true },
            { name: "📅 กำหนดส่ง", value: inserted.dueDate, inline: true },
            { name: "📝 รายละเอียด", value: inserted.note || "ไม่มี", inline: false }
          ];
          sendDiscordEmbedViaGAS(embedTitle, embedDesc, 3447003, fields, null, 'av');
        }
      }
    } catch (err) {
      console.error('Error saving AV task:', err);
      alert('เกิดข้อผิดพลาดในการบันทึกงาน: ' + err.message);
    }
    setModal(false); setEdit(null);
  };

  const openEdit = (t) => {
    setEdit(t);
    setForm({ title:t.title, type:t.type, platform:t.platform, priority:t.priority, assignee:t.assignee, dueDate:t.dueDate, note:t.note });
    setModal(true);
  };

  const handleDeleteTask = async (id) => {
    if (!window.confirm('คุณแน่ใจหรือไม่ที่จะลบงานนี้?')) return;
    try {
      // Also delete from pr_caption_queue if it exists
      await supabase
        .from('pr_caption_queue')
        .delete()
        .eq('id', id);

      const { error } = await supabase
        .from('av_tasks')
        .delete()
        .eq('id', id);
      if (error) throw error;
      setTasks(p => p.filter(t => t.id !== id));
    } catch (err) {
      console.error('Error deleting AV task:', err);
      alert('เกิดข้อผิดพลาดในการลบงาน: ' + err.message);
    }
  };

  const moveStatus = async (id, status) => {
    try {
      const { error } = await supabase
        .from('av_tasks')
        .update({ status })
        .eq('id', id);
      if (error) throw error;

      // If moving to wait_pr, insert into pr_caption_queue
      if (status === 'wait_pr') {
        const task = tasks.find(t => t.id === id);
        if (task) {
          const { data: existing } = await supabase
            .from('pr_caption_queue')
            .select('id')
            .eq('id', id);
          
          if (!existing || existing.length === 0) {
            await supabase
              .from('pr_caption_queue')
              .insert([{
                id: id,
                title: task.title,
                type: task.type,
                platform: task.platform,
                due_date: task.dueDate,
                status: 'pending'
              }]);
          }
        }
      }

      // Find task details
      const task = tasks.find(t => t.id === id);
      if (task) {
        const STATUS_LABELS = {
          backlog: 'คิดคอนเทนต์',
          designing: 'กำลังทำกราฟิก',
          review: 'รอตรวจสอบ',
          wait_pr: 'รอ PR ใส่แคปชั่น',
          done: 'เสร็จ/โพสต์แล้ว'
        };
        const colorMap = {
          backlog: 9803157,      // #9e9e9e
          designing: 1402304,     // #1565c0
          review: 8279997,        // #7e57c2
          wait_pr: 16088855,      // #f57f17
          done: 3046706           // #2e7d32
        };
        const embedTitle = `🎥 อัปเดตความคืบหน้างานโสตทัศนูปกรณ์`;
        const embedDesc = `งาน **${task.title}** ได้ปรับสถานะเป็น **${STATUS_LABELS[status] || status}**`;
        const fields = [
          { name: "👤 ผู้รับผิดชอบ", value: task.assignee || "ไม่ระบุ", inline: true },
          { name: "🎬 ประเภทงาน", value: task.type || "ไม่ระบุ", inline: true },
          { name: "📱 แพลตฟอร์ม", value: task.platform || "ไม่ระบุ", inline: true }
        ];
        const notifyChannel = status === 'wait_pr' ? 'pr' : 'av';
        sendDiscordEmbedViaGAS(embedTitle, embedDesc, colorMap[status] || 3066993, fields, null, notifyChannel);
      }

      setTasks(p => p.map(t => t.id===id ? { ...t, status } : t));
    } catch (err) {
      console.error('Error moving AV task status:', err);
      alert('เกิดข้อผิดพลาดในการอัปเดตสถานะงาน: ' + err.message);
    }
  };

  const statusKeys = Object.keys(STATUS_CFG);
  const filtered   = tasks.filter(t => t.title.includes(search) || t.assignee.includes(search));

  const NEXT = { backlog:'designing', designing:'review', review:'wait_pr', wait_pr:'done', done:null };

  return (
    <div>
      <div className="page-header" style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div>
          <div className="page-title">🎬 ฝ่ายโสตทัศนศึกษา</div>
          <div className="page-subtitle">คิดคอนเทนต์ ทำกราฟิก/วิดีโอ/ถ่ายภาพ และส่งงานให้ฝ่าย PR ใส่แคปชั่น</div>
        </div>
        <button className="btn btn-primary" onClick={()=>{ setEdit(null); setForm({ title:'', type:CONTENT_TYPES[0], platform:PLATFORMS[0], priority:'ปานกลาง', assignee:avMembers[0] || '', dueDate:'', note:'' }); setModal(true); }}>
          <Plus size={14}/> วางแผนคอนเทนต์
        </button>
      </div>

      {/* Stats */}
      <div className="stats-row" style={{ marginBottom:16 }}>
        {statusKeys.map(k => {
          const s = STATUS_CFG[k]; const count = tasks.filter(t=>t.status===k).length;
          return (
            <div key={k} className="stat-box">
              <div className="stat-icon-box" style={{ background:s.bg, fontSize:16 }}>
                {k==='backlog'?'💡':k==='designing'?'✏️':k==='review'?'👁':k==='wait_pr'?'📢':'✅'}
              </div>
              <div><div className="stat-value" style={{ color:s.color }}>{count}</div><div className="stat-label" style={{ fontSize:11 }}>{s.label}</div></div>
            </div>
          );
        })}
      </div>

      {/* Tabs */}
      <div className="tab-bar">
        <button className={`tab-btn${tab==='kanban'?' active':''}`} onClick={()=>setTab('kanban')}>🗂 Kanban Board</button>
        <button className={`tab-btn${tab==='calendar'?' active':''}`} onClick={()=>setTab('calendar')}>📅 ปฏิทินคิวงาน</button>
        <button className={`tab-btn${tab==='list'?' active':''}`} onClick={()=>setTab('list')}>📋 รายการ</button>
        <button className={`tab-btn${tab==='wait_pr'?' active':''}`} onClick={()=>setTab('wait_pr')}>
          📢 รอ PR ใส่แคปชั่น
          {tasks.filter(t=>t.status==='wait_pr').length > 0 &&
            <span style={{ marginLeft:6, background:'#f57f17', color:'white', borderRadius:99, fontSize:10, padding:'1px 6px', fontWeight:700 }}>
              {tasks.filter(t=>t.status==='wait_pr').length}
            </span>
          }
        </button>
      </div>

      {/* Kanban */}
      {tab === 'kanban' && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10, overflowX:'auto' }}>
          {statusKeys.map(k => {
            const s = STATUS_CFG[k];
            const col = tasks.filter(t=>t.status===k);
            return (
              <div key={k} style={{ minWidth:160 }}>
                <div style={{ padding:'8px 10px', fontWeight:700, fontSize:12, color:s.color, background:'white', border:'1px solid #e0e0e0', borderRadius:'6px 6px 0 0', borderBottom:`3px solid ${s.color}`, display:'flex', justifyContent:'space-between' }}>
                  <span>{s.label}</span>
                  <span style={{ background:s.bg, color:s.color, borderRadius:99, fontSize:11, padding:'0 6px' }}>{col.length}</span>
                </div>
                <div style={{ background:'#f9f9f9', border:'1px solid #e0e0e0', borderTop:'none', borderRadius:'0 0 6px 6px', padding:8, minHeight:180, display:'flex', flexDirection:'column', gap:8 }}>
                  {col.map(t => (
                    <div key={t.id} style={{ background:'white', border:'1px solid #e0e0e0', borderRadius:6, padding:'10px 10px' }}>
                      <div style={{ fontSize:12, fontWeight:700, marginBottom:5, lineHeight:1.3 }}>{t.title}</div>
                      <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:6 }}>
                        <span className="badge badge-gray" style={{ fontSize:10 }}>{t.type}</span>
                        <span className={`badge ${PRIORITY_BADGE[t.priority]}`} style={{ fontSize:10 }}>{t.priority}</span>
                      </div>
                      <div style={{ fontSize:11, color:'#9e9e9e', marginBottom:6 }}>
                        👤 {t.assignee} · {new Date(t.dueDate).toLocaleDateString('th-TH',{day:'numeric',month:'short'})}
                      </div>
                      <div style={{ display:'flex', gap:3 }}>
                        <button onClick={()=>openEdit(t)} style={{ flex:1, fontSize:10, padding:'3px 0', border:'1px solid #e0e0e0', borderRadius:3, background:'#f5f5f5', cursor:'pointer', fontFamily:'inherit' }}>✏️</button>
                        {NEXT[k] && (
                          <button onClick={()=>moveStatus(t.id,NEXT[k])}
                            style={{ flex:2, fontSize:10, padding:'3px 0', border:`1px solid ${STATUS_CFG[NEXT[k]].color}44`, borderRadius:3, background:STATUS_CFG[NEXT[k]].bg, cursor:'pointer', color:STATUS_CFG[NEXT[k]].color, fontFamily:'inherit', fontWeight:600 }}>
                            → {STATUS_CFG[NEXT[k]].label}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Calendar */}
      {tab === 'calendar' && (() => {
        const firstDay = new Date(yr, mo, 1).getDay();
        const firstDayAdjusted = firstDay === 0 ? 6 : firstDay - 1;
        const daysInMonth = new Date(yr, mo + 1, 0).getDate();
        const prevMonth = () => { if (mo === 0) { setMo(11); setYr(y => y - 1); } else setMo(m => m - 1); };
        const nextMonth = () => { if (mo === 11) { setMo(0); setYr(y => y + 1); } else setMo(m => m + 1); };
        const setMonthToToday = () => {
          const d = new Date();
          setYr(d.getFullYear());
          setMo(d.getMonth());
        };
        const getTasksForDate = (dateStr) => {
          return tasks.filter(t => t.dueDate === dateStr);
        };
        const getFormattedDateStr = (day) => {
          return `${yr}-${String(mo + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        };

        return (
          <div style={{ background: '#1c1c1e', color: 'white', borderRadius: 12, padding: 20, boxShadow: '0 4px 20px rgba(0,0,0,0.3)', marginBottom: 20 }}>
            {/* Legend Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 700 }}>
                📅 ปฏิทินคิวงานของทีม
              </div>
              
              {/* Legend Dots */}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff6b8b' }} />กราฟิก</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ffa726' }} />วิดีโอ</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#29b6f6' }} />ถ่ายภาพ</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#66bb6a' }} />คอนเทนต์</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f57c00' }} />ประชาสัมพันธ์</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ab47bc' }} />นัดประชุม</span>
              </div>
            </div>

            {/* Header Navigation */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{MONTHS_FULL[mo]} {yr + 543}</h2>
              
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={setMonthToToday} style={{ background: '#2c2c2e', color: 'white', border: '1px solid #3a3a3c', padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>วันนี้</button>
                <button onClick={prevMonth} style={{ background: '#2c2c2e', color: 'white', border: '1px solid #3a3a3c', padding: '6px 12px', borderRadius: 6, cursor: 'pointer' }}>&lt;</button>
                <button onClick={nextMonth} style={{ background: '#2c2c2e', color: 'white', border: '1px solid #3a3a3c', padding: '6px 12px', borderRadius: 6, cursor: 'pointer' }}>&gt;</button>
              </div>
            </div>

            {/* Week Day Titles */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, marginBottom: 8, borderBottom: '1px solid #2c2c2e', paddingBottom: 6 }}>
              {['จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์', 'อาทิตย์'].map(day => (
                <div key={day} style={{ textAlign: 'center', fontSize: 13, fontWeight: 600, color: '#a1a1a6' }}>
                  {day}
                </div>
              ))}
            </div>

            {/* Grid Cells */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, background: '#2c2c2e', padding: 1, borderRadius: 8, overflow: 'hidden' }}>
              {/* Empty cells before the first day */}
              {Array.from({ length: firstDayAdjusted }).map((_, idx) => (
                <div key={`empty-${idx}`} style={{ background: '#1c1c1e', minHeight: 110 }} />
              ))}

              {/* Day cells */}
              {Array.from({ length: daysInMonth }).map((_, idx) => {
                const day = idx + 1;
                const formattedDate = getFormattedDateStr(day);
                const dayTasks = getTasksForDate(formattedDate);
                const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
                const isToday = formattedDate === todayStr;

                return (
                  <div key={day} style={{
                    background: '#1c1c1e',
                    minHeight: 110,
                    padding: 6,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-start',
                    border: isToday ? '1.5px solid #ff6b8b' : 'none'
                  }}>
                    {/* Day number */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
                      <span style={{
                        fontSize: 12,
                        fontWeight: isToday ? 700 : 400,
                        color: isToday ? '#ff6b8b' : '#a1a1a6',
                        background: isToday ? 'rgba(255, 107, 139, 0.15)' : 'transparent',
                        borderRadius: '50%',
                        width: 22,
                        height: 22,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        {day}
                      </span>
                    </div>

                    {/* Tasks */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto', maxHeight: 80 }}>
                      {dayTasks.map(t => {
                        const typeColor = AV_TYPE_COLORS[t.type] || '#ff6b8b';
                        return (
                          <div key={t.id} onClick={() => openEdit(t)} style={{
                            background: typeColor,
                            color: 'white',
                            borderRadius: 4,
                            padding: '4px 6px',
                            fontSize: 11,
                            cursor: 'pointer',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                            transition: 'transform 0.1s',
                            lineHeight: 1.2
                          }}
                          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
                          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
                            <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {t.title}
                            </div>
                            <div style={{ fontSize: 9, opacity: 0.9, marginTop: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                              👤 {t.assignee || 'ไม่ระบุ'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* List */}
      {tab === 'list' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">งานทั้งหมด ({tasks.length})</span>
            <div style={{ position:'relative' }}>
              <Search size={13} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'#bdbdbd' }}/>
              <input className="input-field" placeholder="ค้นหา..." value={search} onChange={e=>setSearch(e.target.value)} style={{ paddingLeft:28, padding:'6px 8px 6px 28px', fontSize:12, width:200 }}/>
            </div>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table className="simple-table">
              <thead><tr><th>#</th><th>คอนเทนต์</th><th>ประเภท</th><th>แพลตฟอร์ม</th><th>ความสำคัญ</th><th>ผู้รับผิดชอบ</th><th>กำหนด</th><th>สถานะ</th><th>จัดการ</th></tr></thead>
              <tbody>
                {filtered.map((t,i) => {
                  const s = STATUS_CFG[t.status];
                  return (
                    <tr key={t.id}>
                      <td style={{ color:'#9e9e9e', fontSize:12 }}>{i+1}</td>
                      <td>
                        <div style={{ fontWeight:600, fontSize:13 }}>{t.title}</div>
                        {t.note && <div style={{ fontSize:11, color:'#9e9e9e' }}>{t.note}</div>}
                      </td>
                      <td><span className="badge badge-gray" style={{ fontSize:11 }}>{t.type}</span></td>
                      <td style={{ fontSize:12 }}>{t.platform}</td>
                      <td><span className={`badge ${PRIORITY_BADGE[t.priority]}`} style={{ fontSize:11 }}>{t.priority}</span></td>
                      <td style={{ fontSize:13 }}>{t.assignee}</td>
                      <td style={{ fontSize:12 }}>{new Date(t.dueDate).toLocaleDateString('th-TH',{day:'numeric',month:'short'})}</td>
                      <td><span className="badge" style={{ background:s.bg, color:s.color, fontSize:11 }}>{s.label}</span></td>
                      <td>
                        <div style={{ display:'flex', gap:5 }}>
                          <button onClick={()=>openEdit(t)} className="btn btn-gray btn-sm"><Edit2 size={12}/></button>
                          <button onClick={()=>handleDeleteTask(t.id)} className="btn btn-danger btn-sm"><X size={12}/></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Wait PR */}
      {tab === 'wait_pr' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">📢 งานที่ส่งให้ PR ใส่แคปชั่น</span>
            <span style={{ fontSize:12, color:'#9e9e9e' }}>PR จะเห็นรายการเหล่านี้ในหน้าของตัวเอง</span>
          </div>
          {tasks.filter(t=>t.status==='wait_pr').length > 0 ? (
            <table className="simple-table">
              <thead><tr><th>#</th><th>คอนเทนต์</th><th>ประเภท</th><th>แพลตฟอร์ม</th><th>ผู้ทำ</th><th>กำหนด</th></tr></thead>
              <tbody>
                {tasks.filter(t=>t.status==='wait_pr').map((t,i) => (
                  <tr key={t.id}>
                    <td style={{ color:'#9e9e9e', fontSize:12 }}>{i+1}</td>
                    <td style={{ fontWeight:600, fontSize:13 }}>{t.title}</td>
                    <td><span className="badge badge-gray" style={{ fontSize:11 }}>{t.type}</span></td>
                    <td style={{ fontSize:12 }}>{t.platform}</td>
                    <td style={{ fontSize:13 }}>{t.assignee}</td>
                    <td style={{ fontSize:12 }}>{new Date(t.dueDate).toLocaleDateString('th-TH',{day:'numeric',month:'short'})}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ textAlign:'center', padding:'32px', color:'#9e9e9e' }}>ไม่มีงานที่รอ PR ใส่แคปชั่น 🎉</div>
          )}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
          <div className="modal-box">
            <div className="modal-header">
              <span style={{ fontWeight:700, fontSize:15 }}>{editTask?'✏️ แก้ไขคอนเทนต์':'💡 วางแผนคอนเทนต์ใหม่'}</span>
              <button onClick={()=>setModal(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9e9e9e' }}><X size={18}/></button>
            </div>
            <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div><label className="form-label">ชื่อคอนเทนต์ *</label><input className="input-field" placeholder="เช่น กราฟิกวันไหว้ครู 2568" value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))}/></div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div><label className="form-label">ประเภทงาน</label><select className="select-field" value={form.type} onChange={e=>setForm(p=>({...p,type:e.target.value}))}>{CONTENT_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
                <div><label className="form-label">แพลตฟอร์ม</label><select className="select-field" value={form.platform} onChange={e=>setForm(p=>({...p,platform:e.target.value}))}>{PLATFORMS.map(t=><option key={t}>{t}</option>)}</select></div>
                <div><label className="form-label">ความสำคัญ</label><select className="select-field" value={form.priority} onChange={e=>setForm(p=>({...p,priority:e.target.value}))}>{PRIORITY.map(t=><option key={t}>{t}</option>)}</select></div>
                <div>
                  <label className="form-label">ผู้รับผิดชอบ</label>
                  <select className="select-field" value={form.assignee} onChange={e=>setForm(p=>({...p,assignee:e.target.value}))}>
                    {avMembers.length === 0 && <option value="">-- ไม่มีสมาชิกฝ่ายโสต --</option>}
                    {avMembers.map(m=><option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              <div><label className="form-label">กำหนดเสร็จ *</label><input className="input-field" type="date" value={form.dueDate} onChange={e=>setForm(p=>({...p,dueDate:e.target.value}))}/></div>
              <div><label className="form-label">บรีฟ / หมายเหตุ</label><input className="input-field" placeholder="รายละเอียดงาน..." value={form.note} onChange={e=>setForm(p=>({...p,note:e.target.value}))}/></div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-gray" onClick={()=>setModal(false)}>ยกเลิก</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={!form.title||!form.dueDate}><Save size={14}/> บันทึก</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
