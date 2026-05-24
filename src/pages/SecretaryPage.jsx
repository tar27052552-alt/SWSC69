import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Plus, X, Save, FileText, Download, ChevronDown, ChevronUp, Upload, Loader } from 'lucide-react';
import { readSheet, writeSheet, uploadFileToDrive, deleteSheet } from '../lib/googleDriveUpload';
import { sendDiscordEmbedViaGAS } from '../lib/discordWebhook';

export default function SecretaryPage() {
  const { user, isAdmin } = useAuth();
  const canManage = isAdmin || user?.deptId === 7;
  const [meetings, setMeetings] = useState([]);
  const [docs, setDocs] = useState([]);
  const [tab, setTab] = useState('meetings');
  const [expanded, setExpanded] = useState(null);
  
  // Loading states
  const [loadingData, setLoadingData] = useState(true);
  const [savingMeeting, setSavingMeeting] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  // Modals
  const [meetingModal, setMeetingModal] = useState(false);
  const [docModal, setDocModal] = useState(false);

  // Forms
  const [meetingForm, setMeetingForm] = useState({ title: '', date: '', time: '12:30', location: 'ห้องสภานักเรียน', agenda: '' });
  const [docForm, setDocForm] = useState({ title: '', file: null, fileName: '', fileBase64: '' });

  const loadSecData = async () => {
    try {
      setLoadingData(true);
      // โหลดการประชุม
      const mData = await readSheet('Secretary_Meetings');
      if (mData) {
        // Sort by created_at desc or date desc
        const sortedMeetings = mData.sort((a, b) => new Date(b.created_at || b.date) - new Date(a.created_at || a.date));
        setMeetings(sortedMeetings);
      }

      // โหลดคลังเอกสาร
      const dData = await readSheet('Secretary_Docs');
      if (dData) {
        const sortedDocs = dData.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        setDocs(sortedDocs.map(d => ({
          id: d.id,
          title: d.title,
          type: d.type,
          size: d.size,
          uploadedBy: d.uploaded_by,
          date: d.date,
          fileUrl: d.file_url
        })));
      }
    } catch (err) {
      console.error('Error loading secretary data from Sheets:', err);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    loadSecData();
  }, []);

  const handleSaveMeeting = async () => {
    if (!meetingForm.title || !meetingForm.date) return;
    setSavingMeeting(true);
    const agendaList = meetingForm.agenda.split('\n').filter(Boolean);
    const newMeeting = {
      title: meetingForm.title,
      date: meetingForm.date,
      time: meetingForm.time + ' น.',
      location: meetingForm.location,
      attendees: [],
      absent: [],
      agenda: agendaList,
      resolutions: [],
      status: 'upcoming'
    };

    try {
      const savedData = await writeSheet('Secretary_Meetings', newMeeting);
      if (savedData) {
        setMeetings(prev => [savedData, ...prev]);
        setMeetingModal(false);
        setMeetingForm({ title: '', date: '', time: '12:30', location: 'ห้องสภานักเรียน', agenda: '' });
        alert('บันทึกวาระการประชุมสภาสำเร็จ!');

        // Notify Discord (general channel)
        const embedTitle = `📅 มีการกำหนดการประชุมสภานักเรียนใหม่`;
        const embedDesc = `หัวข้อ: **${savedData.title}**`;
        const fields = [
          { name: "📆 วันที่", value: new Date(savedData.date).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), inline: true },
          { name: "⏰ เวลา", value: savedData.time, inline: true },
          { name: "📍 สถานที่", value: savedData.location, inline: true }
        ];
        if (savedData.agenda && savedData.agenda.length > 0) {
          fields.push({
            name: "📋 วาระสำคัญ",
            value: "- " + savedData.agenda.join("\n- "),
            inline: false
          });
        }
        sendDiscordEmbedViaGAS(embedTitle, embedDesc, 10181046, fields, null, 'secretary');
      }
    } catch (err) {
      console.error('Error saving secretary meeting:', err);
      alert('เกิดข้อผิดพลาดในการบันทึกการประชุม: ' + err.message);
    } finally {
      setSavingMeeting(false);
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
      const uploadResult = await uploadFileToDrive(docForm.fileBase64, docForm.fileName, 'secretary');
      
      // 2. Write metadata to Google Sheet
      if (uploadResult && uploadResult.url) {
        const docMeta = {
          title: docForm.title || file.name,
          type: ['PDF', 'DOCX', 'XLSX', 'PNG', 'JPG', 'PDF'].includes(fileExt) ? fileExt : 'default',
          size: fileSizeStr,
          uploaded_by: user?.name || user?.nickname || 'เลขานุการ',
          date: new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }),
          file_url: uploadResult.url
        };

        const savedDoc = await writeSheet('Secretary_Docs', docMeta);
        if (savedDoc) {
          setDocs(prev => [{
            id: savedDoc.id,
            title: savedDoc.title,
            type: savedDoc.type,
            size: savedDoc.size,
            uploadedBy: savedDoc.uploaded_by,
            date: savedDoc.date,
            fileUrl: savedDoc.file_url
          }, ...prev]);
          
          setDocModal(false);
          setDocForm({ title: '', file: null, fileName: '', fileBase64: '' });
          alert("อัปโหลดเอกสารฝ่ายเลขานุการสำเร็จ!");

          // Notify Discord (general channel)
          const embedTitle = `📤 เอกสารใหม่ของฝ่ายเลขาฯ ลงคลังแล้ว`;
          const embedDesc = `หัวข้อเอกสาร: **${savedDoc.title}**`;
          const fields = [
            { name: "👤 ผู้อัปโหลด", value: savedDoc.uploaded_by, inline: true },
            { name: "📎 ประเภท", value: savedDoc.type, inline: true },
            { name: "📦 ขนาดไฟล์", value: savedDoc.size, inline: true },
            { name: "📅 วันที่บันทึก", value: savedDoc.date, inline: true }
          ];
          sendDiscordEmbedViaGAS(embedTitle, embedDesc, 3447003, fields, null, 'secretary');
        }
      }
    } catch (err) {
      console.error('Error uploading document:', err);
      alert('เกิดข้อผิดพลาดในการอัปโหลดไฟล์: ' + err.message);
    } finally {
      setUploadingDoc(false);
    }
  };
  const handleDeleteMeeting = async (id) => {
    if (!window.confirm('คุณแน่ใจหรือไม่ที่จะลบวาระการประชุมนี้?')) return;
    try {
      const res = await deleteSheet('Secretary_Meetings', id);
      if (res && res.success) {
        setMeetings(prev => prev.filter(m => m.id !== id));
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
      const res = await deleteSheet('Secretary_Docs', id);
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

  const FILE_ICON = { PDF: '🔴', DOCX: '🔵', XLSX: '🟢', PNG: '🟡', JPG: '🟡', default: '📎' };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="page-title">📝 ฝ่ายเลขานุการ</div>
          <div className="page-subtitle">วาระการประชุม รายงานการประชุม และคลังเอกสารสำคัญ (เก็บแบบไร้ค่าใช้จ่ายบน Google Sheets & Drive)</div>
        </div>
        {canManage && (
          <div style={{ display: 'flex', gap: 8 }}>
            {tab === 'meetings' ? (
              <button className="btn btn-primary" onClick={() => setMeetingModal(true)}>
                <Plus size={14} /> เพิ่มการประชุม
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => setDocModal(true)}>
                <Upload size={14} /> อัปโหลดเอกสาร
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="tab-bar">
        <button className={`tab-btn${tab === 'meetings' ? ' active' : ''}`} onClick={() => setTab('meetings')}>📅 วาระการประชุม</button>
        <button className={`tab-btn${tab === 'docs' ? ' active' : ''}`} onClick={() => setTab('docs')}>📁 คลังเอกสาร</button>
      </div>

      {loadingData ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: 12 }}>
          <div style={{ width: 40, height: 40, border: '4px solid #f3f3f3', borderTop: '4px solid #00bcd4', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
          <div style={{ fontSize: 14, color: '#757575' }}>กำลังดึงข้อมูลจาก Google Sheets backend...</div>
        </div>
      ) : (
        <>
          {/* Meetings */}
          {tab === 'meetings' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {meetings.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '40px 20px', color: '#9e9e9e' }}>
                  📅 ยังไม่มีประวัติหรือวาระการประชุมที่บันทึกไว้ใน Google Sheets
                </div>
              ) : (
                meetings.map(m => {
                  const isExp = expanded === m.id;
                  const isUpcoming = m.status === 'upcoming';
                  // Parse agenda and resolutions array safely
                  const agendaArr = Array.isArray(m.agenda) ? m.agenda : [];
                  const resArr = Array.isArray(m.resolutions) ? m.resolutions : [];
                  
                  return (
                    <div key={m.id} className="card">
                      {/* Header */}
                      <div
                        style={{ padding: '14px 18px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: `4px solid ${isUpcoming ? '#00bcd4' : '#43a047'}` }}
                        onClick={() => setExpanded(isExp ? null : m.id)}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span style={{ fontSize: 24 }}>{isUpcoming ? '📅' : '✅'}</span>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 14 }}>{m.title}</div>
                            <div style={{ fontSize: 12, color: '#757575', marginTop: 2 }}>
                              📆 {new Date(m.date).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                              &nbsp;⏰ {m.time} &nbsp;📍 {m.location}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span className={`badge ${isUpcoming ? 'badge-blue' : 'badge-green'}`}>
                            {isUpcoming ? '📅 กำลังจะมาถึง' : '✅ เสร็จแล้ว'}
                          </span>
                          {isExp ? <ChevronUp size={18} color="#9e9e9e" /> : <ChevronDown size={18} color="#9e9e9e" />}
                        </div>
                      </div>

                      {/* Expanded detail */}
                      {isExp && (
                        <div style={{ borderTop: '1px solid #f0f0f0' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                            {/* Agenda */}
                            <div style={{ padding: '16px 18px', borderRight: '1px solid #f0f0f0' }}>
                              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: '#00838f' }}>📋 วาระการประชุม</div>
                              {agendaArr.length > 0 ? (
                                <ol style={{ paddingLeft: 20, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                  {agendaArr.map((a, i) => <li key={i} style={{ fontSize: 13, color: '#424242', lineHeight: 1.5 }}>{a}</li>)}
                                </ol>
                              ) : <p style={{ color: '#9e9e9e', fontSize: 13 }}>ยังไม่ได้กำหนดวาระ</p>}
                            </div>

                            {/* Resolutions */}
                            <div style={{ padding: '16px 18px' }}>
                              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: '#2e7d32' }}>✅ มติที่ประชุม</div>
                              {resArr.length > 0 ? (
                                <ul style={{ paddingLeft: 20, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                  {resArr.map((r, i) => <li key={i} style={{ fontSize: 13, color: '#424242', lineHeight: 1.5 }}>{r}</li>)}
                                </ul>
                              ) : <p style={{ color: '#9e9e9e', fontSize: 13 }}>{isUpcoming ? 'จะบันทึกหลังการประชุม' : 'ยังไม่มีมติ'}</p>}
                            </div>
                          </div>

                          {/* Attendees */}
                          {m.attendees && m.attendees.length > 0 && (
                            <div style={{ padding: '12px 18px', borderTop: '1px solid #f0f0f0', background: '#fafafa', display: 'flex', gap: 20, fontSize: 13 }}>
                              <div><span style={{ fontWeight: 700, color: '#2e7d32' }}>✅ เข้าร่วม:</span> {m.attendees.join(', ')}</div>
                              {m.absent && m.absent.length > 0 && <div><span style={{ fontWeight: 700, color: '#e53935' }}>❌ ขาด:</span> {m.absent.join(', ')}</div>}
                            </div>
                          )}

                          {canManage && (
                            <div style={{ padding: '10px 18px', borderTop: '1px solid #f0f0f0', textAlign: 'right' }}>
                              <button 
                                className="btn btn-outline" 
                                style={{ color: '#e53935', borderColor: '#e53935', padding: '6px 12px', fontSize: 12 }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteMeeting(m.id);
                                }}
                              >
                                ลบการประชุมนี้
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Docs */}
          {tab === 'docs' && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="card-header" style={{ padding: '18px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="card-title" style={{ margin: 0 }}>📁 คลังเอกสารสภา (จัดเก็บใน Google Drive โควต้าฟรี)</span>
              </div>
              {docs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9e9e9e' }}>
                  📁 ยังไม่มีไฟล์เอกสารใดๆ บันทึกในคลังฝ่ายเลขา
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="simple-table">
                    <thead><tr><th>#</th><th>ชื่อเอกสาร</th><th>ประเภท</th><th>ขนาด</th><th>อัปโหลดโดย</th><th>วันที่อัปโหลด</th><th>ดาวน์โหลด</th></tr></thead>
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
                          <td><span className="badge badge-gray" style={{ fontSize: 11 }}>{d.type}</span></td>
                          <td style={{ fontSize: 12, color: '#9e9e9e' }}>{d.size}</td>
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

      {/* Add meeting modal */}
      {meetingModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setMeetingModal(false)}>
          <div className="modal-box">
            <div className="modal-header">
              <span style={{ fontWeight: 700, fontSize: 15 }}>📅 เพิ่มการประชุมใหม่</span>
              <button onClick={() => setMeetingModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9e9e9e' }}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="form-label">ชื่อการประชุม *</label>
                <input className="input-field" placeholder="เช่น ประชุมสภานักเรียน ครั้งที่ 5/2568" value={meetingForm.title} onChange={e => setMeetingForm(p => ({ ...p, title: e.target.value }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="form-label">วันที่ *</label>
                  <input className="input-field" type="date" value={meetingForm.date} onChange={e => setMeetingForm(p => ({ ...p, date: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">เวลา</label>
                  <input className="input-field" type="time" value={meetingForm.time} onChange={e => setMeetingForm(p => ({ ...p, time: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="form-label">สถานที่</label>
                <input className="input-field" value={meetingForm.location} onChange={e => setMeetingForm(p => ({ ...p, location: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">วาระการประชุม (1 บรรทัด = 1 วาระ)</label>
                <textarea className="input-field" rows={4} placeholder="วาระที่ 1: ประธานแจ้งให้ทราบ&#10;วาระที่ 2: พิจารณาโครงการกีฬาภายใน&#10;..." value={meetingForm.agenda} onChange={e => setMeetingForm(p => ({ ...p, agenda: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-gray" onClick={() => setMeetingModal(false)}>ยกเลิก</button>
              <button className="btn btn-primary" onClick={handleSaveMeeting} disabled={!meetingForm.title || !meetingForm.date || savingMeeting}>
                {savingMeeting ? <Loader size={14} className="animate-spin" style={{ marginRight: 6 }} /> : <Save size={14} />}
                {savingMeeting ? 'กำลังบันทึก...' : 'บันทึกลง Sheets'}
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
              <span style={{ fontWeight: 700, fontSize: 15 }}>📤 อัปโหลดเอกสารใหม่ (Google Drive)</span>
              <button onClick={() => setDocModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9e9e9e' }}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="form-label">ชื่อเอกสาร / หัวข้อการประชุม *</label>
                <input className="input-field" placeholder="เช่น สรุปการประชุมแผนงบประมาณสภา ครั้งที่ 3" value={docForm.title} onChange={e => setDocForm(p => ({ ...p, title: e.target.value }))} />
              </div>
              
              <div>
                <label className="form-label">เลือกไฟล์เอกสาร (PDF, DOCX, XLSX, รูปภาพ) *</label>
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
                  <input type="file" accept=".pdf,.docx,.xlsx,.xls,.png,.jpg,.jpeg,.doc" onChange={handleFileChange} style={{ display: 'none' }} />
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
