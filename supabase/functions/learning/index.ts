import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, getAdminClient, jsonResponse } from '../_shared/auth.ts';

type QuizQuestion = {
  id: string;
  prompt: string;
  options: string[];
  correctOption: number;
};

function fail(message: string, status = 400) {
  return jsonResponse({ error: message }, status);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('Method not allowed', 405);

  try {
    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const authorization = req.headers.get('Authorization');
    if (!url || !anonKey || !authorization) return fail('กรุณายืนยันอีเมลก่อน', 401);

    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await caller.auth.getUser();
    const user = authData.user;
    if (authError || !user || !user.email || !user.email_confirmed_at) {
      return fail('กรุณายืนยันอีเมลก่อน', 401);
    }

    const body = await req.json();
    const action = String(body.action || '');
    const admin = getAdminClient();

    if (action === 'me') {
      const [{ data: profile, error: profileError },
        { data: certificates, error: certificatesError },
        { data: attempts, error: attemptsError }] = await Promise.all([
        admin.from('learning_profiles').select('full_name').eq('user_id', user.id).maybeSingle(),
        admin.from('learning_certificates')
          .select('id,subject_id,certificate_number,recipient_name,issued_at,email_status,pdf_path')
          .eq('user_id', user.id).order('issued_at', { ascending: false }),
        admin.from('learning_attempts').select('subject_id,phase,score,total')
          .eq('user_id', user.id),
      ]);
      if (profileError || certificatesError || attemptsError) {
        throw profileError || certificatesError || attemptsError;
      }
      const progress: Record<string, { preCompleted: boolean; bestPostScore: number; postTotal: number }> = {};
      for (const attempt of attempts || []) {
        const item = progress[attempt.subject_id] ||= {
          preCompleted: false, bestPostScore: -1, postTotal: 10,
        };
        if (attempt.phase === 'pre') item.preCompleted = true;
        if (attempt.phase === 'post' && attempt.score > item.bestPostScore) {
          item.bestPostScore = attempt.score;
          item.postTotal = attempt.total;
        }
      }
      return jsonResponse({
        email: user.email,
        profile,
        progress,
        certificates: (certificates || []).map(({ pdf_path: _path, ...certificate }) => ({
          ...certificate,
          downloadable: Boolean(_path),
        })),
      });
    }

    if (action === 'save_name') {
      const name = String(body.fullName || '').trim().replace(/\s+/g, ' ');
      if (name.length < 2 || name.length > 120) return fail('กรุณาระบุชื่อ 2–120 ตัวอักษร');
      const { data: existing, error: existingError } = await admin.from('learning_profiles')
        .select('full_name').eq('user_id', user.id).maybeSingle();
      if (existingError) throw existingError;
      if (existing) return jsonResponse({ fullName: existing.full_name });
      const { data: profile, error } = await admin.from('learning_profiles')
        .insert({ user_id: user.id, full_name: name })
        .select('full_name').single();
      if (error) throw error;
      return jsonResponse({ fullName: profile.full_name });
    }

    if (action === 'quiz' || action === 'submit') {
      const subjectId = String(body.subjectId || '');
      const phase = String(body.phase || 'post');
      if (!/^civic-[1-5]$/.test(subjectId) || !['pre', 'post'].includes(phase)) {
        return fail('ไม่พบบทเรียนหรือแบบทดสอบ');
      }
      const { data: allowed, error: accessError } = await admin.rpc('get_learning_course_access', {
        p_user_id: user.id, p_subject_id: subjectId, p_phase: phase,
      });
      if (accessError) throw accessError;
      if (!allowed) return fail('ยังไม่สามารถทำแบบทดสอบบทนี้ได้', 403);
      const { data: bank, error: bankError } = await admin.rpc('get_learning_question_bank', {
        p_subject_id: subjectId,
        p_phase: phase,
      });
      if (bankError) throw bankError;
      const questions = bank as QuizQuestion[];
      if (!Array.isArray(questions) || questions.length !== 10) {
        return fail('แบบทดสอบยังไม่พร้อมใช้งาน', 503);
      }
      if (action === 'quiz') {
        return jsonResponse({
          questions: questions.map(({ id, prompt, options }) => ({ id, prompt, options })),
        });
      }

      const { data: profile, error: profileError } = await admin.from('learning_profiles')
        .select('full_name').eq('user_id', user.id).maybeSingle();
      if (profileError) throw profileError;
      if (!profile) return fail('กรุณาบันทึกชื่อผู้เรียนก่อนทำแบบทดสอบ');
      const answers = body.answers;
      if (!answers || typeof answers !== 'object' || Array.isArray(answers) ||
        Object.keys(answers).length !== questions.length) {
        return fail('กรุณาตอบคำถามให้ครบทุกข้อ');
      }
      let score = 0;
      for (const question of questions) {
        const answer = answers[question.id];
        if (!Number.isInteger(answer) || answer < 0 || answer >= question.options.length) {
          return fail('คำตอบไม่ถูกต้องหรือไม่ครบ');
        }
        if (answer === question.correctOption) score++;
      }
      const { data: result, error: resultError } = await admin.rpc('record_learning_result', {
        p_user_id: user.id,
        p_subject_id: subjectId,
        p_phase: phase,
        p_score: score,
        p_total: questions.length,
      });
      if (resultError) throw resultError;
      return jsonResponse({
        score,
        total: questions.length,
        percent: Math.round(score * 100 / questions.length),
        passed: Boolean(result?.passed),
        unlockedNext: phase === 'post' && score * 100 >= questions.length * 60,
        certificateId: result?.certificateId || null,
      });
    }

    if (action === 'download') {
      const certificateId = String(body.certificateId || '');
      const { data: certificate, error } = await admin.from('learning_certificates')
        .select('pdf_path').eq('id', certificateId).eq('user_id', user.id).maybeSingle();
      if (error) throw error;
      if (!certificate?.pdf_path) return fail('เกียรติบัตรยังอยู่ระหว่างจัดทำ', 404);
      const { data: signed, error: signedError } = await admin.storage
        .from('learning-certificates').createSignedUrl(certificate.pdf_path, 60);
      if (signedError) throw signedError;
      return jsonResponse({ url: signed.signedUrl });
    }

    if (action === 'resend') {
      const certificateId = String(body.certificateId || '');
      const { data: certificate, error: certificateError } = await admin
        .from('learning_certificates')
        .select('id,emailed_at,pdf_path').eq('id', certificateId)
        .eq('user_id', user.id).maybeSingle();
      if (certificateError) throw certificateError;
      if (!certificate) return fail('ไม่พบเกียรติบัตร', 404);
      if (certificate.emailed_at &&
        Date.now() - new Date(certificate.emailed_at).getTime() < 10 * 60 * 1000) {
        return fail('กรุณารอ 10 นาทีก่อนส่งซ้ำ', 429);
      }
      const { data: outstanding, error: outstandingError } = await admin
        .from('learning_delivery_jobs').select('id,status')
        .eq('certificate_id', certificate.id)
        .in('status', ['pending', 'processing', 'failed']).maybeSingle();
      if (outstandingError) throw outstandingError;
      if (outstanding && outstanding.status !== 'failed') {
        return fail('เกียรติบัตรกำลังรอส่งอยู่', 409);
      }
      const { error } = outstanding
        ? await admin.from('learning_delivery_jobs')
          .update({ status: 'pending', available_at: new Date().toISOString() })
          .eq('id', outstanding.id).eq('status', 'failed')
        : await admin.from('learning_delivery_jobs')
          .insert({ certificate_id: certificate.id });
      if (error?.code === '23505') return fail('เกียรติบัตรกำลังรอส่งอยู่', 409);
      if (error) throw error;
      return jsonResponse({ queued: true });
    }

    return fail('Unknown action', 404);
  } catch (error) {
    console.error('Learning API error:', error);
    return fail('ระบบบทเรียนขัดข้อง กรุณาลองใหม่', 500);
  }
});
