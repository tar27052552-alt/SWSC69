import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Plus, X, Save, Edit2, Search, Trash2, Camera } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { sendDiscordEmbedViaGAS } from '../lib/discordWebhook';
import { uploadFileToDrive, transformGoogleDriveUrl, writeSheet } from '../lib/googleDriveUpload';
import logoUrl from '../assets/logo.png';

const CONTENT_TYPES = ['กราฟิก', 'วิดีโอ', 'Reel', 'ถ่ายภาพ', 'Live Stream', 'อินโฟกราฟิก'];
const PLATFORMS     = ['Instagram', 'Facebook Page', 'LINE Official', 'ทั้งหมด'];
const PRIORITY      = ['สูง', 'ปานกลาง', 'ต่ำ'];

const STATUS_CFG = {
  backlog:     { label: 'คิดคอนเทนต์',   color: '#9e9e9e', bg: '#f5f5f5'  },
  designing:   { label: 'กำลังทำกราฟิก', color: '#1565c0', bg: '#e3f2fd'  },
  wait_pr:     { label: 'รอ PR ใส่แคปชั่น', color: '#f57f17', bg: '#fff8e1' },
  done:        { label: 'เสร็จ/โพสต์แล้ว', color: '#2e7d32', bg: '#e8f5e9' },
};

const getGraphicUrl = (note) => {
  if (!note) return null;
  const match = note.match(/\[Graphic\]:\s*(https?:\/\/\S+)/);
  return match ? match[1] : null;
};

const getCleanNote = (note) => {
  if (!note) return '';
  return note.replace(/\[Graphic\]:\s*https?:\/\/\S+/, '').trim();
};

const isVideo = (url) => {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.endsWith('.mp4') || lower.endsWith('.mov') || lower.endsWith('.webm') || lower.endsWith('.mkv') || lower.includes('_video_') || url.startsWith('data:video/');
};

const getDrivePreviewUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('data:')) return url;
  let match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return `https://drive.google.com/file/d/${match[1]}/preview`;
  }
  match = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return `https://drive.google.com/file/d/${match[1]}/preview`;
  }
  return url;
};

