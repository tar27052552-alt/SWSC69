import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Plus, ChevronLeft, ChevronRight, Calendar as CalendarIcon, RefreshCw, X, Trash2, Edit2, ShieldAlert, Sparkles, CheckCircle2 } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { sendDiscordEmbedViaGAS } from '../lib/discordWebhook';

const MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const DAYS_TH = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
const DAYS_TH_SHORT = ['อา','จ','อ','พ','พฤ','ศ','ส'];

const TYPE_COLORS = { meeting:'#5c6bc0', event:'#43a047', deadline:'#f9a825', holiday:'#e53935', substitute:'#00bcd4' };
const TYPE_LABELS = { meeting:'ประชุม', event:'กิจกรรม', deadline:'กำหนดส่ง', holiday:'วันหยุดสภา', substitute:'วันเรียนชดเชย' };
const TYPE_BADGE  = { meeting:'badge-purple', event:'badge-green', deadline:'badge-yellow', holiday:'badge-red', substitute:'badge-blue' };

export default function CalendarPage() {
  const { user, isPresident, isAdmin } = useAuth();
  const today = new Date();
  const [yr, setYr] = useState(today.getFullYear());
  const [mo, setMo] = useState(today.getMonth());
  const [sel, setSel] = useState(today.getDate());
  const [filterType, setFilterType] = useState('all');
  
  const [events, setEvents] = useState([]);
  const [disabledDates, setDisabledDates] = useState([]);
  const [substituteDates, setSubstituteDates] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [selectedParticipants, setSelectedParticipants] = useState([]);

  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  
  const [isAdding, setIsAdding] = useState(false);
  const [editId, setEditId] = useState(null);
  const [newEv, setNewEv] = useState({ title: '', date: todayStr, endDate: todayStr, type: 'event', locationCategory: 'internal', checkAttendance: false, attendanceStartTime: '07:00', attendanceLimitTime: '08:00', desc: '', replaceDay: 'จันทร์' });

  const canManage = isAdmin || isPresident || user?.deptId === 1 || user?.deptId === 7;

  useEffect(() => {
    async function loadData() {
      try {
        const [
          eventsRes,
          usersRes,
          participantsRes,
          settingsRes,
          schedulesRes
        ] = await Promise.all([
          supabase.from('events').select('*').order('date', { ascending: true }),
          supabase.from('users').select('id, name, nickname, dept_id').order('name'),
          supabase.from('event_participants').select('*'),
          supabase.from('attendance_settings').select('*'),
          supabase.from('schedules').select('*')
        ]);

        if (eventsRes.data) {
          const mapped = eventsRes.data.map(e => ({
            ...e,
            desc: e.description || e.desc
          }));
          setEvents(mapped);
        }

        if (usersRes.data) setUsersList(usersRes.data);
        if (participantsRes.data) setParticipants(participantsRes.data);
        if (schedulesRes.data) setSchedules(schedulesRes.data);

        if (settingsRes.data) {
          const disabled = settingsRes.data.find(s => s.key === 'disabled_dates')?.value || [];
          const substitutes = settingsRes.data.find(s => s.key === 'substitute_dates')?.value || [];
          setDisabledDates(disabled);
          setSubstituteDates(substitutes);
        }
      } catch (err) {
        console.error('Error loading calendar data:', err);
      }
    }
    loadData();
  }, []);

  const handleSaveEvent = async () => {
    if (!newEv.title || !newEv.date) return alert('กรุณากรอกข้อมูลให้ครบถ้วน');
    
    try {
      const color = TYPE_COLORS[newEv.type] || '#43a047';
      const isCheckAttendance = newEv.locationCategory === 'external' ? false : (newEv.checkAttendance || false);
      const startTime = newEv.attendanceStartTime || '07:00';
      const limitTime = newEv.attendanceLimitTime || '08:00';

      // 1. Sync Holiday in attendance_settings
      if (newEv.type === 'holiday') {
        const datesToAdd = [];
        let curr = new Date(newEv.date);
        const end = new Date(newEv.endDate || newEv.date);
        while (curr <= end) {
          const yyyy = curr.getFullYear();
          const mm = String(curr.getMonth() + 1).padStart(2, '0');
          const dd = String(curr.getDate()).padStart(2, '0');
          datesToAdd.push(`${yyyy}-${mm}-${dd}`);
          curr.setDate(curr.getDate() + 1);
        }

        const newDisabledDates = Array.from(new Set([...disabledDates, ...datesToAdd])).sort();
        setDisabledDates(newDisabledDates);
        await supabase
          .from('attendance_settings')
          .upsert([{ key: 'disabled_dates', value: newDisabledDates }], { onConflict: 'key' });
      }

      // 2. Sync Substitute Date in attendance_settings
      if (newEv.type === 'substitute') {
        const newObj = { date: newEv.date, replaceDay: newEv.replaceDay || 'จันทร์' };
        const filtered = substituteDates.filter(s => (typeof s === 'string' ? s : s.date) !== newEv.date);
        const newSubstitutes = [...filtered, newObj];
        setSubstituteDates(newSubstitutes);
        await supabase
          .from('attendance_settings')
          .upsert([{ key: 'substitute_dates', value: newSubstitutes }], { onConflict: 'key' });
      }

      let eventDesc = newEv.desc || '';
      if (newEv.type === 'substitute' && !eventDesc.includes('เรียนชดเชย')) {
        eventDesc = `เรียนชดเชยแทนตารางวัน${newEv.replaceDay || 'จันทร์'} ${eventDesc ? '(' + eventDesc + ')' : ''}`;
      }
      
      if (editId) {
        const { error } = await supabase
          .from('events')
          .update({
            title: newEv.title,
            date: newEv.date,
            end_date: newEv.endDate || newEv.date,
            location_category: newEv.locationCategory || 'internal',
            check_attendance: isCheckAttendance,
            attendance_start_time: startTime,
            attendance_limit_time: limitTime,
            type: newEv.type,
            color: color,
            description: eventDesc
          })
          .eq('id', editId);
          
        if (error) throw error;

        await supabase.from('event_participants').delete().eq('event_id', editId);

        if (selectedParticipants.length > 0) {
          const participantRecords = selectedParticipants.map(userId => ({
            event_id: editId,
            user_id: userId
          }));
          await supabase.from('event_participants').insert(participantRecords);
        }

        alert('แก้ไขรายการเรียบร้อยแล้ว!');

      } else {
        const { data, error } = await supabase
          .from('events')
          .insert([{
            title: newEv.title,
            date: newEv.date,
            end_date: newEv.endDate || newEv.date,
            location_category: newEv.locationCategory || 'internal',
            check_attendance: isCheckAttendance,
            attendance_start_time: startTime,
            attendance_limit_time: limitTime,
            type: newEv.type,
            color: color,
            description: eventDesc
          }])
          .select();

        if (error) throw error;
        const newEventId = data[0].id;

        if (selectedParticipants.length > 0) {
          const participantRecords = selectedParticipants.map(userId => ({
            event_id: newEventId,
            user_id: userId
          }));
          await supabase.from('event_participants').insert(participantRecords);
        }

        const typeLabel = TYPE_LABELS[newEv.type] || 'กิจกรรม';
        const embedTitle = `📅 ประกาศปฏิทินสภาฯ: ${typeLabel}`;
        const embedDesc = `หัวข้อ: **${newEv.title}** (${typeLabel})`;
        const locLabel = newEv.locationCategory === 'external' ? 'ภายนอกโรงเรียน (นอกสถานที่)' : 'ภายในโรงเรียน';
        const fields = [
          { name: "📆 วันที่", value: newEv.date === (newEv.endDate || newEv.date) 
              ? new Date(newEv.date).toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
              : `${new Date(newEv.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })} - ${new Date(newEv.endDate || newEv.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}`, inline: true },
          { name: "📍 สถานที่", value: locLabel, inline: true },
          { name: "📋 เช็คชื่อ / ยกเว้นเข้าแถว", value: isCheckAttendance ? `เช็คชื่อในกิจกรรม (${startTime} - ${limitTime} น.)` : "ไม่ต้องเช็คชื่อ (ไม่ส่งผลต่อการเข้าแถวปกติ)", inline: false },
          { name: "📝 รายละเอียดเพิ่มเติม", value: eventDesc || "ไม่มี", inline: false }
        ];
        const targetUserIds = usersList.map(u => String(u.id));
        sendDiscordEmbedViaGAS(embedTitle, embedDesc, newEv.type === 'holiday' ? 15158332 : 3447003, fields, null, 'calendar', targetUserIds.length > 0 ? targetUserIds : null);

        alert('เพิ่มรายการเข้าสู่ปฏิทินเรียบร้อยแล้ว!');
      }
      
      setIsAdding(false);
      setEditId(null);
      setNewEv({ title: '', date: todayStr, endDate: todayStr, type: 'event', locationCategory: 'internal', checkAttendance: false, attendanceStartTime: '07:00', attendanceLimitTime: '08:00', desc: '', replaceDay: 'จันทร์' });
      setSelectedParticipants([]);
      
      const { data } = await supabase.from('events').select('*').order('date', { ascending: true });
      setEvents((data || []).map(e => ({ ...e, desc: e.description || e.desc })));

      const { data: pData } = await supabase.from('event_participants').select('*');
      setParticipants(pData || []);
      
    } catch (err) {
      console.error('Error saving event:', err);
      alert('ไม่สามารถบันทึกรายการได้: ' + err.message);
    }
  };

  const handleEditEvent = (ev) => {
    setEditId(ev.id);
    setNewEv({
      title: ev.title,
      date: ev.date,
      endDate: ev.end_date || ev.date,
      type: ev.type,
      locationCategory: ev.location_category || 'internal',
      checkAttendance: ev.check_attendance || false,
      attendanceStartTime: ev.attendance_start_time || '07:00',
      attendanceLimitTime: ev.attendance_limit_time || '08:00',
      desc: ev.desc || ev.description || '',
      replaceDay: 'จันทร์'
    });
    
    const eventParts = participants.filter(p => p.event_id === ev.id).map(p => p.user_id);
    setSelectedParticipants(eventParts);
    setIsAdding(true);
  };

  const handleDeleteEvent = async (eventId) => {
    if (!window.confirm('คุณต้องการลบรายการนี้ออกจากปฏิทินใช่หรือไม่?')) return;
    try {
      const targetEv = events.find(e => e.id === eventId);
      if (targetEv) {
        if (targetEv.type === 'holiday') {
          handleRemoveHoliday(targetEv.date);
        } else if (targetEv.type === 'substitute') {
          handleRemoveSubstitute(targetEv.date);
        }
      }

      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', eventId);
      if (error) throw error;
      
      setEvents(prev => prev.filter(e => e.id !== eventId));
      setParticipants(prev => prev.filter(p => p.event_id !== eventId));
      alert('ลบรายการเรียบร้อยแล้ว!');
    } catch (err) {
      console.error('Error deleting event:', err);
      alert('เกิดข้อผิดพลาดในการลบรายการ: ' + err.message);
    }
  };

  const handleRemoveHoliday = async (dateStr) => {
    try {
      const updated = disabledDates.filter(d => d !== dateStr);
      setDisabledDates(updated);
      await supabase
        .from('attendance_settings')
        .upsert([{ key: 'disabled_dates', value: updated }], { onConflict: 'key' });
    } catch (err) {
      console.error('Error removing holiday:', err);
    }
  };

  const handleRemoveSubstitute = async (dateStr) => {
    try {
      const updated = substituteDates.filter(s => (typeof s === 'string' ? s : s.date) !== dateStr);
      setSubstituteDates(updated);
      await supabase
        .from('attendance_settings')
        .upsert([{ key: 'substitute_dates', value: updated }], { onConflict: 'key' });
    } catch (err) {
      console.error('Error removing substitute date:', err);
    }
  };

  const firstDay = new Date(yr, mo, 1).getDay();
  const daysInMonth = new Date(yr, mo + 1, 0).getDate();

  const prevMonth = () => { if (mo===0){setMo(11);setYr(y=>y-1);}else setMo(m=>m-1); };
  const nextMonth = () => { if (mo===11){setMo(0);setYr(y=>y+1);}else setMo(m=>m+1); };

  const getEventsForDay = (day) => {
    const ds = `${yr}-${String(mo+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    return events.filter(e => {
      const start = e.date;
      const end = e.end_date || e.date;
      const matchesDate = ds >= start && ds <= end;
      if (filterType === 'all') return matchesDate;
      return matchesDate && e.type === filterType;
    });
  };

  const getDayStatus = (day) => {
    const ds = `${yr}-${String(mo+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const isHoliday = disabledDates.includes(ds);
    const substitute = substituteDates.find(s => (typeof s === 'string' ? s : s.date) === ds);
    return { isHoliday, substitute: typeof substitute === 'object' ? substitute : null };
  };

  const getEventParticipants = (eventId) => {
    const eventParts = participants.filter(p => p.event_id === eventId);
    return eventParts.map(p => {
      const u = usersList.find(usr => String(usr.id) === String(p.user_id));
      return u ? u.nickname : null;
    }).filter(Boolean);
  };

  const selDateStr = sel ? `${yr}-${String(mo+1).padStart(2,'0')}-${String(sel).padStart(2,'0')}` : '';
  const selEvents = sel ? getEventsForDay(sel) : [];
  const selDayStatus = sel ? getDayStatus(sel) : { isHoliday: false, substitute: null };
  const selDayOfWeek = sel ? new Date(yr, mo, sel).getDay() : 0;
  const selDayName = DAYS_TH[selDayOfWeek];

  // Get duty schedule for selected day
  const effectiveDayName = selDayStatus.substitute ? selDayStatus.substitute.replaceDay : selDayName.replace('พฤหัสบดี','พฤหัส');
  const greetingSchedule = schedules.find(s => s.type === 'greeting' && s.day === effectiveDayName);
  const cleanRoomSchedule = schedules.find(s => s.type === 'clean_room' && s.day === effectiveDayName);

  const openAddForType = (type, defaultTitle = '') => {
    setEditId(null);
    setNewEv({
      title: defaultTitle,
      date: selDateStr || todayStr,
      endDate: selDateStr || todayStr,
      type: type,
      locationCategory: 'internal',
      checkAttendance: false,
      attendanceStartTime: '07:00',
      attendanceLimitTime: '08:00',
      desc: '',
      replaceDay: 'จันทร์'
    });
    setSelectedParticipants([]);
    setIsAdding(true);
  };

  return (
    <div>
      {/* Hero Header */}
      <div style={{
        background: 'linear-gradient(135deg, #0d0714 0%, #1e0a2e 40%, #006064 100%)',
        borderRadius: 20,
        padding: '24px 28px',
        color: '#fff',
        marginBottom: 20,
        boxShadow: '0 8px 24px rgba(0,188,212,0.15)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 16
      }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(0,188,212,0.2)', color: '#00e5ff', padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, marginBottom: 8, border: '1px solid rgba(0,229,255,0.3)' }}>
            📅 COUNCIL CALENDAR
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: '-0.02em', color: '#ffffff' }}>
            ปฏิทินกิจกรรม ตารางเวร วันหยุดสภาฯ และวันเรียนชดเชย
          </h1>
          <div style={{ fontSize: 13, color: '#b2ebf2', marginTop: 4, fontWeight: 400 }}>
            จัดการและตรวจสอบกิจกรรม การประชุม กำหนดส่งงาน วันหยุดสภาฯ และวันเรียนชดเชย
          </div>
        </div>

        {canManage && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              className="btn"
              onClick={() => openAddForType('holiday', 'วันหยุดสภานักเรียน')}
              style={{
                background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                color: '#fff',
                border: 'none',
                padding: '9px 16px',
                borderRadius: 14,
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 4px 14px rgba(239,68,68,0.35)',
                transition: 'all 0.2s ease'
              }}
            >
              <ShieldAlert size={15} /> + เพิ่มวันหยุด
            </button>

            <button
              className="btn"
              onClick={() => openAddForType('substitute', 'วันเรียนชดเชย')}
              style={{
                background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                color: '#fff',
                border: 'none',
                padding: '9px 16px',
                borderRadius: 14,
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 4px 14px rgba(2,132,199,0.35)',
                transition: 'all 0.2s ease'
              }}
            >
              <RefreshCw size={15} /> + เพิ่มวันชดเชย
            </button>

            <button
              className="btn btn-primary"
              onClick={() => openAddForType('event', '')}
              style={{
                background: 'linear-gradient(135deg, #00bcd4 0%, #00838f 100%)',
                color: '#fff',
                border: 'none',
                padding: '9px 18px',
                borderRadius: 14,
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 4px 14px rgba(0,188,212,0.4)',
                transition: 'all 0.2s ease'
              }}
            >
              <Plus size={16} /> เพิ่มกิจกรรมใหม่
            </button>
          </div>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="card" style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#475569', marginRight: 4 }}>กรองประเภท:</span>
          {[
            { id: 'all', label: 'ทั้งหมด' },
            { id: 'event', label: '🟢 กิจกรรม' },
            { id: 'meeting', label: '🟣 ประชุม' },
            { id: 'deadline', label: '🟡 กำหนดส่ง' },
            { id: 'holiday', label: '🔴 วันหยุดสภาฯ' },
            { id: 'substitute', label: '🔵 วันเรียนชดเชย' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setFilterType(t.id)}
              style={{
                padding: '6px 14px',
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 600,
                border: filterType === t.id ? '1px solid #00bcd4' : '1px solid #e2e8f0',
                background: filterType === t.id ? '#e0f7fa' : '#f8fafc',
                color: filterType === t.id ? '#00838f' : '#64748b',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar & Details Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
        {/* Main Calendar Card */}
        <div className="card" style={{ borderRadius: 20, overflow: 'hidden' }}>
          {/* Header Month Nav */}
          <div style={{ padding: '16px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button className="btn btn-gray btn-sm" onClick={prevMonth} style={{ display: 'flex', alignItems: 'center', gap: 4, borderRadius: 10 }}>
              <ChevronLeft size={16} /> เดือนก่อน
            </button>

            <div style={{ fontWeight: 800, fontSize: 18, color: '#00838f' }}>
              {MONTHS[mo]} {yr + 543}
            </div>

            <button className="btn btn-gray btn-sm" onClick={nextMonth} style={{ display: 'flex', alignItems: 'center', gap: 4, borderRadius: 10 }}>
              เดือนถัดไป <ChevronRight size={16} />
            </button>
          </div>

          <div style={{ padding: 16 }}>
            {/* Weekday headers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, padding: '0 1px', marginBottom: 8 }}>
              {DAYS_TH_SHORT.map((d, idx) => (
                <div key={d} style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, color: idx === 0 ? '#ef4444' : '#64748b', padding: '6px 0' }}>
                  {d}
                </div>
              ))}
            </div>

            {/* Grid Cells */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gridAutoRows: 'minmax(125px, 1fr)', gap: 2, background: '#f0f0f0', border: '1px solid #e0e0e0', borderRadius: 12, overflow: 'hidden' }}>
              {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} style={{ minHeight: '125px', background: '#fafafa' }} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const col = (firstDay + i) % 7;
                const evs = getEventsForDay(day);
                const ds = `${yr}-${String(mo + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const isToday = ds === todayStr;
                const isSel = sel === day;
                const { isHoliday, substitute } = getDayStatus(day);

                return (
                  <div
                    key={day}
                    onClick={() => setSel(day)}
                    style={{
                      height: '100%',
                      padding: '6px 2px 4px 2px',
                      cursor: 'pointer',
                      background: isSel ? '#f3e8ff' : isToday ? '#f0fdf4' : isHoliday ? '#fff5f5' : substitute ? '#e0f7fa' : 'white',
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                      transition: 'all 0.15s ease',
                      position: 'relative'
                    }}
                  >
                    {/* Date header row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px', marginBottom: 4 }}>
                      <div style={{
                        fontSize: 13,
                        fontWeight: isToday || isSel ? 800 : 700,
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        background: isToday ? '#00bcd4' : 'transparent',
                        color: isToday ? 'white' : col === 0 ? '#ef4444' : '#1e293b',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        {day}
                      </div>

                      {isHoliday && <span style={{ fontSize: 10, color: '#dc2626', fontWeight: 700 }}>🚫 หยุด</span>}
                      {substitute && <span style={{ fontSize: 10, color: '#00838f', fontWeight: 700 }}>🔄 ชดเชย</span>}
                    </div>

                    {/* Event bars inside day cell */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, overflow: 'hidden' }}>
                      {evs.slice(0, 3).map(ev => {
                        const isStart = (ev.date === ds) || (col === 0);
                        const endDate = ev.end_date || ev.date;
                        const isEnd = (endDate === ds) || (col === 6);
                        
                        const barBg = ev.type === 'holiday' ? '#fee2e2' : ev.type === 'substitute' ? '#e0f7fa' : ev.type === 'meeting' ? '#e8eaf6' : ev.type === 'deadline' ? '#fff9c4' : '#ebdcf9';
                        const barTextColor = ev.type === 'holiday' ? '#b91c1c' : ev.type === 'substitute' ? '#0369a1' : ev.type === 'meeting' ? '#283593' : ev.type === 'deadline' ? '#f57f17' : '#6a1b9a';

                        return (
                          <div
                            key={ev.id}
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              background: barBg,
                              color: barTextColor,
                              padding: '3px 6px',
                              borderRadius: isStart && isEnd ? 6 : isStart ? '6px 0 0 6px' : isEnd ? '0 6px 6px 0' : 0,
                              marginLeft: isStart ? 2 : -2,
                              marginRight: isEnd ? 2 : -2,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              lineHeight: 1.2
                            }}
                            title={ev.title}
                          >
                            {isStart || col === 0 ? ev.title : '\u00A0'}
                          </div>
                        );
                      })}
                      {evs.length > 3 && (
                        <div style={{ fontSize: 10, color: '#7e57c2', fontWeight: 700, paddingLeft: 4 }}>
                          +{evs.length - 3} รายการ
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {/* Trailing empty cells */}
              {Array.from({ length: (Math.ceil((firstDay + daysInMonth) / 7) * 7) - (firstDay + daysInMonth) }).map((_, i) => (
                <div key={`empty-end-${i}`} style={{ minHeight: '125px', background: '#fafafa' }} />
              ))}
            </div>
          </div>
        </div>

        {/* Selected Day Side Details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Day Inspector Header */}
          <div className="card" style={{ borderRadius: 20, overflow: 'hidden' }}>
            <div className="card-header" style={{ background: 'linear-gradient(135deg, #0d0714, #1e0a2e)', color: '#fff', padding: '16px 20px' }}>
              <span className="card-title" style={{ color: '#e0f7fa', fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                <CalendarIcon size={18} color="#00bcd4" />
                {sel ? `${sel} ${MONTHS[mo]} ${yr + 543}` : 'เลือกวันที่บนปฏิทิน'}
              </span>
              <div style={{ fontSize: 12, color: '#b2ebf2', marginTop: 2 }}>
                {selDayName} {selDayStatus.substitute ? `(แทนตารางวัน${selDayStatus.substitute.replaceDay})` : ''}
              </div>
            </div>

            <div className="card-body" style={{ padding: 16 }}>
              {/* Quick Manage Controls for Admin / President */}
              {canManage && sel && (
                <div style={{ marginBottom: 14, padding: '10px 12px', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>⚙️ จัดการวันที่ {selDateStr}:</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-sm"
                      onClick={() => openAddForType('holiday', 'วันหยุดสภานักเรียน')}
                      style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', fontSize: 11, fontWeight: 700, borderRadius: 8, padding: '4px 10px' }}
                    >
                      + กำหนดเป็นวันหยุด
                    </button>
                    <button
                      className="btn btn-sm"
                      onClick={() => openAddForType('substitute', 'วันเรียนชดเชย')}
                      style={{ background: '#e0f7fa', color: '#00838f', border: '1px solid #b2ebf2', fontSize: 11, fontWeight: 700, borderRadius: 8, padding: '4px 10px' }}
                    >
                      + กำหนดเป็นวันชดเชย
                    </button>
                  </div>
                </div>
              )}

              {/* Holiday Alert */}
              {selDayStatus.isHoliday && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 12, padding: '10px 12px', fontSize: 12, fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ShieldAlert size={16} /> 🚫 วันนี้เป็นวันหยุดสภาฯ (งดเช็คชื่อ)
                  </div>
                  {canManage && (
                    <button onClick={() => handleRemoveHoliday(selDateStr)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 11, underline: 'always', fontWeight: 700 }}>
                      ยกเลิกวันหยุด
                    </button>
                  )}
                </div>
              )}

              {/* Substitute Alert */}
              {selDayStatus.substitute && (
                <div style={{ background: '#e0f7fa', border: '1px solid #b2ebf2', color: '#00838f', borderRadius: 12, padding: '10px 12px', fontSize: 12, fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <RefreshCw size={16} /> 🔄 เรียนชดเชย (แทนวัน{selDayStatus.substitute.replaceDay})
                  </div>
                  {canManage && (
                    <button onClick={() => handleRemoveSubstitute(selDateStr)} style={{ background: 'none', border: 'none', color: '#00838f', cursor: 'pointer', fontSize: 11, underline: 'always', fontWeight: 700 }}>
                      ยกเลิกวันชดเชย
                    </button>
                  )}
                </div>
              )}

              {/* Events list */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  📋 รายการในวันนี้ ({selEvents.length})
                </div>

                {selEvents.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', padding: '16px 0', background: '#f8fafc', borderRadius: 10 }}>
                    ไม่มีรายการในวันนี้
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {selEvents.map(ev => (
                      <div key={ev.id} style={{ padding: '12px 14px', borderRadius: 12, background: ev.color + '11', borderLeft: `4px solid ${ev.color}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: ev.color }}>{ev.title}</div>
                          {canManage && (
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button onClick={() => handleEditEvent(ev)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}><Edit2 size={13} /></button>
                              <button onClick={() => handleDeleteEvent(ev.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}><Trash2 size={13} /></button>
                            </div>
                          )}
                        </div>

                        {ev.end_date && ev.end_date !== ev.date && (
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                            📅 {new Date(ev.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })} - {new Date(ev.end_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </div>
                        )}

                        {ev.desc && <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>{ev.desc}</div>}

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                          <span className={`badge ${TYPE_BADGE[ev.type]}`}>{TYPE_LABELS[ev.type]}</span>
                          <span className="badge" style={{ background: ev.location_category === 'external' ? '#e0f7fa' : '#f1f5f9', color: ev.location_category === 'external' ? '#00838f' : '#64748b' }}>
                            {ev.location_category === 'external' ? '🎒 นอกสถานที่' : '🏫 ภายในโรงเรียน'}
                          </span>
                        </div>

                        {/* Participants list */}
                        {(() => {
                          const parts = getEventParticipants(ev.id);
                          if (parts.length === 0) return null;
                          return (
                            <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px stroke #e2e8f0', fontSize: 11, color: '#475569' }}>
                              <strong>👥 ผู้เข้าร่วม:</strong> {parts.join(', ')}
                            </div>
                          );
                        })()}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Duty Overview */}
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  🙏 เวรประจำวัน ({effectiveDayName})
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#00838f' }}>🙏 เวรยืนไหว้ประตูโรงเรียน</div>
                    {greetingSchedule?.data ? (
                      <div style={{ fontSize: 11, color: '#475569', marginTop: 2, lineHeight: 1.4 }}>
                        ประตูไหมไทย: {(greetingSchedule.data.gate1 || []).join(', ') || '-'}<br />
                        ประตูอำเภอ: {(greetingSchedule.data.gate2 || []).join(', ') || '-'}<br />
                        ประตูหน้า รร.: {(greetingSchedule.data.gate3 || []).join(', ') || '-'}
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>ไม่มีเวรยืนไหว้ในวันนี้</div>
                    )}
                  </div>

                  <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#2e7d32' }}>🧹 เวรทำความสะอาดห้องสภา</div>
                    {cleanRoomSchedule?.data?.members ? (
                      <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>
                        {(cleanRoomSchedule.data.members || []).join(', ')}
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>ไม่มีเวรทำความสะอาดในวันนี้</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add / Edit Event Modal */}
      {isAdding && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setIsAdding(false)} style={{ zIndex: 9999 }}>
          <div className="modal-box" style={{ maxWidth: 500, borderRadius: 20, overflow: 'hidden' }}>
            <div className="modal-header" style={{ background: 'linear-gradient(135deg, #0d0714, #1e0a2e)', color: '#fff' }}>
              <span style={{ fontWeight: 700, fontSize: 16 }}>{editId ? '✏️ แก้ไขรายการ' : '➕ เพิ่มรายการลงปฏิทิน'}</span>
              <button onClick={() => setIsAdding(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b2ebf2' }}><X size={18} /></button>
            </div>
            <div className="modal-body" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="form-label">ชื่อรายการ/โครงการ/วันหยุด *</label>
                <input className="input-field" placeholder="เช่น ประชุมสภาประจำเดือน, วันหยุดวันแม่แห่งชาติ" value={newEv.title} onChange={e => setNewEv({ ...newEv, title: e.target.value })} style={{ fontSize: 13 }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="form-label">วันที่เริ่ม *</label>
                  <input type="date" className="input-field" value={newEv.date} onChange={e => setNewEv({ ...newEv, date: e.target.value, endDate: e.target.value })} style={{ fontSize: 13 }} />
                </div>
                <div>
                  <label className="form-label">วันที่สิ้นสุด</label>
                  <input type="date" className="input-field" value={newEv.endDate} onChange={e => setNewEv({ ...newEv, endDate: e.target.value })} style={{ fontSize: 13 }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="form-label">ประเภทรายการ *</label>
                  <select className="select-field" value={newEv.type} onChange={e => setNewEv({ ...newEv, type: e.target.value })} style={{ fontSize: 13 }}>
                    <option value="event">🟢 กิจกรรม</option>
                    <option value="meeting">🟣 ประชุม</option>
                    <option value="deadline">🟡 กำหนดส่งงาน</option>
                    <option value="holiday">🔴 วันหยุดสภาฯ (งดเช็คชื่อ)</option>
                    <option value="substitute">🔵 วันเรียนชดเชย (แทนตารางวันอื่น)</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">สถานที่</label>
                  <select className="select-field" value={newEv.locationCategory} onChange={e => setNewEv({ ...newEv, locationCategory: e.target.value })} style={{ fontSize: 13 }}>
                    <option value="internal">🏫 ภายในโรงเรียน</option>
                    <option value="external">🎒 นอกสถานที่</option>
                  </select>
                </div>
              </div>

              {/* Special options for Substitute Day */}
              {newEv.type === 'substitute' && (
                <div style={{ background: '#e0f7fa', padding: '12px 14px', borderRadius: 12, border: '1px solid #b2ebf2' }}>
                  <label className="form-label" style={{ color: '#00838f', fontWeight: 700 }}>🔄 เรียนชดเชยแทนตารางของวันไหน?</label>
                  <select className="select-field" value={newEv.replaceDay} onChange={e => setNewEv({ ...newEv, replaceDay: e.target.value })} style={{ fontSize: 13, background: '#fff' }}>
                    <option value="จันทร์">วันจันทร์</option>
                    <option value="อังคาร">วันอังคาร</option>
                    <option value="พุธ">วันพุธ</option>
                    <option value="พฤหัส">วันพฤหัสบดี</option>
                    <option value="ศุกร์">วันศุกร์</option>
                  </select>
                  <div style={{ fontSize: 11, color: '#00838f', marginTop: 6 }}>
                    ℹ️ ระบบจะสลับไปดึงตารางเวรยืนไหว้และเวรทำความสะอาดของวันดังกล่าวให้อัตโนมัติในวันนี้
                  </div>
                </div>
              )}

              {/* Special alert for Holiday */}
              {newEv.type === 'holiday' && (
                <div style={{ background: '#fef2f2', padding: '10px 12px', borderRadius: 12, border: '1px solid #fecaca', fontSize: 12, color: '#dc2626', fontWeight: 600 }}>
                  ℹ️ ระบบจะปิดการเช็คชื่อเข้าแถวในวันดังกล่าวให้อัตโนมัติ (นักเรียนจะไม่โดนปรับขาดเข้าแถว)
                </div>
              )}

              <div>
                <label className="form-label">รายละเอียดเพิ่มเติม</label>
                <textarea className="input-field" rows="3" placeholder="รายละเอียด..." value={newEv.desc} onChange={e => setNewEv({ ...newEv, desc: e.target.value })} style={{ fontSize: 13 }} />
              </div>
            </div>

            <div className="modal-footer" style={{ background: '#f8fafc', padding: '14px 20px', borderTop: '1px solid #e2e8f0' }}>
              <button className="btn btn-gray" onClick={() => setIsAdding(false)} style={{ borderRadius: 10 }}>ยกเลิก</button>
              <button className="btn btn-primary" onClick={handleSaveEvent} style={{ background: 'linear-gradient(135deg, #00bcd4, #00838f)', borderRadius: 10, fontWeight: 700 }}>
                {editId ? 'บันทึกการแก้ไข' : 'บันทึกรายการ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
