import { supabase } from '../supabaseClient';
export async function myAttendancePolicy(date, signal) {
  const { data, error } = await supabase.rpc('get_my_checkin_context', { p_date: date }).abortSignal(signal || AbortSignal.timeout(30000));
  // An older backend can continue regular attendance while the migration is staged.
  if (error && ['PGRST202','42883'].includes(error.code)) return null;
  if (error) throw error;
  if (!data || !['regular','check','exempt'].includes(data.mode)) throw new Error('ข้อมูลกติกาเช็คชื่อไม่ถูกต้อง กรุณารีเฟรช');
  return data;
}
export async function myEventAttendance(from, to) {
  const { data, error } = await supabase.rpc('get_my_event_attendance', { p_from: from, p_to: to }).abortSignal(AbortSignal.timeout(30000));
  if (error && ['PGRST202','42883'].includes(error.code)) return [];
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('ข้อมูลประวัติกิจกรรมไม่ถูกต้อง');
  return data || [];
}