const getExtensionFromBase64 = (base64) => {
  const match = base64.match(/^data:([^;]+);base64,/);
  if (match && match[1]) {
    const mime = match[1];
    if (mime === 'image/png') return 'png';
    if (mime === 'image/jpeg') return 'jpg';
    if (mime === 'image/gif') return 'gif';
    if (mime === 'video/mp4') return 'mp4';
    if (mime === 'video/quicktime') return 'mov';
    if (mime === 'video/webm') return 'webm';
  }
  return 'bin';
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

const initForm = { title:'', type:CONTENT_TYPES[0], platform:PLATFORMS[0], priority:'ปานกลาง', assignee:'', dueDate:'', note:'', caption:'', song:'' };

export default function AVPage() {
  const { user } = useAuth();
  const [tasks, setTasks]   = useState(INIT_TASKS);
  const [tab, setTab]       = useState('kanban');
  const [modal, setModal]   = useState(false);
  const [editTask, setEdit] = useState(null);
  const [avMembers, setAvMembers] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [form, setForm]     = useState(initForm);
  const [search, setSearch] = useState('');
  const today = new Date();
  const [yr, setYr] = useState(today.getFullYear());
  const [mo, setMo] = useState(today.getMonth());
  const [uploadModalTask, setUploadModalTask] = useState(null);
  const [graphicFile, setGraphicFile] = useState(null);
  const [graphicPreview, setGraphicPreview] = useState(null);
  const [uploadingGraphic, setUploadingGraphic] = useState(false);
  const [modalGraphicFile, setModalGraphicFile] = useState(null);
  const [modalGraphicPreview, setModalGraphicPreview] = useState(null);

  // Certificate Sync State
  const [certFolderLink, setCertFolderLink] = useState('');
  const [certEventName, setCertEventName] = useState('');
  const [syncingCerts, setSyncingCerts] = useState(false);
  const [certHistory, setCertHistory] = useState([]);
  const [loadingCertHistory, setLoadingCertHistory] = useState(false);

  // PR News states
  const [newsList, setNewsList] = useState([]);
  const [loadingNews, setLoadingNews] = useState(false);
  const [submittingNews, setSubmittingNews] = useState(false);
  const [newsForm, setNewsForm] = useState({ headline: '', detail: '', category: 'ข่าวโรงเรียน', forDate: '', imagePreview: null, imageFile: null, supportingImages: [] });
  const [editingNewsId, setEditingNewsId] = useState(null);

  // Obec Line states
  const [obecList, setObecList] = useState([]);
  const [loadingObec, setLoadingObec] = useState(false);
  const [submittingObec, setSubmittingObec] = useState(false);
  const [obecForm, setObecForm] = useState({ title: '', imagePreview: null, imageFile: null });
  const [editingObecId, setEditingObecId] = useState(null);


  const loadNewsList = async () => {
    setLoadingNews(true);
    try {
      const { data, error } = await supabase
        .from('web_news')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setNewsList(data || []);
    } catch (err) {
      console.error("Failed to load news:", err);
    } finally {
      setLoadingNews(false);
    }
  };

  const loadObecList = async () => {
    setLoadingObec(true);
    try {
      const { data, error } = await supabase
        .from('obec_line')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setObecList(data || []);
    } catch (err) {
      console.error("Failed to load Obec Line:", err);
    } finally {
      setLoadingObec(false);
    }
  };

  const loadCertHistory = async () => {
    setLoadingCertHistory(true);
    try {
      const GAS_URL = import.meta.env.VITE_GAS_URL;
      const res = await fetch(GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "read_sheet", sheetName: "Academic_Docs" })
      });
      const resJson = await res.json();
      if (resJson.success) {
        const certs = resJson.data.filter(d => d.type && d.type.startsWith('เกียรติบัตร'));
        // Group by category
        const groups = {};
        certs.forEach(c => {
          const cat = c.type.includes('|') ? c.type.split('|')[1] : (c.category || 'ไม่ได้ระบุกิจกรรม');
          if (!groups[cat]) groups[cat] = { count: 0, date: c.date, uploader: c.uploaded_by };
          groups[cat].count++;
        });
        
        const historyArr = Object.keys(groups).map(k => ({
          name: k,
          count: groups[k].count,
          date: groups[k].date,
          uploader: groups[k].uploader
        }));
        
        setCertHistory(historyArr);
      }
    } catch (err) {
      console.error("Failed to load cert history:", err);
    } finally {
      setLoadingCertHistory(false);
    }
  };

  useEffect(() => {
    if (tab === 'certificates') {
      loadCertHistory();
    }
    if (tab === 'news') {
      loadNewsList();
    }
    if (tab === 'obec') {
      loadObecList();
    }
  }, [tab]);


  const handleSubmitObec = async (e) => {
    e.preventDefault();
    
    if (!editingObecId && !obecForm.imageFile) {
      alert("กรุณาเลือกรูปภาพหน้าปกวารสารด้วยครับ");
      return;
    }

    setSubmittingObec(true);
    try {
      let finalImageUrl = obecForm.imagePreview || '';

      if (obecForm.imageFile) {
        const toBase64 = (file) => new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => resolve(reader.result);
          reader.onerror = error => reject(error);
        });
        const base64 = await toBase64(obecForm.imageFile);
        const fileName = `obec_${Date.now()}_${obecForm.imageFile.name}`;
        const uploadResult = await uploadFileToDrive(base64, fileName, 'obec');
        if (uploadResult && uploadResult.url) {
          finalImageUrl = uploadResult.url;
        } else {
          throw new Error("อัปโหลดรูปภาพหน้าปกเข้า Google Drive ไม่สำเร็จ");
        }
      }

      const obecData = {
        title: obecForm.title.trim(),
        file_url: finalImageUrl,
        image_url: finalImageUrl
      };

      if (editingObecId) {
        const { error } = await supabase
          .from('obec_line')
          .update(obecData)
          .eq('id', editingObecId);
        if (error) throw error;
        alert("แก้ไข Obec Line สำเร็จแล้ว!");
      } else {
        const { error } = await supabase
          .from('obec_line')
          .insert([obecData]);
        if (error) throw error;
        alert("เพิ่ม Obec Line สำเร็จแล้ว!");
      }

      setObecForm({ title: '', imagePreview: null, imageFile: null });
      setEditingObecId(null);
      loadObecList();
    } catch (err) {
      console.error(err);
      alert("เกิดข้อผิดพลาด: " + err.message);
    } finally {
      setSubmittingObec(false);
    }
  };

  const handleDeleteObec = async (id) => {
    if (!confirm("คุณแน่ใจหรือไม่ที่จะลบ Obec Line รายการนี้?")) return;
    try {
      const { error } = await supabase
        .from('obec_line')
        .delete()
        .eq('id', id);
      if (error) throw error;
      alert("ลบ Obec Line เรียบร้อยแล้ว!");
      loadObecList();
    } catch (err) {
      console.error(err);
      alert("เกิดข้อผิดพลาดในการลบ: " + err.message);
    }
  };

  const handleEditObec = (item) => {
    setEditingObecId(item.id);
    setObecForm({
      title: item.title,
      imagePreview: item.image_url,
      imageFile: null
    });
  };

  const handleSubmitNews = async (e) => {
    e.preventDefault();
    if (!newsForm.headline.trim() || !newsForm.detail.trim() || !newsForm.forDate) {
      alert("กรุณากรอกหัวข้อข่าว รายละเอียด และกำหนดเผยแพร่ให้ครบถ้วนด้วยครับ");
      return;
    }

    setSubmittingNews(true);
    try {
      const toBase64 = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
      });

      let finalImageUrl = newsForm.imagePreview || '';

      if (newsForm.imageFile) {
        
        const base64 = await toBase64(newsForm.imageFile);
        const fileName = `news_${Date.now()}_${newsForm.imageFile.name}`;
        const subFolderName = newsForm.headline.trim() || 'ข่าวไม่มีหัวข้อ';
        const uploadResult = await uploadFileToDrive(base64, fileName, 'pr', subFolderName);
        if (uploadResult && uploadResult.url) {
          finalImageUrl = uploadResult.url;
        } else {
          throw new Error("อัปโหลดรูปภาพเข้า Google Drive ไม่สำเร็จ");
        }
      }

      const dt = new Date(newsForm.forDate);
      const THAI_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์'];
      const dayName = THAI_DAYS[dt.getDay()];
      const thaiDateStr = `วัน${dayName}ที่ ` + dt.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });

      // Upload supporting images
      let finalSupportingImages = [];
      if (newsForm.supportingImages && newsForm.supportingImages.length > 0) {
        const subFolderName = newsForm.headline.trim() || 'ข่าวไม่มีหัวข้อ';
        for (let img of newsForm.supportingImages) {
          if (img.file) {
            // New file selected — upload to Google Drive
            const base64 = await toBase64(img.file);
            const fileName = `news_sub_${Date.now()}_${img.file.name}`;
            const uploadResult = await uploadFileToDrive(base64, fileName, 'pr', subFolderName);
            if (uploadResult && uploadResult.url) {
              finalSupportingImages.push(uploadResult.url);
            } else {
              throw new Error("อัปโหลดรูปภาพประกอบเข้า Google Drive ไม่สำเร็จ");
            }
          } else if (img.preview && !img.preview.startsWith('blob:')) {
            // Existing Drive URL (from editing) — keep as-is, but skip blob: URLs
            finalSupportingImages.push(img.preview);
          }
          // If img.file is null and img.preview is a blob: URL, skip it
          // (blob URLs are only valid in the current browser session)
        }
      }

      const newsData = {
        headline: newsForm.headline.trim(),
        detail: newsForm.detail.trim(),
        category: newsForm.category,
        for_day: dayName,
        for_date: thaiDateStr,
        image_url: finalImageUrl,
        supporting_images: finalSupportingImages,
        submitter: user?.name || user?.nickname || 'ฝ่ายโสตฯ'
      };

      if (editingNewsId) {
        const { error } = await supabase
          .from('web_news')
          .update(newsData)
          .eq('id', editingNewsId);
        if (error) throw error;
        alert("แก้ไขข่าวสารหน้าเว็บสำเร็จแล้ว!");
      } else {
        const { error } = await supabase
          .from('web_news')
          .insert([newsData]);
        if (error) throw error;
        alert("เพิ่มข่าวสารหน้าเว็บสำเร็จแล้ว!");
      }

      setNewsForm({ headline: '', detail: '', category: 'ข่าวโรงเรียน', forDate: '', imagePreview: null, imageFile: null, supportingImages: [] });
      setEditingNewsId(null);
      loadNewsList();
    } catch (err) {
      console.error(err);
      alert("เกิดข้อผิดพลาด: " + err.message);
    } finally {
      setSubmittingNews(false);
    }
  };

  const handleDeleteNews = async (id) => {
    if (!confirm("คุณแน่ใจหรือไม่ที่จะลบข่าวประชาสัมพันธ์นี้?")) return;
    try {
      const { error } = await supabase
        .from('web_news')
        .delete()
        .eq('id', id);
      if (error) throw error;
      alert("ลบข่าวสารหน้าเว็บเรียบร้อยแล้ว!");
      loadNewsList();
    } catch (err) {
      console.error(err);
      alert("เกิดข้อผิดพลาดในการลบ: " + err.message);
    }
  };

  const handleEditNews = (item) => {
    let dateVal = '';
    if (item.created_at) {
      dateVal = new Date(item.created_at).toISOString().split('T')[0];
    } else {
      dateVal = new Date().toISOString().split('T')[0];
    }
    setEditingNewsId(item.id);
    setNewsForm({
      headline: item.headline,
      detail: item.detail,
      category: item.category,
      forDate: dateVal,
      imagePreview: item.image_url || null,
      imageFile: null,
      supportingImages: (item.supporting_images || []).map(url => ({ file: null, preview: url }))
    });
  };

  const handleDeleteCertGroup = async (eventName) => {
    if (!confirm(`คุณแน่ใจหรือไม่ที่จะลบเกียรติบัตรทั้งหมดในกิจกรรม "${eventName}"?\n(การลบนี้จะลบแค่ในระบบเท่านั้น ไฟล์ใน Google Drive จะยังอยู่)`)) return;
    
    try {
      const GAS_URL = import.meta.env.VITE_GAS_URL;
      const res = await fetch(GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "delete_cert_group", eventName: eventName })
      });
      const resJson = await res.json();
      if (resJson.success) {
        alert(`ลบเกียรติบัตรกิจกรรม "${eventName}" สำเร็จแล้ว จำนวน ${resJson.data.deleted_count} ใบ`);
        loadCertHistory();
      } else {
        throw new Error(resJson.error);
      }
    } catch (err) {
      console.error(err);
      alert("เกิดข้อผิดพลาดในการลบ: " + err.message);
    }
  };

  const handleRenameCertGroup = async (oldName) => {
    const newName = prompt(`กรุณากรอกชื่อกิจกรรมใหม่ สำหรับเปลี่ยนจาก "${oldName}":`, oldName);
    if (!newName || newName.trim() === '' || newName === oldName) return;
    
    try {
      const GAS_URL = import.meta.env.VITE_GAS_URL;
      const res = await fetch(GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "rename_cert_group", oldName: oldName, newName: newName.trim() })
      });
      const resJson = await res.json();
      if (resJson.success) {
        alert(`เปลี่ยนชื่อกิจกรรมเป็น "${newName.trim()}" สำเร็จแล้ว จำนวน ${resJson.data.updated_count} ใบ`);
        loadCertHistory();
      } else {
        throw new Error(resJson.error);
      }
    } catch (err) {
      console.error(err);
      alert("เกิดข้อผิดพลาดในการเปลี่ยนชื่อ: " + err.message);
    }
  };

  const handleDriveSync = async () => {
    if (!certFolderLink.trim()) {
      alert("กรุณาวางลิงก์โฟลเดอร์ Google Drive ก่อนครับ");
      return;
    }
    if (!certEventName.trim()) {
      alert("กรุณากรอกชื่อกิจกรรมก่อนครับ");
      return;
    }

    // Extract Folder ID from the URL
    let folderId = '';
    const match = certFolderLink.match(/folders\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      folderId = match[1];
    } else {
      const matchId = certFolderLink.match(/id=([a-zA-Z0-9_-]+)/);
      if (matchId && matchId[1]) {
        folderId = matchId[1];
      } else {
        alert("ลิงก์โฟลเดอร์ Google Drive ไม่ถูกต้องครับ");
        return;
      }
    }

    setSyncingCerts(true);
    try {
      const GAS_URL = import.meta.env.VITE_GAS_URL;
      const res = await fetch(GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "sync_folder",
          folderId: folderId,
          eventName: certEventName.trim(),
          uploadedBy: user?.name || user?.nickname || 'ฝ่ายโสตฯ'
        })
      });
      
      const resJson = await res.json();
      if (resJson.success) {
        alert("ซิงค์เกียรติบัตรสำเร็จแล้วจำนวน " + resJson.data.synced_count + " ใบ!");
        setCertFolderLink('');
        setCertEventName('');
        loadCertHistory(); // Reload history after sync
      } else {
        throw new Error(resJson.error || "Unknown error");
      }
    } catch (err) {
      console.error(err);
      alert("เกิดข้อผิดพลาดในการซิงค์: " + err.message + "\nโปรดตรวจสอบว่าโฟลเดอร์เปิดสิทธิ์ Anyone with the link แล้ว");
    } finally {
      setSyncingCerts(false);
    }
  };

  useEffect(() => {
    async function loadTasks() {
      try {
        const { data, error } = await supabase
          .from('av_tasks')
          .select('*')
          .order('created_at', { ascending: false });
        if (error) throw error;

        const { data: qData } = await supabase
          .from('pr_caption_queue')
          .select('id, caption, song');

        const qMap = {};
        if (qData) {
          qData.forEach(q => {
            qMap[q.id] = q;
          });
        }

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
            note: d.note,
            caption: qMap[d.id]?.caption || '',
            song: qMap[d.id]?.song || ''
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
          .select('id, nickname, name, dept_id, role');
        if (!error && data) {
          setUsersList(data);
          const names = data.filter(u => u.dept_id === 9).map(u => u.nickname || u.name).filter(Boolean);
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
    if (!form.title || !form.dueDate) return;

    let finalGraphicUrl = modalGraphicPreview;

    if (modalGraphicFile && modalGraphicPreview && modalGraphicPreview.startsWith('data:')) {
      try {
        const ext = getExtensionFromBase64(modalGraphicPreview);
        const isVid = modalGraphicPreview.startsWith('data:video/');
        const prefix = isVid ? 'video' : 'graphic';
        const fileName = `${prefix}_${Date.now()}.${ext}`;
        const uploadResult = await uploadFileToDrive(modalGraphicPreview, fileName, 'av_graphics');
        if (uploadResult && uploadResult.url) {
          finalGraphicUrl = uploadResult.url;
        }
      } catch (err) {
        console.error('Error uploading graphic from modal:', err);
        alert('เกิดข้อผิดพลาดในการอัปโหลดรูปภาพกราฟิกไปยัง Google Drive แต่ระบบจะบันทึกข้อมูลอื่นต่อ');
      }
    }

    const finalNote = finalGraphicUrl ? `${form.note} [Graphic]: ${finalGraphicUrl}` : form.note;

    const taskObj = {
      title: form.title,
      type: form.type,
      platform: form.platform,
      priority: form.priority,
      assignee: form.assignee,
      due_date: form.dueDate,
      note: finalNote
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

        setTasks(p => p.map(t => t.id===editTask.id ? { ...t, ...form, note: finalNote } : t));
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
          
          let targetUserIds = [];
          if (inserted.assignee) {
            const foundUser = usersList.find(u => u.nickname === inserted.assignee || u.name === inserted.assignee);
            if (foundUser) {
              targetUserIds.push(String(foundUser.id));
            }
          }
          if (targetUserIds.length === 0) {
            targetUserIds = usersList
              .filter(u => u.dept_id === 9 || u.role === 'admin')
              .map(u => String(u.id));
          }
          sendDiscordEmbedViaGAS(embedTitle, embedDesc, 3447003, fields, null, 'av', targetUserIds.length > 0 ? targetUserIds : null);
        }
      }
    } catch (err) {
      console.error('Error saving AV task:', err);
      alert('เกิดข้อผิดพลาดในการบันทึกงาน: ' + err.message);
    }
    setModal(false); setEdit(null);
  };

  const openCreate = () => {
    setEdit(null);
    setForm({ title:'', type:CONTENT_TYPES[0], platform:PLATFORMS[0], priority:'ปานกลาง', assignee:avMembers[0] || '', dueDate:'', note:'', caption:'', song:'' });
    setModalGraphicPreview(null);
    setModalGraphicFile(null);
    setModal(true);
  };

  const openEdit = (t) => {
    setEdit(t);
    setForm({ title:t.title, type:t.type, platform:t.platform, priority:t.priority, assignee:t.assignee, dueDate:t.dueDate, note:getCleanNote(t.note), caption:t.caption || '', song:t.song || '' });
    setModalGraphicPreview(getGraphicUrl(t.note) || null);
    setModalGraphicFile(null);
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

  const handleTransition = (task, nextStatus) => {
    if (nextStatus === 'wait_pr') {
      const existingUrl = getGraphicUrl(task.note);
      setUploadModalTask(task);
      setGraphicPreview(existingUrl || null);
      setGraphicFile(null);
    } else {
      moveStatus(task.id, nextStatus);
    }
  };

  const handleSaveGraphicAndMove = async () => {
    if (!uploadModalTask || !graphicPreview || uploadingGraphic) return;
    setUploadingGraphic(true);
    try {
      let finalGraphicUrl = graphicPreview;
      if (graphicPreview.startsWith('data:')) {
        const ext = getExtensionFromBase64(graphicPreview);
        const isVid = graphicPreview.startsWith('data:video/');
        const prefix = isVid ? 'video' : 'graphic';
        const fileName = `${prefix}_${uploadModalTask.id}_${Date.now()}.${ext}`;
        const uploadResult = await uploadFileToDrive(graphicPreview, fileName, 'av_graphics');
        if (!uploadResult || !uploadResult.url) {
          throw new Error('อัปโหลดไฟล์ไม่สำเร็จ');
        }
        finalGraphicUrl = uploadResult.url;
      }
      
      const cleanNote = getCleanNote(uploadModalTask.note);
      const newNote = cleanNote ? `${cleanNote} [Graphic]: ${finalGraphicUrl}` : `[Graphic]: ${finalGraphicUrl}`;

      const { error: avError } = await supabase
        .from('av_tasks')
        .update({ status: 'wait_pr', note: newNote })
        .eq('id', uploadModalTask.id);
      if (avError) throw avError;

      const { data: existing } = await supabase
        .from('pr_caption_queue')
        .select('id')
        .eq('id', uploadModalTask.id);
      
      if (!existing || existing.length === 0) {
        await supabase
          .from('pr_caption_queue')
          .insert([{
            id: uploadModalTask.id,
            title: uploadModalTask.title,
            type: uploadModalTask.type,
            platform: uploadModalTask.platform,
            due_date: uploadModalTask.dueDate,
            status: 'pending'
          }]);
      } else {
        await supabase
          .from('pr_caption_queue')
          .update({ status: 'pending' })
          .eq('id', uploadModalTask.id);
      }

      const STATUS_LABELS = {
        backlog: 'คิดคอนเทนต์',
        designing: 'กำลังทำกราฟิก',
        wait_pr: 'รอ PR ใส่แคปชั่น',
        done: 'เสร็จ/โพสต์แล้ว'
      };
      const embedTitle = `🎥 อัปเดตความคืบหน้างานโสตทัศนูปกรณ์`;
      const embedDesc = `งาน **${uploadModalTask.title}** ได้อัปโหลดรูปกราฟิกและส่งให้ PR เรียบร้อยแล้ว`;
      const fields = [
        { name: "👤 ผู้รับผิดชอบ", value: uploadModalTask.assignee || "ไม่ระบุ", inline: true },
        { name: "🎬 ประเภทงาน", value: uploadModalTask.type || "ไม่ระบุ", inline: true },
        { name: "📱 แพลตฟอร์ม", value: uploadModalTask.platform || "ไม่ระบุ", inline: true }
      ];
      const targetUserIds = usersList
        .filter(u => u.dept_id === 5 || u.role === 'admin')
        .map(u => String(u.id));

      sendDiscordEmbedViaGAS(embedTitle, embedDesc, 16088855, fields, finalGraphicUrl, 'pr', targetUserIds.length > 0 ? targetUserIds : null);

      setTasks(p => p.map(t => t.id === uploadModalTask.id ? { ...t, status: 'wait_pr', note: newNote } : t));
      
      setUploadModalTask(null);
      setGraphicPreview(null);
      setGraphicFile(null);
      alert('อัปโหลดรูปภาพกราฟิกและย้ายสถานะเป็นรอ PR เรียบร้อยแล้วครับ!');
    } catch (err) {
      console.error('Error saving graphic and moving status:', err);
      alert('เกิดข้อผิดพลาดในการอัปโหลดรูปภาพกราฟิก: ' + err.message);
    } finally {
      setUploadingGraphic(false);
    }
  };

  const moveStatus = async (id, status) => {
    try {
      const { error } = await supabase
        .from('av_tasks')
        .update({ status })
        .eq('id', id);
      if (error) throw error;

      // Sync with pr_caption_queue based on the new status
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
          } else {
            await supabase
              .from('pr_caption_queue')
              .update({ status: 'pending' })
              .eq('id', id);
          }
        }
      } else if (status === 'done') {
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
                status: 'done'
              }]);
          } else {
            await supabase
              .from('pr_caption_queue')
              .update({ status: 'done' })
              .eq('id', id);
          }
        }
      } else {
        // If moving back to backlog or designing, delete from pr_caption_queue
        await supabase
          .from('pr_caption_queue')
          .delete()
          .eq('id', id);
      }

      // Find task details
      const task = tasks.find(t => t.id === id);
      if (task) {
        const STATUS_LABELS = {
          backlog: 'คิดคอนเทนต์',
          designing: 'กำลังทำกราฟิก',
          wait_pr: 'รอ PR ใส่แคปชั่น',
          done: 'เสร็จ/โพสต์แล้ว'
        };
        const colorMap = {
          backlog: 9803157,      // #9e9e9e
          designing: 1402304,     // #1565c0
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
        
        let targetUserIds = [];
        if (status === 'wait_pr') {
          targetUserIds = usersList
            .filter(u => u.dept_id === 5 || u.role === 'admin')
            .map(u => String(u.id));
        } else {
          if (task.assignee) {
            const foundUser = usersList.find(u => u.nickname === task.assignee || u.name === task.assignee);
            if (foundUser) {
              targetUserIds.push(String(foundUser.id));
            }
          }
          if (targetUserIds.length === 0) {
            targetUserIds = usersList
              .filter(u => u.dept_id === 9 || u.role === 'admin')
              .map(u => String(u.id));
          }
        }
        sendDiscordEmbedViaGAS(embedTitle, embedDesc, colorMap[status] || 3066993, fields, null, notifyChannel, targetUserIds.length > 0 ? targetUserIds : null);
      }

      setTasks(p => p.map(t => t.id===id ? { ...t, status } : t));
    } catch (err) {
      console.error('Error moving AV task status:', err);
      alert('เกิดข้อผิดพลาดในการอัปเดตสถานะงาน: ' + err.message);
    }
  };

  const exportMonthTasksPNG = () => {
    const logoImg = new Image();
    logoImg.crossOrigin = 'anonymous';
    logoImg.src = logoUrl;
    logoImg.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      const firstDay = new Date(yr, mo, 1).getDay();
      const firstDayAdjusted = firstDay === 0 ? 6 : firstDay - 1;
      const daysInMonth = new Date(yr, mo + 1, 0).getDate();
      const totalCells = firstDayAdjusted + daysInMonth;
      const totalRows = Math.ceil(totalCells / 7);

      const width = 1200;
      const headerHeight = 210;
      const legendHeight = 50;
      const dayHeaderHeight = 40;
      const cellWidth = 155;
      const cellHeight = 125;
      const gridHeight = totalRows * cellHeight;
      const footerHeight = 70;
      const height = headerHeight + legendHeight + dayHeaderHeight + gridHeight + footerHeight;

      canvas.width = width;
      canvas.height = height;

      const drawRoundRect = (x, y, w, h, r) => {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
      };

      // 1. Draw Background
      ctx.fillStyle = '#f8f9fa';
      ctx.fillRect(0, 0, width, height);

      // 2. Draw Header Gradient
      const gradient = ctx.createLinearGradient(0, 0, width, headerHeight);
      gradient.addColorStop(0, '#1565c0'); // Dark Blue
      gradient.addColorStop(1, '#1e88e5'); // Blue
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, headerHeight);

      // Decorative shapes in header
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.beginPath();
      ctx.arc(width - 100, 60, 150, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(100, headerHeight, 100, 0, Math.PI * 2);
      ctx.fill();

      // Logo
      ctx.drawImage(logoImg, 45, 35, 110, 110);

      // Header Texts
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px "Noto Sans Thai", sans-serif';
      ctx.fillText('ปฏิทินคิวงานฝ่ายโสตทัศนศึกษา', 180, 75);
      ctx.font = 'normal 13px "Noto Sans Thai", sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.fillText('ระบบบริหารจัดการคิวงานสื่อประชาสัมพันธ์สภานักเรียน (SWSC69)', 180, 100);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 26px "Noto Sans Thai", sans-serif';
      ctx.fillText(`ตารางกิจกรรมคิวงาน ประจำเดือน ${MONTHS_FULL[mo]} ${yr + 543}`, 45, 175);

      // Date Exported info
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.font = 'normal 12px "Noto Sans Thai", sans-serif';
      const dateStr = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      ctx.fillText(`ข้อมูล ณ วันที่: ${dateStr} น.`, width - 45, 75);

      // 3. Draw Legend Bar (below header)
      const legendY = headerHeight + 10;
      ctx.fillStyle = '#ffffff';
      drawRoundRect(57, legendY, width - 114, legendHeight - 10, 8);
      ctx.fill();
      ctx.strokeStyle = '#e0e0e0';
      ctx.stroke();

      // Draw Legend Dots & Labels
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 12px "Noto Sans Thai", sans-serif';
      ctx.fillStyle = '#424242';
      ctx.fillText('ประเภทงาน:', 75, legendY + 20);

      const legendItems = [
        { label: 'กราฟิก', color: '#ff6b8b' },
        { label: 'วิดีโอ/Reel', color: '#ffa726' },
        { label: 'ถ่ายภาพ/Live', color: '#29b6f6' },
        { label: 'คอนเทนต์', color: '#66bb6a' },
        { label: 'ประชาสัมพันธ์', color: '#f57c00' },
        { label: 'นัดประชุม', color: '#ab47bc' }
      ];

      legendItems.forEach((item, index) => {
        const startX = 180 + (index * 160);
        ctx.beginPath();
        ctx.arc(startX, legendY + 20, 6, 0, Math.PI * 2);
        ctx.fillStyle = item.color;
        ctx.fill();

        ctx.fillStyle = '#616161';
        ctx.font = 'normal 12px "Noto Sans Thai", sans-serif';
        ctx.fillText(item.label, startX + 14, legendY + 20);
      });

      // 4. Draw Day Headers (จันทร์ - อาทิตย์)
      const dayY = legendY + legendHeight;
      const gridStartX = 57;
      
      ctx.fillStyle = '#e3f2fd';
      drawRoundRect(gridStartX, dayY, width - 114, dayHeaderHeight, 6);
      ctx.fill();

      const daysOfWeek = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 13px "Noto Sans Thai", sans-serif';
      ctx.fillStyle = '#1565c0';

      daysOfWeek.forEach((day, idx) => {
        const headerX = gridStartX + (idx * cellWidth) + (cellWidth / 2);
        ctx.fillText(day, headerX, dayY + (dayHeaderHeight / 2));
      });

      // 5. Draw Calendar Grid Cells
      const gridY = dayY + dayHeaderHeight + 5;
      const todayDate = new Date();
      const todayDay = todayDate.getDate();

      for (let idx = 0; idx < totalRows * 7; idx++) {
        const row = Math.floor(idx / 7);
        const col = idx % 7;
        const cellX = gridStartX + (col * cellWidth);
        const cellY = gridY + (row * cellHeight);

        // Draw Cell Borders & Backgrounds
        ctx.strokeStyle = '#cfd8dc';
        ctx.lineWidth = 1;
        ctx.strokeRect(cellX, cellY, cellWidth, cellHeight);

        const isDayInMonth = idx >= firstDayAdjusted && idx < firstDayAdjusted + daysInMonth;

        if (!isDayInMonth) {
          // Empty days (outside month boundary)
          ctx.fillStyle = '#eceff1';
          ctx.fillRect(cellX + 1, cellY + 1, cellWidth - 2, cellHeight - 2);
        } else {
          // Inside month
          const dayNum = idx - firstDayAdjusted + 1;
          const isToday = yr === todayDate.getFullYear() && mo === todayDate.getMonth() && dayNum === todayDay;

          ctx.fillStyle = '#ffffff';
          ctx.fillRect(cellX + 1, cellY + 1, cellWidth - 2, cellHeight - 2);

          // Draw Day Number
          if (isToday) {
            // Highlight today number with a cyan circle
            ctx.beginPath();
            ctx.arc(cellX + cellWidth - 16, cellY + 14, 10, 0, Math.PI * 2);
            ctx.fillStyle = '#00bcd4';
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 11px "Noto Sans Thai", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(dayNum), cellX + cellWidth - 16, cellY + 14);
          } else {
            ctx.fillStyle = '#455a64';
            ctx.font = 'normal 12px "Noto Sans Thai", sans-serif';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'top';
            ctx.fillText(String(dayNum), cellX + cellWidth - 8, cellY + 8);
          }

          // Fetch and Draw Tasks for this date
          const dateStr = `${yr}-${String(mo + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
          const dayTasks = tasks.filter(t => t.dueDate === dateStr);

          // Draw up to 3 task items in this cell
          dayTasks.slice(0, 3).forEach((task, tIdx) => {
            const taskY = cellY + 28 + (tIdx * 28);
            const typeColor = AV_TYPE_COLORS[task.type] || '#ff6b8b';

            const isDone = task.status === 'done';
            if (isDone) {
              ctx.globalAlpha = 0.45;
            }

            // Background pill
            ctx.fillStyle = typeColor;
            drawRoundRect(cellX + 5, taskY, cellWidth - 10, 24, 4);
            ctx.fill();

            // Text
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 10px "Noto Sans Thai", sans-serif';

            let displayName = isDone ? `✓ ${task.title}` : task.title;
            const maxTextWidth = cellWidth - 20;

            if (ctx.measureText(displayName).width > maxTextWidth) {
              while (ctx.measureText(displayName + '...').width > maxTextWidth) {
                displayName = displayName.slice(0, -1);
              }
              displayName += '...';
            }

            ctx.fillText(displayName, cellX + 10, taskY + 12);
            if (isDone) {
              ctx.globalAlpha = 1.0;
            }
          });

          // If there are more than 3 tasks, draw an indicator (e.g. "+2 งาน")
          if (dayTasks.length > 3) {
            ctx.fillStyle = '#e53935';
            drawRoundRect(cellX + 5, cellY + cellHeight - 18, 50, 14, 3);
            ctx.fill();

            ctx.textAlign = 'center';
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 9px "Noto Sans Thai", sans-serif';
            ctx.fillText(`+${dayTasks.length - 3} งาน`, cellX + 30, cellY + cellHeight - 11);
          }
        }
      }

      // 6. Draw Footer Watermark
      const footerY = height - 45;
      ctx.strokeStyle = '#b0bec5';
      ctx.beginPath();
      ctx.moveTo(57, footerY - 10);
      ctx.lineTo(width - 57, footerY - 10);
      ctx.stroke();

      ctx.fillStyle = '#78909c';
      ctx.font = 'normal 11px "Noto Sans Thai", sans-serif';
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillText('ฝ่ายโสตทัศนศึกษา | Student Council Portal SWSC69', 57, footerY);

      ctx.textAlign = 'right';
      ctx.fillText('ตารางคิวงานแบบปฏิทิน ใช้ประสานงานและส่งคิวเผยแพร่ภายในสภานักเรียนเท่านั้น', width - 57, footerY);

      // Trigger download
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `AV_Calendar_Summary_${yr}_${mo + 1}.png`;
      link.href = dataUrl;
      link.click();
    };
  };

  const statusKeys = Object.keys(STATUS_CFG);
  const filtered   = tasks.filter(t => t.title.includes(search) || t.assignee.includes(search));

  const NEXT = { backlog:'designing', designing:'wait_pr', wait_pr:'done', done:null };

  return (
    <div>
      <div className="page-header" style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div>
          <div className="page-title">🎬 ฝ่ายโสตทัศนศึกษา</div>
          <div className="page-subtitle">คิดคอนเทนต์ ทำกราฟิก/วิดีโอ/ถ่ายภาพ และส่งงานให้ฝ่าย PR ใส่แคปชั่น</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-outline" onClick={exportMonthTasksPNG} style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, padding:'7px 12px' }}>
            <Camera size={14}/> 📸 สรุปคิวงานเดือนนี้ (PNG)
          </button>
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={14}/> วางแผนคอนเทนต์
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-row" style={{ marginBottom:16 }}>
        {statusKeys.map(k => {
          const s = STATUS_CFG[k]; const count = tasks.filter(t=>t.status===k).length;
          return (
            <div key={k} className="stat-box">
              <div className="stat-icon-box" style={{ background:s.bg, fontSize:16 }}>
                {k==='backlog'?'💡':k==='designing'?'✏️':k==='wait_pr'?'📢':'✅'}
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
        <button className={`tab-btn${tab==='certificates'?' active':''}`} onClick={()=>setTab('certificates')}>🎓 อัปโหลดเกียรติบัตร</button>
        <button className={`tab-btn${tab==='news'?' active':''}`} onClick={()=>setTab('news')}>📰 ส่งข่าวประชาสัมพันธ์</button>
        <button className={`tab-btn${tab==='obec'?' active':''}`} onClick={()=>setTab('obec')}>📚 จัดการ Obec Line</button>
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
                      {t.caption && (
                        <div style={{ fontSize:10, color:'#f57f17', marginBottom:6, background:'#fff9c4', padding:'4px 6px', borderRadius:4, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={t.caption}>
                          💬 {t.caption}
                        </div>
                      )}
                      {getGraphicUrl(t.note) && (
                        <div style={{ marginTop: 4, marginBottom: 6 }}>
                          <a href={getGraphicUrl(t.note)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4, color: '#1565c0', textDecoration: 'none', fontWeight: 600 }}>
                            🖼️ ดูรูปภาพกราฟิก
                          </a>
                        </div>
                      )}
                      <div style={{ display:'flex', gap:3 }}>
                        <button onClick={()=>openEdit(t)} style={{ flex:1, fontSize:10, padding:'3px 0', border:'1px solid #e0e0e0', borderRadius:3, background:'#f5f5f5', cursor:'pointer', fontFamily:'inherit' }} title="แก้ไข">✏️</button>
                        <button onClick={()=>handleDeleteTask(t.id)} style={{ flex:1, fontSize:10, padding:'3px 0', border:'1px solid #ffcdd2', borderRadius:3, background:'#ffebee', cursor:'pointer', color:'#d32f2f', fontFamily:'inherit' }} title="ลบ">🗑️</button>
                        {NEXT[k] && (
                          <button onClick={()=>handleTransition(t,NEXT[k])}
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

      {/* Certificates Bulk Upload */}
      {tab === 'certificates' && (
        <div style={{ background: '#ffffff', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 12, padding: 30, boxShadow: '0 4px 12px rgba(0,0,0,0.03)', marginBottom: 20 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 10, color: 'var(--purple-700)' }}>🎓 ซิงค์เกียรติบัตรจาก Google Drive</h2>
          <p style={{ color: 'var(--gray-500)', fontSize: 13, marginBottom: 25, lineHeight: 1.5 }}>
            ระบบนี้จะเชื่อมโยงเกียรติบัตรทั้งหมดในโฟลเดอร์ Google Drive ของคุณเข้าสู่ระบบของโรงเรียนแบบอัตโนมัติ<br/>
            <strong>ข้อแนะนำ:</strong> <br/>
            1. อัปโหลดไฟล์เกียรติบัตรลงในโฟลเดอร์ Google Drive และตั้งชื่อไฟล์ด้วยรหัสนักเรียน (เช่น <code>12345.pdf</code>)<br/>
            2. ตั้งค่าการแชร์โฟลเดอร์เป็น <strong>"Anyone with the link"</strong> (ทุกคนที่มีลิงก์สามารถดูได้)
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 600 }}>
            <div>
              <label className="form-label">ชื่อกิจกรรมของเกียรติบัตร *</label>
              <input 
                className="input-field" 
                placeholder="เช่น ค่ายวิทยาศาสตร์ ม.4 (2568)" 
                value={certEventName} 
                onChange={e => setCertEventName(e.target.value)} 
                disabled={syncingCerts}
              />
            </div>

            <div>
              <label className="form-label">ลิงก์โฟลเดอร์ Google Drive *</label>
              <input 
                className="input-field" 
                placeholder="เช่น https://drive.google.com/drive/folders/1YK1-fwPQnD..." 
                value={certFolderLink} 
                onChange={e => setCertFolderLink(e.target.value)} 
                disabled={syncingCerts}
              />
            </div>

            <button 
              className="btn btn-primary" 
              style={{ padding: '14px', fontSize: 15, fontWeight: 700, marginTop: 10, width: '100%' }}
              onClick={handleDriveSync}
              disabled={syncingCerts}
            >
              {syncingCerts ? '⏳ กำลังซิงค์ข้อมูลจาก Drive... ห้ามปิดหน้านี้' : '🚀 เริ่มดึงข้อมูลจากโฟลเดอร์'}
            </button>
          </div>
          
          {/* Certificate Sync History */}
          <div style={{ marginTop: 40, borderTop: '1px solid var(--border)', paddingTop: 20 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 15, color: 'var(--gray-700)' }}>🗂️ กิจกรรมที่มีเกียรติบัตรในระบบแล้ว</h3>
            {loadingCertHistory ? (
              <div style={{ color: 'var(--gray-500)', fontSize: 13 }}>กำลังโหลดข้อมูล...</div>
            ) : certHistory.length === 0 ? (
              <div style={{ color: 'var(--gray-500)', fontSize: 13 }}>ยังไม่มีเกียรติบัตรในระบบ</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 }}>
                {certHistory.map((h, i) => (
                  <div key={i} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 15, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--purple-700)', marginBottom: 4 }}>{h.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>อัปโหลดโดย {h.uploader} • {h.date}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                      <div style={{ background: '#e0e7ff', color: '#4338ca', padding: '4px 10px', borderRadius: 99, fontSize: 12, fontWeight: 700 }}>
                        {h.count} ใบ
                      </div>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <button onClick={() => handleRenameCertGroup(h.name)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--gray-500)' }}>✏️ แก้ไข</button>
                        <button onClick={() => handleDeleteCertGroup(h.name)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#e53935' }}>🗑️ ลบ</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* PR News Form & Management for AV */}
      {tab === 'news' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 20, marginBottom: 20 }}>
          {/* Form */}
          <div style={{ background: '#ffffff', border: '1px solid var(--border)', borderRadius: 12, padding: 25, boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20, color: 'var(--purple-700)', display: 'flex', alignItems: 'center', gap: 8 }}>
              {editingNewsId ? '✏️ แก้ไขข่าวประชาสัมพันธ์' : '📣 เพิ่มข่าวประชาสัมพันธ์'}
            </h2>
            <form onSubmit={handleSubmitNews} style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
              <div>
                <label className="form-label">หัวข้อข่าว *</label>
                <input 
                  type="text"
                  className="input-field" 
                  placeholder="เช่น ฝนตกใหม่ ๆ ทำไมมีกลิ่นดิน" 
                  value={newsForm.headline} 
                  onChange={e => setNewsForm(p => ({ ...p, headline: e.target.value }))}
                  required
                />
              </div>

              <div>
                <label className="form-label">รายละเอียดข่าว *</label>
                <textarea 
                  className="input-field" 
                  placeholder="กรอกรายละเอียดเนื้อหาข่าวที่นี่..." 
                  value={newsForm.detail} 
                  onChange={e => setNewsForm(p => ({ ...p, detail: e.target.value }))}
                  style={{ minHeight: 120, resize: 'vertical', fontFamily: 'inherit', padding: '10px 12px' }}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="form-label">หมวดหมู่ข่าว</label>
                  <select 
                    className="select-field" 
                    value={newsForm.category} 
                    onChange={e => setNewsForm(p => ({ ...p, category: e.target.value }))}
                  >
                    <option value="ข่าวโรงเรียน">ข่าวโรงเรียน</option>
                    <option value="กิจกรรมสภา">กิจกรรมสภา</option>
                    <option value="ประกาศ">ประกาศ</option>
                    <option value="ข่าวชมรม">ข่าวชมรม</option>
                    <option value="อื่นๆ">อื่นๆ</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">กำหนดวันลงข่าว *</label>
                  <input 
                    type="date"
                    className="input-field" 
                    value={newsForm.forDate} 
                    onChange={e => setNewsForm(p => ({ ...p, forDate: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="form-label">🖼️ รูปภาพประกอบข่าว (แนะนำสัดส่วนปกติ 4:5)</label>
                <input 
                  type="file" 
                  accept="image/*"
                  className="input-field"
                  onChange={e => {
                    const file = e.target.files[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        setNewsForm(p => ({ ...p, imagePreview: reader.result, imageFile: file }));
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                />
                <span style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 4, display: 'block' }}>
                  💡 ระบบจะแสดงพรีวิวภาพในแบบ 4:5 เพื่อให้เห็นตัวอย่างภาพที่จะแสดงบนเว็บ
                </span>
                
                {newsForm.imagePreview && (
                  <div style={{ marginTop: 15, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ 
                      width: 120, 
                      height: 150, 
                      overflow: 'hidden', 
                      borderRadius: 6, 
                      border: '2px solid var(--purple-200)',
                      boxShadow: '0 4px 10px rgba(0,0,0,0.1)'
                    }}>
                      <img 
                        src={transformGoogleDriveUrl(newsForm.imagePreview)} 
                        alt="Preview" 
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                      />
                    </div>
                    <button 
                      type="button"
                      className="btn btn-sm"
                      style={{ background: '#e53935', color: 'white', border: 'none', padding: '5px 10px', borderRadius: 4, width: 120, fontSize: 12, cursor: 'pointer' }}
                      onClick={() => setNewsForm(p => ({ ...p, imagePreview: null, imageFile: null }))}
                    >
                      ลบรูปภาพ
                    </button>
                  </div>
                )}
              </div>

              {/* Supporting Images */}
              <div style={{ marginTop: 20 }}>
                <label className="form-label">📸 รูปภาพประกอบเพิ่มเติม (รูปประกอบ - เลือกได้หลายรูปพร้อมกัน)</label>
                <input 
                  type="file" 
                  accept="image/*"
                  multiple
                  className="input-field"
                  onChange={e => {
                    try {
                      const files = Array.from(e.target.files);
                      const newImages = files.map(file => ({
                        file,
                        preview: URL.createObjectURL(file)
                      }));
                      setNewsForm(p => ({ 
                        ...p, 
                        supportingImages: [...(p.supportingImages || []), ...newImages] 
                      }));
                    } catch (err) {
                      console.error("Error in supporting images onChange:", err);
                      alert("เกิดข้อผิดพลาดในการอ่านไฟล์ภาพประกอบ: " + err.message);
                    }
                  }}
                />
                
                {newsForm.supportingImages && newsForm.supportingImages.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
                    {newsForm.supportingImages.map((img, idx) => (
                      <div key={idx} style={{ position: 'relative', width: 80, height: 80, borderRadius: 6, overflow: 'hidden', border: '1px solid #ccc' }}>
                        <img 
                          src={transformGoogleDriveUrl(img.preview)} 
                          alt="preview" 
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                        />
                        <button 
                          type="button" 
                          style={{ 
                            position: 'absolute', 
                            top: 2, right: 2, 
                            background: 'rgba(229, 57, 53, 0.9)', 
                            color: 'white', 
                            border: 'none', 
                            borderRadius: '50%', 
                            width: 18, height: 18, 
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 11,
                            lineHeight: 1
                          }}
                          onClick={() => {
                            setNewsForm(p => ({
                              ...p,
                              supportingImages: p.supportingImages.filter((_, i) => i !== idx)
                            }));
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                {editingNewsId && (
                  <button 
                    type="button" 
                    className="btn btn-gray"
                    onClick={() => {
                      setEditingNewsId(null);
                      setNewsForm({ headline: '', detail: '', category: 'ข่าวโรงเรียน', forDate: '', imagePreview: null, imageFile: null, supportingImages: [] });
                    }}
                    style={{ flex: 1 }}
                  >
                    ยกเลิก
                  </button>
                )}
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={submittingNews}
                  style={{ flex: 2, padding: '12px' }}
                >
                  {submittingNews ? '⏳ กำลังบันทึก...' : (editingNewsId ? '💾 บันทึกการแก้ไข' : '🚀 ส่งข่าวขึ้นเว็บไซต์')}
                </button>
              </div>
            </form>
          </div>

          {/* List / History */}
          <div style={{ background: '#ffffff', border: '1px solid var(--border)', borderRadius: 12, padding: 25, boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20, color: 'var(--gray-700)' }}>🗂️ รายการข่าวบนเว็บไซต์</h2>
            
            {loadingNews ? (
              <div style={{ color: 'var(--gray-500)', fontSize: 14 }}>กำลังโหลดข้อมูล...</div>
            ) : newsList.length === 0 ? (
              <div style={{ color: 'var(--gray-500)', fontSize: 14 }}>ยังไม่มีการลงข่าวประชาสัมพันธ์บนเว็บไซต์</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', maxHeight: 600, paddingRight: 5 }}>
                {newsList.map(n => (
                  <div key={n.id} style={{ display: 'flex', gap: 15, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, position: 'relative' }}>
                    
                    {n.image_url && (
                      <div style={{ width: 60, height: 75, minWidth: 60, overflow: 'hidden', borderRadius: 4, border: '1px solid #e5e7eb' }}>
                        <img 
                          src={transformGoogleDriveUrl(n.image_url)} 
                          alt="Thumb" 
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                        />
                      </div>
                    )}

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <div>
                        <span className="badge badge-gray" style={{ fontSize: 10, background: '#e0e7ff', color: '#4338ca', border: 'none', marginBottom: 5 }}>{n.category}</span>
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#111827', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden', margin: '2px 0' }}>
                          {n.headline}
                        </div>
                        <div style={{ fontSize: 11, color: '#6b7280', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.4 }}>
                          {n.detail}
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, borderTop: '1px dashed #e5e7eb', paddingTop: 6, fontSize: 11, color: '#9ca3af' }}>
                        <span>📅 {n.for_date}</span>
                        <div style={{ display: 'flex', gap: 10 }}>
                          <button onClick={() => handleEditNews(n)} style={{ background: 'none', border: 'none', color: '#4b5563', fontWeight: 600, cursor: 'pointer' }}>✏️ แก้ไข</button>
                          <button onClick={() => handleDeleteNews(n.id)} style={{ background: 'none', border: 'none', color: '#dc2626', fontWeight: 600, cursor: 'pointer' }}>🗑️ ลบ</button>
                        </div>
                      </div>
                    </div>

                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Obec Line Form & Management for AV */}
      {tab === 'obec' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 20, marginBottom: 20 }}>
          {/* Form */}
          <div style={{ background: '#ffffff', border: '1px solid var(--border)', borderRadius: 12, padding: 25, boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20, color: 'var(--purple-700)', display: 'flex', alignItems: 'center', gap: 8 }}>
              {editingObecId ? '✏️ แก้ไขรูปภาพ Obec Line' : '📚 อัปโหลด Obec Line (A4 แนวตั้ง)'}
            </h2>
            <form onSubmit={handleSubmitObec} style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>


              <div>
                <label className="form-label">🖼️ รูปภาพวารสาร Obec Line * (แนะนำสัดส่วน A4 แนวตั้ง)</label>
                <input 
                  type="file" 
                  accept="image/*"
                  className="input-field"
                  onChange={e => {
                    const file = e.target.files[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        setObecForm(p => ({ ...p, imagePreview: reader.result, imageFile: file }));
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                  required={!editingObecId}
                />
                <span style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 4, display: 'block' }}>
                  💡 ระบบจะจัดเก็บและแสดงรูปภาพในอัตราส่วน A4 แนวตั้ง (1:1.414) เพื่อความสวยงามบนหน้าแรก
                </span>
                
                {obecForm.imagePreview && (
                  <div style={{ marginTop: 15, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ 
                      width: 140, 
                      aspectRatio: '1 / 1.414', 
                      overflow: 'hidden', 
                      borderRadius: 6, 
                      border: '2px solid var(--purple-200)',
                      boxShadow: '0 4px 10px rgba(0,0,0,0.1)'
                    }}>
                      <img 
                        src={transformGoogleDriveUrl(obecForm.imagePreview)} 
                        alt="A4 ratio preview" 
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                      />
                    </div>
                    <button 
                      type="button"
                      className="btn btn-sm"
                      style={{ background: '#e53935', color: 'white', border: 'none', padding: '5px 10px', borderRadius: 4, width: 140, fontSize: 12, cursor: 'pointer' }}
                      onClick={() => setObecForm(p => ({ ...p, imagePreview: null, imageFile: null }))}
                    >
                      ลบรูปภาพ
                    </button>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                {editingObecId && (
                  <button 
                    type="button" 
                    className="btn btn-gray"
                    onClick={() => {
                      setEditingObecId(null);
                      setObecForm({ title: '', imagePreview: null, imageFile: null });
                    }}
                    style={{ flex: 1 }}
                  >
                    ยกเลิก
                  </button>
                )}
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={submittingObec}
                  style={{ flex: 2, padding: '12px' }}
                >
                  {submittingObec ? '⏳ กำลังบันทึก...' : (editingObecId ? '💾 บันทึกการแก้ไข' : '🚀 อัปโหลด Obec Line')}
                </button>
              </div>
            </form>
          </div>

          {/* List / History */}
          <div style={{ background: '#ffffff', border: '1px solid var(--border)', borderRadius: 12, padding: 25, boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20, color: 'var(--gray-700)' }}>🗂️ รายการ Obec Line ในระบบ</h2>
            
            {loadingObec ? (
              <div style={{ color: 'var(--gray-500)', fontSize: 14 }}>กำลังโหลดข้อมูล...</div>
            ) : obecList.length === 0 ? (
              <div style={{ color: 'var(--gray-500)', fontSize: 14 }}>ยังไม่มีการอัปโหลด Obec Line</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', maxHeight: 600, paddingRight: 5 }}>
                {obecList.map(o => (
                  <div key={o.id} style={{ display: 'flex', gap: 15, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, alignItems: 'center' }}>
                    
                    {o.image_url && (
                      <div style={{ width: 55, height: 78, minWidth: 55, overflow: 'hidden', borderRadius: 4, border: '1px solid #e5e7eb' }}>
                        <img 
                          src={transformGoogleDriveUrl(o.image_url)} 
                          alt="Cover" 
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                        />
                      </div>
                    )}

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 6 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>
                          {o.title}
                        </div>
                        <a 
                          href={o.file_url} 
                          target="_blank" 
                          rel="noreferrer"
                          style={{ fontSize: 11, color: 'var(--purple-600)', textDecoration: 'underline', wordBreak: 'break-all', display: 'block', marginTop: 4 }}
                        >
                          เปิดลิงก์อ่านเอกสาร 🔗
                        </a>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#9ca3af', borderTop: '1px dashed #e5e7eb', paddingTop: 6 }}>
                        <span>📅 {new Date(o.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        <div style={{ display: 'flex', gap: 10 }}>
                          <button onClick={() => handleEditObec(o)} style={{ background: 'none', border: 'none', color: '#4b5563', fontWeight: 600, cursor: 'pointer' }}>✏️ แก้ไข</button>
                          <button onClick={() => handleDeleteObec(o.id)} style={{ background: 'none', border: 'none', color: '#dc2626', fontWeight: 600, cursor: 'pointer' }}>🗑️ ลบ</button>
                        </div>
                      </div>
                    </div>

                  </div>
                ))}
              </div>
            )}
          </div>
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
          <div style={{ background: '#ffffff', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, boxShadow: '0 4px 12px rgba(0,0,0,0.03)', marginBottom: 20 }}>
            {/* Legend Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
                📅 ปฏิทินคิวงานของทีม
              </div>
              
              {/* Legend Dots */}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-muted)' }}>
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
              <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text)' }}>{MONTHS_FULL[mo]} {yr + 543}</h2>
              
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={setMonthToToday} style={{ background: '#f5f5f7', color: '#212121', border: '1px solid #e5e5ea', padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>วันนี้</button>
                <button onClick={prevMonth} style={{ background: '#f5f5f7', color: '#212121', border: '1px solid #e5e5ea', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>&lt;</button>
                <button onClick={nextMonth} style={{ background: '#f5f5f7', color: '#212121', border: '1px solid #e5e5ea', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>&gt;</button>
              </div>
            </div>

            {/* Week Day Titles */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, marginBottom: 8, borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
              {['จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์', 'อาทิตย์'].map(day => (
                <div key={day} style={{ textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>
                  {day}
                </div>
              ))}
            </div>

            {/* Grid Cells */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, background: 'var(--border)', padding: 1, borderRadius: 8, overflow: 'hidden' }}>
              {/* Empty cells before the first day */}
              {Array.from({ length: firstDayAdjusted }).map((_, idx) => (
                <div key={`empty-${idx}`} style={{ background: '#f5f5f7', minHeight: 110 }} />
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
                    background: '#ffffff',
                    minHeight: 110,
                    padding: 6,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-start',
                    border: isToday ? '1.5px solid var(--primary)' : 'none'
                  }}>
                    {/* Day number */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
                      <span style={{
                        fontSize: 12,
                        fontWeight: isToday ? 700 : 400,
                        color: isToday ? 'var(--primary)' : '#6e6e73',
                        background: isToday ? 'var(--primary-light)' : 'transparent',
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
                            lineHeight: 1.2,
                            opacity: t.status === 'done' ? 0.55 : 1
                          }}
                          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
                          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
                            <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {t.status === 'done' ? `✓ ${t.title}` : t.title}
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
                        {t.caption && (
                          <div style={{ fontSize:11, color:'#f57f17', marginTop:3 }}>
                            💬 แคปชั่น: <span style={{ color: '#555' }}>{t.caption}</span> {t.song && <span style={{ color: '#777', marginLeft: 8 }}>🎵 {t.song}</span>}
                          </div>
                        )}
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
              <div>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  🖼️ รูปภาพกราฟิก (ถ้ามี)
                </label>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 6 }}>
                  <button 
                    type="button" 
                    className="btn btn-gray btn-sm" 
                    onClick={() => document.getElementById('modal-graphic-input').click()}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
                  >
                    <Camera size={14} /> เลือกรูปภาพ
                  </button>
                  <input
                    id="modal-graphic-input"
                    type="file"
                    accept="image/*,video/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (file) {
                        if (file.size > 15 * 1024 * 1024) {
                          alert("ไฟล์มีขนาดใหญ่เกินไป (สูงสุด 15MB) กรุณาใช้ไฟล์วิดีโอที่สั้นลง หรือนำลิงก์ Drive มาใส่ในช่องด้านล่างแทน");
                          return;
                        }
                        const reader = new FileReader();
                        reader.onloadend = () => {
                          setModalGraphicPreview(reader.result);
                        };
                        reader.readAsDataURL(file);
                        setModalGraphicFile(file);
                      }
                    }}
                  />
                  {modalGraphicPreview && (
                    <button 
                      type="button" 
                      className="btn btn-danger btn-sm" 
                      onClick={() => { setModalGraphicPreview(null); setModalGraphicFile(null); }}
                      style={{ background: '#d32f2f', padding: '4px 8px', fontSize: 11 }}
                    >
                      ลบไฟล์
                    </button>
                  )}
                </div>
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 11, color: '#757575' }}>หรือใส่ลิงก์ Google Drive โดยตรง:</span>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="https://drive.google.com/file/d/..."
                    value={modalGraphicPreview && !modalGraphicPreview.startsWith('data:') ? modalGraphicPreview : ''}
                    onChange={(e) => {
                      const val = e.target.value.trim();
                      setModalGraphicPreview(val || null);
                      setModalGraphicFile(null);
                    }}
                    style={{ fontSize: 12, padding: '6px 10px' }}
                  />
                </div>
                {modalGraphicPreview && (
                  <div style={{ marginTop: 10, textAlign: 'center' }}>
                    {isVideo(modalGraphicPreview) ? (
                      modalGraphicPreview.startsWith('data:') ? (
                        <video src={modalGraphicPreview} controls style={{ maxWidth: '100%', maxHeight: 150, borderRadius: 6, border: '1px solid #e5e5ea' }} />
                      ) : (
                        <iframe src={getDrivePreviewUrl(modalGraphicPreview)} style={{ width: '100%', height: 200, border: 'none', borderRadius: 6 }} allow="autoplay" />
                      )
                    ) : (
                      <img 
                        src={transformGoogleDriveUrl(modalGraphicPreview)} 
                        alt="Graphic Preview" 
                        style={{ maxWidth: '100%', maxHeight: 150, borderRadius: 6, border: '1px solid #e5e5ea', objectFit: 'contain', cursor: 'pointer' }} 
                        onClick={() => !modalGraphicPreview.startsWith('data:') && window.open(modalGraphicPreview, '_blank')}
                        title={modalGraphicPreview.startsWith('data:') ? 'พรีวิวรูปภาพใหม่' : 'คลิกเพื่อดูรูปภาพขนาดเต็ม'}
                      />
                    )}
                  </div>
                )}
              </div>
              {editTask && (form.caption || form.song) && (
                <div style={{ background: '#f5f5f7', padding: '10px 12px', borderRadius: 8, border: '1px solid #e5e5ea', marginTop: 4 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#f57f17', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                    📢 ข้อความจาก PR (แคปชั่นและเพลง)
                  </div>
                  {form.caption && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 11, color: '#8e8e93', fontWeight: 600 }}>✍️ แคปชั่นที่โพสต์:</div>
                      <div style={{ fontSize: 12, whiteSpace: 'pre-wrap', color: '#1c1c1e', lineHeight: 1.4, userSelect: 'all', background: 'white', padding: '6px 8px', borderRadius: 4, border: '1px solid #e5e5ea', marginTop: 2 }}>
                        {form.caption}
                      </div>
                    </div>
                  )}
                  {form.song && (
                    <div>
                      <div style={{ fontSize: 11, color: '#8e8e93', fontWeight: 600 }}>🎵 เพลงประกอบ:</div>
                      <div style={{ fontSize: 12, color: '#1c1c1e', background: 'white', padding: '4px 8px', borderRadius: 4, border: '1px solid #e5e5ea', marginTop: 2, display: 'inline-block' }}>
                        {form.song}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {editTask ? (
                <button className="btn btn-danger" onClick={() => { handleDeleteTask(editTask.id); setModal(false); }} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Trash2 size={14}/> ลบงาน
                </button>
              ) : <div />}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-gray" onClick={()=>setModal(false)}>ยกเลิก</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={!form.title||!form.dueDate}><Save size={14}/> บันทึก</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload Graphic Modal */}
      {uploadModalTask && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&!uploadingGraphic&&setUploadModalTask(null)}>
          <div className="modal-box" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <span style={{ fontWeight: 700, fontSize: 15 }}>📤 อัปโหลดไฟล์กราฟิก/วิดีโอ (ก่อนส่งให้ PR)</span>
              <button onClick={() => !uploadingGraphic&&setUploadModalTask(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9e9e9e' }}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 13, color: '#616161' }}>ชื่องาน: <strong>{uploadModalTask.title}</strong></div>
              <div style={{ border: '2px dashed #ccc', borderRadius: 8, padding: 24, textAlign: 'center', cursor: 'pointer', background: '#fafafa', position: 'relative' }} onClick={() => document.getElementById('graphic-upload-input').click()}>
                <Camera size={28} style={{ color: '#9e9e9e', marginBottom: 8 }} />
                <div style={{ fontSize: 12, color: '#757575' }}>คลิกเพื่ออัปโหลดรูปภาพหรือวิดีโอ *</div>
                <input
                  id="graphic-upload-input"
                  type="file"
                  accept="image/*,video/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) {
                      if (file.size > 15 * 1024 * 1024) {
                        alert("ไฟล์มีขนาดใหญ่เกินไป (สูงสุด 15MB) กรุณาใช้ไฟล์วิดีโอที่สั้นลง หรือนำลิงก์ Drive มาใส่ในช่องด้านล่างแทน");
                        return;
                      }
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        setGraphicPreview(reader.result);
                      };
                      reader.readAsDataURL(file);
                      setGraphicFile(file);
                    }
                  }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#616161' }}>หรือใส่ลิงก์ Google Drive โดยตรง:</span>
                <input
                  type="text"
                  className="input-field"
                  placeholder="https://drive.google.com/file/d/..."
                  value={graphicPreview && !graphicPreview.startsWith('data:') ? graphicPreview : ''}
                  onChange={(e) => {
                    const val = e.target.value.trim();
                    setGraphicPreview(val || null);
                    setGraphicFile(null);
                  }}
                  style={{ fontSize: 12, padding: '6px 10px' }}
                />
              </div>
              {graphicPreview && (
                <div style={{ textAlign: 'center', marginTop: 8 }}>
                  {isVideo(graphicPreview) ? (
                    graphicPreview.startsWith('data:') ? (
                      <video src={graphicPreview} controls style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 6, border: '1px solid #e0e0e0' }} />
                    ) : (
                      <iframe src={getDrivePreviewUrl(graphicPreview)} style={{ width: '100%', height: 200, border: 'none', borderRadius: 6 }} allow="autoplay" />
                    )
                  ) : (
                    <img src={graphicPreview.startsWith('data:') ? graphicPreview : transformGoogleDriveUrl(graphicPreview)} alt="Graphic Preview" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 6, border: '1px solid #e0e0e0', objectFit: 'contain' }} />
                  )}
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn btn-gray" onClick={() => setUploadModalTask(null)} disabled={uploadingGraphic}>ยกเลิก</button>
              <button className="btn btn-primary" onClick={handleSaveGraphicAndMove} disabled={!graphicPreview || uploadingGraphic}>
                {uploadingGraphic ? '⏳ กำลังอัปโหลด...' : 'ส่งให้ PR'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
