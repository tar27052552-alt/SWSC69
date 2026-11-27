import test from 'node:test';
import assert from 'node:assert/strict';
import { certificateGenerationStatus as status } from '../supabase/functions/_shared/certificateStatus.js';
test('PDF status prioritizes ready and the latest job without leaking job details', () => {
  const failed = { created_at: '2026-10-10', status: 'failed' };
  assert.equal(status('private/file.pdf', [failed]), 'ready');
  assert.equal(status(null, []), 'pending');
  assert.equal(status(null, [], 'failed'), 'failed');
  assert.equal(status(null, [failed]), 'failed');
  assert.equal(status(null, [failed, { created_at: '2026-10-12', status: 'processing' }]), 'processing');
  assert.equal(status(null, [failed, { created_at: '2026-10-12', status: 'pending' }]), 'pending');
});
