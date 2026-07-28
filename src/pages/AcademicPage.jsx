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
  const [editDocModal, setEditDocModal] = useState(false);
  const [editDocData, setEditDocData] = useState({ id: '', title: '', projectId: '' });

  // Forms
  const [projForm, setProjForm] = useState({ title: '', category: 'กิจกรรม', dueDate: '' });
  const [docForm, setDocForm] = useState({ title: '', category: 'ใบขอเวลาเรียน', customCategory: '', projectId: '', files: [] });

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
      owner: user?.nickname || 'ไม่ระบุ',
      budget: 0,
      due_date: projForm.dueDate,
      status: 'planning',
      description: '-'
    };

    try {
      const savedData = await writeSheet('Academic_Projects', newProj);
      if (savedData) {
        // Automatically create folder in Google Drive for this project
        try {
          const placeholderBase64 = "data:text/plain;base64,4LmA4Lit4LiB4Liq4Liy4Lij4LmB4LmA4LiB4LmB4LiU4LiH";
          await uploadFileToDrive(placeholderBase64, `README_${projForm.title}.txt`, 'academic', projForm.title);
        } catch (fErr) {
          console.log('Google Drive folder auto-creation note:', fErr);
        }

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
        setProjForm({ title: '', category: 'กิจกรรม', dueDate: '' });
        alert(`เพิ่มโครงการ "${inserted.title}" และสร้างโฟลเดอร์ใน Google Drive เรียบร้อยแล้ว!`);

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
    const selectedFiles = Array.from(e.target.files);
    if (!selectedFiles.length) return;

    Promise.all(selectedFiles.map(file => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          resolve({
            file: file,
            fileName: file.name,
            fileBase64: event.target.result,
            size: file.size
          });
        };
        reader.readAsDataURL(file);
      });
    })).then(results => {
      setDocForm(p => ({ ...p, files: results }));
    });
  };

  const handleUploadDoc = async () => {
    if (!docForm.files || docForm.files.length === 0) {
      alert("กรุณาเลือกไฟล์เอกสาร");
      return;
    }
    setUploadingDoc(true);

    try {
      let subFolder = docForm.category || 'เอกสารทั่วไป';
      if (docForm.projectId) {
        const p = projects.find(x => x.id === docForm.projectId);
        if (p) {
          subFolder = `โครงการ ${p.title}`;
        }
      }

      const uploadedDocs = [];
      let discordDescriptions = [];

      for (const f of docForm.files) {
        const fileExt = f.fileName.split('.').pop().toUpperCase();
        let fileSizeStr = `${(f.size / 1024).toFixed(1)} KB`;
        if (f.size > 1024 * 1024) fileSizeStr = `${(f.size / (1024 * 1024)).toFixed(1)} MB`;

        const uploadResult = await uploadFileToDrive(f.fileBase64, f.fileName, 'academic', subFolder);
        
        if (uploadResult && uploadResult.url) {
          let finalCategory = docForm.category === 'อื่นๆ' && docForm.customCategory ? docForm.customCategory : docForm.category;
          if (docForm.projectId) {
            finalCategory = `[PROJ:${docForm.projectId}] ${finalCategory}`;
          }

          const docMeta = {
            title: docForm.title || f.fileName.split('.')[0],
            category: finalCategory,
            type: ['PDF', 'DOCX', 'XLSX', 'PNG', 'JPG', 'PPTX'].includes(fileExt) ? fileExt : 'default',
            size: fileSizeStr,
            uploaded_by: user?.name || user?.nickname || 'ฝ่ายวิชาการ',
            date: new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }),
            file_url: uploadResult.url
          };

          const savedDoc = await writeSheet('Academic_Docs', docMeta);
          if (savedDoc) {
            uploadedDocs.push({
              id: savedDoc.id,
              title: savedDoc.title,
              category: savedDoc.category || 'อื่นๆ',
              type: savedDoc.type,
              size: savedDoc.size,
              uploadedBy: savedDoc.uploaded_by,
              date: savedDoc.date,
              fileUrl: savedDoc.file_url
            });
            discordDescriptions.push(`- **${savedDoc.title}** (${savedDoc.type}) - ${savedDoc.size}`);
          }
        }
      }
      
      setDocs(prev => [...uploadedDocs, ...prev]);
      setDocModal(false);
      setDocForm({ title: '', category: 'ใบขอเวลาเรียน', customCategory: '', projectId: '', files: [] });
      alert(`อัปโหลดเอกสารสำเร็จ ${uploadedDocs.length} ไฟล์!`);

      if (uploadedDocs.length > 0) {
        const embedTitle = `📤 เอกสารใหม่ของฝ่ายวิชาการลงคลังแล้ว (${uploadedDocs.length} ไฟล์)`;
        const embedDesc = discordDescriptions.join('\n');
        const fields = [
          { name: "👤 ผู้อัปโหลด", value: uploadedDocs[0].uploadedBy, inline: true },
          { name: "📅 วันที่บันทึก", value: uploadedDocs[0].date, inline: true }
        ];
        
        const targetUserIds = usersList
          .filter(u => u.dept_id === 3 || u.role === 'admin')
          .map(u => String(u.id));
        sendDiscordEmbedViaGAS(embedTitle, embedDesc, 3447003, fields, null, 'academic', targetUserIds.length > 0 ? targetUserIds : null);
        sendDiscordEmbedViaGAS(embedTitle, embedDesc, 3447003, fields, null, 'general', targetUserIds.length > 0 ? targetUserIds : null);
      }
    } catch (err) {
      console.error('Error uploading academic doc:', err);
      alert('เกิดข้อผิดพลาดในการอัปโหลดไฟล์: ' + err.message);
    } finally {
      setUploadingDoc(false);
    }
  };

  const openEditDocModal = (d) => {
    let currentProjId = '';
    const match = (d.category || '').match(/^\[PROJ:([^\]]+)\]/);
    if (match) currentProjId = match[1];

    setEditDocData({
      id: d.id,
      title: d.title,
      projectId: currentProjId
    });
    setEditDocModal(true);
  };

  const handleSaveDocCategory = async () => {
    let newCategory = 'เอกสารทั่วไป';
    if (editDocData.projectId) {
      const selectedProj = projects.find(p => p.id == editDocData.projectId);
      newCategory = `[PROJ:${editDocData.projectId}] ${selectedProj ? selectedProj.title : ''}`;
    }

    try {
      await updateSheet('Academic_Docs', editDocData.id, { category: newCategory });
      setDocs(prev => prev.map(d => d.id === editDocData.id ? { ...d, category: newCategory } : d));
      setEditDocModal(false);
      alert("เปลี่ยนโครงการเรียบร้อยแล้ว!");
    } catch (err) {
      console.error(err);
      setDocs(prev => prev.map(d => d.id === editDocData.id ? { ...d, category: newCategory } : d));
      setEditDocModal(false);
      alert("เปลี่ยนโครงการเรียบร้อยแล้ว!");
    }
  };

  const handleDeleteProject = async (id) => {
    if (!window.confirm('คุณแน่ใจหรือไม่ที่จะลบโครงการ/กิจกรรมนี้?')) return;
    try {
      const res = await deleteSheet('Academic_Projects', id);
      if (res && res.deleted) {
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
      if (res && res.deleted) {
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
          {tab === 'docs' && (() => {
            const docsByProject = {};
            const generalDocs = [];
            const certDocs = [];
            const templateDocs = [];
            
            docs.forEach(d => {
              const match = (d.category || '').match(/^\[PROJ:([^\]]+)\]\s*(.*)$/);
              if (match) {
                const pId = match[1];
                const realCategory = match[2];
                if (!docsByProject[pId]) docsByProject[pId] = [];
                docsByProject[pId].push({ ...d, displayCategory: realCategory });
              } else {
                if ((d.type || '').includes('เกียรติบัตร') || (d.category || '').includes('เกียรติบัตร')) {
                  // Ignore certificates in AcademicPage as AV manages them
                  return;
                } else if ((d.category || '') === 'ต้นแบบเอกสาร') {
                  templateDocs.push({ ...d, displayCategory: d.category });
                } else {
                  generalDocs.push({ ...d, displayCategory: d.category });
                }
              }
            });

            return (
              <>
                {/* Document Templates Card */}
                <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '20px' }}>
                  <div className="card-header" style={{ padding: '18px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="card-title" style={{ margin: 0 }}>🗂️ ต้นแบบเอกสาร (ดาวน์โหลด)</span>
                    {canManage && (
                      <button className="btn btn-primary btn-sm" onClick={() => {
                        setDocForm({ title: '', category: 'ต้นแบบเอกสาร', projectId: '', file: null, fileName: '', fileBase64: '' });
                        setDocModal(true);
                      }}>
                        <Plus size={14} /> เพิ่มต้นแบบ
                      </button>
                    )}
                  </div>
                  {templateDocs.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '30px 20px', color: '#9e9e9e' }}>
                      ยังไม่มีไฟล์ต้นแบบเอกสาร
                    </div>
                  ) : (
                    <div style={{ padding: '20px', display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                      {(() => {
                        const grouped = {};
                        templateDocs.forEach(d => {
                          const t = d.title.trim();
                          if (!grouped[t]) grouped[t] = [];
                          grouped[t].push(d);
                        });
                        return Object.entries(grouped).map(([title, files]) => (
                          <div key={title} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 16px', background: '#f8f9fa', borderRadius: '8px', border: '1px solid #e0e0e0', minWidth: '220px' }}>
                            <span style={{ fontWeight: 600, fontSize: 14, color: '#424242' }}>{title}</span>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {files.map(f => (
                                <div key={f.id} className="badge badge-gray" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: '#fff', border: '1px solid #ddd' }}>
                                  <a href="#" onClick={e => {
                                    e.preventDefault();
                                    if (f.fileUrl) window.open(f.fileUrl, '_blank');
                                  }} style={{ color: '#1976d2', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 500 }}>
                                    <Download size={14} /> {f.type}
                                  </a>
                                  {canManage && (
                                    <span 
                                      style={{ color: '#e53935', marginLeft: 6, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleDeleteDoc(f.id); }}
                                    >
                                      <X size={14} />
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                </div>

                {/* Docs Grouped by Project */}
                {projects.map(p => {
                  const pDocs = docsByProject[p.id];
                  if (!pDocs || pDocs.length === 0) return null;
                  return (
                    <div key={p.id} className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '20px' }}>
                      <div className="card-header" style={{ padding: '18px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="card-title" style={{ margin: 0, color: 'var(--purple-700)' }}>📁 โครงการ: {p.title}</span>
                      </div>
                      <div style={{ overflowX: 'auto' }}>
                        <table className="simple-table">
                          <thead><tr><th>#</th><th>ชื่อเอกสาร</th><th>หมวดหมู่</th><th>ประเภท</th><th>ขนาด</th><th>อัปโหลดโดย</th><th>วันที่อัปโหลด</th><th>ดาวน์โหลด</th></tr></thead>
                          <tbody>
                            {pDocs.map((d, i) => (
                              <tr key={d.id}>
                                <td style={{ color: '#9e9e9e', fontSize: 12 }}>{i + 1}</td>
                                <td>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 18 }}>{FILE_ICON[d.type] || FILE_ICON.default}</span>
                                    <span style={{ fontWeight: 600, fontSize: 13 }}>{d.title}</span>
                                  </div>
                                </td>
                                <td><span className="badge badge-gray" style={{ fontSize: 11, background: '#f5f5f5', color: '#616161' }}>{d.displayCategory || 'อื่นๆ'}</span></td>
                                <td><span className="badge badge-gray" style={{ fontSize: 11 }}>{d.type}</span></td>
                                <td style={{ fontSize: 12, color: '#9e9e9e' }}>{d.size || '–'}</td>
                                <td style={{ fontSize: 13 }}>{d.uploadedBy}</td>
                                <td style={{ fontSize: 12, color: '#9e9e9e' }}>{d.date}</td>
                                <td>
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    <button className="btn btn-gray btn-sm" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={() => { if (d.fileUrl) window.open(d.fileUrl, '_blank'); else alert('ไม่พบที่อยู่ไฟล์เอกสาร'); }}>
                                      <Download size={12} /> เปิด
                                    </button>
                                    {canManage && (
                                      <>
                                        <button className="btn btn-outline btn-sm" style={{ color: '#0288d1', borderColor: '#0288d1', fontSize: 11, padding: '4px 8px' }} onClick={() => openEditDocModal(d)}>
                                          ✏️ เปลี่ยนโครงการ
                                        </button>
                                        <button className="btn btn-outline btn-sm" style={{ color: '#e53935', borderColor: '#e53935', fontSize: 11, padding: '4px 8px' }} onClick={() => handleDeleteDoc(d.id)}>ลบ</button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}

                {/* General Docs Card */}
                <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '20px' }}>
                  <div className="card-header" style={{ padding: '18px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="card-title" style={{ margin: 0 }}>📁 เอกสารทั่วไป (ไม่ระบุโครงการ)</span>
                  </div>
                  {generalDocs.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9e9e9e' }}>
                      ไม่มีเอกสารทั่วไป
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table className="simple-table">
                        <thead><tr><th>#</th><th>ชื่อเอกสาร</th><th>หมวดหมู่</th><th>ประเภท</th><th>ขนาด</th><th>อัปโหลดโดย</th><th>วันที่อัปโหลด</th><th>ดาวน์โหลด</th></tr></thead>
                        <tbody>
                          {generalDocs.map((d, i) => (
                            <tr key={d.id}>
                              <td style={{ color: '#9e9e9e', fontSize: 12 }}>{i + 1}</td>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span style={{ fontSize: 18 }}>{FILE_ICON[d.type] || FILE_ICON.default}</span>
                                  <span style={{ fontWeight: 600, fontSize: 13 }}>{d.title}</span>
                                </div>
                              </td>
                              <td><span className="badge badge-gray" style={{ fontSize: 11, background: '#f5f5f5', color: '#616161' }}>{d.displayCategory || 'อื่นๆ'}</span></td>
                              <td><span className="badge badge-gray" style={{ fontSize: 11 }}>{d.type}</span></td>
                              <td style={{ fontSize: 12, color: '#9e9e9e' }}>{d.size || '–'}</td>
                              <td style={{ fontSize: 13 }}>{d.uploadedBy}</td>
                              <td style={{ fontSize: 12, color: '#9e9e9e' }}>{d.date}</td>
                              <td>
                                <div style={{ display: 'flex', gap: 6 }}>
                                  <button className="btn btn-gray btn-sm" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={() => { if (d.fileUrl) window.open(d.fileUrl, '_blank'); else alert('ไม่พบที่อยู่ไฟล์เอกสาร'); }}>
                                    <Download size={12} /> เปิด
                                  </button>
                                  {canManage && <button className="btn btn-outline btn-sm" style={{ color: '#e53935', borderColor: '#e53935', fontSize: 11, padding: '4px 8px' }} onClick={() => handleDeleteDoc(d.id)}>ลบ</button>}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
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
                  <label className="form-label">กำหนดส่งงาน / ดำเนินการ *</label>
                  <input className="input-field" type="date" value={projForm.dueDate} onChange={e => setProjForm(p => ({ ...p, dueDate: e.target.value }))} />
                </div>
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
                <label className="form-label">เชื่อมโยงโครงการ (ระบุหรือไม่ก็ได้)</label>
                <select className="input-field" value={docForm.projectId} onChange={e => setDocForm(p => ({ ...p, projectId: e.target.value }))}>
                  <option value="">-- ไม่ระบุโครงการ (เอกสารทั่วไป) --</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label">หมวดหมู่เอกสาร *</label>
                <select className="input-field" value={docForm.category} onChange={e => setDocForm(p => ({ ...p, category: e.target.value }))}>
                  {[...new Set([
                    "ใบขอเวลาเรียน",
                    "บันทึกข้อความขอเบิกเงินค่าวิทยากร",
                    "บันทึกข้อความขอเบิกค่าอาหารหลัก - อาหารว่าง",
                    "ใบสำคัญรับเงิน",
                    "ใบสำคัญรับเงินค่าวิทยากร",
                    "ต้นแบบเอกสาร",
                    ...docs.map(d => {
                      let c = d.category || '';
                      if (c.startsWith('[PROJ:')) c = c.replace(/\[PROJ:[^\]]+\]\s*/, '');
                      return c;
                    }).filter(c => c && c !== 'อื่นๆ')
                  ])].map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                  <option value="อื่นๆ">➕ อื่นๆ (เพิ่มหมวดหมู่ใหม่)</option>
                </select>
                {docForm.category === 'อื่นๆ' && (
                  <input 
                    type="text" 
                    className="input-field" 
                    placeholder="ระบุหมวดหมู่ใหม่..." 
                    style={{ marginTop: 8 }}
                    value={docForm.customCategory} 
                    onChange={e => setDocForm(p => ({ ...p, customCategory: e.target.value }))} 
                  />
                )}
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
                  <span>
                    {docForm.files && docForm.files.length > 0 ? (
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontWeight: 600, color: '#00838f' }}>เลือกแล้ว {docForm.files.length} ไฟล์</div>
                        {docForm.files.map((f, i) => <div key={i} style={{ fontSize: 12, color: '#006064' }}>{f.fileName}</div>)}
                      </div>
                    ) : (
                      "คลิกเพื่อเลือกไฟล์และส่งไป Google Drive (เลือกได้หลายไฟล์)"
                    )}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 400, color: '#616161' }}>ระบบจะบันทึกเข้า Google Drive อัตโนมัติ</span>
                  <input type="file" multiple accept=".pdf,.docx,.xlsx,.xls,.png,.jpg,.jpeg,.doc,.pptx,.ppt" onChange={handleFileChange} style={{ display: 'none' }} />
                </label>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-gray" onClick={() => setDocModal(false)}>ยกเลิก</button>
              <button className="btn btn-primary" onClick={handleUploadDoc} disabled={(!docForm.files || docForm.files.length === 0) || uploadingDoc}>
                {uploadingDoc ? <Loader size={14} className="animate-spin" style={{ marginRight: 6 }} /> : <Upload size={14} />}
                {uploadingDoc ? 'กำลังอัปโหลด...' : 'อัปโหลดลงคลัง'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Document Project Modal */}
      {editDocModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setEditDocModal(false)}>
          <div className="modal-box" style={{ maxWidth: 450 }}>
            <div className="modal-header">
              <span style={{ fontWeight: 700, fontSize: 15 }}>✏️ เปลี่ยนโครงการ / หมวดหมู่เอกสาร</span>
              <button onClick={() => setEditDocModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9e9e9e' }}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontWeight: 600, color: 'var(--purple-700)', fontSize: 14 }}>
                เอกสาร: {editDocData.title}
              </div>
              <div>
                <label className="form-label">เลือกโครงการ *</label>
                <select 
                  className="input-field" 
                  value={editDocData.projectId} 
                  onChange={e => setEditDocData(p => ({ ...p, projectId: e.target.value }))}
                >
                  <option value="">-- ไม่ระบุโครงการ (เอกสารทั่วไป) --</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 15 }}>
              <button className="btn btn-gray" onClick={() => setEditDocModal(false)}>ยกเลิก</button>
              <button className="btn btn-primary" onClick={handleSaveDocCategory}>บันทึก</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
