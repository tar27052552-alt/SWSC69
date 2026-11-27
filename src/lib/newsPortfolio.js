import { academicYear } from './councilPermissions.js';

export function newsImageUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    if (url.hostname === 'drive.google.com') {
      const id = url.searchParams.get('id') || url.pathname.match(/\/d\/([^/]+)/)?.[1];
      if (id) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1600`;
    }
    return url.href;
  } catch { return null; }
}
export function newsPortfolioYear(news, date) {
  // Council terms may start before May. An explicitly named cohort takes
  // precedence over the legacy date-based fallback; the news date stays intact.
  const explicit = Number(news.portfolio_academic_year ?? news.academic_year);
  if (Number.isInteger(explicit) && explicit >= 2400 && explicit <= 2800) return explicit;
  for (const text of [news.headline, news.detail]) {
    const normalized = String(text || '').replace(/[๐-๙]/g, digit => String('๐๑๒๓๔๕๖๗๘๙'.indexOf(digit)));
    const match = normalized.match(/ปีการศึกษา\s*(?:พ\.?ศ\.?\s*)?([0-9]{4})(?![0-9])/);
    const year = Number(match?.[1]);
    if (year >= 2400 && year <= 2800) return year;
  }
  return academicYear(date);
}
export function newsAsPortfolio(news) {
  if (news.category !== 'ผลงาน' || news.portfolio_hidden === true || !news.created_at) return null;
  const date = new Date(news.created_at);
  if (!Number.isFinite(date.getTime())) return null;
  const activityDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  return { id: `news-${news.id}`, source: 'news', academic_year: newsPortfolioYear(news, date), title: news.headline || 'ผลงานสภานักเรียน', description: news.detail || '', outcomes: '', activity_date: activityDate, department_id: null, cover_path: newsImageUrl(news.image_url), image_paths: (Array.isArray(news.supporting_images) ? news.supporting_images : []).map(newsImageUrl).filter(Boolean), status: 'published', featured: news.portfolio_featured === true };
}
export function mergePortfolioYears(years, newsItems) {
  const byYear = new Map(years.map(year => [year.academic_year, year]));
  for (const item of newsItems) if (!byYear.has(item.academic_year)) byYear.set(item.academic_year, { academic_year: item.academic_year, cohort_name: `สภานักเรียน ปีการศึกษา ${item.academic_year}`, summary: '', cover_path: null });
  return [...byYear.values()].sort((a, b) => b.academic_year - a.academic_year);
}
