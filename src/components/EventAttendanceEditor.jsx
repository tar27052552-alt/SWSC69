import { useState } from 'react';
import { DEPARTMENTS } from '../data/mockData';
import { defaultEventDay, eventDates } from '../lib/eventAttendance';
import './eventAttendance.css';

export default function EventAttendanceEditor({ start, end, members, rules, setRules, disabled, today }) {
  const dates = eventDates(start, end || start);
  const [search, setSearch] = useState(''), [department, setDepartment] = useState(''), [selectedDate, setSelectedDate] = useState('');
  const date = dates.includes(selectedDate) ? selectedDate : dates[0];
  if (!date) return <p role="status">เลือกช่วงวันที่กิจกรรมก่อน (ไม่เกิน 366 วัน)</p>;
  const day = rules[date] || defaultEventDay(date);
  const locked = disabled || day.locked || date < today;
  const filtered = members.filter(m => (!department || Number(m.dept_id) === Number(department)) && `${m.name} ${m.nickname}`.toLowerCase().includes(search.toLowerCase()));
  const update = patch => setRules({ ...rules, [date]: { ...day, ...patch } });
  return <section className="event-attendance-editor">
    <h3>👥 ผู้เข้าร่วมและการเช็คชื่อ</h3><p>เลือกวัน รายชื่อ และกติกาของวันนั้น สมาชิกที่ไม่ถูกเลือกยังเช็คชื่อตามปกติ</p>
    <label className="form-label">วันที่ตั้งค่า<select className="select-field" value={date} onChange={e => setSelectedDate(e.target.value)}>{dates.map(d => <option key={d} value={d}>{new Date(d + 'T12:00:00+07:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })} · {(rules[d]?.participants || []).length} คน{rules[d]?.locked || d < today ? ' · ล็อกแล้ว' : ''}</option>)}</select></label>
    {locked && <p className="event-day-locked">วันนี้ถูกล็อก ไม่สามารถแก้กติกาหรือรายชื่อได้</p>}
    <fieldset disabled={locked}><label className="form-label">การเช็คชื่อ<select aria-label="การเช็คชื่อ" className="select-field" value={day.mode} onChange={e => update({ mode: e.target.value })}><option value="check">ต้องเช็คชื่อตามเวลาของกิจกรรม</option><option value="exempt">ยกเว้นเช็คชื่อประจำวันทั้งวัน</option></select></label>
      {day.mode === 'check' && <div className="event-attendance-times">{[['opens_at','เปิดรับ'],['late_at','เริ่มสายหลังเวลา'],['closes_at','ปิดรับ']].map(([key,label]) => <label className="form-label" key={key}>{label}<input className="input-field" type="time" required value={day[key]} onChange={e => update({ [key]: e.target.value })}/></label>)}</div>}
      <div className="event-member-filters"><input className="input-field" aria-label="ค้นหาสมาชิกกิจกรรม" placeholder="ค้นหาชื่อหรือชื่อเล่น…" value={search} onChange={e => setSearch(e.target.value)}/><select className="select-field" aria-label="กรองฝ่ายผู้เข้าร่วม" value={department} onChange={e => setDepartment(e.target.value)}><option value="">ทุกฝ่าย</option>{DEPARTMENTS.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
      <div className="event-member-toolbar"><strong>เลือกแล้ว {day.participants.length} คน</strong><button type="button" onClick={() => update({ participants: [...new Set([...day.participants,...filtered.map(m => String(m.id))])] })}>เลือกทั้งหมดที่แสดง</button><button type="button" onClick={() => update({ participants: [] })}>ล้างรายชื่อวันนี้</button></div>
      <div className="event-members">{filtered.map(m => <label key={m.id}><input type="checkbox" checked={day.participants.includes(String(m.id))} onChange={e => update({ participants: e.target.checked ? [...day.participants,String(m.id)] : day.participants.filter(id => id !== String(m.id)) })}/><span>{m.name}<small>{m.nickname} · {DEPARTMENTS.find(d => d.id === m.dept_id)?.short || 'สมาชิกสภา'}</small></span></label>)}{!filtered.length && <p>ไม่พบสมาชิกที่ค้นหา</p>}</div>
      <button type="button" className="event-copy-days" onClick={() => {
        const next = { ...rules };
        for (const target of dates) if (target !== date && target >= today && !rules[target]?.locked) next[target] = { ...day, date: target, participants: [...day.participants], locked: false };
        setRules(next);
      }}>คัดลอกรายชื่อและเวลาวันนี้ไปทุกวันที่ยังไม่ล็อก</button>
    </fieldset>
    <details className="event-day-summary" open><summary>สรุปก่อนบันทึก · {dates.length} วัน</summary>{dates.map(d => { const rule = rules[d] || defaultEventDay(d);return <div key={d}><strong>{d} · {rule.participants.length} คน</strong><span>{rule.mode === 'exempt' ? 'ยกเว้นเช็คชื่อ' : `${rule.opens_at} เปิด · ${rule.late_at} เริ่มสาย · ${rule.closes_at} ปิด`}</span><small>{rule.participants.map(id => members.find(m => String(m.id) === id)?.name || id).join(', ') || 'ไม่มีผู้เข้าร่วม'}</small></div>; })}</details>
  </section>;
}
