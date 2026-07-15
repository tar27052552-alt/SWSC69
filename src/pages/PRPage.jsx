import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Plus, Edit2, Check, Clock, Trash2, CheckCircle, XCircle, Info, Calendar, Sparkles, Save, X, Music, Send } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { sendDiscordEmbedViaGAS } from '../lib/discordWebhook';
import { transformGoogleDriveUrl } from '../lib/googleDriveUpload';
// ----------------------------------------------------------------
// Tab 1: Caption Queue (งานกราฟิกจากโสตฯ รอใส่แคปชั่น)
// ----------------------------------------------------------------
const INIT_QUEUE = [];

// ----------------------------------------------------------------
// Tab 2: Daily News Inbox (กล่องรับข่าวรายวันจากเวรส่งข่าว)
// ----------------------------------------------------------------
const NEWS_CATEGORIES = ['ข่าวโรงเรียน', 'กิจกรรมสภา', 'ประกาศ', 'ข่าวชมรม', 'อื่นๆ'];

// หา duty member ของ "พรุ่งนี้" (ต้องกรอกข่าวก่อนวันที่เป็นเวร 1 วัน)
const DAY_MAP = { 0:'อาทิตย์', 1:'จันทร์', 2:'อังคาร', 3:'พุธ', 4:'พฤหัส', 5:'ศุกร์', 6:'เสาร์' };

const INIT_NEWS = [];

// ----------------------------------------------------------------
// COMPONENTS
// ----------------------------------------------------------------

const TagList = ({ names }) => (
  <div style={{ display:'flex', flexWrap:'wrap', gap:3 }}>
    {names.map((n,i) => (
      <span key={i} style={{
        background: n==='–' ? 'transparent' : '#e0f7fa',
        color: n==='–' ? '#bdbdbd' : '#00838f',
        border: n==='–' ? '1px dashed #e0e0e0' : '1px solid #b2ebf2',
        borderRadius:4, padding:'2px 8px', fontSize:12, fontWeight:600,
      }}>{n}</span>
    ))}
  </div>
);

