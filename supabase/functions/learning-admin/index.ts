import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, getAdminClient, jsonResponse } from '../_shared/auth.ts';

const EDITION = 'civic-dna-2026';
const subjectPattern = /^civic-[1-5]$/;
const videoPattern = /^[\w-]{11}$/;
const driveIdPattern = /^[\w-]{20,100}$/;
function fail(error: string, status = 400) { return jsonResponse({ error }, status); }

function validTopics(topics: unknown, subjectId: string) {
  if (!Array.isArray(topics) || topics.length !== 4) return false;
  return topics.every((topic, index) => {
    if (!topic || typeof topic !== 'object') return false;
    const item = topic as Record<string, unknown>;
    if (item.id !== `${subjectId}-t${index + 1}` || typeof item.title !== 'string' ||
      !item.title.trim() || !Array.isArray(item.blocks) || !Array.isArray(item.resources)) return false;
    return item.blocks.every(block => {
      if (!block || typeof block !== 'object') return false;
      const value = block as Record<string, unknown>;
      if (value.type === 'heading' || value.type === 'paragraph') return typeof value.text === 'string';
      if (value.type === 'image') return typeof value.path === 'string' &&
        value.path.startsWith(`${EDITION}/${subjectId}/`);
      if (value.type === 'page') return typeof value.text === 'string' &&
        typeof value.imagePath === 'string' && value.imagePath.startsWith(`${EDITION}/${subjectId}/`);
      if (value.type === 'table') return Array.isArray(value.rows) &&
        value.rows.every(row => Array.isArray(row) && row.every(cell => typeof cell === 'string'));
      return false;
    }) && item.resources.every(resource => {
      if (!resource || typeof resource !== 'object') return false;
      const value = resource as Record<string, unknown>;
      if (value.type === 'video') return typeof value.title === 'string' &&
        videoPattern.test(String(value.videoId || ''));
      if (value.type === 'document') return typeof value.title === 'string' &&
        typeof value.path === 'string' && value.path.startsWith(`${EDITION}/${subjectId}/`);
      return false;
    });
  });
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('Method not allowed', 405);
  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return fail('กรุณาเข้าสู่ระบบหลังบ้าน', 401);
    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!url || !anonKey) throw new Error('Missing Auth configuration');
    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await caller.auth.getUser();
    if (authError || !authData.user) return fail('เซสชันหมดอายุ', 401);
    const admin = getAdminClient();
    const { data: councilAdmin, error: roleError } = await admin.from('users')
      .select('id,role,banned').eq('auth_user_id', authData.user.id).maybeSingle();
    if (roleError) throw roleError;
    if (councilAdmin?.role !== 'admin' || councilAdmin.banned === true) {
      return fail('เฉพาะผู้ดูแลระบบ', 403);
    }

    const body = await req.json();
    const action = String(body.action || '');
    const subjectId = String(body.subjectId || '');
    if (action === 'decide_name_change') {
      const requestId = String(body.requestId || '');
      if (!/^[0-9a-f-]{36}$/i.test(requestId)) return fail('ไม่พบคำขอ');
      if (typeof body.approve !== 'boolean') return fail('กรุณาเลือกอนุมัติหรือปฏิเสธ');
      const { data, error } = await admin.rpc('decide_learning_v2_name_change', {
        p_request_id: requestId, p_approve: body.approve,
        p_admin_id: authData.user.id, p_note: String(body.note || '').trim() || null,
      });
      if (error) return fail(error.message, 409);
      return jsonResponse({ regenerated: data });
    }
    if (action === 'create_name_request') {
      const number = String(body.certificateNumber || '').trim();
      const name = String(body.fullName || '').trim().replace(/\s+/g, ' ');
      if (!/^SWSC-DNA-\d{4}-\d{6}$/.test(number) || name.length < 2 || name.length > 120) {
        return fail('เลขใบหรือชื่อใหม่ไม่ถูกต้อง');
      }
      const { data: certificate, error: findError } = await admin.from('learning_certificates')
        .select('user_id').eq('edition_id', EDITION).eq('certificate_number', number).maybeSingle();
      if (findError) throw findError;
      if (!certificate) return fail('ไม่พบเกียรติบัตร', 404);
      const { data, error } = await admin.rpc('request_learning_v2_name_change', {
        p_user_id: certificate.user_id, p_full_name: name,
      });
      if (error) return fail(error.message, 409);
      return jsonResponse({ requestId: data });
    }
    if (action === 'lookup_certificate') {
      const number = String(body.certificateNumber || '').trim();
      if (!/^SWSC-DNA-\d{4}-\d{6}$/.test(number)) return fail('เลขเกียรติบัตรไม่ถูกต้อง');
      const { data: certificate, error } = await admin.from('learning_certificates')
        .select('id,certificate_number,recipient_name,subject_id,issued_at,email_status')
        .eq('edition_id', EDITION).eq('certificate_number', number).maybeSingle();
      if (error) throw error;
      if (certificate) return jsonResponse({ certificate });
      const { data: archived, error: archiveError } = await admin.from('learning_certificate_history')
        .select('certificate_number,recipient_name,subject_id,issued_at,pdf_path,revoked_at,status')
        .eq('edition_id', EDITION).eq('certificate_number', number).maybeSingle();
      if (archiveError) throw archiveError;
      if (!archived) return fail('ไม่พบเกียรติบัตร', 404);
      let auditUrl: string | null = null;
      if (archived.pdf_path) {
        const { data: signed, error: signedError } = await admin.storage.from('learning-certificates')
          .createSignedUrl(archived.pdf_path, 60);
        if (signedError) throw signedError;
        auditUrl = signed.signedUrl;
      }
      const { pdf_path: _path, ...safeArchive } = archived;
      return jsonResponse({ certificate: { ...safeArchive, auditUrl } });
    }
    if (action === 'list') {
      const [{ data: edition, error: editionError },
        { data: subjects, error: subjectError },
        { data: notes, error: noteError },
        { data: nameRequests, error: nameError }] = await Promise.all([
        admin.from('learning_editions').select('published,certificates_enabled')
          .eq('id', EDITION).single(),
        admin.from('learning_subject_editions').select('*')
          .eq('edition_id', EDITION).order('ordinal'),
        admin.from('learning_review_notes').select('*')
          .eq('edition_id', EDITION).order('created_at'),
        admin.from('learning_certificate_name_requests').select('*')
          .eq('edition_id', EDITION).eq('status', 'pending').order('created_at'),
      ]);
      if (editionError || subjectError || noteError || nameError) throw editionError || subjectError || noteError || nameError;
      const quizCounts = await Promise.all((subjects || []).map(async subject => {
        const { data, error } = await admin.rpc('get_learning_v2_draft_questions', {
          p_subject_id: subject.subject_id,
        });
        if (error) throw error;
        return { subjectId: subject.subject_id, count: (data || []).length };
      }));
      const requestUsers = [...new Set((nameRequests || []).map(item => item.user_id))];
      const { data: currentCertificates, error: currentError } = requestUsers.length
        ? await admin.from('learning_certificates').select('user_id,recipient_name,certificate_number')
          .eq('edition_id', EDITION).in('user_id', requestUsers)
        : { data: [], error: null };
      if (currentError) throw currentError;
      const detailedRequests = (nameRequests || []).map(item => ({ ...item,
        currentName: currentCertificates?.find(cert => cert.user_id === item.user_id)?.recipient_name || '',
        certificateCount: currentCertificates?.filter(cert => cert.user_id === item.user_id).length || 0,
      }));
      return jsonResponse({ edition, subjects, notes, nameRequests: detailedRequests, quizCounts });
    }
    if (!subjectPattern.test(subjectId) && !['publish', 'activate_certificates'].includes(action)) {
      return fail('ไม่พบวิชา');
    }
    if (action === 'read_quiz') {
      const { data, error } = await admin.rpc('get_learning_v2_draft_questions', {
        p_subject_id: subjectId,
      });
      if (error) throw error;
      return jsonResponse({ questions: (data || []).map(item => ({
        prompt: item.prompt, options: item.options, correctOption: item.correct_option,
      })) });
    }
    if (action === 'save_subject') {
      const topics = body.topics;
      const title = String(body.title || '').trim();
      const summary = String(body.summary || '').trim();
      if (!title || title.length > 300 || summary.length > 2000 || !validTopics(topics, subjectId)) {
        return fail('เนื้อหาต้องมี 4 หัวข้อ พร้อมบล็อกและสื่อในรูปแบบที่รองรับ');
      }
      if (JSON.stringify(topics).length > 1_500_000) return fail('เนื้อหาใหญ่เกินไป');
      const { error } = await admin.from('learning_subject_editions').update({
        draft_title: title, draft_summary: summary, draft_topics: topics, content_reviewed: false,
        updated_at: new Date().toISOString(),
      }).eq('edition_id', EDITION).eq('subject_id', subjectId);
      if (error) throw error;
      const { error: revisionError } = await admin.rpc('increment_learning_draft_revision', {
        p_subject_id: subjectId,
      });
      if (revisionError) throw revisionError;
      return jsonResponse({ saved: true });
    }
    if (action === 'replace_quiz') {
      const questions = body.questions;
      if (!Array.isArray(questions) || questions.length !== 10 || questions.some(item =>
        !item || typeof item.prompt !== 'string' || !item.prompt.trim() ||
        !Array.isArray(item.options) || item.options.length !== 4 ||
        item.options.some((option: unknown) => typeof option !== 'string' || !option.trim()) ||
        !Number.isInteger(item.correctOption) || item.correctOption < 0 || item.correctOption > 3
      )) return fail('ต้องมีคำถาม 10 ข้อ พร้อม 4 ตัวเลือกและเฉลย');
      const { error } = await admin.rpc('import_learning_v2_questions', {
        p_subject_id: subjectId, p_questions: questions,
      });
      if (error) throw error;
      return jsonResponse({ saved: true });
    }
    if (action === 'review') {
      const column = body.kind === 'quiz' ? 'quiz_reviewed' : 'content_reviewed';
      const { error } = await admin.from('learning_subject_editions').update({
        [column]: body.approved === true, updated_at: new Date().toISOString(),
      }).eq('edition_id', EDITION).eq('subject_id', subjectId);
      if (error) throw error;
      return jsonResponse({ reviewed: true });
    }
    if (action === 'add_note') {
      const sourceReference = String(body.sourceReference || '').trim();
      const proposedChange = String(body.proposedChange || '').trim();
      const rationale = String(body.rationale || '').trim();
      if (!sourceReference || !proposedChange || !rationale) return fail('กรอกแหล่งที่มา ข้อเสนอ และเหตุผล');
      const { error } = await admin.from('learning_review_notes').insert({
        edition_id: EDITION, subject_id: subjectId,
        source_reference: sourceReference, proposed_change: proposedChange, rationale,
      });
      if (error) throw error;
      return jsonResponse({ saved: true });
    }
    if (action === 'set_note_status') {
      const status = String(body.status || '');
      if (!['approved', 'rejected'].includes(status)) return fail('สถานะไม่ถูกต้อง');
      const { error } = await admin.from('learning_review_notes').update({ status })
        .eq('id', body.noteId).eq('edition_id', EDITION).eq('subject_id', subjectId);
      if (error) throw error;
      return jsonResponse({ saved: true });
    }
    if (action === 'sign_upload') {
      const kind = String(body.kind || '');
      const mime = String(body.mime || '');
      const extension = mime === 'application/pdf' ? 'pdf' :
        mime === 'image/webp' ? 'webp' : mime === 'image/png' ? 'png' :
        mime === 'image/jpeg' ? 'jpg' : '';
      if (!extension || !['document', 'image'].includes(kind) ||
        (kind === 'document' && extension !== 'pdf') ||
        (kind === 'image' && extension === 'pdf')) return fail('ชนิดไฟล์ไม่รองรับ');
      const path = `${EDITION}/${subjectId}/${crypto.randomUUID()}.${extension}`;
      const { data, error } = await admin.storage.from('learning-materials').createSignedUploadUrl(path);
      if (error) throw error;
      return jsonResponse({ path, token: data.token });
    }
    if (action === 'set_template') {
      const raw = String(body.templateId || '').trim();
      const id = raw.match(/\/presentation\/d\/([\w-]+)/)?.[1] || raw;
      if (!driveIdPattern.test(id)) return fail('ระบุลิงก์หรือ ID ของ Google Slides แบบใบที่เซ็นแล้ว');
      const { error } = await admin.from('learning_subject_editions').update({
        template_path: id, template_approved: body.approved === true,
      }).eq('edition_id', EDITION).eq('subject_id', subjectId);
      if (error) throw error;
      return jsonResponse({ saved: true });
    }
    if (action === 'publish') {
      const { data: subjects, error: loadError } = await admin.from('learning_subject_editions')
        .select('subject_id,draft_topics').eq('edition_id', EDITION);
      if (loadError) throw loadError;
      const resources = (subjects || []).flatMap(subject =>
        (subject.draft_topics || []).flatMap((topic: { resources?: Array<{ type: string; path?: string; videoId?: string }> }) =>
          topic.resources || []));
      if (new Set(resources.filter(item => item.type === 'document').map(item => item.path)).size !== 12 ||
        resources.filter(item => item.type === 'video' && videoPattern.test(item.videoId || '')).length !== 60) {
        return fail('ต้องนำเข้า PDF 12 ไฟล์และวิดีโอ 60 รายการก่อนเผยแพร่');
      }
      const documentPaths = [...new Set(resources.filter(item => item.type === 'document')
        .map(item => item.path || ''))];
      const checks = await Promise.all(documentPaths.map(path =>
        admin.storage.from('learning-materials').exists(path)));
      if (checks.some(item => item.error || !item.data)) {
        return fail('ยังมีไฟล์ PDF ที่ไม่ได้อัปโหลดเข้าพื้นที่ส่วนตัว');
      }
      const { error } = await admin.rpc('publish_learning_v2');
      if (error) throw error;
      return jsonResponse({ published: true });
    }
    if (action === 'activate_certificates') {
      const { data, error } = await admin.rpc('activate_learning_v2_certificates');
      if (error) throw error;
      return jsonResponse({ enabled: true, issued: data });
    }
    return fail('Unknown action', 404);
  } catch (error) {
    console.error('Learning admin error:', error);
    return fail('จัดการบทเรียนไม่สำเร็จ กรุณาลองใหม่', 500);
  }
});
