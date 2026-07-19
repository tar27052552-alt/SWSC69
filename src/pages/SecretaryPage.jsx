import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Plus, X, Save, FileText, Download, ChevronDown, ChevronUp, Upload, Loader } from 'lucide-react';
import { readSheet, writeSheet, updateSheet, uploadFileToDrive, deleteSheet } from '../lib/googleDriveUpload';
import { sendDiscordEmbedViaGAS } from '../lib/discordWebhook';
import { supabase } from '../supabaseClient';

export default function SecretaryPage() {
  const { user, isAdmin } = useAuth();
  const canManage = isAdmin || user?.deptId === 7;
  const [meetings, setMeetings] = useState([]);
  const [docs, setDocs] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [tab, setTab] = useState('meetings');
  const [expanded, setExpanded] = useState(null);
  
  // Loading states
  const [loadingData, setLoadingData] = useState(true);
  const [savingMeeting, setSavingMeeting] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  // Modals
  const [meetingModal, setMeetingModal] = useState(false);
  const [docModal, setDocModal] = useState(false);
  const [editMeetingModal, setEditMeetingModal] = useState(false);
  const [updatingMeeting, setUpdatingMeeting] = useState(false);
  const [editForm, setEditForm] = useState({ 
    id: '', title: '', date: '', time: '', location: '', status: 'upcoming', originalStatus: 'upcoming',
    resolutions: '', existingResolutionsUrl: '', attendees: [], absent: [],
    file: null, fileName: '', fileBase64: '' 
  });

  // Forms
  const [meetingForm, setMeetingForm] = useState({ title: '', date: '', time: '12:30', location: 'ห้องสภานักเรียน', file: null, fileName: '', fileBase64: '' });
  const [docForm, setDocForm] = useState({ title: '', category: 'วาระการประชุม', file: null, fileName: '', fileBase64: '' });

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
          category: d.category || 'อื่นๆ',
          type: d.type,
          size: d.size,
          uploadedBy: d.uploaded_by,
          date: d.date,
          fileUrl: d.file_url
        })));
      }

      // โหลดผู้ใช้
      const { data: uData } = await supabase.from('users').select('id, nickname, name, dept_id, role');
      if (uData) {
        setUsersList(uData);
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

  const handleMeetingFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setMeetingForm(p => ({
        ...p,
        file: file,
        fileName: file.name,
        fileBase64: event.target.result
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleSaveMeeting = async () => {
    if (!meetingForm.title || !meetingForm.date) return;
    if (!meetingForm.fileBase64) {
      alert('กรุณาเลือกไฟล์วาระการประชุมด้วยครับ');
      return;
    }
    setSavingMeeting(true);

    try {
      // 1. Upload file to Google Drive
      const uploadResult = await uploadFileToDrive(meetingForm.fileBase64, meetingForm.fileName, 'secretary');
      if (!uploadResult || !uploadResult.url) {
        throw new Error('อัปโหลดไฟล์วาระเข้า Google Drive ล้มเหลว');
      }

      const newMeeting = {
        title: meetingForm.title,
        date: meetingForm.date,
        time: meetingForm.time + ' น.',
        location: meetingForm.location,
        attendees: [],
        absent: [],
        agenda: uploadResult.url,
        resolutions: [],
        status: 'upcoming'
      };

      const savedData = await writeSheet('Secretary_Meetings', newMeeting);
      if (savedData) {
        setMeetings(prev => [savedData, ...prev]);
        setMeetingModal(false);
        setMeetingForm({ title: '', date: '', time: '12:30', location: 'ห้องสภานักเรียน', file: null, fileName: '', fileBase64: '' });
        alert('บันทึกวาระการประชุมสภาสำเร็จ!');

        // Notify Discord (general channel)
        const embedTitle = `📅 มีการกำหนดการประชุมสภานักเรียนใหม่`;
        const embedDesc = `หัวข้อ: **${savedData.title}**`;
        const fields = [
          { name: "📆 วันที่", value: new Date(savedData.date).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), inline: true },
          { name: "⏰ เวลา", value: savedData.time, inline: true },
          { name: "📍 สถานที่", value: savedData.location, inline: true }
        ];
        if (savedData.agenda) {
          const isUrl = typeof savedData.agenda === 'string' && savedData.agenda.startsWith('http');
          fields.push({
            name: "📋 วาระการประชุม",
            value: isUrl ? `[📎 คลิกเพื่อดาวน์โหลด/เปิดไฟล์วาระ](${savedData.agenda})` : (Array.isArray(savedData.agenda) ? "- " + savedData.agenda.join("\n- ") : String(savedData.agenda)),
            inline: false
          });
        }
        const targetUserIds = usersList.map(u => String(u.id));
        sendDiscordEmbedViaGAS(embedTitle, embedDesc, 10181046, fields, null, 'secretary', targetUserIds.length > 0 ? targetUserIds : null);
        sendDiscordEmbedViaGAS(embedTitle, embedDesc, 10181046, fields, null, 'general', targetUserIds.length > 0 ? targetUserIds : null);
        sendDiscordEmbedViaGAS(embedTitle, embedDesc, 10181046, fields, null, 'academic', targetUserIds.length > 0 ? targetUserIds : null);
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
          category: docForm.category || 'อื่นๆ',
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
            category: savedDoc.category,
            type: savedDoc.type,
            size: savedDoc.size,
            uploadedBy: savedDoc.uploaded_by,
            date: savedDoc.date,
            fileUrl: savedDoc.file_url
          }, ...prev]);
          
          setDocModal(false);
          setDocForm({ title: '', category: 'วาระการประชุม', file: null, fileName: '', fileBase64: '' });
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
          
          const targetUserIds = usersList
            .filter(u => u.dept_id === 7 || u.role === 'admin')
            .map(u => String(u.id));
          sendDiscordEmbedViaGAS(embedTitle, embedDesc, 3447003, fields, null, 'secretary', targetUserIds.length > 0 ? targetUserIds : null);
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

  const formatDateForInput = (dateVal) => {
    if (!dateVal) return '';
    try {
      const d = new Date(dateVal);
      if (!isNaN(d.getTime())) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
    } catch (e) {}
    if (typeof dateVal === 'string') {
      const match = dateVal.match(/^(\d{4}-\d{2}-\d{2})/);
      if (match) return match[1];
    }
    return '';
  };

  const openEditMeetingModal = (meeting, defaultStatus = null) => {
    const resVal = meeting.resolutions;
    const isUrl = typeof resVal === 'string' && resVal.startsWith('http');
    const isUrlArray = Array.isArray(resVal) && resVal.length === 1 && typeof resVal[0] === 'string' && resVal[0].startsWith('http');
    const existingUrl = isUrl ? resVal : (isUrlArray ? resVal[0] : '');

    const resArr = Array.isArray(meeting.resolutions) ? meeting.resolutions : [];
    const resolutionsStr = existingUrl ? '' : resArr.join('\n');

    const attendeesArr = Array.isArray(meeting.attendees) ? meeting.attendees : [];
    const absentArr = Array.isArray(meeting.absent) ? meeting.absent : [];

    let initialAttendees = [...attendeesArr];
    let initialAbsent = [...absentArr];
    if (attendeesArr.length === 0 && absentArr.length === 0) {
      initialAttendees = usersList
        .filter(u => u.nickname !== 'แอดมิน')
        .map(u => u.nickname);
      initialAbsent = [];
    }

    setEditForm({
      id: meeting.id,
      title: meeting.title || '',
      date: formatDateForInput(meeting.date),
      time: (meeting.time || '').replace(' น.', '').trim(),
      location: meeting.location || '',
      status: defaultStatus || meeting.status || 'upcoming',
      originalStatus: meeting.status || 'upcoming',
      resolutions: resolutionsStr,
      existingResolutionsUrl: existingUrl,
      attendees: initialAttendees,
      absent: initialAbsent,
      file: null,
      fileName: '',
      fileBase64: ''
    });
    setEditMeetingModal(true);
  };

  const handleEditFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setEditForm(p => ({
        ...p,
        file: file,
        fileName: file.name,
        fileBase64: event.target.result
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleUpdateMeeting = async () => {
    if (!editForm.title || !editForm.date) {
      alert('กรุณากรอกหัวข้อและวันที่การประชุม');
      return;
    }
    setUpdatingMeeting(true);

    try {
      let finalResolutions = editForm.existingResolutionsUrl;

      if (editForm.fileBase64) {
        const uploadResult = await uploadFileToDrive(editForm.fileBase64, editForm.fileName, 'secretary');
        if (!uploadResult || !uploadResult.url) {
          throw new Error('อัปโหลดไฟล์รายงานการประชุมล้มเหลว');
        }
        finalResolutions = uploadResult.url;
      } else if (!editForm.existingResolutionsUrl && editForm.resolutions) {
        finalResolutions = editForm.resolutions
          .split('\n')
          .map(r => r.trim())
          .filter(Boolean);
      } else if (!editForm.existingResolutionsUrl && !editForm.fileBase64) {
        finalResolutions = [];
      }

      const formattedTime = editForm.time + (editForm.time.endsWith(' น.') ? '' : ' น.');

      const updatedFields = {
        title: editForm.title,
        date: editForm.date,
        time: formattedTime,
        location: editForm.location,
        status: editForm.status,
        resolutions: finalResolutions,
        attendees: editForm.attendees,
        absent: editForm.absent
      };

      const result = await updateSheet('Secretary_Meetings', editForm.id, updatedFields);
      if (result) {
        setMeetings(prev => prev.map(m => {
          if (m.id === editForm.id) {
            return {
              ...m,
              ...updatedFields
            };
          }
          return m;
        }));

        setEditMeetingModal(false);
        alert('อัปเดตข้อมูลการประชุมสำเร็จ!');

        const oldMeeting = meetings.find(m => m.id === editForm.id);
        const wasUpcoming = oldMeeting?.status === 'upcoming';
        const isCompleted = editForm.status === 'completed';

        if (isCompleted && wasUpcoming) {
          const embedTitle = `✅ เสร็จสิ้นการประชุมสภานักเรียน`;
          const embedDesc = `หัวข้อ: **${editForm.title}**\nสถานะ: **เสร็จสิ้นการประชุม**`;
          const fields = [
            { name: "📆 วันที่", value: new Date(editForm.date).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), inline: true },
            { name: "⏰ เวลา", value: formattedTime, inline: true },
            { name: "📍 สถานที่", value: editForm.location, inline: true }
          ];

          if (finalResolutions) {
            const isUrl = typeof finalResolutions === 'string' && finalResolutions.startsWith('http');
            fields.push({
              name: "📋 รายงานการประชุม",
              value: isUrl ? `[📎 คลิกเพื่อดาวน์โหลด/เปิดไฟล์รายงาน](${finalResolutions})` : (Array.isArray(finalResolutions) ? finalResolutions.map((r, i) => `${i + 1}. ${r}`).join("\n") : String(finalResolutions)),
              inline: false
            });
          }

          if (editForm.attendees.length > 0) {
            fields.push({
              name: "👥 ผู้เข้าร่วมประชุม",
              value: editForm.attendees.join(", "),
              inline: false
            });
          }

          if (editForm.absent.length > 0) {
            fields.push({
              name: "❌ ผู้ขาดประชุม",
              value: editForm.absent.join(", "),
              inline: false
            });
          }

          const targetUserIds = usersList.map(u => String(u.id));
          sendDiscordEmbedViaGAS(embedTitle, embedDesc, 3066993, fields, null, 'secretary', targetUserIds.length > 0 ? targetUserIds : null);
          sendDiscordEmbedViaGAS(embedTitle, embedDesc, 3066993, fields, null, 'general', targetUserIds.length > 0 ? targetUserIds : null);
          sendDiscordEmbedViaGAS(embedTitle, embedDesc, 3066993, fields, null, 'academic', targetUserIds.length > 0 ? targetUserIds : null);
        } else if (isCompleted && !wasUpcoming && editForm.fileBase64) {
          const embedTitle = `📄 อัปโหลดรายงานการประชุมสภานักเรียนแล้ว`;
          const embedDesc = `หัวข้อ: **${editForm.title}**\nได้อัปโหลดไฟล์รายงานการประชุมเข้าระบบเรียบร้อยแล้ว`;
          const fields = [
            { name: "📆 วันที่ประชุม", value: new Date(editForm.date).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), inline: true },
            { name: "⏰ เวลา", value: formattedTime, inline: true },
            { name: "📍 สถานที่", value: editForm.location, inline: true }
          ];

          if (typeof finalResolutions === 'string' && finalResolutions.startsWith('http')) {
            fields.push({
              name: "📎 ลิงก์ดาวน์โหลดรายงาน",
              value: `[📎 คลิกเพื่อเปิดไฟล์รายงานการประชุม](${finalResolutions})`,
              inline: false
            });
          }

          const targetUserIds = usersList.map(u => String(u.id));
          sendDiscordEmbedViaGAS(embedTitle, embedDesc, 3066993, fields, null, 'secretary', targetUserIds.length > 0 ? targetUserIds : null);
          sendDiscordEmbedViaGAS(embedTitle, embedDesc, 3066993, fields, null, 'general', targetUserIds.length > 0 ? targetUserIds : null);
          sendDiscordEmbedViaGAS(embedTitle, embedDesc, 3066993, fields, null, 'academic', targetUserIds.length > 0 ? targetUserIds : null);
        }
      }
    } catch (err) {
      console.error('Error updating meeting:', err);
      alert('เกิดข้อผิดพลาดในการอัปเดตข้อมูลการประชุม: ' + err.message);
    } finally {
      setUpdatingMeeting(false);
    }
  };

  const FILE_ICON = { PDF: '🔴', DOCX: '🔵', XLSX: '🟢', PNG: '🟡', JPG: '🟡', default: '📎' };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="page-title">📝 ฝ่ายเลขานุการ</div>
          <div className="page-subtitle">คลังเอกสารสำคัญและรายงานการประชุม (จัดเก็บใน Google Drive)</div>
        </div>
        {canManage && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={() => setDocModal(true)}>
              <Upload size={14} /> อัปโหลดเอกสาร
            </button>
          </div>
        )}
      </div>

      {loadingData ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: 12 }}>
          <div style={{ width: 40, height: 40, border: '4px solid #f3f3f3', borderTop: '4px solid #00bcd4', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
          <div style={{ fontSize: 14, color: '#757575' }}>กำลังดึงข้อมูลจาก Google Sheets backend...</div>
        </div>
      ) : (
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
                <label className="form-label">ไฟล์วาระการประชุม (PDF, Word, Excel, รูปภาพ) *</label>
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
                  <span>{meetingForm.fileName ? meetingForm.fileName : "คลิกเพื่อเลือกไฟล์วาระการประชุม"}</span>
                  <span style={{ fontSize: 11, fontWeight: 400, color: '#616161' }}>ไฟล์จะถูกอัปโหลดเข้า Google Drive อัตโนมัติ</span>
                  <input type="file" accept=".pdf,.docx,.xlsx,.xls,.png,.jpg,.jpeg,.doc" onChange={handleMeetingFileChange} style={{ display: 'none' }} />
                </label>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-gray" onClick={() => setMeetingModal(false)}>ยกเลิก</button>
              <button className="btn btn-primary" onClick={handleSaveMeeting} disabled={!meetingForm.title || !meetingForm.date || !meetingForm.fileBase64 || savingMeeting}>
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
                <label className="form-label">หมวดหมู่เอกสาร *</label>
                <select className="input-field" value={docForm.category} onChange={e => setDocForm(p => ({ ...p, category: e.target.value }))}>
                  <option value="วาระการประชุม">📑 วาระการประชุม</option>
                  <option value="สรุปการประชุม">📝 สรุปการประชุม</option>
                  <option value="อื่นๆ">📁 อื่นๆ</option>
                </select>
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

      {/* Edit meeting modal */}
      {editMeetingModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setEditMeetingModal(false)}>
          <div className="modal-box" style={{ maxWidth: 650 }}>
            <div className="modal-header">
              <span style={{ fontWeight: 700, fontSize: 15 }}>📝 บันทึกผลการประชุม / แก้ไขข้อมูล</span>
              <button onClick={() => setEditMeetingModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9e9e9e' }}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '70vh', overflowY: 'auto', paddingRight: 4 }}>
              <div>
                <label className="form-label">ชื่อการประชุม *</label>
                <input className="input-field" value={editForm.title} onChange={e => setEditForm(p => ({ ...p, title: e.target.value }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="form-label">วันที่ *</label>
                  <input className="input-field" type="date" value={editForm.date} onChange={e => setEditForm(p => ({ ...p, date: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">เวลา</label>
                  <input className="input-field" type="time" value={editForm.time} onChange={e => setEditForm(p => ({ ...p, time: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="form-label">สถานที่</label>
                  <input className="input-field" value={editForm.location} onChange={e => setEditForm(p => ({ ...p, location: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">สถานะการประชุม *</label>
                  <select 
                    className="input-field" 
                    value={editForm.status} 
                    onChange={e => setEditForm(p => ({ ...p, status: e.target.value }))}
                    style={{ height: 42, background: 'white' }}
                  >
                    <option value="upcoming">📅 กำลังจะมาถึง</option>
                    <option value="completed">✅ เสร็จสิ้นแล้ว</option>
                  </select>
                </div>
              </div>

              {editForm.originalStatus !== 'upcoming' && (
                <div>
                  <label className="form-label">ไฟล์รายงานการประชุม (PDF, Word, Excel, รูปภาพ)</label>
                  {(() => {
                    const resVal = editForm.existingResolutionsUrl;
                    if (resVal) {
                      return (
                        <div style={{ marginBottom: 8, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span>📎 ไฟล์ปัจจุบัน:</span>
                          <a href={resVal} target="_blank" rel="noreferrer" style={{ color: '#00838f', fontWeight: 600 }}>เปิดดูไฟล์</a>
                          <button 
                            type="button" 
                            className="btn btn-outline btn-sm"
                            style={{ color: '#e53935', borderColor: '#e53935', padding: '2px 6px', fontSize: 11, marginLeft: 8 }}
                            onClick={() => setEditForm(p => ({ ...p, existingResolutionsUrl: '' }))}
                          >
                            ลบไฟล์ออก
                          </button>
                        </div>
                      );
                    }
                    return null;
                  })()}
                  
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
                    <span>{editForm.fileName ? editForm.fileName : "คลิกเพื่อเลือกไฟล์รายงานการประชุม"}</span>
                    <span style={{ fontSize: 11, fontWeight: 400, color: '#616161' }}>ไฟล์จะถูกอัปโหลดเข้า Google Drive อัตโนมัติ</span>
                    <input type="file" accept=".pdf,.docx,.xlsx,.xls,.png,.jpg,.jpeg,.doc" onChange={handleEditFileChange} style={{ display: 'none' }} />
                  </label>
                </div>
              )}

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label className="form-label" style={{ margin: 0 }}>👥 เช็คชื่อผู้เข้าร่วมประชุม</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button 
                      type="button" 
                      className="btn btn-gray btn-sm" 
                      style={{ fontSize: 11, padding: '2px 8px' }}
                      onClick={() => {
                        const allNicks = usersList.filter(u => u.nickname !== 'แอดมิน').map(u => u.nickname);
                        setEditForm(p => ({ ...p, attendees: allNicks, absent: [] }));
                      }}
                    >
                      เลือกทั้งหมด
                    </button>
                    <button 
                      type="button" 
                      className="btn btn-gray btn-sm" 
                      style={{ fontSize: 11, padding: '2px 8px' }}
                      onClick={() => {
                        const allNicks = usersList.filter(u => u.nickname !== 'แอดมิน').map(u => u.nickname);
                        setEditForm(p => ({ ...p, attendees: [], absent: allNicks }));
                      }}
                    >
                      ล้างทั้งหมด
                    </button>
                  </div>
                </div>
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', 
                  gap: 8, 
                  background: '#f8f9fa', 
                  padding: 12, 
                  borderRadius: 8, 
                  border: '1px solid #e9ecef',
                  maxHeight: 180,
                  overflowY: 'auto'
                }}>
                  {usersList
                    .filter(u => u.nickname !== 'แอดมิน')
                    .map(u => {
                      const isAttended = editForm.attendees.includes(u.nickname);
                      return (
                        <label 
                          key={u.id} 
                          style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: 6, 
                            cursor: 'pointer',
                            fontSize: 12,
                            padding: '4px 6px',
                            borderRadius: 4,
                            background: isAttended ? '#e0f7fa' : '#ffebee',
                            color: isAttended ? '#006064' : '#b71c1c',
                            transition: 'all 0.2s',
                            border: `1px solid ${isAttended ? '#b2ebf2' : '#ffcdd2'}`
                          }}
                        >
                          <input 
                            type="checkbox" 
                            checked={isAttended}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              if (checked) {
                                setEditForm(p => ({
                                  ...p,
                                  attendees: [...p.attendees, u.nickname],
                                  absent: p.absent.filter(name => name !== u.nickname)
                                }));
                              } else {
                                setEditForm(p => ({
                                  ...p,
                                  attendees: p.attendees.filter(name => name !== u.nickname),
                                  absent: [...p.absent, u.nickname]
                                }));
                              }
                            }}
                            style={{ cursor: 'pointer' }}
                          />
                          <span style={{ fontWeight: 600 }}>{u.nickname}</span>
                          <span style={{ fontSize: 10, opacity: 0.8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>({u.name.split(' ')[0]})</span>
                        </label>
                      );
                    })}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-gray" onClick={() => setEditMeetingModal(false)}>ยกเลิก</button>
              <button 
                className="btn btn-primary" 
                onClick={handleUpdateMeeting} 
                disabled={!editForm.title || !editForm.date || updatingMeeting}
              >
                {updatingMeeting ? <Loader size={14} className="animate-spin" style={{ marginRight: 6 }} /> : <Save size={14} />}
                {updatingMeeting ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
