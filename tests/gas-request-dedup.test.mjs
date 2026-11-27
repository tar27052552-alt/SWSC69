import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeUploadFileName } from '../src/lib/uploadFileName.js';
import { assertBase64UploadSize } from '../src/lib/uploadLimits.js';

test('same-account simultaneous writes share a request; different accounts never share one', async () => {
  let account = 'first'; let calls = 0;
  const completions = [];
  const source = fs.readFileSync('src/lib/googleDriveUpload.js', 'utf8')
    .split('export async function verifySlipViaGAS')[0]
    .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '')
    .replace('import.meta.env.VITE_GAS_URL', "'https://fixture.test'");
  const api = new Function('supabase', 'normalizeUploadFileName', 'assertBase64UploadSize', 'fetchWithDeadline',
    source + '\nreturn { callGAS };')({ auth: { getSession: async () => ({ data: {
      session: { user: { id: account }, access_token: account },
    } }) } }, normalizeUploadFileName, assertBase64UploadSize, async () => {
      calls++; return new Promise(resolve => completions.push(() => resolve({ response: { ok: true }, text: '{"success":true,"data":{"saved":true}}' })));
    });
  const first = api.callGAS('write_sheet', { rowData: { title: 'same' } });
  const duplicate = api.callGAS('write_sheet', { rowData: { title: 'same' } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  account = 'second';
  const other = api.callGAS('write_sheet', { rowData: { title: 'same' } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 2);
  completions.forEach(complete => complete());
  for (const result of await Promise.all([first, duplicate, other])) assert.equal(result.saved, true);
});
