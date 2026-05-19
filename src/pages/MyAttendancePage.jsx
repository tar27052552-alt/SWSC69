import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { CheckCircle, XCircle, AlertTriangle, Clock, CalendarDays } from 'lucide-react';
import { supabase } from '../supabaseClient';

export default function MyAttendancePage() {
  const { user, checkInState } = useAuth();
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [dbRecords, setDbRecords] = useState([]);
  const [enabledDays, setEnabledDays] = useState(["จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์"]);
  const [disabledDates, setDisabledDates] = useState([]);
  const [startDate, setStartDate] = useState('');
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [greetingSchedules, setGreetingSchedules] = useState([]);

  useEffect(() => {
    async function loadSettings() {
      try {
        const { data, error } = await supabase.from('attendance_settings').select('*');
        if (error) throw error;
        if (data) {
          const days = data.find(d => d.key === 'enabled_days')?.value;
          const dates = data.find(d => d.key === 'disabled_dates')?.value;
          const startD = data.find(d => d.key === 'start_date')?.value;
          if (days) setEnabledDays(days);
          if (dates) setDisabledDates(dates);
          if (startD) setStartDate(startD);
        }
      } catch (err) {
        console.error('Error loading settings in MyAttendancePage:', err);
      } finally {
        setLoadingSettings(false);
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

  const STATUS = {
    on_time: { label: 'มาตรงเวลา', color: '#2e7d32', bg: '#e8f5e9', icon: '✅' },
    late:    { label: 'มาสาย',     color: '#c62828', bg: '#ffebee', icon: '⚠️' },
    leave:   { label: 'ลา',       color: '#f57f17', bg: '#fff8e1', icon: '📝' },
    missing: { label: 'ขาด',      color: '#757575', bg: '#f5f5f5', icon: '❌' },
  };

  // Generate attendance for all weekdays in the selected month
  const [year, mon] = month.split('-').map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();
  const toGregorianStr = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const todayStr = toGregorianStr();
  const daysTh = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์'];

  const records = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, mon - 1, d);
    const dow = date.getDay();
    const dateStr = toGregorianStr(date);
    const dayName = daysTh[dow];

    const isDayEnabled = enabledDays.includes(dayName);
    const isDateDisabled = disabledDates.includes(dateStr);
    const isBeforeStart = startDate && dateStr < startDate;
    const isRequired = isDayEnabled && !isDateDisabled && !isBeforeStart;

    // 1. Check in database record
    const dbRec = dbRecords.find(r => r.date === dateStr);

    if (!isRequired && !dbRec && (dateStr !== todayStr || !checkInState)) {
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
      });
      continue;
    }

    // 2. Today: use real check-in state fallback
    if (dateStr === todayStr && checkInState) {
      records.push({
        date: dateStr, dayName, hasGreetingDuty,
        status: checkInState.status,
        time: checkInState.time,
      });
      continue;
    }

    // 3. Past date without database record -> missing
    if (dateStr < todayStr) {
      records.push({
        date: dateStr, dayName, hasGreetingDuty,
        status: 'missing',
        time: '-',
      });
    }
  }

  const counts = {
    on_time: records.filter(r => r.status === 'on_time').length,
    late: records.filter(r => r.status === 'late').length,
    leave: records.filter(r => r.status === 'leave').length,
    missing: records.filter(r => r.status === 'missing').length,
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
              <tr><th>#</th><th>วันที่</th><th>วัน</th><th>เวลาเช็คชื่อ</th><th>เวรไหว้</th><th>สถานะ</th></tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr><td colSpan="6" style={{ textAlign: 'center', padding: 40, color: '#9e9e9e' }}>ไม่มีข้อมูลในเดือนนี้</td></tr>
              ) : (
                records.map((r, i) => {
                  const s = STATUS[r.status];
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
    </div>
  );
}
