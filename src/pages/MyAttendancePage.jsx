import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { CalendarDays, X } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { transformGoogleDriveUrl, getGoogleDriveViewUrl } from '../lib/googleDriveUpload';

const toGregorianStr = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function MyAttendancePage() {
  const { user, checkInState } = useAuth();
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [dbRecords, setDbRecords] = useState([]);
  const [enabledDays, setEnabledDays] = useState(["จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์"]);
  const [disabledDates, setDisabledDates] = useState([]);
  const [substituteDates, setSubstituteDates] = useState([]);
  const [startDate, setStartDate] = useState('');
  const [greetingSchedules, setGreetingSchedules] = useState([]);
  const [dbExemptDates, setDbExemptDates] = useState([]);
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  useEffect(() => {
    async function loadSettings() {
      try {
        const { data, error } = await supabase.from('attendance_settings').select('*');
        if (error) throw error;
        if (data) {
          const days = data.find(d => d.key === 'enabled_days')?.value;
          const dates = data.find(d => d.key === 'disabled_dates')?.value;
          const subDates = data.find(d => d.key === 'substitute_dates')?.value;
          const startD = data.find(d => d.key === 'start_date')?.value;
          if (days) setEnabledDays(days);
          if (dates) setDisabledDates(dates);
          if (subDates) setSubstituteDates(subDates);
          if (startD) setStartDate(startD);
        }
      } catch (err) {
        console.error('Error loading settings in MyAttendancePage:', err);
      }
    }
    async function loadGreetingSchedules() {
      try {
        const { data, error } = await supabase
          .from('schedules')
          .select('*')
          .eq('type', 'greeting');
        if (!error && data) {
          setGreetingSchedules(data);
        }
      } catch (err) {
        console.error('Error loading greeting schedules:', err);
      }
    }
    loadSettings();
    loadGreetingSchedules();
  }, []);

  useEffect(() => {
    async function loadMyAttendance() {
      try {
        if (user) {
          const { data, error } = await supabase
            .from('student_attendance')
            .select('*')
            .eq('user_id', String(user.id))
            .like('date', `${month}-%`);
          if (error) throw error;
          if (data) {
            setDbRecords(data);
          }
        }
      } catch (err) {
        console.error('Error loading personal attendance history:', err);
      }
    }
    loadMyAttendance();
  }, [month, user]);

  useEffect(() => {
    async function loadExemptDates() {
      if (!user) return;
      try {
        const { data: eventsData } = await supabase.from('events').select('*');
        const { data: partData } = await supabase
          .from('event_participants')
          .select('event_id')
          .eq('user_id', String(user.id));
        
        if (eventsData && partData) {
          const myEventIds = partData.map(p => p.event_id);
          const myExtEvents = eventsData.filter(ev => 
            !ev.check_attendance && ev.location_category === 'external' && myEventIds.includes(ev.id)
          );

          const exemptDates = [];
          myExtEvents.forEach(ev => {
            const start = new Date(ev.date);
            const end = new Date(ev.end_date || ev.date);
            let current = new Date(start);
            while (current <= end) {
              const dStr = toGregorianStr(current);
              if (!exemptDates.includes(dStr)) {
                exemptDates.push(dStr);
              }
              current.setDate(current.getDate() + 1);
            }
          });
          setDbExemptDates(exemptDates);
        }
      } catch (err) {
        console.error('Error loading exempt dates in MyAttendance:', err);
      }
    }
    loadExemptDates();
  }, [user, month]);

  const STATUS = {
    on_time:      { label: 'มาตรงเวลา', color: '#2e7d32', bg: '#e8f5e9', icon: '✅' },
    late:         { label: 'มาสาย',     color: '#c62828', bg: '#ffebee', icon: '⚠️' },
    leave:        { label: 'ลา',       color: '#f57f17', bg: '#fff8e1', icon: '📝' },
    missing:      { label: 'ขาด',      color: '#757575', bg: '#f5f5f5', icon: '❌' },
    activity:     { label: 'ทำกิจกรรม', color: '#00838f', bg: '#e0f7fa', icon: '🎗️' },
    holiday:      { label: 'วันหยุด',   color: '#dc2626', bg: '#fef2f2', icon: '🚫' },
    substitute:   { label: 'วันชดเชย',  color: '#0284c7', bg: '#e0f2fe', icon: '🔄' },
    not_required: { label: 'ไม่บังคับ', color: '#64748b', bg: '#f1f5f9', icon: '➖' },
  };

  // Generate attendance for all weekdays in the selected month
  const [year, mon] = month.split('-').map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();
  const todayStr = toGregorianStr();
  const daysTh = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์'];

  const records = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, mon - 1, d);
    const dow = date.getDay();
    const dateStr = toGregorianStr(date);
    let dayName = daysTh[dow];
    
    const subMatch = substituteDates.find(s => (typeof s === 'string' ? s : s.date) === dateStr);
    if (subMatch && typeof subMatch !== 'string' && subMatch.replaceDay) {
      dayName = subMatch.replaceDay;
    }

    const isDayEnabled = enabledDays.includes(dayName);
    const isDateDisabled = disabledDates.includes(dateStr);
    const isBeforeStart = startDate && dateStr < startDate;
    const isRequired = isDayEnabled && !isDateDisabled && !isBeforeStart;

    // 1. Check in database record
    const dbRec = dbRecords.find(r => r.date === dateStr);
    const isExempt = dbExemptDates.includes(dateStr);

    if (!isRequired && !dbRec && (dateStr !== todayStr || !checkInState) && !isExempt) {
      continue; // skip days with no check-in required and no check-in record
    }

    // Check if user has greeting duty
    let hasGreetingDuty = false;
    const todaySchedule = greetingSchedules.find(s => s.day === dayName);
    if (todaySchedule && user?.nickname) {
      const scheduleData = todaySchedule.data || {};
      if (scheduleData.gate1?.includes(user.nickname) ||
          scheduleData.gate2?.includes(user.nickname) ||
          scheduleData.gate3?.includes(user.nickname)) {
        hasGreetingDuty = true;
      }
    }

    // 1. Check in database record
    if (dbRec) {
      records.push({
        date: dateStr, dayName, hasGreetingDuty,
        status: dbRec.status,
        time: dbRec.time,
        photo: dbRec.photo || null,
      });
      continue;
    }

    // 2. Today: use real check-in state fallback
    if (dateStr === todayStr) {
      if (checkInState) {
        records.push({
          date: dateStr, dayName, hasGreetingDuty,
          status: checkInState.status,
          time: checkInState.time,
          photo: checkInState.photo || null,
        });
      } else if (isExempt) {
        records.push({
          date: dateStr, dayName, hasGreetingDuty,
          status: 'activity',
          time: 'ทำกิจกรรม',
        });
      } else {
        records.push({
          date: dateStr, dayName, hasGreetingDuty,
          status: 'missing',
          time: '-',
        });
      }
      continue;
    }

    // 3. Past date without database record
    if (dateStr < todayStr) {
      records.push({
        date: dateStr, dayName, hasGreetingDuty,
        status: isExempt ? 'activity' : 'missing',
        time: isExempt ? 'ทำกิจกรรม' : '-',
      });
    }
  }

  const counts = {
    on_time: records.filter(r => r.status === 'on_time').length,
    late: records.filter(r => r.status === 'late').length,
    leave: records.filter(r => r.status === 'leave').length,
    missing: records.filter(r => r.status === 'missing').length,
    activity: records.filter(r => r.status === 'activity').length,
  };
  const total = records.length;

  if (user?.role === 'admin' || user?.nickname === 'แอดมิน') {
    return (
      <div style={{ maxWidth: 500, margin: '0 auto', textAlign: 'center', paddingTop: 40 }}>
        <CalendarDays size={64} color="#00bcd4" style={{ margin: '0 auto' }} />
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#37474f', marginTop: 16 }}>
          ประวัติการเช็คชื่อ
        </h2>
        <div style={{ fontSize: 14, color: '#757575', marginTop: 8 }}>
          ในฐานะผู้ดูแลระบบ คุณได้รับการยกเว้นและไม่มีประวัติการเช็คชื่อเข้าโรงเรียน
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="page-title">📊 ประวัติการเช็คชื่อ</div>
          <div className="page-subtitle">ข้อมูลการเช็คชื่อเข้าโรงเรียนของ {user?.name}</div>
        </div>
        <input
          type="month"
          className="input-field"
          value={month}
          onChange={e => setMonth(e.target.value)}
          style={{ width: 'auto', padding: '6px 12px' }}
        />
      </div>

      {/* Stats */}
      <div className="stats-row" style={{ marginBottom: 16 }}>
        {[
          { label: 'มาตรงเวลา', value: counts.on_time, icon: '✅', bg: '#e8f5e9', color: '#2e7d32' },
          { label: 'มาสาย', value: counts.late, icon: '⚠️', bg: '#ffebee', color: '#c62828' },
          { label: 'ลา', value: counts.leave, icon: '📝', bg: '#fff8e1', color: '#f57f17' },
          { label: 'ขาด', value: counts.missing, icon: '❌', bg: '#f5f5f5', color: '#757575' },
          { label: 'ทำกิจกรรม', value: counts.activity, icon: '🎒', bg: '#e0f7fa', color: '#00838f' },
          { label: 'รวมทั้งหมด', value: total, icon: '📅', bg: '#e3f2fd', color: '#1565c0' },
        ].map(s => (
          <div key={s.label} className="stat-box">
            <div className="stat-icon-box" style={{ background: s.bg }}>{s.icon}</div>
            <div>
              <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">รายละเอียดการเช็คชื่อรายวัน</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="simple-table">
            <thead>
              <tr><th>#</th><th>วันที่</th><th>วัน</th><th>เวลาเช็คชื่อ</th><th>📷 รูปถ่าย</th><th>เวรไหว้</th><th>สถานะ</th></tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr><td colSpan="6" style={{ textAlign: 'center', padding: 40, color: '#9e9e9e' }}>ไม่มีข้อมูลในเดือนนี้</td></tr>
              ) : (
                records.map((r, i) => {
                  const s = STATUS[r.status] || { label: r.status || 'ไม่ระบุ', color: '#64748b', bg: '#f1f5f9', icon: 'ℹ️' };
                  return (
                    <tr key={r.date} style={{ background: r.date === todayStr ? '#e3f2fd44' : undefined }}>
                      <td style={{ color: '#9e9e9e', fontSize: 12 }}>{i + 1}</td>
                      <td style={{ fontSize: 13, fontWeight: r.date === todayStr ? 700 : 400 }}>
                        {r.date}
                        {r.date === todayStr && <span style={{ fontSize: 10, color: '#1565c0', marginLeft: 6 }}>(วันนี้)</span>}
                      </td>
                      <td style={{ fontSize: 13 }}>{r.dayName}</td>
                      <td style={{ fontSize: 13, fontWeight: 500 }}>{r.time}</td>
                      <td>
                        {r.photo ? (
                          <div style={{ display: 'inline-block' }}>
                            <img
                              src={transformGoogleDriveUrl(r.photo)}
                              alt="Selfie"
                              onClick={() => setSelectedPhoto(r.photo)}
                              onError={(e) => {
                                e.target.style.display = 'none';
                                if (e.target.nextSibling) e.target.nextSibling.style.display = 'inline-block';
                              }}
                              style={{
                                width: 36,
                                height: 36,
                                objectFit: 'cover',
                                borderRadius: 8,
                                border: '1px solid #b2ebf2',
                                cursor: 'pointer',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                              }}
                              title="คลิกเพื่อดูรูปขยาย"
                            />
                            <button
                              onClick={() => {
                                const viewUrl = getGoogleDriveViewUrl(r.photo);
                                if (viewUrl && viewUrl.startsWith('http')) {
                                  window.open(viewUrl, '_blank');
                                } else {
                                  setSelectedPhoto(r.photo);
                                }
                              }}
                              style={{ display: 'none', padding: '3px 8px', fontSize: 11, background: '#e0f7fa', color: '#00838f', border: '1px solid #b2ebf2', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
                            >
                              📷 ดูรูป
                            </button>
                          </div>
                        ) : (
                          <span style={{ fontSize: 11, color: '#bdbdbd' }}>–</span>
                        )}
                      </td>
                      <td>
                        {r.hasGreetingDuty
                          ? <span className="badge" style={{ background: '#fff3e0', color: '#e65100', borderRadius: 3 }}>🙏 เวรไหว้</span>
                          : <span style={{ fontSize: 11, color: '#bdbdbd' }}>–</span>
                        }
                      </td>
                      <td>
                        <span className="badge" style={{ background: s.bg, color: s.color }}>
                          {s.icon} {s.label}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal ดูรูปขยาย */}
      {selectedPhoto && (
        <div className="modal-overlay" onClick={() => setSelectedPhoto(null)} style={{ zIndex: 9999 }}>
          <div className="modal-box" style={{ maxWidth: 380, padding: 16, textAlign: 'center' }}>
            <div className="modal-header" style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: '#37474f' }}>📷 รูปถ่ายการเช็คชื่อ</span>
              <button onClick={() => setSelectedPhoto(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9e9e9e' }}>
                <X size={18} />
              </button>
            </div>
            <img
              src={transformGoogleDriveUrl(selectedPhoto)}
              alt="Selfie Full"
              onError={(e) => {
                let fileId = '';
                const match = selectedPhoto?.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || selectedPhoto?.match(/[?&]id=([a-zA-Z0-9_-]+)/) || selectedPhoto?.match(/\/d\/([a-zA-Z0-9_-]+)/);
                if (match && match[1]) fileId = match[1];
                if (fileId && !e.target.src.includes('thumbnail')) {
                  e.target.src = `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`;
                }
              }}
              style={{ width: '100%', maxHeight: 380, objectFit: 'contain', borderRadius: 8, border: '1px solid #eee' }}
            />
            {selectedPhoto && (
              <div style={{ marginTop: 12 }}>
                <a
                  href={getGoogleDriveViewUrl(selectedPhoto)}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-primary"
                  style={{ fontSize: 12, padding: '6px 14px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  🔗 เปิดดูรูปภาพใน Google Drive
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
