const THAI_DIGITS = ['๐', '๑', '๒', '๓', '๔', '๕', '๖', '๗', '๘', '๙'];
const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

export function toThaiDigits(value) {
  return String(value ?? '').replace(/\d/g, (d) => THAI_DIGITS[Number(d)]);
}

export function formatThaiBirthDate(isoDate) {
  if (!isoDate) return '';
  const parts = String(isoDate).split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return String(isoDate);
  const [y, m, d] = parts;
  const beYear = y < 2400 ? y + 543 : y;
  return `${d} ${THAI_MONTHS[m - 1] || ''} ${beYear}`.trim();
}

export function calculateAge(isoDate) {
  if (!isoDate) return '';
  const parts = String(isoDate).split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return '';
  const [y, m, d] = parts;
  const adYear = y > 2400 ? y - 543 : y;
  const today = new Date();
  let age = today.getFullYear() - adYear;
  const monthDiff = today.getMonth() + 1 - m;
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < d)) age -= 1;
  return age >= 0 && age < 100 ? String(age) : '';
}
