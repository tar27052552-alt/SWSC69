import { supabase } from '../supabaseClient';
import { applySupabase } from './applySupabaseClient';

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/recruitment`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export async function callRecruitment(payload, { requireAuth = true, client = null } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    apikey: ANON_KEY,
  };

  if (requireAuth) {
    const authClient = client || (String(payload?.action || '').startsWith('admin_') ? supabase : applySupabase);
    const { data: { session } } = await authClient.auth.getSession();
    if (!session?.access_token) {
      throw new Error('กรุณาเข้าสู่ระบบด้วยอีเมลโรงเรียน (@sappha.ac.th)');
    }
    headers.Authorization = `Bearer ${session.access_token}`;
  } else {
    headers.Authorization = `Bearer ${ANON_KEY}`;
  }

  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `คำขอล้มเหลว (${res.status})`);
  }
  return data;
}

export async function uploadRecruitmentDoc({ memberId, docType, file }) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (!allowed.includes(file.type)) {
    throw new Error('รองรับเฉพาะไฟล์ JPG, PNG, WebP หรือ PDF เท่านั้น');
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('ขนาดไฟล์ต้องไม่เกิน 10 MB');
  }

  const { path, token } = await callRecruitment({
    action: 'get_upload_url',
    memberId,
    docType,
    mimeType: file.type,
  });

  const { error } = await applySupabase.storage
    .from('recruitment-docs')
    .uploadToSignedUrl(path, token, file, { contentType: file.type });

  if (error) {
    throw new Error(error.message || 'อัปโหลดไฟล์ไม่สำเร็จ');
  }
  return path;
}
