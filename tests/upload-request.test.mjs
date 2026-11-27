import test from 'node:test';
import assert from 'node:assert/strict';
import { assertUploadSize, assertBase64UploadSize, MAX_UPLOAD_BYTES } from '../src/lib/uploadLimits.js';
import { normalizeUploadFileName } from '../src/lib/uploadFileName.js';
import { fetchWithDeadline } from '../src/lib/requestDeadline.js';

test('25 MB boundary and long Thai filenames preserve the extension', () => {
  assertUploadSize({ size: MAX_UPLOAD_BYTES - 1 });
  assertUploadSize({ size: MAX_UPLOAD_BYTES });
  assert.throws(() => assertUploadSize({ size: MAX_UPLOAD_BYTES + 1 }), /25 MB/);
  const name = normalizeUploadFileName('ข่าวภาษาไทย'.repeat(40) + '.jpg');
  assert.ok(name.length <= 180); assert.ok(name.endsWith('.jpg'));
  assert.equal(normalizeUploadFileName('1.jpg'), '1.jpg');
  assertBase64UploadSize('data:image/jpeg;base64,YQ==');
  assert.throws(() => assertBase64UploadSize('data:image/jpeg;base64,' + 'A'.repeat(Math.ceil((MAX_UPLOAD_BYTES + 3) / 3) * 4)), /25 MB/);
});

test('deadline covers response body, marks writes uncertain, and never retries', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return { text: () => new Promise(() => {}) }; };
  try {
    await assert.rejects(fetchWithDeadline('https://fixture.test', {}, 10), e => e.code === 'REQUEST_TIMEOUT' && !e.uncertainWrite);
    await assert.rejects(fetchWithDeadline('https://fixture.test', { method: 'POST' }, 10, true), e => e.uncertainWrite && /ตรวจรายการ/.test(e.message));
    assert.equal(calls, 2);
  } finally { globalThis.fetch = original; }
});
