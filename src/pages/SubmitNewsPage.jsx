import { useState, useEffect } from 'react';
import { Send, Trash2, Clock, CheckCircle, XCircle, Info, Calendar } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import { sendDiscordEmbedViaGAS } from '../lib/discordWebhook';

const NEWS_CATEGORIES = ['ข่าวโรงเรียน', 'กิจกรรมสภา', 'ประกาศ', 'ข่าวชมรม', 'อื่นๆ'];

const DAY_MAP = { 0:'อาทิตย์', 1:'จันทร์', 2:'อังคาร', 3:'พุธ', 4:'พฤหัส', 5:'ศุกร์', 6:'เสาร์' };

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
  pending:  { label:'รอตรวจสอบ', badge:'badge-yellow', icon:<Clock size={12} /> },
  approved: { label:'อนุมัติแล้ว', badge:'badge-green',  icon:<CheckCircle size={12} /> },
  rejected: { label:'ไม่ผ่าน',    badge:'badge-red',    icon:<XCircle size={12} /> },
};

export default function SubmitNewsPage() {
  const { user, isAdmin } = useAuth();
  const isPR = user?.deptId === 5;

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
  const isWeek1Tomorrow = Math.ceil(tomorrow.getDate() / 7) % 2 === 1;

  const [dutyMembers, setDutyMembers] = useState([]);
  const [hasDutyTomorrow, setHasDutyTomorrow] = useState(false);
  const [isMyDutyTomorrow, setIsMyDutyTomorrow] = useState(false);

  const [news, setNews] = useState([]);
  const [newsForm, setNewsForm] = useState({ headline:'', detail:'', category:'ข่าวโรงเรียน' });
  const [newsFormError, setNewsFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [usersList, setUsersList] = useState([]);

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
      } catch (err) {
        console.error('Error loading PR news duty schedule:', err);
      }
    }
    loadDuty();
  }, [user, tomorrowKey, isWeek1Tomorrow]);

  const loadNewsData = async () => {
    try {
      const { data, error } = await supabase
        .from('pr_news')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) {
        setNews(data.map(d => ({
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
      console.error('Error loading PR news:', err);
    }
  };

  useEffect(() => {
    loadNewsData();

    // Subscribe to realtime updates for news
    const channel = supabase
      .channel('pr-news-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pr_news' },
        () => {
          loadNewsData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleSubmitNews = async () => {
    if (!newsForm.headline.trim()) { 
      setNewsFormError('กรุณากรอกหัวข่าว'); 
      return; 
    }

    setSubmitting(true);
    const nowT = new Date();
    const subStr = nowT.toLocaleTimeString('th-TH', { hour:'2-digit', minute:'2-digit' });
    const nicknameOrName = user?.nickname || user?.name || 'ไม่ระบุ';
    
    const newNews = {
      for_day: tomorrowKey,
      for_date: tomorrowDateStr,
      submitter: nicknameOrName,
      category: newsForm.category,
      headline: newsForm.headline.trim(),
      detail: newsForm.detail.trim(),
      status: 'pending',
      submitted_at: subStr
    };

    try {
      const { error } = await supabase
        .from('pr_news')
        .insert([newNews]);
      if (error) throw error;
      
      // Notify Discord (pr channel)
      const embedTitle = `📝 มีการเสนอข่าวประชาสัมพันธ์ใหม่`;
      const embedDesc = `ส่งข่าวโดย **${nicknameOrName}** เพื่อประกาศ in วัน**${tomorrowKey}** (${tomorrowDateStr})`;
      const fields = [
        { name: "หัวข่าว", value: newsForm.headline.trim(), inline: false },
        { name: "หมวดหมู่", value: newsForm.category, inline: true },
        { name: "รายละเอียด", value: newsForm.detail.trim() || "(ไม่มีรายละเอียด)", inline: false }
      ];
      
      const targetUserIds = usersList
        .filter(u => u.dept_id === 5 || u.role === 'admin')
        .map(u => String(u.id));
      sendDiscordEmbedViaGAS(embedTitle, embedDesc, 3447003, fields, null, 'pr', targetUserIds.length > 0 ? targetUserIds : null);
      
      alert('ส่งข่าวประชาสัมพันธ์เรียบร้อยแล้ว');
      setNewsForm({ headline:'', detail:'', category:'ข่าวโรงเรียน' });
      setNewsFormError('');
      loadNewsData();
    } catch (err) {
      console.error('Error submitting daily news:', err);
      alert('เกิดข้อผิดพลาดในการส่งข่าว: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const deleteNews = async (id) => {
    if (!window.confirm('คุณแน่ใจหรือไม่ที่จะยกเลิกข่าวประชาสัมพันธ์นี้?')) return;
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

  const nicknameOrName = user?.nickname || user?.name || '';
  const mySubmissions = news.filter(item => item.submitter === nicknameOrName);
  const tomorrowSubmissions = news.filter(item => item.date === tomorrowDateStr);

  return (
    <div>
      <div className="page-header">
        <div className="page-title">📝 ส่งข่าวประชาสัมพันธ์</div>
        <div className="page-subtitle">สำหรับเวรหาข่าวหรือคณะกรรมการที่ต้องการประชาสัมพันธ์ข่าวสารในวันพรุ่งนี้</div>
      </div>

      {/* แจ้งเตือนคนในเวร */}
      {isMyDutyTomorrow && (
        <div style={{ 
          background:'#e8f5e9', 
          border:'1px solid #a5d6a7', 
          borderRadius:8, 
          padding:'14px 20px', 
          marginBottom:16, 
          fontSize:14, 
          display:'flex', 
          alignItems:'flex-start', 
          gap:12,
          boxShadow: '0 2px 8px rgba(46, 125, 50, 0.05)'
        }}>
          <span style={{ fontSize:20 }}>🔔</span>
          <div>
            <strong style={{ color: '#1b5e20' }}>คุณมีเวรส่งข่าววันพรุ่งนี้ ({tomorrowKey})!</strong> 
            <div style={{ fontSize:12, color:'#2e7d32', marginTop:4 }}>
              กรุณากรอกข่าวที่จะให้ PR นำไปประกาศหน้าเสาธงก่อน 22.00 น. ของวันนี้
            </div>
          </div>
        </div>
      )}

      {/* แถบเวรพรุ่งนี้ */}
      <div className="card" style={{ marginBottom:16, border:'1px solid #b2ebf2', background:'#e0f7fa' }}>
        <div style={{ padding:'16px 20px', display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
          <div style={{ fontSize:28 }}>📋</div>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:700, fontSize:15, color:'#004d40', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Calendar size={16} /> เวรส่งข่าววัน{tomorrowKey} — {tomorrowDateStr}
            </div>
            <div style={{ fontSize:13, color:'#00838f', marginTop:8, display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
              {hasDutyTomorrow ? (
                <>
                  <span>ผู้รับผิดชอบหาข่าวพรุ่งนี้:</span>
                  <TagList names={dutyMembers} />
                </>
              ) : (
                <span style={{ color:'#78909c' }}>ไม่มีเวรส่งข่าวพรุ่งนี้ (วันหยุด/ไม่มีตารางเวร)</span>
              )}
            </div>
            <div style={{ fontSize:12, color:'#0097a7', marginTop:6, display:'flex', alignItems:'center', gap:4 }}>
              <Info size={12} /> <span>คนในเวรมีหน้าที่หาข่าวส่งให้ PR → PR นำไปตรวจสอบและประกาศในเช้าวันพรุ่งนี้</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, alignItems: 'start' }}>
        {/* ฟอร์มส่งข่าว */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">📝 แบบฟอร์มส่งข่าว PR สำหรับวันพรุ่งนี้</span>
          </div>
          {isMyDutyTomorrow || isPR || isAdmin ? (
            <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:14 }}>
              <div>
                <label className="form-label">ประเภทข่าว <span style={{ color:'#ef4444' }}>*</span></label>
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
                  placeholder="เช่น พรุ่งนี้โรงเรียนจัดกิจกรรม... / ประกาศด่วน..."
                  value={newsForm.headline}
                  onChange={e => { setNewsForm(p => ({ ...p, headline:e.target.value })); setNewsFormError(''); }}
                />
                {newsFormError && <div style={{ color:'#ef4444', fontSize:12, marginTop:4 }}>{newsFormError}</div>}
              </div>

              <div>
                <label className="form-label">รายละเอียดเพิ่มเติม</label>
                <textarea
                  className="input-field"
                  rows={4}
                  placeholder="รายละเอียด เช่น เวลา สถานที่ ขั้นตอน หรือข้อมูลสำคัญเพิ่มเติม..."
                  value={newsForm.detail}
                  onChange={e => setNewsForm(p => ({ ...p, detail:e.target.value }))}
                  style={{ resize:'vertical' }}
                />
              </div>

              <button 
                className="btn btn-primary" 
                onClick={handleSubmitNews} 
                disabled={submitting}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                <Send size={14}/> {submitting ? 'กำลังส่ง...' : 'ส่งข่าวประชาสัมพันธ์'}
              </button>
            </div>
          ) : (
            <div style={{ padding:'28px 20px', textAlign:'center', display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}>
              <div style={{ fontSize:40 }}>🔒</div>
              <div style={{ fontWeight:600, fontSize:15, color:'#37474f' }}>
                เฉพาะผู้ที่มีเวรส่งข่าววันพรุ่งนี้ หรือ PR/Admin เท่านั้น
              </div>
              <div style={{ fontSize:12, color:'#78909c', lineHeight:1.5, maxWidth:280, margin:'0 auto' }}>
                ระบบส่งข่าวประชาสัมพันธ์นี้ สงวนสิทธิ์ไว้เฉพาะผู้รับผิดชอบเวรหาข่าววันพรุ่งนี้ หรือสมาชิกฝ่ายประชาสัมพันธ์ และผู้ดูแลระบบเท่านั้น
              </div>
            </div>
          )}
        </div>

        {/* ประวัติข่าวของคุณ */}
        <div style={{ display:'flex', flexDirection:'column', gap: 16 }}>
          <div className="card">
            <div className="card-header">
              <span className="card-title">👤 ข่าวที่คุณส่งล่าสุด ({mySubmissions.length})</span>
            </div>
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {mySubmissions.length === 0 ? (
                <div style={{ textAlign:'center', padding:'32px', color:'#9e9e9e', fontSize:13 }}>
                  ยังไม่มีประวัติการส่งข่าวสารของคุณ
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column' }}>
                  {mySubmissions.map((item, i) => {
                    const s = STATUS_MAP[item.status] || STATUS_MAP.pending;
                    return (
                      <div 
                        key={item.id} 
                        style={{ 
                          padding:'12px 16px', 
                          borderBottom: i < mySubmissions.length - 1 ? '1px solid #f0f0f0' : 'none',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          gap: 12
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <span className={`badge ${s.badge}`} style={{ display:'flex', alignItems:'center', gap:4, padding:'2px 6px', fontSize:11 }}>
                              {s.icon} {s.label}
                            </span>
                            <span style={{ fontSize:11, color:'#757575', background:'#f5f5f5', borderRadius:4, padding:'1px 6px' }}>
                              {item.category}
                            </span>
                          </div>
                          <div style={{ fontWeight:600, fontSize:13, wordBreak: 'break-word' }}>{item.headline}</div>
                          {item.detail && <div style={{ fontSize:12, color:'#616161', marginTop:2, wordBreak: 'break-word' }}>{item.detail}</div>}
                          <div style={{ fontSize:11, color:'#9e9e9e', marginTop:4 }}>
                            ส่งสำหรับวัน {item.day} {item.date} · เวลา {item.submittedAt}
                          </div>
                        </div>

                        {/* สามารถลบได้เฉพาะสถานะ pending เท่านั้น */}
                        {item.status === 'pending' && (
                          <button
                            className="btn btn-sm btn-gray"
                            onClick={() => deleteNews(item.id)}
                            style={{ padding: 6, minWidth: 'auto' }}
                            title="ยกเลิกการส่งข่าว"
                          >
                            <Trash2 size={12} style={{ color: '#ef4444' }} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ข่าววันพรุ่งนี้ทั้งหมด */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">📢 ข่าวสารพรุ่งนี้ทั้งหมด ({tomorrowSubmissions.length})</span>
            </div>
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {tomorrowSubmissions.length === 0 ? (
                <div style={{ textAlign:'center', padding:'32px', color:'#9e9e9e', fontSize:13 }}>
                  ยังไม่มีข่าวประชาสัมพันธ์สำหรับวันพรุ่งนี้
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column' }}>
                  {tomorrowSubmissions.map((item, i) => {
                    const s = STATUS_MAP[item.status] || STATUS_MAP.pending;
                    return (
                      <div 
                        key={item.id} 
                        style={{ 
                          padding:'12px 16px', 
                          borderBottom: i < tomorrowSubmissions.length - 1 ? '1px solid #f0f0f0' : 'none',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <span className={`badge ${s.badge}`} style={{ display:'flex', alignItems:'center', gap:4, padding:'2px 6px', fontSize:11 }}>
                            {s.icon} {s.label}
                          </span>
                          <span style={{ fontSize:11, color:'#757575', background:'#f5f5f5', borderRadius:4, padding:'1px 6px' }}>
                            {item.category}
                          </span>
                          <span style={{ fontSize:11, color: '#9e9e9e', marginLeft: 'auto' }}>
                            โดย {item.submitter}
                          </span>
                        </div>
                        <div style={{ fontWeight:600, fontSize:13, wordBreak: 'break-word' }}>{item.headline}</div>
                        {item.detail && <div style={{ fontSize:12, color:'#616161', marginTop:2, wordBreak: 'break-word' }}>{item.detail}</div>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
