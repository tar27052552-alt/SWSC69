import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { certificateGenerationStatus } from '../supabase/functions/_shared/certificateStatus.js';

test('PDF retry requires a valid admin and status conflicts are returned without issuing a new certificate', async () => {
  let handler; let role = 'member'; let banned = false; let calls = 0; let conflict = false;
  const certificateId = '00000000-0000-4000-8000-000000000002';
  const admin = {
    from: table => table === 'users' ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role, banned } }) }) }) } :
      { select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [{ id: certificateId, recipient_name: 'ผู้เรียน', pdf_path: 'private/file.pdf', email_status: 'ready', learning_delivery_jobs: [] }] }) }) }) }) },
    rpc: async name => {
      calls++; assert.equal(name, 'retry_learning_certificate_pdf');
      return conflict ? { error: { message: 'already processing' } } : { data: { queued: true } };
    },
  };
  const source = fs.readFileSync('supabase/functions/learning-admin/index.ts', 'utf8').replace(/^import .*;\r?\n/gm, '');
  new Function('Deno', 'createClient', 'getAdminClient', 'jsonResponse', 'corsHeaders', 'certificateGenerationStatus', stripTypeScriptTypes(source))(
    { env: { get: () => 'fixture' }, serve: value => { handler = value; } },
    () => ({ auth: { getUser: async () => ({ data: { user: { id: 'fixture-admin' } } }) } }),
    () => admin, (data, status = 200) => Response.json(data, { status }), {}, certificateGenerationStatus);
  const request = (action, id = certificateId, token = true) => handler(new Request('https://fixture.test', {
    method: 'POST', headers: token ? { Authorization: 'Bearer fixture' } : {},
    body: JSON.stringify({ action, certificateId: id }),
  }));
  assert.equal((await request('retry_certificate_pdf', certificateId, false)).status, 401);
  assert.equal((await request('retry_certificate_pdf')).status, 403);
  role = 'admin'; banned = true;
  assert.equal((await request('retry_certificate_pdf')).status, 403);
  banned = false; assert.equal((await request('retry_certificate_pdf', 'invalid')).status, 400);
  assert.equal(calls, 0);
  assert.equal((await request('retry_certificate_pdf')).status, 200);
  conflict = true; assert.equal((await request('retry_certificate_pdf')).status, 409);
  const jobs = await (await request('certificate_jobs')).json();
  assert.equal(jobs.certificates[0].generationStatus, 'ready');
  assert.ok(!('pdf_path' in jobs.certificates[0]));
  assert.ok(!('learning_delivery_jobs' in jobs.certificates[0]));
});
