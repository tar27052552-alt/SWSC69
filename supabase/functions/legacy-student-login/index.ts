import { corsHeaders, getAdminClient, jsonResponse, studentAuthEmail } from '../_shared/auth.ts';

async function createLegacyMagicLink(admin: ReturnType<typeof getAdminClient>, email: string) {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (error || !data?.properties?.hashed_token) {
    throw error || new Error('สร้างเซสชันเข้าสู่ระบบไม่สำเร็จ');
  }
  return data.properties.hashed_token;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  try {
    const { studentId, password } = await req.json();
    if (typeof studentId !== 'string' || typeof password !== 'string' || !studentId.trim() || !password) {
      return jsonResponse({ error: 'กรุณากรอกรหัสนักเรียนและรหัสผ่าน' }, 400);
    }

    const admin = getAdminClient();
    const { data: profile, error: profileError } = await admin
      .from('users')
      .select('id,student_id,auth_user_id,banned,must_change_password,password_hash')
      .eq('student_id', studentId.trim())
      .maybeSingle();

    if (profileError || !profile || profile.banned) {
      return jsonResponse({ error: 'รหัสนักเรียนหรือรหัสผ่านไม่ถูกต้อง หรือบัญชีถูกระงับ' }, 401);
    }

    const email = studentAuthEmail(profile.student_id);
    if (profile.auth_user_id && profile.password_hash === '!supabase-auth!' && !profile.must_change_password) {
      return jsonResponse({ email });
    }

    if (profile.password_hash === '!supabase-auth!') {
      return jsonResponse({ error: 'ข้อมูลบัญชีไม่สมบูรณ์ กรุณาติดต่อผู้ดูแลระบบ' }, 409);
    }

    const forwardedFor = req.headers.get('cf-connecting-ip')
      || req.headers.get('x-real-ip')
      || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || 'unknown';
    const { data: verified, error: verifyError } = await admin.rpc('verify_legacy_student_login', {
      p_student_id: studentId.trim(),
      p_password: password,
      p_client_ip: forwardedFor,
    });
    const legacyUser = Array.isArray(verified) ? verified[0] : null;
    if (verifyError || !legacyUser || legacyUser.id !== profile.id) {
      return jsonResponse({ error: 'รหัสนักเรียนหรือรหัสผ่านไม่ถูกต้อง' }, 401);
    }

    if (profile.auth_user_id) {
      const tokenHash = await createLegacyMagicLink(admin, email);
      if (profile.must_change_password) {
        const { error: updateError } = await admin.from('users')
          .update({ must_change_password: false }).eq('id', profile.id);
        if (updateError) throw updateError;
      }
      return jsonResponse({ email, token_hash: tokenHash });
    }

    // Supabase Auth may reject older short passwords. Keep the legacy hash on
    // the server and exchange a verified password for a short-lived Auth link.
    const temporaryPassword = `${crypto.randomUUID()}A1!${crypto.randomUUID()}`;
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
      app_metadata: { council_user_id: profile.id },
    });

    if (createError || !created.user) {
      // A parallel first login may have completed the link after our read.
      const { data: latest } = await admin.from('users')
        .select('auth_user_id').eq('id', profile.id).maybeSingle();
      if (!latest?.auth_user_id) {
        return jsonResponse({ error: 'ย้ายบัญชีไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' }, 409);
      }
      const tokenHash = await createLegacyMagicLink(admin, email);
      const { error: updateError } = await admin.from('users')
        .update({ must_change_password: false }).eq('id', profile.id);
      if (updateError) throw updateError;
      return jsonResponse({ email, token_hash: tokenHash });
    }

    let tokenHash: string;
    try {
      tokenHash = await createLegacyMagicLink(admin, email);
    } catch (error) {
      await admin.auth.admin.deleteUser(created.user.id);
      throw error;
    }

    const { data: linked, error: linkError } = await admin.from('users')
      .update({ auth_user_id: created.user.id, must_change_password: false })
      .eq('id', profile.id)
      .is('auth_user_id', null)
      .select('id')
      .maybeSingle();

    if (linkError || !linked) {
      await admin.auth.admin.deleteUser(created.user.id);
      return jsonResponse({ error: 'เชื่อมบัญชีกับสมาชิกไม่สำเร็จ กรุณาลองใหม่' }, 409);
    }

    return jsonResponse({ email, token_hash: tokenHash });
  } catch (error) {
    console.error('Legacy student login failed:', error);
    return jsonResponse({ error: 'ไม่สามารถเข้าสู่ระบบได้ในขณะนี้' }, 500);
  }
});
