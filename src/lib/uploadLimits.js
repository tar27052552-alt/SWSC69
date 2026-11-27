export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export function assertUploadSize(file) {
  if (!file || !Number.isFinite(file.size) || file.size > MAX_UPLOAD_BYTES) {
    throw new Error('ไฟล์ต้องมีขนาดไม่เกิน 25 MB');
  }
}
export function acceptUploadFile(file) {
  try { assertUploadSize(file); return true; }
  catch (error) { alert(error.message); return false; }
}
export function assertBase64UploadSize(data) {
  const payload = typeof data === 'string' ? data.split(';base64,')[1] : null;
  if (!payload) throw new Error('รูปแบบไฟล์ไม่ถูกต้อง');
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  if (payload.length * 3 / 4 - padding > MAX_UPLOAD_BYTES) throw new Error('ไฟล์ต้องมีขนาดไม่เกิน 25 MB');
}
