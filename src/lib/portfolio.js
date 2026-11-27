import { supabase } from '../supabaseClient';

export const PORTFOLIO_BUCKET = 'council-portfolios';
export const IMAGE_LIMIT = 10 * 1024 * 1024;
export function validatePortfolioImage(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('เลือกรูป JPG, PNG หรือ WebP');
  if (!file.size || file.size > IMAGE_LIMIT) throw new Error('รูปแต่ละไฟล์ต้องไม่เกิน 10 MB');
}
export function sortPortfolioItems(items) {
  return [...items].sort((a, b) => Number(b.featured) - Number(a.featured) || b.activity_date.localeCompare(a.activity_date) || a.id.localeCompare(b.id));
}
export async function portfolioDeadline(request, timeout = 30000, writing = false) {
  let timer;
  try { return await Promise.race([request, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(writing ? 'หมดเวลาระหว่างอัปโหลด ผลอาจสำเร็จแล้ว กรุณาตรวจรายการก่อนลองใหม่' : 'หมดเวลารอรูป กรุณาลองใหม่')), timeout); })]); }
  finally { clearTimeout(timer); }
}
export async function portfolioQuery(query, signal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, 30000);
  try {
    const { data, error } = await query.abortSignal(controller.signal);
    if (controller.signal.aborted) throw new Error('หมดเวลารอข้อมูล กรุณาลองใหม่');
    if (error) throw error;
    return data;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
export async function portfolioImages(paths, client = supabase) {
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return {};
  const { data, error } = await portfolioDeadline(client.storage.from(PORTFOLIO_BUCKET).createSignedUrls(unique, 300));
  if (error) throw error;
  return Object.fromEntries(data.filter(x => x.signedUrl && !x.error).map(x => [x.path, x.signedUrl]));
}
export async function uploadPortfolioImage(file, year) {
  validatePortfolioImage(file);
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type];
  const path = `${year}/${crypto.randomUUID()}.${ext}`;
  const { error } = await portfolioDeadline(supabase.storage.from(PORTFOLIO_BUCKET).upload(path, file, { contentType: file.type, upsert: false }), 90000, true);
  if (error) throw error;
  return path;
}
