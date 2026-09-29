import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, getAdminClient, jsonResponse } from '../_shared/auth.ts';

const EDITION = 'civic-dna-2026';
type Topic = { id: string; title: string; blocks?: unknown[]; resources?: Array<{ type: string; path?: string; videoId?: string }> };

function fail(error: string, status = 400) { return jsonResponse({ error }, status); }

function tokenUsesGoogle(token: string, user: { identities?: Array<{ provider: string }> }) {
  try {
    const encoded = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(encoded)) as { amr?: Array<{ method: string }> };
    return claims.amr?.some(entry => entry.method === 'oauth') === true &&
      user.identities?.some(identity => identity.provider === 'google') === true;
  } catch { return false; }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('Method not allowed', 405);
  try {
    const body = await req.json();
    const action = String(body.action || '');
    const admin = getAdminClient();
    const { data: edition, error: editionError } = await admin.from('learning_editions')
      .select('published,certificates_enabled').eq('id', EDITION).single();
    if (editionError) throw editionError;
    if (action === 'catalog') {
      const { data, error } = await admin.from('learning_subject_editions')
        .select('subject_id,ordinal,title,summary,published_topics,published_revision')
        .eq('edition_id', EDITION).order('ordinal');
      if (error) throw error;
      return jsonResponse({ published: edition.published,
        subjects: (data || []).map(subject => ({
          id: subject.subject_id, ordinal: subject.ordinal, title: subject.title,
          summary: subject.summary, revision: subject.published_revision,
          topics: edition.published ? (subject.published_topics as Topic[]).map(topic =>
            ({ id: topic.id, title: topic.title })) : [],
        })) });
    }

    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return fail('กรุณาเข้าสู่ระบบด้วย Google', 401);
    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!url || !anonKey) throw new Error('Missing Auth configuration');
    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await caller.auth.getUser();
    const user = authData.user;
    if (authError || !user?.email || !user.email_confirmed_at || !tokenUsesGoogle(token, user)) {
      return fail('กรุณาเข้าสู่ระบบด้วยบัญชี Google ที่ยืนยันแล้ว', 401);
    }
    if (!edition.published) return fail('หลักสูตรยังไม่เปิดใช้งาน', 503);

    const { data: enrollment, error: enrollmentError } = await admin.from('learning_enrollments')
      .select('full_name').eq('user_id', user.id).eq('edition_id', EDITION).maybeSingle();
    if (enrollmentError) throw enrollmentError;

    if (action === 'me') {
      const [{ data: attempts, error: attemptError },
        { data: completions, error: completionError },
        { data: certificates, error: certificateError }] = await Promise.all([
        admin.from('learning_attempts').select('subject_id,phase,score,total')
          .eq('user_id', user.id).eq('edition_id', EDITION),
        admin.from('learning_topic_completions').select('subject_id,topic_id')
          .eq('user_id', user.id).eq('edition_id', EDITION),
        admin.from('learning_certificates')
          .select('id,subject_id,certificate_number,recipient_name,issued_at,email_status,pdf_path')
          .eq('user_id', user.id).eq('edition_id', EDITION).order('issued_at', { ascending: false }),
      ]);
      if (attemptError || completionError || certificateError) throw attemptError || completionError || certificateError;
      const progress: Record<string, { preCompleted: boolean; bestPostScore: number; completedTopicIds: string[] }> = {};
      for (const attempt of attempts || []) {
        const item = progress[attempt.subject_id] ||= { preCompleted: false, bestPostScore: -1, completedTopicIds: [] };
        if (attempt.phase === 'pre') item.preCompleted = true;
        if (attempt.phase === 'post') item.bestPostScore = Math.max(item.bestPostScore, attempt.score);
      }
      for (const completion of completions || []) {
        const item = progress[completion.subject_id] ||= { preCompleted: false, bestPostScore: -1, completedTopicIds: [] };
        item.completedTopicIds.push(completion.topic_id);
      }
      return jsonResponse({ email: user.email, profile: enrollment, progress,
        certificatesEnabled: edition.certificates_enabled,
        certificates: (certificates || []).map(({ pdf_path: _path, ...certificate }) =>
          ({ ...certificate, downloadable: Boolean(_path) })) });
    }
    if (action === 'save_name') {
      const name = String(body.fullName || '').trim().replace(/\s+/g, ' ');
      if (name.length < 2 || name.length > 120) return fail('กรุณาระบุชื่อจริง 2–120 ตัวอักษร');
      if (enrollment) return jsonResponse({ fullName: enrollment.full_name });
      const { data, error } = await admin.from('learning_enrollments')
        .insert({ user_id: user.id, edition_id: EDITION, full_name: name })
        .select('full_name').single();
      if (error) throw error;
      return jsonResponse({ fullName: data.full_name });
    }
    if (!enrollment) return fail('กรุณาบันทึกชื่อจริงก่อนเริ่มเรียน', 403);

    const subjectId = String(body.subjectId || '');
    const subjectActions = ['topic', 'complete_topic', 'material', 'report_media', 'quiz', 'submit'];
    let subject: { ordinal: number; published_topics: Topic[]; published_revision: number } | null = null;
    let attempts: Array<{ subject_id: string; phase: string; score: number }> = [];
    let completions: Array<{ topic_id: string }> = [];
    if (subjectActions.includes(action)) {
      if (!/^civic-[1-5]$/.test(subjectId)) return fail('ไม่พบวิชา', 404);
      const [{ data: subjectData, error: subjectError },
        { data: attemptData, error: attemptError },
        { data: completionData, error: completionError }] = await Promise.all([
        admin.from('learning_subject_editions').select('ordinal,published_topics,published_revision')
          .eq('edition_id', EDITION).eq('subject_id', subjectId).single(),
        admin.from('learning_attempts').select('subject_id,phase,score')
          .eq('user_id', user.id).eq('edition_id', EDITION),
        admin.from('learning_topic_completions').select('topic_id')
          .eq('user_id', user.id).eq('edition_id', EDITION).eq('subject_id', subjectId),
      ]);
      if (subjectError || attemptError || completionError) throw subjectError || attemptError || completionError;
      subject = subjectData;
      attempts = attemptData || [];
      completions = completionData || [];
      const previousId = `civic-${subject.ordinal - 1}`;
      if (subject.ordinal > 1 && !attempts.some(item => item.subject_id === previousId &&
        item.phase === 'post' && item.score >= 6)) return fail('วิชานี้ยังไม่ปลดล็อก', 403);
    }
    const hasPretest = attempts.some(item => item.subject_id === subjectId && item.phase === 'pre');
    const topics = subject?.published_topics || [];
    const completed = new Set(completions.map(item => item.topic_id));
    const topicIndex = topics.findIndex(topic => topic.id === body.topicId);
    const canOpenTopic = hasPretest && topicIndex >= 0 &&
      topics.slice(0, topicIndex).every(topic => completed.has(topic.id));

    if (action === 'topic') {
      if (!canOpenTopic) return fail('ทำแบบทดสอบก่อนเรียนและเรียนหัวข้อก่อนหน้าให้ครบ', 403);
      return jsonResponse({ topic: topics[topicIndex], index: topicIndex, total: topics.length });
    }
    if (action === 'complete_topic') {
      if (!canOpenTopic) return fail('หัวข้อนี้ยังไม่ปลดล็อก', 403);
      const { error } = await admin.from('learning_topic_completions').upsert({
        user_id: user.id, edition_id: EDITION, subject_id: subjectId,
        topic_id: topics[topicIndex].id,
      }, { onConflict: 'user_id,edition_id,subject_id,topic_id', ignoreDuplicates: true });
      if (error) throw error;
      return jsonResponse({ completed: true });
    }
    if (action === 'material') {
      if (!canOpenTopic) return fail('สื่อนี้ยังไม่ปลดล็อก', 403);
      const path = String(body.path || '');
      const topic = topics[topicIndex];
      const resources = topic.resources || [];
      const blockPaths = (topic.blocks || []).flatMap(block => {
        const value = block as { path?: string; imagePath?: string };
        return [value.path, value.imagePath].filter(Boolean);
      });
      if (!resources.some(item => item.path === path) && !blockPaths.includes(path)) {
        return fail('ไม่พบสื่อในหัวข้อนี้', 404);
      }
      const { data, error } = await admin.storage.from('learning-materials').createSignedUrl(path, 300);
      if (error) throw error;
      return jsonResponse({ url: data.signedUrl });
    }
    if (action === 'report_media') {
      if (!canOpenTopic) return fail('สื่อนี้ยังไม่ปลดล็อก', 403);
      const videoId = String(body.videoId || '');
      if (!topics[topicIndex].resources?.some(item => item.type === 'video' && item.videoId === videoId)) {
        return fail('ไม่พบวิดีโอในหัวข้อนี้', 404);
      }
      const sourceReference = `ผู้เรียนแจ้งวิดีโอ ${videoId} ใน ${subjectId}/${topics[topicIndex].id}`;
      const { data: existing, error: checkError } = await admin.from('learning_review_notes')
        .select('id').eq('edition_id', EDITION).eq('subject_id', subjectId)
        .eq('source_reference', sourceReference).eq('status', 'pending').limit(1);
      if (checkError) throw checkError;
      if (!existing?.length) {
        const { error } = await admin.from('learning_review_notes').insert({
          edition_id: EDITION, subject_id: subjectId, source_reference: sourceReference,
          proposed_change: 'ตรวจสอบและเปลี่ยนวิดีโอที่เปิดไม่ได้',
          rationale: `แจ้งโดยผู้เรียน ${user.id}`,
        });
        if (error) throw error;
      }
      return jsonResponse({ reported: true });
    }
    if (action === 'quiz' || action === 'submit') {
      const phase = String(body.phase || '');
      if (action === 'submit' && body.revision !== subject?.published_revision) {
        return fail('บทเรียนมีฉบับใหม่ กรุณาเปิดข้อสอบอีกครั้ง', 409);
      }
      if (!['pre', 'post'].includes(phase)) return fail('ไม่พบแบบทดสอบ');
      if (phase === 'pre' && hasPretest) return fail('ทำแบบทดสอบก่อนเรียนแล้ว', 409);
      if (phase === 'post' && (!hasPretest || topics.length !== 4 ||
        !topics.every(topic => completed.has(topic.id)))) return fail('เรียนทุกหัวข้อให้ครบก่อน', 403);
      const { data, error } = await admin.rpc('get_learning_v2_questions', {
        p_subject_id: subjectId,
      });
      if (error) throw error;
      const questions = data || [];
      if (questions.length !== 10) return fail('แบบทดสอบยังไม่พร้อม', 503);
      if (action === 'quiz') return jsonResponse({ revision: subject?.published_revision,
        questions: questions.map(({ correct_option: _key, ...item }) => item) });
      const answers = body.answers;
      if (!answers || typeof answers !== 'object' || Array.isArray(answers) ||
        Object.keys(answers).length !== 10) return fail('กรุณาตอบให้ครบ 10 ข้อ');
      let score = 0;
      for (const question of questions) {
        const answer = answers[question.id];
        if (!Number.isInteger(answer) || answer < 0 || answer >= question.options.length) {
          return fail('คำตอบไม่ครบหรือไม่ถูกต้อง');
        }
        if (answer === question.correct_option) score++;
      }
      const { data: result, error: resultError } = await admin.rpc('record_learning_v2_result', {
        p_user_id: user.id, p_subject_id: subjectId, p_phase: phase, p_score: score,
      });
      if (resultError) throw resultError;
      return jsonResponse({ score, total: 10, passed: phase === 'post' && score >= 8,
        unlockedNext: phase === 'post' && score >= 6,
        certificatePending: phase === 'post' && score >= 8 && !edition.certificates_enabled,
        certificateId: result?.certificateId || null });
    }
    if (action === 'download' || action === 'resend') {
      const certificateId = String(body.certificateId || '');
      const { data: certificate, error } = await admin.from('learning_certificates')
        .select('id,pdf_path,emailed_at').eq('id', certificateId)
        .eq('user_id', user.id).eq('edition_id', EDITION).maybeSingle();
      if (error) throw error;
      if (!certificate) return fail('ไม่พบเกียรติบัตร', 404);
      if (action === 'download') {
        if (!certificate.pdf_path) return fail('กำลังจัดทำ PDF', 404);
        const { data, error: signedError } = await admin.storage.from('learning-certificates')
          .createSignedUrl(certificate.pdf_path, 60);
        if (signedError) throw signedError;
        return jsonResponse({ url: data.signedUrl });
      }
      if (!certificate.pdf_path) return fail('เกียรติบัตรกำลังจัดทำ', 409);
      if (certificate.emailed_at && Date.now() - Date.parse(certificate.emailed_at) < 600_000) {
        return fail('กรุณารอ 10 นาทีก่อนส่งซ้ำ', 429);
      }
      const { data: outstanding, error: jobError } = await admin.from('learning_delivery_jobs')
        .select('id,status').eq('certificate_id', certificateId)
        .in('status', ['pending', 'processing', 'failed']).maybeSingle();
      if (jobError) throw jobError;
      if (outstanding?.status === 'pending' || outstanding?.status === 'processing') {
        return fail('เกียรติบัตรอยู่ในคิวส่งแล้ว', 409);
      }
      const request = outstanding
        ? admin.from('learning_delivery_jobs').update({ status: 'pending', available_at: new Date().toISOString() }).eq('id', outstanding.id)
        : admin.from('learning_delivery_jobs').insert({ certificate_id: certificateId });
      const { error: resendError } = await request;
      if (resendError) throw resendError;
      return jsonResponse({ queued: true });
    }
    return fail('Unknown action', 404);
  } catch (error) {
    console.error('Learning v2 error:', error);
    return fail('ระบบบทเรียนขัดข้อง กรุณาลองใหม่', 500);
  }
});
