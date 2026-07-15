import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Plus, X, Save, Search, FileText, Upload, Download, Loader, AlertTriangle } from 'lucide-react';
import { readSheet, writeSheet, updateSheet, uploadFileToDrive, deleteSheet } from '../lib/googleDriveUpload';
import { sendDiscordEmbedViaGAS } from '../lib/discordWebhook';
import { supabase } from '../supabaseClient';

const PROJECT_STATUS = {
  planning:    { label:'วางแผน',        badge:'badge-gray'   },
  in_progress: { label:'กำลังดำเนินการ', badge:'badge-blue'   },
  review:      { label:'รอตรวจสอบ',     badge:'badge-yellow' },
  done:        { label:'เสร็จแล้ว',     badge:'badge-green'  },
  cancelled:   { label:'ยกเลิก',        badge:'badge-red'    },
};

export default function AcademicPage() {
  const { isAdmin, user } = useAuth();
  const canManage = isAdmin || user?.deptId === 3;
  const [projects, setProjects] = useState([]);
  const [docs, setDocs] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [tab, setTab] = useState('projects');
  const [search, setSearch] = useState('');
  
  // Loading states
  const [loadingData, setLoadingData] = useState(true);
  const [savingProj, setSavingProj] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState({});
  const [uploadingDoc, setUploadingDoc] = useState(false);

  // Modals
  const [projModal, setProjModal] = useState(false);
  const [docModal, setDocModal] = useState(false);

  // Forms
  const [projForm, setProjForm] = useState({ title: '', category: 'กิจกรรม', owner: '', budget: '', dueDate: '', desc: '' });
  const [docForm, setDocForm] = useState({ title: '', category: 'ใบขอเวลาเรียน', file: null, fileName: '', fileBase64: '' });

  const loadAcademicData = async () => {
    try {
      setLoadingData(true);
      // โหลดโครงการ
      const pData = await readSheet('Academic_Projects');
      if (pData) {
        const sortedProjects = pData.sort((a, b) => new Date(b.created_at || b.due_date) - new Date(a.created_at || a.due_date));
        setProjects(sortedProjects.map(p => ({
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
      const dData = await readSheet('Academic_Docs');
      if (dData) {
        const sortedDocs = dData.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        setDocs(sortedDocs.map(d => ({
          id: d.id,
          title: d.title,
          category: d.category || 'อื่นๆ',
          type: d.type,
          size: d.size,
          uploadedBy: d.uploaded_by,
          date: d.date,
          fileUrl: d.file_url
        })));
      }

      // โหลดรายชื่อผู้ใช้
      const { data: uData } = await supabase.from('users').select('id, nickname, name, dept_id, role');
      if (uData) {
        setUsersList(uData);
      }
    } catch (err) {
      console.error('Error loading academic data from Sheets:', err);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    loadAcademicData();
  }, []);

  const filtered = projects.filter(p => 
    p.title.toLowerCase().includes(search.toLowerCase()) || 
    p.owner.toLowerCase().includes(search.toLowerCase()) || 
    p.category.toLowerCase().includes(search.toLowerCase())
  );

  const handleSaveProject = async () => {
    if (!projForm.title || !projForm.dueDate) return;
    setSavingProj(true);

    const newProj = {
      title: projForm.title,
      category: projForm.category,
      owner: projForm.owner || user?.nickname || 'ไม่ระบุ',
      budget: parseInt(projForm.budget) || 0,
      due_date: projForm.dueDate,
      status: 'planning',
      description: projForm.desc
    };

    try {
      const savedData = await writeSheet('Academic_Projects', newProj);
      if (savedData) {
        const inserted = {
          id: savedData.id,
          title: savedData.title,
          category: savedData.category,
          owner: savedData.owner,
          budget: savedData.budget,
          dueDate: savedData.due_date,
          status: savedData.status,
          desc: savedData.description
        };
        setProjects(prev => [inserted, ...prev]);
        setProjModal(false);
        setProjForm({ title: '', category: 'กิจกรรม', owner: '', budget: '', dueDate: '', desc: '' });
        alert('เพิ่มโครงการวิชาการลง Google Sheets เรียบร้อย!');

        // Notify Discord (general channel)
        const embedTitle = `📚 ฝ่ายวิชาการเสนอโครงการใหม่`;
        const embedDesc = `หัวข้อโครงการ: **${inserted.title}**`;
        const fields = [
          { name: "👤 ผู้รับผิดชอบ", value: inserted.owner, inline: true },
          { name: "🏷️ หมวดหมู่", value: inserted.category, inline: true },
          { name: "💵 งบประมาณ", value: `${inserted.budget} บาท`, inline: true },
          { name: "📅 กำหนดแล้วเสร็จ", value: inserted.dueDate, inline: true },
          { name: "📝 รายละเอียด", value: inserted.desc || "ไม่มี", inline: false }
        ];
        
        const targetUserIds = usersList
          .filter(u => u.dept_id === 3 || u.role === 'admin')
          .map(u => String(u.id));
        sendDiscordEmbedViaGAS(embedTitle, embedDesc, 10181046, fields, null, 'academic', targetUserIds.length > 0 ? targetUserIds : null);
        sendDiscordEmbedViaGAS(embedTitle, embedDesc, 10181046, fields, null, 'general', targetUserIds.length > 0 ? targetUserIds : null);
      }
    } catch (err) {
      console.error('Error saving academic project:', err);
      alert('เกิดข้อผิดพลาดในการบันทึกโครงการ: ' + err.message);
    } finally {
      setSavingProj(false);
    }
  };

  const changeStatus = async (id, status) => {
    setUpdatingStatus(prev => ({ ...prev, [id]: true }));
    try {
      await updateSheet('Academic_Projects', id, { status });
      
      const targetProj = projects.find(p => p.id === id);
      if (targetProj) {
        const statusLabels = { planning: 'วางแผน', in_progress: 'กำลังดำเนินการ', completed: 'สำเร็จเสร็จสิ้น', review: 'รอตรวจสอบ' };
        const colorMap = { planning: 9803157, in_progress: 3447003, completed: 3066993, review: 15105570 };
        const embedTitle = `📚 อัปเดตสถานะโครงการฝ่ายวิชาการ`;
        const embedDesc = `โครงการ **${targetProj.title}** ได้เปลี่ยนสถานะเป็น **${statusLabels[status] || status}**`;
        
        let targetUserIds = [];
        if (targetProj.owner) {
          const foundUser = usersList.find(u => u.nickname === targetProj.owner || u.name === targetProj.owner);
          if (foundUser) {
            targetUserIds.push(String(foundUser.id));
          }
        }
        usersList
          .filter(u => u.dept_id === 3 || u.role === 'admin')
          .forEach(u => {
            const uid = String(u.id);
            if (!targetUserIds.includes(uid)) targetUserIds.push(uid);
          });
        sendDiscordEmbedViaGAS(embedTitle, embedDesc, colorMap[status] || 3066993, [], null, 'academic', targetUserIds.length > 0 ? targetUserIds : null);
        sendDiscordEmbedViaGAS(embedTitle, embedDesc, colorMap[status] || 3066993, [], null, 'general', targetUserIds.length > 0 ? targetUserIds : null);
      }

      setProjects(prev => prev.map(x => x.id === id ? { ...x, status } : x));
    } catch (err) {
      console.error('Error updating project status in Sheet:', err);
      alert('เกิดข้อผิดพลาดในการอัปเดตสถานะโครงการ: ' + err.message);
    } finally {
      setUpdatingStatus(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setDocForm(p => ({
        ...p,
        file: file,
        fileName: file.name,
        fileBase64: event.target.result
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleUploadDoc = async () => {
    if (!docForm.fileBase64 || !docForm.fileName) {
      alert("กรุณาเลือกไฟล์เอกสาร");
      return;
    }
    setUploadingDoc(true);

    try {
      const file = docForm.file;
      const fileExt = file.name.split('.').pop().toUpperCase();
      
      // Calculate file size in human readable string
      let fileSizeStr = `${(file.size / 1024).toFixed(1)} KB`;
      if (file.size > 1024 * 1024) {
        fileSizeStr = `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
      }

      // 1. Upload file to Google Drive
      const uploadResult = await uploadFileToDrive(docForm.fileBase64, docForm.fileName, 'academic');
      
      if (uploadResult && uploadResult.url) {
        const docMeta = {
          title: docForm.title || file.name,
          category: docForm.category || 'อื่นๆ',
          type: ['PDF', 'DOCX', 'XLSX', 'PNG', 'JPG', 'PPTX'].includes(fileExt) ? fileExt : 'default',
          size: fileSizeStr,
          uploaded_by: user?.name || user?.nickname || 'ฝ่ายวิชาการ',
          date: new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }),
          file_url: uploadResult.url
        };

        const savedDoc = await writeSheet('Academic_Docs', docMeta);
        if (savedDoc) {
          setDocs(prev => [{
            id: savedDoc.id,
            title: savedDoc.title,
            category: savedDoc.category,
            type: savedDoc.type,
            size: savedDoc.size,
            uploadedBy: savedDoc.uploaded_by,
            date: savedDoc.date,
            fileUrl: savedDoc.file_url
          }, ...prev]);
          
          setDocModal(false);
          setDocForm({ title: '', category: 'ใบขอเวลาเรียน', file: null, fileName: '', fileBase64: '' });
          alert("อัปโหลดเอกสารแผนงานวิชาการสำเร็จ!");

          // Notify Discord (general channel)
          const embedTitle = `📤 เอกสารใหม่ของฝ่ายวิชาการลงคลังแล้ว`;
          const embedDesc = `หัวข้อเอกสาร: **${savedDoc.title}**`;
          const fields = [
            { name: "👤 ผู้อัปโหลด", value: savedDoc.uploaded_by, inline: true },
            { name: "📎 ประเภท", value: savedDoc.type, inline: true },
            { name: "📦 ขนาดไฟล์", value: savedDoc.size, inline: true },
            { name: "📅 วันที่บันทึก", value: savedDoc.date, inline: true }
          ];
          
          const targetUserIds = usersList
            .filter(u => u.dept_id === 3 || u.role === 'admin')
            .map(u => String(u.id));
          sendDiscordEmbedViaGAS(embedTitle, embedDesc, 3447003, fields, null, 'academic', targetUserIds.length > 0 ? targetUserIds : null);
          sendDiscordEmbedViaGAS(embedTitle, embedDesc, 3447003, fields, null, 'general', targetUserIds.length > 0 ? targetUserIds : null);
        }
      }
    } catch (err) {
      console.error('Error uploading academic doc:', err);
      alert('เกิดข้อผิดพลาดในการอัปโหลดไฟล์: ' + err.message);
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleDeleteProject = async (id) => {
    if (!window.confirm('คุณแน่ใจหรือไม่ที่จะลบโครงการ/กิจกรรมนี้?')) return;
    try {
      const res = await deleteSheet('Academic_Projects', id);
      if (res && res.success) {
        setProjects(prev => prev.filter(p => p.id !== id));
        alert('ลบข้อมูลสำเร็จ');
      } else {
        alert('ไม่สามารถลบข้อมูลได้: ' + (res?.message || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาด: ' + err.message);
    }
  };

  const handleDeleteDoc = async (id) => {
    if (!window.confirm('คุณแน่ใจหรือไม่ที่จะลบเอกสารนี้?')) return;
    try {
      const res = await deleteSheet('Academic_Docs', id);
      if (res && res.success) {
        setDocs(prev => prev.filter(d => d.id !== id));
        alert('ลบข้อมูลสำเร็จ');
      } else {
        alert('ไม่สามารถลบข้อมูลได้: ' + (res?.message || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาด: ' + err.message);
    }
  };

  const FILE_ICON = { PDF: '🔴', DOCX: '🔵', XLSX: '🟢', PNG: '🟡', JPG: '🟡', PPTX: '🟠', default: '📎' };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="page-title">📚 ฝ่ายวิชาการ</div>
          <div className="page-subtitle">จัดการโครงการ เอกสารเผยแพร่ และแผนงานวิชาการประจำปี (เก็บแบบไร้ค่าใช้จ่ายบน Google Sheets & Drive)</div>
        </div>
        {canManage && (
          <div style={{ display: 'flex', gap: 8 }}>
            {tab === 'projects' ? (
              <button className="btn btn-primary" onClick={() => setProjModal(true)}>
                <Plus size={14} /> เพิ่มโครงการ
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => setDocModal(true)}>
                <Upload size={14} /> อัปโหลดเอกสาร
              </button>
            )}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="stats-row" style={{ marginBottom: 16 }}>
        {Object.entries(PROJECT_STATUS).map(([k, s]) => (
          <div key={k} className="stat-box">
            <div className="stat-icon-box" style={{ background: '#f5f5f5', fontSize: 16 }}>
              {k === 'planning' ? '📋' : k === 'in_progress' ? '⚙️' : k === 'review' ? '👁' : k === 'done' ? '✅' : '❌'}
            </div>
            <div>
              <div className="stat-value" style={{ color: '#212121' }}>{projects.filter(p => p.status === k).length}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="tab-bar">
        <button className={`tab-btn${tab === 'projects' ? ' active' : ''}`} onClick={() => setTab('projects')}>📋 โครงการทั้งหมด</button>
        <button className={`tab-btn${tab === 'docs' ? ' active' : ''}`} onClick={() => setTab('docs')}>📁 คลังเอกสาร</button>
      </div>

      {loadingData ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: 12 }}>
          <div style={{ width: 40, height: 40, border: '4px solid #f3f3f3', borderTop: '4px solid #00bcd4', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
          <div style={{ fontSize: 14, color: '#757575' }}>กำลังดึงข้อมูลโครงการจาก Google Sheets backend...</div>
        </div>
      ) : (
        <>
          {/* Projects */}
          {tab === 'projects' && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="card-header" style={{ padding: '18px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="card-title" style={{ margin: 0 }}>ทะเบียนโครงการฝ่ายวิชาการ</span>
                <div style={{ position: 'relative' }}>
                  <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#bdbdbd' }} />
                  <input className="input-field" placeholder="ค้นหาโครงการ..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 28, padding: '6px 8px 6px 28px', fontSize: 12, width: 200 }} />
                </div>
              </div>
              
              {filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9e9e9e' }}>
                  📋 ไม่พบข้อมูลโครงการฝ่ายวิชาการใน Sheets
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="simple-table">
                    <thead><tr><th>#</th><th>โครงการ</th><th>หมวด</th><th>ผู้รับผิดชอบ</th><th>งบประมาณ</th><th>กำหนดส่งงาน</th><th>สถานะ</th>{canManage && <th>เปลี่ยนสถานะ</th>}</tr></thead>
                    <tbody>
                      {filtered.map((p, i) => {
                        const s = PROJECT_STATUS[p.status] || PROJECT_STATUS.planning;
                        return (
                          <tr key={p.id}>
                            <td style={{ color: '#9e9e9e', fontSize: 12 }}>{i + 1}</td>
                            <td>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{p.title}</div>
                              <div style={{ fontSize: 11, color: '#9e9e9e' }}>{p.desc}</div>
                            </td>
                            <td><span className="badge badge-gray" style={{ fontSize: 11 }}>{p.category}</span></td>
                            <td style={{ fontSize: 13 }}>{p.owner}</td>
                            <td style={{ fontSize: 13 }}>{p.budget > 0 ? p.budget.toLocaleString() + ' บาท' : '–'}</td>
                            <td style={{ fontSize: 12 }}>
                              {p.dueDate ? new Date(p.dueDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : '–'}
                            </td>
                            <td>
                              <span className={`badge ${s.badge}`} style={{ fontSize: 11 }}>
                                {s.label}
                              </span>
                            </td>
                            {canManage && (
                              <td style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <select 
                                  className="select-field" 
                                  value={p.status} 
                                  disabled={updatingStatus[p.id]}
                                  onChange={e => changeStatus(p.id, e.target.value)} 
                                  style={{ fontSize: 11, padding: '4px 6px', width: 140 }}
                                >
                                  {Object.entries(PROJECT_STATUS).map(([k, v]) => (
                                    <option key={k} value={k}>{v.label}</option>
                                  ))}
                                </select>
                                <button 
                                  className="btn btn-outline btn-sm" 
                                  style={{ color: '#e53935', borderColor: '#e53935', fontSize: 11, padding: '4px 8px' }}
                                  onClick={() => handleDeleteProject(p.id)}
                                >
                                  ลบ
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Docs */}
          {tab === 'docs' && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="card-header" style={{ padding: '18px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="card-title" style={{ margin: 0 }}>📁 คลังเอกสารฝ่ายวิชาการ (จัดเก็บใน Google Drive โควต้าฟรี)</span>
              </div>
              
              {docs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9e9e9e' }}>
                  📁 ยังไม่มีไฟล์เอกสารวิชาการอัปโหลดไว้ใน Google Sheets
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="simple-table">
                    <thead><tr><th>#</th><th>ชื่อเอกสาร</th><th>หมวดหมู่</th><th>ประเภท</th><th>ขนาด</th><th>อัปโหลดโดย</th><th>วันที่อัปโหลด</th><th>ดาวน์โหลด</th></tr></thead>
                    <tbody>
                      {docs.map((d, i) => (
                        <tr key={d.id}>
                          <td style={{ color: '#9e9e9e', fontSize: 12 }}>{i + 1}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 18 }}>{FILE_ICON[d.type] || FILE_ICON.default}</span>
                              <span style={{ fontWeight: 600, fontSize: 13 }}>{d.title}</span>
                            </div>
                          </td>
                          <td><span className="badge badge-gray" style={{ fontSize: 11, background: '#f5f5f5', color: '#616161' }}>{d.category || 'อื่นๆ'}</span></td>
                          <td><span className="badge badge-gray" style={{ fontSize: 11 }}>{d.type}</span></td>
                          <td style={{ fontSize: 12, color: '#9e9e9e' }}>{d.size || '–'}</td>
                          <td style={{ fontSize: 13 }}>{d.uploadedBy}</td>
                          <td style={{ fontSize: 12, color: '#9e9e9e' }}>{d.date}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button 
                                className="btn btn-gray btn-sm" 
                                style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                onClick={() => {
                                  if (d.fileUrl) window.open(d.fileUrl, '_blank');
                                  else alert('ไม่พบที่อยู่ไฟล์เอกสาร');
                                }}
                              >
                                <Download size={12} /> เปิด
                              </button>
                              {canManage && (
                                <button 
                                  className="btn btn-outline btn-sm" 
                                  style={{ color: '#e53935', borderColor: '#e53935', fontSize: 11, padding: '4px 8px' }}
                                  onClick={() => handleDeleteDoc(d.id)}
                                >
                                  ลบ
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Add Project Modal */}
      {projModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setProjModal(false)}>
          <div className="modal-box">
            <div className="modal-header">
              <span style={{ fontWeight: 700, fontSize: 15 }}>📋 เพิ่มโครงการใหม่ (วิชาการ)</span>
              <button onClick={() => setProjModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9e9e9e' }}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="form-label">ชื่อโครงการ *</label>
                <input className="input-field" value={projForm.title} onChange={e => setProjForm(p => ({ ...p, title: e.target.value }))} placeholder="ชื่อโครงการ เช่น โครงการติวเข้มพิชิต ONET" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="form-label">หมวดหมู่</label>
                  <select className="select-field" value={projForm.category} onChange={e => setProjForm(p => ({ ...p, category: e.target.value }))}>
                    <option>กิจกรรม</option>
                    <option>เอกสาร</option>
                    <option>งานวิชาการ</option>
                    <option>คู่มือการเรียน</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">ผู้รับผิดชอบ</label>
                  <input className="input-field" value={projForm.owner} onChange={e => setProjForm(p => ({ ...p, owner: e.target.value }))} placeholder="ชื่อผู้รับผิดชอบหลัก" />
                </div>
                <div>
                  <label className="form-label">งบประมาณ (บาท)</label>
                  <input className="input-field" type="number" value={projForm.budget} onChange={e => setProjForm(p => ({ ...p, budget: e.target.value }))} placeholder="0" />
                </div>
                <div>
                  <label className="form-label">กำหนดส่งงาน / ดำเนินการ *</label>
                  <input className="input-field" type="date" value={projForm.dueDate} onChange={e => setProjForm(p => ({ ...p, dueDate: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="form-label">รายละเอียด / วัตถุประสงค์</label>
                <input className="input-field" value={projForm.desc} onChange={e => setProjForm(p => ({ ...p, desc: e.target.value }))} placeholder="คำอธิบายโครงการหรือรายละเอียดคร่าวๆ" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-gray" onClick={() => setProjModal(false)}>ยกเลิก</button>
              <button className="btn btn-primary" onClick={handleSaveProject} disabled={!projForm.title || !projForm.dueDate || savingProj}>
                {savingProj ? <Loader size={14} className="animate-spin" style={{ marginRight: 6 }} /> : <Save size={14} />}
                {savingProj ? 'กำลังบันทึก...' : 'บันทึกลง Sheets'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Document Modal */}
      {docModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setDocModal(false)}>
          <div className="modal-box" style={{ maxWidth: 450 }}>
            <div className="modal-header">
              <span style={{ fontWeight: 700, fontSize: 15 }}>📤 อัปโหลดเอกสารวิชาการ (Google Drive)</span>
              <button onClick={() => setDocModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9e9e9e' }}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="form-label">ชื่อเอกสาร *</label>
                <input className="input-field" placeholder="เช่น แบบฟอร์มขอเวลาเรียน ปพ.1" value={docForm.title} onChange={e => setDocForm(p => ({ ...p, title: e.target.value }))} />
              </div>

              <div>
                <label className="form-label">หมวดหมู่เอกสาร *</label>
                <select className="input-field" value={docForm.category} onChange={e => setDocForm(p => ({ ...p, category: e.target.value }))}>
                  <option value="ใบขอเวลาเรียน">🕒 ใบขอเวลาเรียน</option>
                  <option value="เอกสารโครงการ">📄 เอกสารโครงการ</option>
                  <option value="อื่นๆ">📁 อื่นๆ</option>
                </select>
              </div>
              
              <div>
                <label className="form-label">เลือกไฟล์เอกสาร (PDF, DOCX, XLSX, รูปภาพ, PPTX) *</label>
                <label style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '20px 24px',
                  border: '2px dashed #00bcd4',
                  borderRadius: 12,
                  background: '#e0f7fa22',
                  color: '#00838f',
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'center',
                  fontWeight: 600,
                  fontSize: 14
                }}>
                  <Upload size={24} />
                  <span>{docForm.fileName ? docForm.fileName : "คลิกเพื่อเลือกไฟล์และส่งไป Google Drive"}</span>
                  <span style={{ fontSize: 11, fontWeight: 400, color: '#616161' }}>ระบบจะบันทึกเข้า Google Drive อัตโนมัติ</span>
                  <input type="file" accept=".pdf,.docx,.xlsx,.xls,.png,.jpg,.jpeg,.doc,.pptx,.ppt" onChange={handleFileChange} style={{ display: 'none' }} />
                </label>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-gray" onClick={() => setDocModal(false)}>ยกเลิก</button>
              <button className="btn btn-primary" onClick={handleUploadDoc} disabled={!docForm.fileBase64 || uploadingDoc}>
                {uploadingDoc ? <Loader size={14} className="animate-spin" style={{ marginRight: 6 }} /> : <Upload size={14} />}
                {uploadingDoc ? 'กำลังอัปโหลด...' : 'อัปโหลดลงคลัง'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
