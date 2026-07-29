import { useState, useEffect, useMemo } from 'react';
import { Send, Clock, CheckCircle, Calendar, Bell, AlertCircle, Edit3, UserCheck, MessageSquare, ShieldAlert, ChevronRight, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import { sendDiscordEmbedViaGAS } from '../lib/discordWebhook';

const DAY_MAP = { 0:'อาทิตย์', 1:'จันทร์', 2:'อังคาร', 3:'พุธ', 4:'พฤหัส', 5:'ศุกร์', 6:'เสาร์' };

const TagList = ({ names }) => {
  const safeNames = Array.isArray(names) ? names : (typeof names === 'string' ? [names] : []);
  return (
    <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
      {safeNames.map((n,i) => (
        <span key={i} style={{
          background: n==='–' ? 'transparent' : '#e0f7fa',
          color: n==='–' ? '#bdbdbd' : '#00838f',
          border: n==='–' ? '1px dashed #e0e0e0' : '1px solid #b2ebf2',
          borderRadius:6, padding:'2px 8px', fontSize:12, fontWeight:600,
        }}>{n}</span>
      ))}
    </div>
  );
};

// Web Audio Chime Sound Helper
const playChimeSound = () => {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch (e) {
    console.warn("Audio Context failed:", e);
  }
};

export default function SubmitNewsPage() {
  const { user, isAdmin } = useAuth();

  const [nowDate, setNowDate] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setNowDate(new Date());
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const tomorrow = new Date(nowDate); 
  tomorrow.setDate(nowDate.getDate() + 1);
  const tomorrowKey = DAY_MAP[tomorrow.getDay()];
  const tomorrowDateStr = tomorrow.toLocaleDateString('th-TH', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  const isWeek1Tomorrow = Math.ceil(tomorrow.getDate() / 7) % 2 === 1;

  const [dutyMembers, setDutyMembers] = useState([]);
  const [hasDutyTomorrow, setHasDutyTomorrow] = useState(false);
  const [isMyDutyTomorrow, setIsMyDutyTomorrow] = useState(false);

  const [news, setNews] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [submittingDuty, setSubmittingDuty] = useState(false);

  // Form State for Duty Member
  const [dutyForm, setDutyForm] = useState({ detail: '' });
  const [formError, setFormError] = useState('');

  // 10-Minute Reminder Timer State
  const [secondsRemaining, setSecondsRemaining] = useState(600);

  // Safe Duty Members list
  const dutyMembersList = useMemo(() => {
    if (Array.isArray(dutyMembers)) return dutyMembers;
    if (typeof dutyMembers === 'string') {
      try {
        const parsed = JSON.parse(dutyMembers);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {}
      return [dutyMembers];
    }
    return [];
  }, [dutyMembers]);

  const [weeklySchedules, setWeeklySchedules] = useState({});

  // Load duty schedule for tomorrow and full week
  useEffect(() => {
    async function loadDuty() {
      try {
        const { data, error } = await supabase
          .from('schedules')
          .select('*')
          .eq('type', 'pr_news');

        if (!error && data) {
          const schedMap = {};
          data.forEach(row => {
            const rowData = row.data || {};
            const rawM = isWeek1Tomorrow ? (rowData.week1 || []) : (rowData.week2 || []);
            let mList = [];
            if (Array.isArray(rawM)) mList = rawM;
            else if (typeof rawM === 'string') {
              try { mList = JSON.parse(rawM); } catch(e) { mList = [rawM]; }
            }
            schedMap[row.day] = mList;
          });
          setWeeklySchedules(schedMap);

          // Get tomorrow's duty members
          const tomorrowMembers = schedMap[tomorrowKey] || [];
          setDutyMembers(tomorrowMembers);
          const hasDuty = Array.isArray(tomorrowMembers) && tomorrowMembers.length > 0 && tomorrowMembers[0] !== '–';
          setHasDutyTomorrow(hasDuty);
          
          const myNickname = user?.nickname || '';
          const myName = user?.name || '';
          const isMyDuty = hasDuty && tomorrowMembers.some(n => {
            if (!n || n === '–') return false;
            return n === myNickname || n === myName || (myNickname && n.includes(myNickname)) || (myName && n.includes(myName));
          });
          setIsMyDutyTomorrow(isMyDuty);
        }
      } catch (err) {
        console.error('Error loading PR news duty schedule:', err);
      }
    }
    loadDuty();
  }, [user, tomorrowKey, isWeek1Tomorrow]);

  // Load News items & User list
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
      
      const { data: uData } = await supabase.from('users').select('id, nickname, name, dept_id, role');
      if (uData) setUsersList(uData);
    } catch (err) {
      console.error('Error loading PR news:', err);
    }
  };

  useEffect(() => {
    loadNewsData();

    const channel = supabase
      .channel('submit-news-realtime')
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

  // News item for tomorrow
  const tomorrowNewsItem = useMemo(() => {
    return news.find(item => item.date === tomorrowDateStr);
  }, [news, tomorrowDateStr]);

  const isTopicSet = !!(tomorrowNewsItem && tomorrowNewsItem.headline && tomorrowNewsItem.headline.trim());
  const isContentSubmitted = !!(tomorrowNewsItem && tomorrowNewsItem.detail && tomorrowNewsItem.detail.trim() && tomorrowNewsItem.status !== 'waiting_content');

  // Pre-fill dutyForm if detail exists
  useEffect(() => {
    if (tomorrowNewsItem?.detail) {
      setDutyForm({ detail: tomorrowNewsItem.detail || '' });
    }
  }, [tomorrowNewsItem]);

  // ── RECURRING 10-MINUTE TIMER & NOTIFICATION LOGIC ──
  const trigger10MinDutyNotification = async () => {
    if (!tomorrowNewsItem || isContentSubmitted) return;

    // Audio Ping
    playChimeSound();

    // Desktop Notification
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification('🔔 แจ้งเตือนเวรหาข่าวประจำวัน', {
          body: `ฝ่าย PR กำหนดหัวข้อข่าวแล้ว: "${tomorrowNewsItem.headline}" - กรุณากรอกรายละเอียดเนื้อหาข่าวสาร`,
          icon: '/favicon.ico'
        });
      } catch (e) {
        console.warn('Desktop notification failed:', e);
      }
    }

    // Discord Notification
    const targetUserIds = usersList
      .filter(u => dutyMembersList.includes(u.nickname) || dutyMembersList.includes(u.name))
      .map(u => String(u.id));

    const fields = [
      { name: "หัวข้อข่าวจาก PR", value: tomorrowNewsItem.headline, inline: false },
      { name: "หมวดหมู่", value: tomorrowNewsItem.category || 'ข่าวทั่วไป', inline: true },
      { name: "สถานะ", value: "⏳ รอคนในเวรส่งรายละเอียดเนื้อหาข่าว (เตือนทุก 10 นาที)", inline: true }
    ];

    sendDiscordEmbedViaGAS(
      `🔔 แจ้งเตือนเวรหาข่าวประจำวัน (เตือนทุก 10 นาที)`,
      `แจ้งเตือนผู้รับผิดชอบเวรหาข่าวประจำวัน**${tomorrowKey}** (**${dutyMembersList.join(', ')}**): ฝ่าย PR ได้คิดและตั้งหัวข้อข่าวเรียบร้อยแล้ว กรุณากรอกรายละเอียดเนื้อหาข่าวสารส่งเข้าระบบ`,
      15105570,
      fields,
      null,
      'pr',
      targetUserIds.length > 0 ? targetUserIds : null
    );
  };

  // Timer Countdown Effect
  useEffect(() => {
    if (!isTopicSet || isContentSubmitted) return;

    const interval = setInterval(() => {
      setSecondsRemaining(prev => {
        if (prev <= 1) {
          trigger10MinDutyNotification();
          return 600; // Reset to 10 minutes
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isTopicSet, isContentSubmitted, tomorrowNewsItem]);

  // ── DUTY MEMBER SUBMITS CONTENT ──
  const handleDutySubmitContent = async () => {
    if (!isMyDutyTomorrow) {
      alert('🔒 สงวนสิทธิ์เฉพาะผู้มีชื่ออยู่ในตารางเวรหาข่าวประจำวันพรุ่งนี้เท่านั้นที่จะส่งเนื้อหาข่าวได้');
      return;
    }
    if (!dutyForm.detail.trim()) {
      setFormError('กรุณากรอกรายละเอียดเนื้อหาข่าวที่จะให้ PR นำไปประกาศ');
      return;
    }

    setSubmittingDuty(true);
    const nowT = new Date();
    const subStr = nowT.toLocaleTimeString('th-TH', { hour:'2-digit', minute:'2-digit' });
    const nicknameOrName = user?.name || user?.nickname || 'เวรหาข่าว';

    try {
      const payload = {
        for_day: tomorrowKey,
        for_date: tomorrowDateStr,
        submitter: nicknameOrName,
        category: tomorrowNewsItem?.category || 'ข่าวโรงเรียน',
        headline: tomorrowNewsItem?.headline || 'ข่าวประชาสัมพันธ์ประจำวัน',
        detail: dutyForm.detail.trim(),
        status: 'pending',
        submitted_at: subStr
      };

      if (tomorrowNewsItem?.id) {
        const { error } = await supabase
          .from('pr_news')
          .update(payload)
          .eq('id', tomorrowNewsItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('pr_news')
          .insert([payload]);
        if (error) throw error;
      }

      // Notify Discord
      const fields = [
        { name: "หัวข้อข่าว", value: payload.headline, inline: false },
        { name: "เนื้อหาข่าวสาร", value: dutyForm.detail.trim(), inline: false },
        { name: "ผู้ส่งเนื้อหา", value: nicknameOrName, inline: true }
      ];

      const targetPRUserIds = usersList
        .filter(u => u.dept_id === 5 || u.role === 'admin')
        .map(u => String(u.id));

      sendDiscordEmbedViaGAS(
        `✅ เวรหาข่าวส่งเนื้อหาข่าวประชาสัมพันธ์เรียบร้อยแล้ว`,
        `คุณ **${nicknameOrName}** ได้ส่งรายละเอียดเนื้อหาข่าวสำหรับวัน**${tomorrowKey}** (${tomorrowDateStr}) เรียบร้อยแล้ว`,
        3066993,
        fields,
        null,
        'pr',
        targetPRUserIds.length > 0 ? targetPRUserIds : null
      );

      alert('ส่งรายละเอียดเนื้อหาข่าวประชาสัมพันธ์เรียบร้อยแล้ว!');
      setFormError('');
      loadNewsData();
    } catch (err) {
      console.error('Error duty submit content:', err);
      alert('เกิดข้อผิดพลาดในการส่งข่าว: ' + err.message);
    } finally {
      setSubmittingDuty(false);
    }
  };

  const formatTimer = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const [isEditingContent, setIsEditingContent] = useState(false);

  const canUserEdit = isMyDutyTomorrow;

  return (
    <div style={{ paddingBottom: 40 }}>
      {/* ── PAGE HEADER ── */}
      <div className="page-header">
        <div className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'linear-gradient(135deg, var(--primary), var(--accent))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', boxShadow: 'var(--shadow-primary)'
          }}>
            <MessageSquare size={22} />
          </div>
          <span>การส่งเวรข่าวประชาสัมพันธ์ประจำวัน</span>
        </div>
        <div className="page-subtitle">
          ขั้นตอนสำหรับเวรหาข่าว: ฝ่าย PR คิดหัวข้อในหน้า /pr ➔ เวรหาข่าวกรอกเนื้อหาตรงนี้ส่งก่อนเข้าแถว
        </div>
      </div>

      {/* ── STATUS ALERTS BANNERS ── */}
      {/* 1. Timer Reminder Banner (Topic set, awaiting content) */}
      {isTopicSet && !isContentSubmitted && (
        <div style={{
          background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)',
          border: '1px solid #86efac', borderRadius: 'var(--radius-lg)',
          padding: '16px 20px', marginBottom: 20, boxShadow: 'var(--shadow-sm)',
          display: 'flex', alignItems: 'flex-start', gap: 14, animation: 'fadeIn 0.3s ease'
        }}>
          <Bell size={26} style={{ color: '#16a34a', flexShrink: 0, marginTop: 2, animation: 'pulse 1.5s infinite' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: '#14532d', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <span>🔔 แจ้งเตือนเวรหาข่าว ({dutyMembersList.join(', ') || 'ผู้รับผิดชอบ'}): ได้รับหัวข้อข่าวจาก PR แล้ว!</span>
              <span className="badge badge-green" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Clock size={13} /> เตือนถัดไปใน: {formatTimer(secondsRemaining)}
              </span>
            </div>
            <div style={{ fontSize: 13, color: '#15803d', marginTop: 4, lineHeight: 1.5 }}>
              ฝ่าย PR กำหนดหัวข้อข่าวให้แล้วคือ: <strong style={{ textDecoration: 'underline' }}>"{tomorrowNewsItem?.headline}"</strong><br />
              (ต้องการตัวแทนเวรส่งเพียง 1 คน ระบบจะหยุดแจ้งเตือนทันทีเมื่อมีผู้ส่งข่าวสำเร็จ)
            </div>
          </div>
        </div>
      )}

      {/* 2. Success Banner (When 1 member has submitted) */}
      {isContentSubmitted && (
        <div style={{
          background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)',
          border: '1px solid #86efac', borderRadius: 'var(--radius-lg)',
          padding: '16px 20px', marginBottom: 20, boxShadow: 'var(--shadow-sm)',
          display: 'flex', alignItems: 'center', gap: 14
        }}>
          <CheckCircle size={28} style={{ color: '#16a34a', flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: '#14532d', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>✅ ส่งข่าวประชาสัมพันธ์สำหรับวันพรุ่งนี้เรียบร้อยแล้ว!</span>
              <span className="badge badge-green">เสร็จสิ้นงานเวรประจำวัน</span>
            </div>
            <div style={{ fontSize: 13, color: '#15803d', marginTop: 2 }}>
              ส่งโดยคุณ <strong>"{tomorrowNewsItem?.submitter}"</strong> เมื่อเวลา {tomorrowNewsItem?.submittedAt || 'ล่าสุด'} (ต้องการตัวแทนส่งเพียง 1 คนต่อวัน)
            </div>
          </div>
        </div>
      )}

      {/* ── DUTY MEMBER BANNER ── */}
      <div className="card" style={{ marginBottom: 24, background: 'linear-gradient(135deg, #eff6ff, #e0f2fe)', border: '1px solid #bae6fd' }}>
        <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14, background: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'var(--shadow-sm)', color: 'var(--primary)', flexShrink: 0
          }}>
            <Calendar size={24} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: '#0369a1', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>เวรส่งข่าววัน{tomorrowKey} — {tomorrowDateStr}</span>
              {isMyDutyTomorrow && <span className="badge badge-purple">เวรของคุณ!</span>}
            </div>
            <div style={{ fontSize: 13, color: '#0284c7', marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {hasDutyTomorrow ? (
                <>
                  <span>ผู้รับผิดชอบหาข่าวพรุ่งนี้:</span>
                  <TagList names={dutyMembersList} />
                  <span style={{ fontSize: 11.5, color: '#0369a1', opacity: 0.8, marginLeft: 4 }}>(ต้องการเพียง 1 คนส่งข่าวต่อวัน)</span>
                </>
              ) : (
                <span style={{ color: '#64748b' }}>ไม่มีเวรส่งข่าวพรุ่งนี้ (วันหยุด/ไม่มีตารางเวร)</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── FORM OR SUBMITTED VIEW SECTION ── */}
      <div style={{ marginBottom: 24 }}>
        <div className="card" style={{ border: isContentSubmitted ? '1px solid #86efac' : (isTopicSet ? '2px solid var(--primary)' : '1px solid var(--border)') }}>
          <div className="card-header" style={{ background: isContentSubmitted ? '#f0fdf4' : (isTopicSet ? 'var(--primary-light)' : '#f8fafc') }}>
            <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Send size={18} color={isContentSubmitted ? '#16a34a' : 'var(--primary)'} />
              <span>{isContentSubmitted && !isEditingContent ? 'รายละเอียดเนื้อหาข่าวสารที่ส่งแล้ว' : 'กรอกรายละเอียดเนื้อหาข่าวสารสำหรับวันพรุ่งนี้'}</span>
            </span>
            {isContentSubmitted ? (
              <span className="badge badge-green">ส่งเนื้อหาแล้ว</span>
            ) : isTopicSet ? (
              <span className="badge badge-cyan">พร้อมกรอกเนื้อหา</span>
            ) : (
              <span className="badge badge-orange">รอหัวข้อจาก PR</span>
            )}
          </div>

          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Case A: Non-Duty Member */}
            {!canUserEdit ? (
              <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <UserCheck size={44} style={{ color: 'var(--text-light)', marginBottom: 12 }} />
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>
                  🔒 สงวนสิทธิ์เฉพาะผู้ที่เป็นเวรหาข่าวประจำวันพรุ่งนี้เท่านั้น
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
                  คุณไม่มีชื่ออยู่ในตารางเวรหาข่าวสำหรับวันพรุ่งนี้ ({tomorrowKey})<br />
                  <span style={{ color: 'var(--primary)', fontWeight: 600 }}>ผู้มีหน้าที่ส่งข่าววันพรุ่งนี้คือ: {dutyMembersList.join(', ') || 'ไม่มีรายการเวร'}</span>
                </div>
              </div>
            ) : !isTopicSet ? (
              /* Case B: Topic not set yet */
              <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <Clock size={44} style={{ color: '#f97316', marginBottom: 12 }} />
                <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>
                  ⏳ รอฝ่าย PR กำหนดหัวข้อข่าวก่อน
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
                  ฝ่าย PR กำลังคิดและตั้งหัวข้อข่าวในระบบ<br />
                  เมื่อฝ่าย PR บันทึกหัวข้อข่าวในหน้า <strong>ฝ่ายประชาสัมพันธ์ (/pr)</strong> เรียบร้อยแล้ว แบบฟอร์มกรอกเนื้อหาข่าวสารจะเปิดให้คุณกรอกทันที
                </div>
              </div>
            ) : isContentSubmitted && !isEditingContent ? (
              /* Case C: Submitted View (หน้าที่ส่งเรียบร้อยแล้ว) */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ background: 'linear-gradient(135deg, #f0fdf4, #e8f5e9)', padding: 18, borderRadius: 'var(--radius-md)', border: '1px solid #a5d6a7' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <span className="badge badge-green" style={{ fontSize: 12, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <CheckCircle size={14} /> ข้อมูลข่าวถูกส่งเรียบร้อยแล้ว
                    </span>
                    <span style={{ fontSize: 12, color: '#2e7d32', fontWeight: 600 }}>
                      ส่งเมื่อเวลา {tomorrowNewsItem?.submittedAt || '-'}
                    </span>
                  </div>
                  
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 12, color: '#388e3c', fontWeight: 700 }}>📌 หัวข้อข่าวจากฝ่าย PR:</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#1b5e20', marginTop: 2 }}>
                      "{tomorrowNewsItem?.headline}"
                    </div>
                    <div style={{ fontSize: 12, color: '#2e7d32', marginTop: 2 }}>
                      หมวดหมู่: {tomorrowNewsItem?.category || 'ข่าวทั่วไป'}
                    </div>
                  </div>
                </div>

                <div style={{ background: '#f8fafc', padding: 18, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
                  <div style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 8 }}>
                    📝 รายละเอียดเนื้อหาข่าวประชาสัมพันธ์ที่ส่ง:
                  </div>
                  <div style={{ fontSize: 14.5, color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: 1.6, background: '#ffffff', padding: 16, borderRadius: 8, border: '1px solid var(--border)' }}>
                    {tomorrowNewsItem?.detail}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>ผู้รับผิดชอบส่งข่าว:</span>
                    <strong style={{ color: 'var(--primary)' }}>{tomorrowNewsItem?.submitter}</strong>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-gray"
                    onClick={() => setIsEditingContent(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', fontSize: 13 }}
                  >
                    <Edit3 size={15} />
                    <span>แก้ไขเนื้อหาที่ส่ง</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Case D: Editing or Initial Form */
              <>
                <div style={{ background: '#f8fafc', padding: 14, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>📌 หัวข้อข่าวจากฝ่าย PR:</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--primary)', marginTop: 3 }}>
                    "{tomorrowNewsItem?.headline}"
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 3 }}>
                    หมวดหมู่: {tomorrowNewsItem?.category || 'ข่าวทั่วไป'}
                  </div>
                </div>

                <div>
                  <label className="form-label">
                    รายละเอียดเนื้อหาข่าวประชาสัมพันธ์ (สำหรับเวรหาข่าว) <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <textarea
                    className="input-field"
                    rows={5}
                    placeholder="กรอกรายละเอียด เช่น วัน เวลา สถานที่ ขั้นตอน ข้อกำหนด หรือข้อมูลสำคัญที่จะให้ PR อ่านประกาศหน้าเสาธง..."
                    value={dutyForm.detail}
                    onChange={e => { setDutyForm({ detail: e.target.value }); setFormError(''); }}
                    style={{ resize: 'vertical' }}
                  />
                  {formError && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 4 }}>{formError}</div>}
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  {isEditingContent && (
                    <button
                      type="button"
                      className="btn btn-gray"
                      onClick={() => setIsEditingContent(false)}
                      style={{ padding: '11px 20px' }}
                    >
                      ยกเลิก
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      await handleDutySubmitContent();
                      setIsEditingContent(false);
                    }}
                    disabled={submittingDuty}
                    className="btn btn-success"
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 22px' }}
                  >
                    <Send size={16} />
                    <span>{submittingDuty ? 'กำลังบันทึก...' : (isContentSubmitted ? 'บันทึกแก้ไขเนื้อหาข่าว' : 'ส่งรายละเอียดเนื้อหาข่าวสาร')}</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── WEEKLY DUTY PREVIEW CARD ── */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={18} color="var(--primary)" />
            <span>ตารางเวรส่งข่าวประจำสัปดาห์นี้ ({isWeek1Tomorrow ? 'สัปดาห์คี่' : 'สัปดาห์คู่'})</span>
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            💡 ตรวจสอบตารางเวรล่วงหน้าเพื่อเตรียมความพร้อม
          </span>
        </div>
        <div className="card-body" style={{ padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
            {[
              { day: 'จันทร์', color: '#9a3412', bg: '#fff7ed', border: '#ffedd5' },
              { day: 'อังคาร', color: '#831843', bg: '#fdf2f8', border: '#fbcfe8' },
              { day: 'พุธ', color: '#14532d', bg: '#f0fdf4', border: '#bbf7d0' },
              { day: 'พฤหัส', color: '#7c2d12', bg: '#fff7ed', border: '#fed7aa' },
              { day: 'ศุกร์', color: '#1e3a8a', bg: '#eff6ff', border: '#bfdbfe' },
            ].map(item => {
              const members = weeklySchedules[item.day] || [];
              const isTomorrow = item.day === tomorrowKey;
              const myNickname = user?.nickname || '';
              const myName = user?.name || '';
              const isMyTurn = Array.isArray(members) && members.some(n => n && n !== '–' && (n === myNickname || n === myName));

              return (
                <div
                  key={item.day}
                  style={{
                    background: item.bg,
                    border: isTomorrow ? '2px solid var(--primary)' : `1px solid ${item.border}`,
                    borderRadius: 'var(--radius-md)',
                    padding: 14,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    position: 'relative'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 800, fontSize: 14, color: item.color }}>
                      วัน{item.day}
                    </span>
                    {isTomorrow && <span className="badge badge-purple" style={{ fontSize: 10.5 }}>✨ พรุ่งนี้</span>}
                  </div>

                  <TagList names={members.length > 0 ? members : ['–']} />

                  {isMyTurn && (
                    <div style={{ marginTop: 'auto', paddingTop: 4 }}>
                      <span className="badge badge-green" style={{ fontSize: 10.5, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        ⭐ เวรของคุณ
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