const STATUS_MAP = {
  pending:  { label:'รอตรวจสอบ', badge:'badge-yellow', icon:'⏳' },
  approved: { label:'อนุมัติแล้ว', badge:'badge-green',  icon:'✅' },
  rejected: { label:'ไม่ผ่าน',    badge:'badge-red',    icon:'❌' },
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

// ================================================================
// MAIN PAGE
// ================================================================
const TABS = [
  { id:'caption',    label:'✍️ ใส่แคปชั่นกราฟิก' },
  { id:'news_inbox', label:'📬 ข่าวจากคนเวร' },
];

export default function PRPage() {
  const { user, isAdmin, isPresident } = useAuth();
  const isPR = user?.deptId === 5;
  // PR / admin = รับข่าวและอนุมัติได้ (ประธานไม่สามารถแก้ไข/อนุมัติได้ ได้แค่ดู)
  const canManageNews = isAdmin || isPR;

  const [nowDate, setNowDate] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      const d = new Date();
      if (d.getDate() !== nowDate.getDate() || d.getMonth() !== nowDate.getMonth() || d.getFullYear() !== nowDate.getFullYear()) {
        setNowDate(d);
      }
    }, 10000); // Check every 10 seconds for date change
    return () => clearInterval(interval);
  }, [nowDate]);

  const tomorrow = new Date(nowDate); tomorrow.setDate(nowDate.getDate() + 1);
  const tomorrowKey = DAY_MAP[tomorrow.getDay()];
  const tomorrowDateStr = tomorrow.toLocaleDateString('th-TH', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  // สัปดาห์คี่/คู่ตามวันพรุ่งนี้
  const isWeek1Tomorrow = Math.ceil(tomorrow.getDate() / 7) % 2 === 1;

  const [dutyMembers, setDutyMembers] = useState([]);
  const [hasDutyTomorrow, setHasDutyTomorrow] = useState(false);
  const [isMyDutyTomorrow, setIsMyDutyTomorrow] = useState(false);
  const [canSubmitNews, setCanSubmitNews] = useState(false);

  const [tab, setTab]     = useState('caption');
  // --- Caption tab state ---
  const [queue, setQueue] = useState(INIT_QUEUE);
  const [done,  setDone]  = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ caption:'', song:'' });

  // --- News inbox state ---
  const [news, setNews]         = useState(INIT_NEWS);
  const [showNewsForm, setShowNewsForm] = useState(false);
  const [newsForm, setNewsForm] = useState({ headline:'', detail:'', category:'ข่าวโรงเรียน' });
  const [newsFormError, setNewsFormError] = useState('');
  const [usersList, setUsersList] = useState([]);

  const loadPRData = async () => {
    try {
      // โหลด คิวแคปชั่น
      const { data: cData, error: cErr } = await supabase
        .from('pr_caption_queue')
        .select('*')
        .order('created_at', { ascending: false });

      // โหลด av_tasks เพื่อดึงลิงก์รูปภาพกราฟิก
      const { data: avData } = await supabase
        .from('av_tasks')
        .select('id, note');
      
      const graphicMap = {};
      if (avData) {
        avData.forEach(task => {
          const note = task.note || '';
          const match = note.match(/\[Graphic\]:\s*(https?:\/\/\S+)/);
          if (match) {
            graphicMap[task.id] = match[1];
          }
        });
      }

      if (!cErr && cData) {
        const mappedQueue = cData.filter(d => d.status === 'pending').map(d => ({
          id: d.id, title: d.title, type: d.type, platform: d.platform, dueDate: d.due_date, caption: d.caption, song: d.song, status: d.status,
          graphicUrl: graphicMap[d.id] || null
        }));
        const mappedDone = cData.filter(d => d.status === 'done').map(d => ({
          id: d.id, title: d.title, type: d.type, platform: d.platform, dueDate: d.due_date, caption: d.caption, song: d.song, status: d.status,
          graphicUrl: graphicMap[d.id] || null
        }));
        setQueue(mappedQueue);
        setDone(mappedDone);
      }

      // โหลด กล่องรับข่าวรายวัน
      const { data: nData, error: nErr } = await supabase
        .from('pr_news')
        .select('*')
        .order('created_at', { ascending: false });
      if (!nErr && nData) {
        setNews(nData.map(d => ({
          id: d.id,
          date: d.for_date,
          day: d.for_day,
          submitter: d.submitter,
          category: d.category,
          headline: d.headline,
          detail: d.detail,
          status: d.status,
          submittedAt: d.submitted_at
        })));
      }

      // โหลดรายชื่อผู้ใช้
      const { data: uData } = await supabase.from('users').select('id, nickname, name, dept_id, role');
      if (uData) {
        setUsersList(uData);
      }
    } catch (err) {
      console.error('Error loading PR data:', err);
    }
  };

  useEffect(() => {
    async function loadDuty() {
      try {
        const { data, error } = await supabase
          .from('schedules')
          .select('*')
          .eq('type', 'pr_news')
          .eq('day', tomorrowKey);
        let members = [];
        if (!error && data && data[0]) {
          const rowData = data[0].data; // has week1, week2
          members = isWeek1Tomorrow ? (rowData.week1 || []) : (rowData.week2 || []);
        }
        
        setDutyMembers(members);
        const hasDuty = members.length > 0 && members[0] !== '–';
        setHasDutyTomorrow(hasDuty);
        
        const myNickname = user?.nickname || '';
        const isMyDuty = hasDuty && members.some(n => n === myNickname);
        setIsMyDutyTomorrow(isMyDuty);
        
        setCanSubmitNews(isMyDuty || isAdmin || isPR);
      } catch (err) {
        console.error('Error loading PR news duty schedule:', err);
      }
    }
    loadDuty();
  }, [user, isAdmin, isPresident, isPR, tomorrowKey, isWeek1Tomorrow]);

  useEffect(() => {
    loadPRData();

    // Subscribe to realtime updates for both caption queue and news
    const channel = supabase
      .channel('pr-dashboard-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pr_caption_queue' },
        () => {
          loadPRData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pr_news' },
        () => {
          loadPRData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  /* ---------- Caption handlers ---------- */
  const openEdit = (item) => { setEditing(item.id); setForm({ caption:item.caption, song:item.song }); };
  const handleSave = async (id) => {
    const item = queue.find(q => q.id === id) || done.find(q => q.id === id);
    if (!item) return;
    const isDoneState = !!form.caption;

    try {
      const { error } = await supabase
        .from('pr_caption_queue')
        .update({
          caption: form.caption,
          song: form.song,
          status: isDoneState ? 'done' : 'pending'
        })
        .eq('id', id);
      if (error) throw error;

      // Update the corresponding task in av_tasks
      await supabase
        .from('av_tasks')
        .update({ status: isDoneState ? 'done' : 'wait_pr' })
        .eq('id', id);
      
      setQueue(prev => {
        const target = prev.find(q => q.id === id);
        if (!target) return prev;
        if (isDoneState) {
          setDone(d => [...d, { ...target, ...form, status:'done' }]);
          return prev.filter(q => q.id !== id);
        }
        return prev.map(q => q.id===id ? { ...q, ...form } : q);
      });

      // Notify Discord (pr channel)
      if (isDoneState) {
        const embedTitle = `📱 [แคปชั่น PR] เขียนแคปชั่นโพสต์ Social Media สำเร็จ`;
        const embedDesc = `งาน: **${item.title}** (${item.type} - ${item.platform})`;
        const fields = [
          { name: "แคปชั่นที่เขียน", value: form.caption, inline: false }
        ];
        if (form.song) {
          fields.push({ name: "เพลงประกอบ", value: form.song, inline: true });
        }
        
        const targetUserIds = usersList
          .filter(u => u.dept_id === 5 || u.dept_id === 9 || u.role === 'admin')
          .map(u => String(u.id));
        const imageEmbedUrl = (item.graphicUrl && !isVideo(item.graphicUrl)) ? transformGoogleDriveUrl(item.graphicUrl) : null;
        sendDiscordEmbedViaGAS(embedTitle, embedDesc, 15105570, fields, imageEmbedUrl, 'pr', targetUserIds.length > 0 ? targetUserIds : null);
      }
    } catch (err) {
      console.error('Error updating caption queue:', err);
      alert('เกิดข้อผิดพลาดในการบันทึกแคปชั่น: ' + err.message);
    }
    setEditing(null);
  };

  /* ---------- News handlers ---------- */
  const handleSubmitNews = async () => {
    if (!newsForm.headline.trim()) { setNewsFormError('กรุณากรอกหัวข่าว'); return; }
    const nowT = new Date();
    const subStr = nowT.toLocaleTimeString('th-TH', { hour:'2-digit', minute:'2-digit' });
    const newNews = {
      for_day: tomorrowKey,
      for_date: tomorrowDateStr,
      submitter: user?.nickname || user?.name || 'ไม่ระบุ',
      category: newsForm.category,
      headline: newsForm.headline.trim(),
      detail: newsForm.detail.trim(),
      status: 'pending',
      submitted_at: subStr
    };

    try {
      const { data, error } = await supabase
        .from('pr_news')
        .insert([newNews])
        .select();
      if (error) throw error;
      if (data && data[0]) {
        const inserted = {
          id: data[0].id,
          date: data[0].for_date,
          day: data[0].for_day,
          submitter: data[0].submitter,
          category: data[0].category,
          headline: data[0].headline,
          detail: data[0].detail,
          status: data[0].status,
          submittedAt: data[0].submitted_at
        };
        setNews(prev => [inserted, ...prev]);
      }
    } catch (err) {
      console.error('Error submitting daily news:', err);
      alert('เกิดข้อผิดพลาดในการส่งข่าว: ' + err.message);
    }
    setNewsForm({ headline:'', detail:'', category:'ข่าวโรงเรียน' });
    setNewsFormError('');
    setShowNewsForm(false);
  };

  const changeStatus = async (id, status) => {
    try {
      const { error } = await supabase
        .from('pr_news')
        .update({ status })
        .eq('id', id);
      if (error) throw error;

      // Find the news item details
      const newsItem = news.find(n => n.id === id);
      if (newsItem) {
        const statusText = status === 'approved' ? '🟢 อนุมัติการประกาศข่าว' : '🔴 ปฏิเสธข่าวประชาสัมพันธ์';
        const color = status === 'approved' ? 3066993 : 15158332;
        const embedTitle = `${statusText}`;
        const embedDesc = `ข่าวเสนอโดย **${newsItem.submitter}** สำหรับวัน**${newsItem.day}** (${newsItem.date})`;
        const fields = [
          { name: "หัวข้อข่าว", value: newsItem.headline, inline: false },
          { name: "หมวดหมู่", value: newsItem.category, inline: true },
          { name: "รายละเอียด", value: newsItem.detail || "(ไม่มีรายละเอียด)", inline: false }
        ];
        
        let targetUserIds = [];
        if (newsItem.submitter) {
          const foundUser = usersList.find(u => u.nickname === newsItem.submitter || u.name === newsItem.submitter);
          if (foundUser) {
            targetUserIds.push(String(foundUser.id));
          }
        }
        usersList
          .filter(u => u.dept_id === 5 || u.role === 'admin')
          .forEach(u => {
            const uid = String(u.id);
            if (!targetUserIds.includes(uid)) targetUserIds.push(uid);
          });
        sendDiscordEmbedViaGAS(embedTitle, embedDesc, color, fields, null, 'pr', targetUserIds.length > 0 ? targetUserIds : null);
      }

      setNews(prev => prev.map(n => n.id===id ? { ...n, status } : n));
    } catch (err) {
      console.error('Error changing news status:', err);
      alert('เกิดข้อผิดพลาดในการอัปเดตสถานะข่าว: ' + err.message);
    }
  };

  const deleteNews = async (id) => {
    try {
      const { error } = await supabase
        .from('pr_news')
        .delete()
        .eq('id', id);
      if (error) throw error;
      setNews(prev => prev.filter(n => n.id !== id));
    } catch (err) {
      console.error('Error deleting news:', err);
      alert('เกิดข้อผิดพลาดในการลบข่าว: ' + err.message);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-title">📢 ฝ่ายประชาสัมพันธ์</div>
        <div className="page-subtitle">จัดการแคปชั่นโพสต์ และรับข่าวที่คนเวรส่งมาให้ประกาศ</div>
      </div>

      {/* Tab bar */}
      <div className="tab-bar">
        {TABS.map(t => (
          <button key={t.id} className={`tab-btn${tab===t.id?' active':''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ============================================================
          TAB 1: Caption Queue
          ============================================================ */}
      {tab === 'caption' && (
        <>
          {/* Stats */}
          <div className="stats-row" style={{ marginBottom:16 }}>
            {[
              { label:'รอใส่แคปชั่น',  value: queue.length, bg:'#fff8e1', color:'#f57f17', icon:'⏳' },
              { label:'เสร็จ/โพสต์แล้ว', value: done.length, bg:'#e8f5e9', color:'#2e7d32', icon:'✅' },
            ].map(s => (
              <div key={s.label} className="stat-box">
                <div className="stat-icon-box" style={{ background:s.bg }}>{s.icon}</div>
                <div><div className="stat-value" style={{ color:s.color }}>{s.value}</div><div className="stat-label">{s.label}</div></div>
              </div>
            ))}
            <div className="stat-box" style={{ gridColumn:'span 2', background:'#e0f7fa', border:'1px solid #b2ebf2' }}>
              <div className="stat-icon-box" style={{ background:'#b2ebf2' }}>📌</div>
              <div style={{ fontSize:13, color:'#00838f', lineHeight:1.6 }}>
                <strong>หน้าที่ฝ่าย PR:</strong> รับกราฟิก/วิดีโอจากโสตฯ → คิดแคปชั่น → เลือกเพลงประกอบ → ส่งให้โพสต์
              </div>
            </div>
          </div>

          {/* รอใส่แคปชั่น */}
          <div className="card" style={{ marginBottom:16 }}>
            <div className="card-header">
              <span className="card-title">⏳ รอใส่แคปชั่น ({queue.length} รายการ)</span>
              <span style={{ fontSize:12, color:'#9e9e9e' }}>กราฟิกที่โสตฯ ทำเสร็จแล้ว รอ PR ดำเนินการ</span>
            </div>
            {queue.length === 0 ? (
              <div style={{ textAlign:'center', padding:'32px', color:'#9e9e9e' }}>🎉 ไม่มีรายการที่รอ — ทำเสร็จหมดแล้ว!</div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column' }}>
                {queue.map((item, i) => (
                  <div key={item.id} style={{ borderBottom: i<queue.length-1?'1px solid #f0f0f0':'none' }}>
                    <div style={{ padding:'14px 18px', display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
                      <div style={{ fontSize:22 }}>{item.type==='Reel'?'🎞️':item.type==='วิดีโอ'?'🎬':'🖼️'}</div>
                      {item.graphicUrl && (
                        <div>
                          {isVideo(item.graphicUrl) ? (
                            <div 
                              style={{ 
                                width:42, 
                                height:42, 
                                borderRadius:4, 
                                display:'flex', 
                                alignItems:'center', 
                                justifyContent:'center', 
                                background:'#efebe9', 
                                border:'1px solid #d7ccc8', 
                                cursor:'pointer',
                                fontSize:18
                              }}
                              onClick={() => window.open(item.graphicUrl, '_blank')}
                              title="คลิกเพื่อดูวิดีโอบน Google Drive"
                            >
                              🎬
                            </div>
                          ) : (
                            <img 
                              src={transformGoogleDriveUrl(item.graphicUrl)} 
                              alt="graphic preview" 
                              style={{ width:42, height:42, borderRadius:4, objectFit:'cover', border:'1px solid #e0e0e0', cursor:'pointer' }}
                              onClick={() => window.open(item.graphicUrl, '_blank')}
                              title="คลิกเพื่อดูรูปภาพขนาดเต็ม"
                            />
                          )}
                        </div>
                      )}
                      <div style={{ flex:1, minWidth:200 }}>
                        <div style={{ fontWeight:700, fontSize:14 }}>{item.title}</div>
                        <div style={{ fontSize:12, color:'#9e9e9e', marginTop:2 }}>
                          📱 {item.platform} · 📅 {new Date(item.dueDate).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'2-digit'})}
                        </div>
                      </div>
                      <span className="badge badge-yellow">⏳ รอแคปชั่น</span>
                      <button
                        className={`btn ${editing===item.id ? 'btn-gray' : 'btn-primary'} btn-sm`}
                        onClick={() => editing===item.id ? setEditing(null) : openEdit(item)}
                      >
                        {editing===item.id ? 'ยกเลิก' : '✍️ ใส่แคปชั่น'}
                      </button>
                    </div>
                    {editing === item.id && (
                      <div style={{ padding:'16px 18px', display:'flex', flexDirection:'column', gap:12, background:'#fafafa', borderTop:'1px solid #f0f0f0' }}>
                        {item.graphicUrl && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <span style={{ fontWeight: 600, fontSize: 13, color: '#424242' }}>🎬 พรีวิวสื่อประกอบ:</span>
                            <div style={{ display: 'flex', justifyContent: 'center', background: '#eaeaea', borderRadius: 8, padding: 8, border: '1px solid #ddd' }}>
                              {isVideo(item.graphicUrl) ? (
                                <iframe 
                                  src={getDrivePreviewUrl(item.graphicUrl)} 
                                  style={{ width: '100%', maxWidth: 480, height: 270, border: 'none', borderRadius: 6 }} 
                                  allow="autoplay" 
                                />
                              ) : (
                                <img 
                                  src={transformGoogleDriveUrl(item.graphicUrl)} 
                                  alt="Content Preview" 
                                  style={{ maxWidth: '100%', maxHeight: 250, borderRadius: 6, objectFit: 'contain' }} 
                                />
                              )}
                            </div>
                          </div>
                        )}
                        <div>
                          <label className="form-label">✍️ แคปชั่น *</label>
                          <textarea
                            className="input-field" rows={5}
                            placeholder={`เขียนแคปชั่นสำหรับ "${item.title}"...`}
                            value={form.caption}
                            onChange={e=>setForm(p=>({...p,caption:e.target.value}))}
                            style={{ resize:'vertical' }}
                          />
                        </div>
                        <div>
                          <label className="form-label" style={{ display:'flex', alignItems:'center', gap:6 }}>
                            <Music size={13}/> เพลงประกอบโพสต์
                          </label>
                          <input
                            className="input-field"
                            placeholder="เช่น ชื่อเพลง - ศิลปิน หรือ 'ไม่ใส่เพลง'"
                            value={form.song}
                            onChange={e=>setForm(p=>({...p,song:e.target.value}))}
                          />
                        </div>
                        <div style={{ display:'flex', gap:8 }}>
                          <button className="btn btn-gray" onClick={() => setEditing(null)}><X size={13}/> ยกเลิก</button>
                          <button className="btn btn-primary" onClick={() => handleSave(item.id)} disabled={!form.caption}>
                            <Save size={13}/> บันทึกและส่งโพสต์
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Done */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">✅ เสร็จแล้ว / โพสต์แล้ว ({done.length} รายการ)</span>
            </div>
            <div style={{ overflowX:'auto' }}>
              <table className="simple-table">
                <thead><tr><th>#</th><th>รูป</th><th>คอนเทนต์</th><th>แพลตฟอร์ม</th><th>แคปชั่น</th><th>เพลง</th><th>กำหนด</th></tr></thead>
                <tbody>
                  {done.map((item,i) => (
                    <tr key={item.id}>
                      <td style={{ color:'#9e9e9e', fontSize:12 }}>{i+1}</td>
                      <td>
                        {item.graphicUrl ? (
                          isVideo(item.graphicUrl) ? (
                            <span 
                              style={{ 
                                cursor:'pointer', 
                                fontSize:16,
                                display:'inline-block',
                                padding:'2px 6px',
                                background:'#efebe9',
                                border:'1px solid #d7ccc8',
                                borderRadius:4
                              }}
                              onClick={() => window.open(item.graphicUrl, '_blank')}
                              title="คลิกเพื่อดูวิดีโอบน Google Drive"
                            >
                              🎬 วิดีโอ
                            </span>
                          ) : (
                            <img 
                              src={transformGoogleDriveUrl(item.graphicUrl)} 
                              alt="graphic" 
                              style={{ width:30, height:30, borderRadius:4, objectFit:'cover', border:'1px solid #e0e0e0', cursor:'pointer' }}
                              onClick={() => window.open(item.graphicUrl, '_blank')}
                              title="คลิกเพื่อดูรูปภาพขนาดเต็ม"
                            />
                          )
                        ) : '-'}
                      </td>
                      <td style={{ fontWeight:600, fontSize:13 }}>{item.title}</td>
                      <td style={{ fontSize:12 }}>{item.platform}</td>
                      <td style={{ fontSize:12, color:'#424242', maxWidth:250 }}>
                        <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:250 }} title={item.caption}>{item.caption}</div>
                      </td>
                      <td style={{ fontSize:12, color:'#757575' }}>
                        {item.song ? <span>🎵 {item.song}</span> : <span style={{ color:'#bdbdbd' }}>–</span>}
                      </td>
                      <td style={{ fontSize:12, color:'#9e9e9e' }}>
                        {new Date(item.dueDate).toLocaleDateString('th-TH',{day:'numeric',month:'short'})}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {done.length===0 && <div style={{ textAlign:'center', padding:'24px', color:'#9e9e9e', fontSize:13 }}>ยังไม่มีโพสต์ที่เสร็จแล้ว</div>}
            </div>
          </div>
        </>
      )}

      {/* ============================================================
          TAB 2: News Inbox (รับข่าวรายวัน)
          ============================================================ */}
      {tab === 'news_inbox' && (
        <>
          {/* แจ้งเตือนคนในเวร */}
          {isMyDutyTomorrow && (
            <div style={{ background:'#e8f5e9', border:'1px solid #a5d6a7', borderRadius:6, padding:'10px 16px', marginBottom:14, fontSize:13, display:'flex', alignItems:'flex-start', gap:8 }}>
              <span style={{ fontSize:16 }}>🔔</span>
              <div>
                <strong>คุณมีเวรส่งข่าว{tomorrowKey}พรุ่งนี้!</strong> กรุณากรอกข่าวที่จะให้ PR ประกาศก่อนสิ้นวันนี้
                <div style={{ fontSize:11, color:'#388e3c', marginTop:2 }}>📌 กรอกข่าวก่อน 22.00 น. เพื่อให้ฝ่าย PR เตรียมประกาศทันตอนเช้า</div>
              </div>
            </div>
          )}

          {/* เวรพรุ่งนี้ + ปุ่มกรอกข่าว */}
          <div className="card" style={{ marginBottom:16, border:'1px solid #b2ebf2', background:'#e0f7fa' }}>
            <div style={{ padding:'14px 18px', display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
              <div style={{ fontSize:28 }}>📋</div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, fontSize:14, color:'#004d40' }}>
                  เวรส่งข่าว{tomorrowKey} — {tomorrowDateStr}
                </div>
                <div style={{ fontSize:12, color:'#00838f', marginTop:6 }}>
                  {hasDutyTomorrow
                    ? <><span style={{ marginRight:6 }}>ผู้รับผิดชอบหาข่าว:</span><TagList names={dutyMembers} /></>
                    : <span style={{ color:'#9e9e9e' }}>ไม่มีเวรส่งข่าวพรุ่งนี้ (วันหยุด)</span>
                  }
                </div>
                <div style={{ fontSize:11, color:'#0097a7', marginTop:4 }}>💡 คนในเวรเป็นผู้หาข่าว → กรอกส่งให้ PR → PR นำไปประกาศ</div>
              </div>
              {canSubmitNews ? (
                <button className="btn btn-primary" onClick={() => setShowNewsForm(v => !v)}>
                  <Send size={13}/> {showNewsForm ? 'ปิดฟอร์ม' : 'กรอกข่าวส่ง PR'}
                </button>
              ) : (
                <span style={{ fontSize:12, color:'#9e9e9e' }}>🔒 เฉพาะคนในเวรเท่านั้น</span>
              )}
            </div>

            {/* ฟอร์มส่งข่าว */}
            {showNewsForm && (
              <div style={{ padding:'0 18px 18px', display:'flex', flexDirection:'column', gap:12, borderTop:'1px solid #b2ebf2', background:'#f0fdff' }}>
                <div style={{ paddingTop:12, fontWeight:600, fontSize:13, color:'#004d40' }}>
                  📝 กรอกข่าวส่งให้ PR ประกาศ{tomorrowKey}พรุ่งนี้
                  <div style={{ fontSize:11, fontWeight:400, color:'#00838f', marginTop:2 }}>ข่าวนี้จะถูกส่งไปยัง PR เพื่อนำไปประกาศหน้าเสาธง</div>
                </div>

                <div>
                  <label className="form-label">ประเภทข่าว</label>
                  <select
                    className="input-field"
                    value={newsForm.category}
                    onChange={e => setNewsForm(p => ({ ...p, category:e.target.value }))}
                  >
                    {NEWS_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div>
                  <label className="form-label">หัวข่าว <span style={{ color:'#ef4444' }}>*</span></label>
                  <input
                    className="input-field"
                    placeholder="เช่น พรุ่งนี้โรงเรียนจัดกิจกรรม... / ประกาศจากฝ่ายวิชาการ..."
                    value={newsForm.headline}
                    onChange={e => { setNewsForm(p => ({ ...p, headline:e.target.value })); setNewsFormError(''); }}
                  />
                  {newsFormError && <div style={{ color:'#ef4444', fontSize:11, marginTop:3 }}>{newsFormError}</div>}
                </div>

                <div>
                  <label className="form-label">รายละเอียดเพิ่มเติม</label>
                  <textarea
                    className="input-field"
                    rows={3}
                    placeholder="รายละเอียดเพิ่มเติม เช่น เวลา สถานที่ หรือข้อมูลอื่นๆ..."
                    value={newsForm.detail}
                    onChange={e => setNewsForm(p => ({ ...p, detail:e.target.value }))}
                    style={{ resize:'vertical' }}
                  />
                </div>

                <div style={{ display:'flex', gap:8 }}>
                  <button className="btn btn-gray" onClick={() => { setShowNewsForm(false); setNewsFormError(''); }}>
                    <X size={13}/> ยกเลิก
                  </button>
                  <button className="btn btn-primary" onClick={handleSubmitNews}>
                    <Send size={13}/> ส่งข่าวสำหรับพรุ่งนี้
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* กล่องรับข่าว (PR เห็น + จัดการ) */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">📬 ข่าวจากคนเวร รอ PR ประกาศ ({news.length} รายการ)</span>
              <div style={{ display:'flex', gap:8, fontSize:11, color:'#9e9e9e', alignItems:'center' }}>
                {canManageNews && <span style={{ color:'#00838f' }}>✏️ PR: อนุมัติแล้วนำไปประกาศ</span>}
              </div>
            </div>

            {news.length === 0 ? (
              <div style={{ textAlign:'center', padding:'32px', color:'#9e9e9e' }}>📭 ยังไม่มีข่าวส่งมาวันนี้</div>
            ) : (
              <div>
                {news.map((item, i) => {
                  const s = STATUS_MAP[item.status];
                  return (
                    <div key={item.id} style={{ borderBottom: i<news.length-1?'1px solid #f0f0f0':'none', padding:'14px 18px' }}>
                      <div style={{ display:'flex', alignItems:'flex-start', gap:12, flexWrap:'wrap' }}>
                        {/* Meta */}
                        <div style={{ flex:1, minWidth:220 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
                            <span className={`badge ${s.badge}`}>{s.icon} {s.label}</span>
                            <span style={{ fontSize:11, background:'#f5f5f5', borderRadius:4, padding:'2px 8px', color:'#616161' }}>{item.category}</span>
                          </div>
                          <div style={{ fontWeight:700, fontSize:14 }}>{item.headline}</div>
                          {item.detail && (
                            <div style={{ fontSize:12, color:'#616161', marginTop:4 }}>{item.detail}</div>
                          )}
                          <div style={{ fontSize:11, color:'#9e9e9e', marginTop:6 }}>
                            📤 ส่งโดย <strong>{item.submitter}</strong> · {item.day} {item.date} เวลา {item.submittedAt}
                          </div>
                        </div>

                        {/* Actions (เฉพาะ PR / admin) */}
                        {canManageNews && (
                          <div style={{ display:'flex', gap:6, alignItems:'center', flexShrink:0 }}>
                            {item.status !== 'approved' && (
                              <button
                                className="btn btn-sm"
                                style={{ background:'#e8f5e9', color:'#2e7d32', border:'1px solid #a5d6a7' }}
                                onClick={() => changeStatus(item.id, 'approved')}
                              >
                                <CheckCircle size={12}/> อนุมัติ
                              </button>
                            )}
                            {item.status !== 'rejected' && (
                              <button
                                className="btn btn-sm"
                                style={{ background:'#ffeaea', color:'#c62828', border:'1px solid #ef9a9a' }}
                                onClick={() => changeStatus(item.id, 'rejected')}
                              >
                                <X size={12}/> ไม่ผ่าน
                              </button>
                            )}
                            <button
                              className="btn btn-sm btn-gray"
                              onClick={() => deleteNews(item.id)}
                              title="ลบ"
                            >
                              <Trash2 size={12}/>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
