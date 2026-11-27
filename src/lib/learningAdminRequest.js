import { supabase } from '../supabaseClient';
import { fetchWithDeadline } from './requestDeadline';

const reads = new Set(['list', 'read_quiz', 'learner_overview', 'learner_roster', 'learner_detail', 'certificate_jobs', 'lookup_certificate']);
export async function adminRequest(body) {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!session?.access_token) throw new Error('กรุณาเข้าสู่ระบบหลังบ้าน');
  const { response, text } = await fetchWithDeadline(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/learning-admin`, {
    method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, 30000, !reads.has(body.action));
  const data = JSON.parse(text);
  if (!response.ok || data?.error) throw new Error(data?.error || 'โหลดข้อมูลไม่สำเร็จ');
  return data;
}
