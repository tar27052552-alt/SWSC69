// Apps Script accepts at most 180 UTF-16 code units per file name.
export function normalizeUploadFileName(fileName) {
  if (typeof fileName !== 'string' || !fileName.trim()) {
    throw new Error('กรุณาระบุชื่อไฟล์ก่อนอัปโหลด');
  }
  const clean = fileName.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-');
  if (clean.length <= 180) return clean;
  const extension = clean.match(/\.[a-zA-Z0-9]{1,16}$/)?.[0] || '';
  let stem = clean.slice(0, 180 - extension.length);
  // Avoid splitting a supplementary Unicode character.
  if (/[\uD800-\uDBFF]$/.test(stem)) stem = stem.slice(0, -1);
  return stem + extension;
}
