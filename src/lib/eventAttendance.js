export function thaiToday(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function eventDates(start, end = start) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start || '') || !/^\d{4}-\d{2}-\d{2}$/.test(end || '') || end < start) return [];
  const result = [], stop = Date.parse(end + 'T00:00:00Z');
  for (let current = Date.parse(start + 'T00:00:00Z'); current <= stop && result.length <= 366; current += 86400000) result.push(new Date(current).toISOString().slice(0, 10));
  return result.length > 366 ? [] : result;
}
export function defaultEventDay(date) { return { date, mode: 'check', opens_at: '07:00', late_at: '07:35', closes_at: '08:00', participants: [] }; }
export function validateEventDays(days) {
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  for (const day of days) {
    if (!['check', 'exempt'].includes(day.mode)) throw new Error('กรุณาเลือกกติกาเช็คชื่อ');
    if (day.mode === 'check' && (!time.test(day.opens_at) || !time.test(day.late_at) || !time.test(day.closes_at) || day.opens_at > day.late_at || day.late_at > day.closes_at || day.opens_at >= day.closes_at)) throw new Error(`เวลาเช็คชื่อวันที่ ${day.date} ไม่ถูกต้อง`);
    if (new Set(day.participants).size !== day.participants.length) throw new Error('มีรายชื่อซ้ำในวันเดียวกัน');
  }
  return days;
}
export function dayRuleFromRows(day, members) { return { date: day.date, mode: day.mode, opens_at: day.opens_at?.slice(0,5) || '07:00', late_at: day.late_at?.slice(0,5) || '07:35', closes_at: day.closes_at?.slice(0,5) || '08:00', participants: members.filter(m => m.event_id === day.event_id && m.date === day.date).map(m => String(m.user_id)), locked: day.locked === true }; }
