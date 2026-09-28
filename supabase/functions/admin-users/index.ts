import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, getAdminClient, jsonResponse, studentAuthEmail } from '../_shared/auth.ts';

const publicFields = 'id,name,nickname,student_id,phone,dept_id,role,position,avatar,avatar_color,banned,auth_user_id';
const allowedRoles = new Set(['admin', 'president', 'dept_head', 'member']);

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

    const admin = getAdminClient();
    const { data: actor } = await admin.from('users').select('role,banned')
      .eq('auth_user_id', authData.user.id).maybeSingle();
    if (!actor || actor.role !== 'admin' || actor.banned) {
      return jsonResponse({ error: 'ไม่มีสิทธิ์จัดการสมาชิก' }, 403);
    }

    const body = await req.json();
    if (body.action === 'list') {
      const { data, error } = await admin.from('users').select(publicFields).order('created_at', { ascending: true });
      if (error) throw error;
      return jsonResponse({ users: data || [] });
    }

    if (body.action === 'save') {
      const input = body.user;
      if (!input || typeof input.name !== 'string' || typeof input.nickname !== 'string'
        || typeof input.student_id !== 'string' || !allowedRoles.has(input.role)) {
        return jsonResponse({ error: 'ข้อมูลสมาชิกไม่ครบหรือไม่ถูกต้อง' }, 400);
      }

      const isNew = Boolean(body.isNew) || !input.id;
      const studentId = input.student_id.trim();
      if (!studentId) return jsonResponse({ error: 'กรุณาระบุรหัสนักเรียน' }, 400);
      if (typeof body.password === 'string' && body.password && body.password.length < 8) {
        return jsonResponse({ error: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' }, 400);
      }

      if (isNew) {
        if (typeof body.password !== 'string' || body.password.length < 8) {
          return jsonResponse({ error: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' }, 400);
        }
        const { data: created, error: createError } = await admin.auth.admin.createUser({
          email: studentAuthEmail(studentId),
          password: body.password,
          email_confirm: true,
        });
        if (createError || !created.user) throw createError || new Error('สร้างบัญชี Auth ไม่สำเร็จ');

        const { data: saved, error: saveError } = await admin.from('users').insert({
          id: input.id,
          name: input.name.trim(), nickname: input.nickname.trim(), student_id: studentId,
          phone: input.phone || null, dept_id: input.dept_id || null, role: input.role,
          position: input.position || '', avatar: input.avatar || null,
          avatar_color: input.avatar_color || null, banned: Boolean(input.banned),
          auth_user_id: created.user.id, password_hash: '!supabase-auth!',
        }).select(publicFields).single();
        if (saveError) {
          await admin.auth.admin.deleteUser(created.user.id);
          throw saveError;
        }
        return jsonResponse({ user: saved });
      }

      const { data: existing, error: existingError } = await admin.from('users')
        .select('id,auth_user_id,student_id').eq('id', input.id).single();
      if (existingError) throw existingError;

      let authUserId = existing.auth_user_id;
      if (authUserId) {
        const attrs: Record<string, unknown> = {
          email: studentAuthEmail(studentId),
          email_confirm: true,
        };
        if (typeof body.password === 'string' && body.password) attrs.password = body.password;
        const { error } = await admin.auth.admin.updateUserById(authUserId, attrs);
        if (error) throw error;
      } else if (typeof body.password === 'string' && body.password) {
        const { error } = await admin.rpc('set_user_password', { p_user_id: input.id, p_password: body.password });
        if (error) throw error;
      }

      const { data: saved, error: saveError } = await admin.from('users').update({
        name: input.name.trim(), nickname: input.nickname.trim(), student_id: studentId,
        phone: input.phone || null, dept_id: input.dept_id || null, role: input.role,
        position: input.position || '', avatar: input.avatar || null,
        avatar_color: input.avatar_color || null, banned: Boolean(input.banned),
        ...(authUserId && body.password ? { password_hash: '!supabase-auth!', must_change_password: false } : {}),
      }).eq('id', input.id).select(publicFields).single();
      if (saveError) throw saveError;
      return jsonResponse({ user: saved });
    }

    if (body.action === 'delete') {
      const userId = String(body.userId || '');
      const { data: target, error: targetError } = await admin.from('users')
        .select('id,auth_user_id,nickname').eq('id', userId).single();
      if (targetError) throw targetError;
      if (!userId || target.auth_user_id === authData.user.id) {
        return jsonResponse({ error: 'ไม่สามารถลบบัญชีนี้ได้' }, 400);
      }

      const cleanup = [
        ['discipline_fines', 'user_id', userId], ['student_attendance', 'user_id', userId],
        ['notifications', 'user_id', userId], ['event_participants', 'user_id', userId],
      ];
      for (const [table, column, value] of cleanup) {
        const { error } = await admin.from(table).delete().eq(column, value);
        if (error) throw error;
      }
      if (target.nickname) {
        const { error: cleanError } = await admin.from('clean_duty_checks').delete().eq('nickname', target.nickname);
        const { error: greetingError } = await admin.from('greeting_duty_checks').delete().eq('nickname', target.nickname);
        if (cleanError) throw cleanError;
        if (greetingError) throw greetingError;
      }
      const { data: fees, error: feesError } = await admin.from('finance_fees').select('id,payments');
      if (feesError) throw feesError;
      for (const fee of fees || []) {
        if (!fee.payments?.[userId]) continue;
        const payments = { ...fee.payments };
        delete payments[userId];
        const { error } = await admin.from('finance_fees').update({ payments }).eq('id', fee.id);
        if (error) throw error;
      }
      if (target.auth_user_id) await admin.auth.admin.deleteUser(target.auth_user_id);
      const { error: deleteError } = await admin.from('users').delete().eq('id', userId);
      if (deleteError) throw deleteError;
      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: 'ไม่รู้จักคำสั่งนี้' }, 400);
  } catch (error) {
    console.error('Admin user action failed:', error);
    return jsonResponse({ error: error instanceof Error ? error.message : 'ดำเนินการไม่สำเร็จ' }, 500);
  }
});
