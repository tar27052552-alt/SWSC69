export function certificateGenerationStatus(pdfPath, jobs = [], legacyStatus) {
  if (pdfPath) return 'ready';
  const latest = [...(jobs || [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (latest?.status === 'processing') return 'processing';
  if (latest?.status === 'failed' || (!latest && legacyStatus === 'failed')) return 'failed';
  return 'pending';
}
