import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Plus, X, Save, Search, FileText } from 'lucide-react';
import { supabase } from '../supabaseClient';

const PROJECT_STATUS = {
  planning:    { label:'วางแผน',        badge:'badge-gray'   },
  in_progress: { label:'กำลังดำเนินการ', badge:'badge-blue'   },
  review:      { label:'รอตรวจสอบ',     badge:'badge-yellow' },
  done:        { label:'เสร็จแล้ว',     badge:'badge-green'  },
  cancelled:   { label:'ยกเลิก',        badge:'badge-red'    },
};

const MOCK_PROJECTS = [];

const MOCK_DOCS = [];

export default function AcademicPage() {
  const { isAdmin, user } = useAuth();
  const canManage = isAdmin || user?.deptId === 3;
  const [projects, setProjects] = useState(MOCK_PROJECTS);
  const [docs, setDocs] = useState(MOCK_DOCS);
  const [tab, setTab] = useState('projects');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ title:'', category:'กิจกรรม', owner:'', budget:'', dueDate:'', desc:'' });

  useEffect(() => {
    async function loadAcademicData() {
      try {
        // โหลดโครงการ
        const { data: pData, error: pErr } = await supabase
          .from('academic_projects')
          .select('*')
          .order('created_at', { ascending: false });
        if (!pErr && pData) {
          setProjects(pData.map(p => ({
            id: p.id,
            title: p.title,
            category: p.category,
            owner: p.owner,
            budget: p.budget,
            dueDate: p.due_date,
            status: p.status,
            desc: p.description
          })));
        }

        // โหลดเอกสาร
        const { data: dData, error: dErr } = await supabase
          .from('academic_docs')
          .select('*')
          .order('created_at', { ascending: false });
        if (!dErr && dData) {
          setDocs(dData.map(d => ({
            id: d.id,
            title: d.title,
            type: d.type,
            uploadedBy: d.uploaded_by,
            date: d.date
          })));
        }
      } catch (err) {
        console.error('Error loading academic data:', err);
      }
    }
    loadAcademicData();
  }, []);

  const filtered = projects.filter(p => p.title.includes(search) || p.owner.includes(search) || p.category.includes(search));

  const handleSave = async () => {
    const newProj = {
      title: form.title,
      category: form.category,
      owner: form.owner || user?.nickname || 'ไม่ระบุ',
      budget: parseInt(form.budget) || 0,
      due_date: form.dueDate,
      status: 'planning',
      description: form.desc
    };

    try {
      const { data, error } = await supabase
        .from('academic_projects')
        .insert([newProj])
        .select();
      if (error) throw error;
      if (data && data[0]) {
        const inserted = {
          id: data[0].id,
          title: data[0].title,
          category: data[0].category,
          owner: data[0].owner,
          budget: data[0].budget,
          dueDate: data[0].due_date,
          status: data[0].status,
          desc: data[0].description
        };
        setProjects(prev => [inserted, ...prev]);
      }
    } catch (err) {
      console.error('Error inserting academic project:', err);
      alert('เกิดข้อผิดพลาดในการบันทึกโครงการ: ' + err.message);
    }
    setModal(false); setForm({ title:'', category:'กิจกรรม', owner:'', budget:'', dueDate:'', desc:'' });
  };

  const changeStatus = async (id, status) => {
    try {
      const { error } = await supabase
        .from('academic_projects')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
      setProjects(p => p.map(x => x.id===id ? {...x, status} : x));
    } catch (err) {
      console.error('Error updating project status:', err);
      alert('เกิดข้อผิดพลาดในการอัปเดตสถานะ: ' + err.message);
    }
  };

  return (
    <div>
      <div className="page-header" style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div>
          <div className="page-title">📚 ฝ่ายวิชาการ</div>
          <div className="page-subtitle">จัดการโครงการ เอกสาร และแผนงานประจำปี</div>
        </div>
        {canManage && <button className="btn btn-primary" onClick={()=>setModal(true)}><Plus size={14}/> เพิ่มโครงการ</button>}
      </div>

      {/* Stats */}
      <div className="stats-row" style={{ marginBottom:16 }}>
        {Object.entries(PROJECT_STATUS).map(([k,s]) => (
          <div key={k} className="stat-box">
            <div className="stat-icon-box" style={{ background:'#f5f5f5', fontSize:16 }}>
              {k==='planning'?'📋':k==='in_progress'?'⚙️':k==='review'?'👁':k==='done'?'✅':'❌'}
            </div>
            <div>
              <div className="stat-value" style={{ color:'#212121' }}>{projects.filter(p=>p.status===k).length}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="tab-bar">
        <button className={`tab-btn${tab==='projects'?' active':''}`} onClick={()=>setTab('projects')}>📋 โครงการทั้งหมด</button>
        <button className={`tab-btn${tab==='docs'?' active':''}`} onClick={()=>setTab('docs')}>📁 คลังเอกสาร</button>
      </div>

      {tab==='projects' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">โครงการทั้งหมด</span>
            <div style={{ position:'relative' }}>
              <Search size={13} style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', color:'#bdbdbd' }}/>
              <input className="input-field" placeholder="ค้นหา..." value={search} onChange={e=>setSearch(e.target.value)} style={{ paddingLeft:28, padding:'6px 8px 6px 28px', fontSize:12, width:200 }}/>
            </div>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table className="simple-table">
              <thead><tr><th>#</th><th>โครงการ</th><th>หมวด</th><th>ผู้รับผิดชอบ</th><th>งบประมาณ</th><th>กำหนด</th><th>สถานะ</th>{canManage && <th>เปลี่ยนสถานะ</th>}</tr></thead>
              <tbody>
                {filtered.map((p,i) => {
                  const s = PROJECT_STATUS[p.status];
                  return (
                    <tr key={p.id}>
                      <td style={{ color:'#9e9e9e', fontSize:12 }}>{i+1}</td>
                      <td><div style={{ fontWeight:600, fontSize:13 }}>{p.title}</div><div style={{ fontSize:11, color:'#9e9e9e' }}>{p.desc}</div></td>
                      <td><span className="badge badge-gray" style={{ fontSize:11 }}>{p.category}</span></td>
                      <td style={{ fontSize:13 }}>{p.owner}</td>
                      <td style={{ fontSize:13 }}>{p.budget > 0 ? p.budget.toLocaleString()+' บาท' : '–'}</td>
                      <td style={{ fontSize:12 }}>{new Date(p.dueDate).toLocaleDateString('th-TH',{day:'numeric',month:'short'})}</td>
                      <td><span className={`badge ${s.badge}`} style={{ fontSize:11 }}>{s.label}</span></td>
                      {canManage && (
                        <td>
                          <select className="select-field" value={p.status} onChange={e=>changeStatus(p.id,e.target.value)} style={{ fontSize:11, padding:'4px 6px', width:140 }}>
                            {Object.entries(PROJECT_STATUS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                          </select>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab==='docs' && (
        <div className="card">
          <div className="card-header"><span className="card-title">📁 คลังเอกสาร</span>{canManage && <button className="btn btn-primary btn-sm"><Plus size={13}/> อัปโหลด</button>}</div>
          <table className="simple-table">
            <thead><tr><th>#</th><th>เอกสาร</th><th>ประเภท</th><th>อัปโหลดโดย</th><th>วันที่</th></tr></thead>
            <tbody>{docs.map((d,i) => (
              <tr key={d.id}>
                <td style={{ color:'#9e9e9e', fontSize:12 }}>{i+1}</td>
                <td><div style={{ display:'flex', alignItems:'center', gap:8 }}><FileText size={16} color="#9e9e9e"/><span style={{ fontWeight:600, fontSize:13 }}>{d.title}</span></div></td>
                <td><span className="badge badge-gray" style={{ fontSize:11 }}>{d.type}</span></td>
                <td style={{ fontSize:13 }}>{d.uploadedBy}</td>
                <td style={{ fontSize:12, color:'#9e9e9e' }}>{d.date}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {modal && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
          <div className="modal-box">
            <div className="modal-header"><span style={{ fontWeight:700 }}>📋 เพิ่มโครงการใหม่</span><button onClick={()=>setModal(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9e9e9e' }}><X size={18}/></button></div>
            <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div><label className="form-label">ชื่อโครงการ *</label><input className="input-field" value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} placeholder="ชื่อโครงการ"/></div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div><label className="form-label">หมวด</label><select className="select-field" value={form.category} onChange={e=>setForm(p=>({...p,category:e.target.value}))}><option>กิจกรรม</option><option>เอกสาร</option><option>งานวิชาการ</option></select></div>
                <div><label className="form-label">ผู้รับผิดชอบ</label><input className="input-field" value={form.owner} onChange={e=>setForm(p=>({...p,owner:e.target.value}))} placeholder="ชื่อเล่น"/></div>
                <div><label className="form-label">งบประมาณ (บาท)</label><input className="input-field" type="number" value={form.budget} onChange={e=>setForm(p=>({...p,budget:e.target.value}))} placeholder="0"/></div>
                <div><label className="form-label">กำหนด *</label><input className="input-field" type="date" value={form.dueDate} onChange={e=>setForm(p=>({...p,dueDate:e.target.value}))}/></div>
              </div>
              <div><label className="form-label">รายละเอียด</label><input className="input-field" value={form.desc} onChange={e=>setForm(p=>({...p,desc:e.target.value}))} placeholder="คำอธิบายโครงการ"/></div>
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
