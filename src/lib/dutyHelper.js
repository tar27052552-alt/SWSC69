/**
 * Helper utilities for Duty Scheduling & Swap Resolution
 * SWSC69 Student Council Portal
 */

export const DUTY_LABELS = {
  greeting_gate1: 'ยืนไหว้ - ประตูไหมไทย',
  greeting_gate2: 'ยืนไหว้ - ประตูอำเภอ',
  greeting_gate3: 'ยืนไหว้ - ประตูหน้า รร.',
  clean_room: 'เวรทำความสะอาดห้องสภา',
  national_flag: 'เชิญธงชาติ',
  color_flag: 'เชิญธงสี',
  pr_news: 'เวรส่งข่าว PR'
};

export const THAI_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์'];

/**
 * Returns YYYY-MM-DD in Thailand Timezone (UTC+7)
 * Fixes the early morning UTC midnight bug where 00:00-06:59 resulted in yesterday's date
 */
export function getThaiTodayStr(dateInput = new Date()) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  // Add 7 hours offset to UTC time
  const tzOffset = 7 * 60 * 60 * 1000;
  const thTime = new Date(d.getTime() + tzOffset);
  return thTime.toISOString().split('T')[0];
}

/**
 * Converts a YYYY-MM-DD string to Thai Day name ('จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์')
 */
export function getThaiDayFromDateStr(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  return THAI_DAYS[dateObj.getDay()] || '';
}

/**
 * Resolves effective substitute for a duty member, supporting chained swaps (A -> B -> C)
 * and avoiding infinite loops if A -> B and B -> A.
 *
 * @param {string} originalNickname - Nickname scheduled originally in the template
 * @param {Array<Object>} swapsForDay - Swaps that match the given date and duty type
 * @returns {string} The final substitute nickname (or original if no swap)
 */
export function resolveEffectiveSubstitute(originalNickname, swapsForDay = []) {
  if (!originalNickname || originalNickname === '–' || originalNickname === '') {
    return originalNickname;
  }

  let current = originalNickname.trim();
  const visited = new Set();

  while (current && !visited.has(current)) {
    visited.add(current);
    // Find the latest swap where original_nickname is current
    const match = swapsForDay.find(s => s.original_nickname?.trim() === current);
    if (match && match.substitute_nickname?.trim()) {
      current = match.substitute_nickname.trim();
    } else {
      break;
    }
  }

  return current;
}

/**
 * Resolves an entire list of scheduled members with duty swaps applied
 */
export function resolveEffectiveMemberList(members = [], swapsForDayAndType = []) {
  return (members || []).map(m => resolveEffectiveSubstitute(m, swapsForDayAndType));
}
