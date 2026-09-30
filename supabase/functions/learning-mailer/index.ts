import { getAdminClient, jsonResponse, corsHeaders } from '../_shared/auth.ts';

function authorized(req: Request) {
  const actual = req.headers.get('x-learning-mailer-secret') || '';
  const expected = Deno.env.get('LEARNING_MAILER_SECRET') || '';
  if (!expected || actual.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < actual.length; i++) difference |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return difference === 0;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  if (!authorized(req)) return jsonResponse({ error: 'Unauthorized' }, 401);
  try {
    const admin = getAdminClient();
    const body = await req.json();
    const action = String(body.action || '');
    if (action === 'claim') {
      const { data, error } = await admin.rpc('claim_learning_delivery');
      if (error) throw error;
      const job = data?.[0];
      if (!job) return jsonResponse({ job: null });
      const { data: user, error: userError } = await admin.auth.admin.getUserById(job.user_id);
      if (userError || !user.user?.email || !user.user.email_confirmed_at) {
        throw userError || new Error('Learner email unavailable');
      }
      const { data: certificate, error: certificateError } = await admin
        .from('learning_certificates').select('edition_id').eq('id', job.certificate_id).single();
      if (certificateError) throw certificateError;
      let templateId: string | null = null;
      if (certificate.edition_id === 'civic-dna-2026') {
        const { data: subject, error: subjectError } = await admin
          .from('learning_subject_editions').select('template_path,template_approved')
          .eq('edition_id', certificate.edition_id).eq('subject_id', job.subject_id).single();
        if (subjectError || !subject?.template_approved || !subject.template_path) {
          throw subjectError || new Error('Signed certificate template unavailable');
        }
        templateId = subject.template_path;
      }
      return jsonResponse({ job: {
        jobId: job.job_id, certificateId: job.certificate_id,
        subjectId: job.subject_id, fullName: job.recipient_name,
        certificateNumber: job.certificate_number, issuedAt: job.issued_at,
        email: user.user.email, hasPdf: Boolean(job.pdf_path), templateId,
      } });
    }
    const jobId = String(body.jobId || '');
    const { data: job, error: jobError } = await admin.from('learning_delivery_jobs')
      .select('id,status,certificate_id,attempts').eq('id', jobId).maybeSingle();
    if (jobError || !job || job.status !== 'processing') {
      return jsonResponse({ error: 'Job unavailable' }, 409);
    }
    if (action === 'upload') {
      const base64 = String(body.pdfBase64 || '');
      if (base64.length > 14_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
        return jsonResponse({ error: 'Invalid PDF' }, 400);
      }
      const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
      if (bytes.length > 10_485_760 || new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') {
        return jsonResponse({ error: 'Invalid PDF' }, 400);
      }
      const { data: current, error: currentError } = await admin.from('learning_certificates')
        .select('certificate_number').eq('id', job.certificate_id).single();
      if (currentError || !current) return jsonResponse({ error: 'Certificate unavailable' }, 404);
      const path = `${job.certificate_id}/${current.certificate_number}.pdf`;
      const { error: uploadError } = await admin.storage.from('learning-certificates')
        .upload(path, bytes, { contentType: 'application/pdf', upsert: false });
      if (uploadError && !String(uploadError.message).includes('already exists')) throw uploadError;
      const { error: updateError } = await admin.from('learning_certificates')
        .update({ pdf_path: path, email_status: 'ready' }).eq('id', job.certificate_id)
        .eq('certificate_number', current.certificate_number);
      if (updateError) throw updateError;
      return jsonResponse({ uploaded: true });
    }
    if (action === 'pdf') {
      const { data: certificate, error } = await admin.from('learning_certificates')
        .select('pdf_path').eq('id', job.certificate_id).single();
      if (error || !certificate?.pdf_path) return jsonResponse({ error: 'PDF unavailable' }, 404);
      const { data: file, error: fileError } = await admin.storage.from('learning-certificates')
        .download(certificate.pdf_path);
      if (fileError) throw fileError;
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i += 8192) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      }
      return jsonResponse({ pdfBase64: btoa(binary) });
    }
    if (action === 'complete') {
      const success = body.success === true;
      const { error: updateError } = await admin.from('learning_delivery_jobs').update({
        status: success ? 'sent' : 'failed', locked_until: null,
        sent_at: success ? new Date().toISOString() : null,
        available_at: success ? new Date().toISOString() :
          new Date(Date.now() + Math.min(60, 2 ** Math.min(job.attempts, 8)) * 60_000).toISOString(),
        last_error: success ? null : String(body.error || 'Email failed').slice(0, 500),
      }).eq('id', jobId);
      if (updateError) throw updateError;
      const { error: certificateError } = await admin.from('learning_certificates').update({
        email_status: success ? 'sent' : 'failed',
        ...(success ? { emailed_at: new Date().toISOString() } : {}),
      }).eq('id', job.certificate_id);
      if (certificateError) throw certificateError;
      return jsonResponse({ completed: true });
    }
    return jsonResponse({ error: 'Unknown action' }, 404);
  } catch (error) {
    console.error('Learning mailer error:', error);
    return jsonResponse({ error: 'Mailer error' }, 500);
  }
});
