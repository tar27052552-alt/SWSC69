import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, getAdminClient, jsonResponse } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const authHeader = req.headers.get('Authorization');
    if (!url || !anonKey || !authHeader) return jsonResponse({ error: 'ต้องเข้าสู่ระบบก่อน' }, 401);

    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await caller.auth.getUser();
    if (authError || !authData.user) return jsonResponse({ error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' }, 401);

    const { oldPassword, newPassword } = await req.json();
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return jsonResponse({ error: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร' }, 400);
    }

    const admin = getAdminClient();
    const { data: profile, error: profileError } = await admin.from('users')
      .select('id,student_id,password_hash,must_change_password,banned')
      .eq('auth_user_id', authData.user.id)
      .maybeSingle();
    if (profileError || !profile || profile.banned) {
      return jsonResponse({ error: 'ไม่พบบัญชีหรือเซสชันไม่ถูกต้อง' }, 403);
    }

    if (!profile.must_change_password || oldPassword) {
      if (typeof oldPassword !== 'string' || !oldPassword) {
        return jsonResponse({ error: 'กรุณาระบุรหัสผ่านปัจจุบัน' }, 400);
      }
      if (profile.password_hash === '!supabase-auth!') {
        if (!authData.user.email) return jsonResponse({ error: 'ไม่พบอีเมลบัญชี' }, 403);
        const passwordClient = createClient(url, anonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { error: verifyError } = await passwordClient.auth.signInWithPassword({
          email: authData.user.email,
          password: oldPassword,
        });
        if (verifyError) return jsonResponse({ error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' }, 401);
      } else {
        const clientIp = req.headers.get('cf-connecting-ip')
          || req.headers.get('x-real-ip')
          || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
          || 'unknown';
        const { data: verified, error: verifyError } = await admin.rpc('verify_legacy_student_login', {
          p_student_id: profile.student_id,
          p_password: oldPassword,
          p_client_ip: clientIp,
        });
        const legacyUser = Array.isArray(verified) ? verified[0] : null;
        if (verifyError || legacyUser?.id !== profile.id) {
          return jsonResponse({ error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' }, 401);
        }
      }
    }

    const { error: passwordError } = await admin.auth.admin.updateUserById(authData.user.id, {
      password: newPassword,
    });
    if (passwordError) {
      return jsonResponse({ error: passwordError.message || 'ตั้งรหัสผ่านใหม่ไม่สำเร็จ' }, 400);
    }

    const { error: profileUpdateError } = await admin.from('users').update({
      must_change_password: false,
      password_hash: '!supabase-auth!',
    }).eq('id', profile.id);
    if (profileUpdateError) throw profileUpdateError;

    return jsonResponse({ success: true });
  } catch (error) {
    console.error('Legacy password migration failed:', error);
    return jsonResponse({ error: 'บันทึกรหัสผ่านใหม่ไม่สำเร็จ กรุณาลองอีกครั้ง' }, 500);
  }
});
