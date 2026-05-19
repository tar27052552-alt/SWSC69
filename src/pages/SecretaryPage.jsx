import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Plus, X, Save, FileText, Download, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../supabaseClient';

const MOCK_MEETINGS = [];

const MOCK_DOCS = [];

export default function SecretaryPage() {
  const { user, isAdmin } = useAuth();
  const canManage = isAdmin || user?.deptId === 7;
  const [meetings, setMeetings] = useState(MOCK_MEETINGS);
  const [docs, setDocs] = useState(MOCK_DOCS);
  const [tab, setTab] = useState('meetings');
  const [expanded, setExpanded] = useState(null);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ title:'', date:'', time:'12:30', location:'ห้องสภานักเรียน', agenda:'' });

  useEffect(() => {
    async function loadSecData() {
      try {
        // โหลดการประชุม
        const { data: mData, error: mErr } = await supabase
          .from('secretary_meetings')
          .select('*')
          .order('created_at', { ascending: false });
        if (!mErr && mData) {
          setMeetings(mData);
        }

        // โหลดคลังเอกสาร
        const { data: dData, error: dErr } = await supabase
          .from('secretary_docs')
          .select('*')
          .order('created_at', { ascending: false });
        if (!dErr && dData) {
          setDocs(dData.map(d => ({
            id: d.id,
            title: d.title,
            type: d.type,
            size: d.size,
            uploadedBy: d.uploaded_by,
            date: d.date
          })));
        }
      } catch (err) {
        console.error('Error loading secretary data:', err);
      }
    }
    loadSecData();
  }, []);

  const handleSave = async () => {
    const agendaList = form.agenda.split('\n').filter(Boolean);
    const newMeeting = {
      title: form.title,
      date: form.date,
      time: form.time + ' น.',
      location: form.location,
      attendees: [],
      absent: [],
      agenda: agendaList,
      resolutions: [],
      status: 'upcoming'
    };

    try {
      const { data, error } = await supabase
        .from('secretary_meetings')
        .insert([newMeeting])
        .select();
      if (error) throw error;
      if (data && data[0]) {
        setMeetings(prev => [data[0], ...prev]);
      }
    } catch (err) {
      console.error('Error inserting secretary meeting:', err);
      alert('เกิดข้อผิดพลาดในการบันทึกการประชุม: ' + err.message);
    }
    setModal(false);
    setForm({ title:'', date:'', time:'12:30', location:'ห้องสภานักเรียน', agenda:'' });
  };

  const FILE_ICON = { PDF:'🔴', DOCX:'🔵', XLSX:'🟢', PNG:'🟡', default:'📎' };

  return (
    <div>
      <div className="page-header" style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div>
          <div className="page-title">📝 ฝ่ายเลขานุการ</div>
          <div className="page-subtitle">วาระการประชุม รายงานการประชุม และคลังเอกสารสำคัญ</div>
        </div>
        {canManage && (
          <button className="btn btn-primary" onClick={()=>setModal(true)}>
            <Plus size={14}/> เพิ่มการประชุม
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="tab-bar">
        <button className={`tab-btn${tab==='meetings'?' active':''}`} onClick={()=>setTab('meetings')}>📅 วาระการประชุม</button>
        <button className={`tab-btn${tab==='docs'?' active':''}`} onClick={()=>setTab('docs')}>📁 คลังเอกสาร</button>
      </div>

      {/* Meetings */}
      {tab === 'meetings' && (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {meetings.map(m => {
            const isExp = expanded === m.id;
            const isUpcoming = m.status === 'upcoming';
            return (
              <div key={m.id} className="card">
                {/* Header */}
                <div
                  style={{ padding:'14px 18px', cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center', borderLeft:`4px solid ${isUpcoming?'#00bcd4':'#43a047'}` }}
                  onClick={()=>setExpanded(isExp ? null : m.id)}
                >
                  <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                    <span style={{ fontSize:24 }}>{isUpcoming?'📅':'✅'}</span>
                    <div>
                      <div style={{ fontWeight:700, fontSize:14 }}>{m.title}</div>
                      <div style={{ fontSize:12, color:'#757575', marginTop:2 }}>
                        📆 {new Date(m.date).toLocaleDateString('th-TH',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}
                        &nbsp;⏰ {m.time} &nbsp;📍 {m.location}
                      </div>
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                    <span className={`badge ${isUpcoming?'badge-blue':'badge-green'}`}>
                      {isUpcoming ? '📅 กำลังจะมาถึง' : '✅ เสร็จแล้ว'}
                    </span>
                    {isExp ? <ChevronUp size={18} color="#9e9e9e"/> : <ChevronDown size={18} color="#9e9e9e"/>}
                  </div>
                </div>

                {/* Expanded detail */}
                {isExp && (
                  <div style={{ borderTop:'1px solid #f0f0f0' }}>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:0 }}>
                      {/* Agenda */}
                      <div style={{ padding:'16px 18px', borderRight:'1px solid #f0f0f0' }}>
                        <div style={{ fontWeight:700, fontSize:13, marginBottom:10, color:'#00838f' }}>📋 วาระการประชุม</div>
                        {m.agenda.length > 0 ? (
                          <ol style={{ paddingLeft:20, margin:0, display:'flex', flexDirection:'column', gap:6 }}>
                            {m.agenda.map((a,i) => <li key={i} style={{ fontSize:13, color:'#424242', lineHeight:1.5 }}>{a}</li>)}
                          </ol>
                        ) : <p style={{ color:'#9e9e9e', fontSize:13 }}>ยังไม่ได้กำหนดวาระ</p>}
                      </div>

                      {/* Resolutions */}
                      <div style={{ padding:'16px 18px' }}>
                        <div style={{ fontWeight:700, fontSize:13, marginBottom:10, color:'#2e7d32' }}>✅ มติที่ประชุม</div>
                        {m.resolutions.length > 0 ? (
                          <ul style={{ paddingLeft:20, margin:0, display:'flex', flexDirection:'column', gap:6 }}>
                            {m.resolutions.map((r,i) => <li key={i} style={{ fontSize:13, color:'#424242', lineHeight:1.5 }}>{r}</li>)}
                          </ul>
                        ) : <p style={{ color:'#9e9e9e', fontSize:13 }}>{isUpcoming ? 'จะบันทึกหลังการประชุม' : 'ยังไม่มีมติ'}</p>}
                      </div>
                    </div>

                    {/* Attendees */}
                    {m.attendees.length > 0 && (
                      <div style={{ padding:'12px 18px', borderTop:'1px solid #f0f0f0', background:'#fafafa', display:'flex', gap:20, fontSize:13 }}>
                        <div><span style={{ fontWeight:700, color:'#2e7d32' }}>✅ เข้าร่วม:</span> {m.attendees.join(', ')}</div>
                        {m.absent.length > 0 && <div><span style={{ fontWeight:700, color:'#e53935' }}>❌ ขาด:</span> {m.absent.join(', ')}</div>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Docs */}
      {tab === 'docs' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">📁 คลังเอกสารสำคัญ</span>
            {canManage && <button className="btn btn-primary btn-sm"><Plus size={13}/> อัปโหลดเอกสาร</button>}
          </div>
          <table className="simple-table">
            <thead><tr><th>#</th><th>ชื่อเอกสาร</th><th>ประเภท</th><th>ขนาด</th><th>อัปโหลดโดย</th><th>วันที่</th><th>ดาวน์โหลด</th></tr></thead>
            <tbody>
              {docs.map((d,i) => (
                <tr key={d.id}>
                  <td style={{ color:'#9e9e9e', fontSize:12 }}>{i+1}</td>
                  <td>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:18 }}>{FILE_ICON[d.type]||FILE_ICON.default}</span>
                      <span style={{ fontWeight:600, fontSize:13 }}>{d.title}</span>
                    </div>
                  </td>
                  <td><span className="badge badge-gray" style={{ fontSize:11 }}>{d.type}</span></td>
                  <td style={{ fontSize:12, color:'#9e9e9e' }}>{d.size}</td>
                  <td style={{ fontSize:13 }}>{d.uploadedBy}</td>
                  <td style={{ fontSize:12, color:'#9e9e9e' }}>{d.date}</td>
                  <td>
                    <button className="btn btn-gray btn-sm" style={{ fontSize:11, display:'inline-flex', alignItems:'center', gap:4 }}>
                      <Download size={12}/> ดาวน์โหลด
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add meeting modal */}
      {modal && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
          <div className="modal-box">
            <div className="modal-header">
              <span style={{ fontWeight:700, fontSize:15 }}>📅 เพิ่มการประชุมใหม่</span>
              <button onClick={()=>setModal(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'#9e9e9e' }}><X size={18}/></button>
            </div>
            <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div><label className="form-label">ชื่อการประชุม *</label><input className="input-field" placeholder="เช่น ประชุมสภานักเรียน ครั้งที่ 5/2568" value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))}/></div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div><label className="form-label">วันที่ *</label><input className="input-field" type="date" value={form.date} onChange={e=>setForm(p=>({...p,date:e.target.value}))}/></div>
                <div><label className="form-label">เวลา</label><input className="input-field" type="time" value={form.time} onChange={e=>setForm(p=>({...p,time:e.target.value}))}/></div>
              </div>
              <div><label className="form-label">สถานที่</label><input className="input-field" value={form.location} onChange={e=>setForm(p=>({...p,location:e.target.value}))}/></div>
              <div><label className="form-label">วาระการประชุม (1 บรรทัด = 1 วาระ)</label><textarea className="input-field" rows={4} placeholder="วาระที่ 1&#10;วาระที่ 2&#10;..." value={form.agenda} onChange={e=>setForm(p=>({...p,agenda:e.target.value}))}/></div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-gray" onClick={()=>setModal(false)}>ยกเลิก</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={!form.title||!form.date}><Save size={14}/> บันทึก</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
