import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import './eventAttendance.css';

const labels = { pending: 'รอเช็คชื่อ', missing: 'ขาด · รอฝ่ายปกครองพิจารณา', activity: 'ยกเว้นเช็คชื่อ', on_time: 'ตรงเวลา', late: 'มาสาย', leave: 'ลา', not_required: 'ระบบปิดเช็คชื่อ' };
export default function EventAttendanceReport({ date }) {
  const [state, setState] = useState({ loading: true, rows: [], error: '' }), [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30000);
    Promise.resolve().then(async () => {
      if (!active) return;
      setState(s => ({ ...s, loading: true, error: '' }));
      const { data, error } = await supabase.rpc('get_event_attendance_report', { p_date: date }).abortSignal(controller.signal);
      if (!active) return;
      if (error && ['PGRST202','42883'].includes(error.code)) setState({ loading: false, rows: [], error: 'ต้องอัปเดต backend ก่อนใช้รายงานกิจกรรมรายวัน' });
      else if (error) setState(s => ({ ...s, loading: false, error: error.message }));
      else setState({ loading: false, rows: data || [], error: '' });
    }).catch(e => { if (active) setState(s => ({ ...s, loading: false, error: e.message })); });
    return () => { active = false; controller.abort(); clearTimeout(timer); };
  }, [date, reload]);
  return <section className="event-attendance-report card"><div className="card-header"><h3>ผู้เข้าร่วมกิจกรรม · {date}</h3><button type="button" className="btn btn-gray btn-sm" disabled={state.loading} onClick={() => setReload(x => x + 1)}>รีเฟรชรายงานกิจกรรม</button></div><div className="card-body">
    {state.loading ? <p role="status">กำลังอ่านรายงานกิจกรรม…</p> : state.error ? <p role="alert">{state.error}</p> : !state.rows.length ? <p>ไม่มีผู้เข้าร่วมกิจกรรมในวันนี้</p> : <div className="event-report-scroll"><table><thead><tr><th>สมาชิก</th><th>กิจกรรม</th><th>เวลา</th><th>สถานะ</th></tr></thead><tbody>{state.rows.map(row => <tr key={row.user_id}><td>{row.name}</td><td>{row.context.title}</td><td>{row.context.mode === 'exempt' ? 'ยกเว้น' : `${row.context.opens_at}–${row.context.closes_at} · เริ่มสาย ${row.context.late_at}`}</td><td>{labels[row.context.status] || row.context.status}</td></tr>)}</tbody></table></div>}
    <p style={{ fontSize: 12, color: '#8b7b96' }}>สถานะขาดเป็นข้อมูลให้ฝ่ายปกครองพิจารณา ไม่สร้างค่าปรับขาดกิจกรรมอัตโนมัติ</p>
  </div></section>;
}
