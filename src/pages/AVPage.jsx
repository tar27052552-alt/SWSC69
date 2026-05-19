import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Plus, X, Save, Edit2, Search } from 'lucide-react';
import { supabase } from '../supabaseClient';

const CONTENT_TYPES = ['กราฟิก', 'วิดีโอ', 'Reel', 'ถ่ายภาพ', 'Live Stream', 'อินโฟกราฟิก'];
const PLATFORMS     = ['Instagram', 'Facebook Page', 'LINE Official', 'ทั้งหมด'];
const PRIORITY      = ['สูง', 'ปานกลาง', 'ต่ำ'];
const AV_MEMBERS    = ['บิ๊ก', 'ฝน', 'แบงค์'];

const STATUS_CFG = {
  backlog:     { label: 'คิดคอนเทนต์',   color: '#9e9e9e', bg: '#f5f5f5'  },
  designing:   { label: 'กำลังทำกราฟิก', color: '#1565c0', bg: '#e3f2fd'  },
  review:      { label: 'รอตรวจสอบ',     color: '#7e57c2', bg: '#ede7f6'  },
  wait_pr:     { label: 'รอ PR ใส่แคปชั่น', color: '#f57f17', bg: '#fff8e1' },
  done:        { label: 'เสร็จ/โพสต์แล้ว', color: '#2e7d32', bg: '#e8f5e9' },
};

const PRIORITY_BADGE = { สูง: 'badge-red', ปานกลาง: 'badge-yellow', ต่ำ: 'badge-green' };

const INIT_TASKS = [];

const initForm = { title:'', type:CONTENT_TYPES[0], platform:PLATFORMS[0], priority:'ปานกลาง', assignee:AV_MEMBERS[0], dueDate:'', note:'' };

export default function AVPage() {
  const { user } = useAuth();
  const [tasks, setTasks]   = useState(INIT_TASKS);
  const [tab, setTab]       = useState('kanban');
  const [modal, setModal]   = useState(false);
  const [editTask, setEdit] = useState(null);
  const [form, setForm]     = useState(initForm);
  const [search, setSearch] = useState('');

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
    loadTasks();
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

  const moveStatus = async (id, status) => {
    try {
      const { error } = await supabase
        .from('av_tasks')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
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
        <button className="btn btn-primary" onClick={()=>{ setEdit(null); setForm(initForm); setModal(true); }}>
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
                          <button onClick={()=>setTasks(p=>p.filter(x=>x.id!==t.id))} className="btn btn-danger btn-sm"><X size={12}/></button>
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
                <div><label className="form-label">ผู้รับผิดชอบ</label><select className="select-field" value={form.assignee} onChange={e=>setForm(p=>({...p,assignee:e.target.value}))}>{AV_MEMBERS.map(m=><option key={m}>{m}</option>)}</select></div>
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
