// Renders uploaded recruitment attachments (ปพ.6 & ใบรับรองความประพฤติ) into crisp A4-ready page URLs.
// Converts both images (via Blob URL) and multi-page PDFs (via pdfjs-dist canvas) so they NEVER expire
// during preview or window.print() / Save as PDF.
import { callRecruitment } from './recruitmentApi';

const renderedPathCache = new Map();
let pdfjsPromise = null;

async function getPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]).then(([pdfjs, workerMod]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default;
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

async function renderPdfUrlToDataUrls(signedUrl, maxPages = 10) {
  const res = await fetch(signedUrl);
  if (!res.ok) throw new Error(`ไม่สามารถโหลดไฟล์ PDF ได้ (HTTP ${res.status})`);
  const buf = await res.arrayBuffer();
  const pdfjs = await getPdfJs();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const pageCount = Math.min(pdf.numPages || 0, maxPages);
  const pages = [];

  for (let i = 1; i <= pageCount; i += 1) {
    const page = await pdf.getPage(i);
    const baseViewport = page.getViewport({ scale: 1 });
    const targetScale = Math.min(2.2, Math.max(1.4, 1500 / Math.max(baseViewport.width, 1)));
    const viewport = page.getViewport({ scale: targetScale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    pages.push(canvas.toDataURL('image/jpeg', 0.92));
  }
  return pages;
}

async function fetchImageAsLocalUrl(signedUrl) {
  const res = await fetch(signedUrl);
  if (!res.ok) throw new Error(`ไม่สามารถโหลดไฟล์ภาพได้ (HTTP ${res.status})`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

async function resolveDocPages({ memberId, path, docType, isAdmin }) {
  if (!path) return [];
  const cached = renderedPathCache.get(path);
  if (cached && cached.length > 0) return cached;

  const { signedUrl } = await callRecruitment(
    isAdmin
      ? { action: 'admin_get_doc_url', path }
      : { action: 'get_doc_url', memberId, path },
  );
  if (!signedUrl) return [];

  const isPdf = String(path).toLowerCase().endsWith('.pdf');
  const pages = isPdf
    ? (await renderPdfUrlToDataUrls(signedUrl)).map((src, idx) => ({ key: `${docType}-${idx}`, src, docType }))
    : [{ key: `${docType}-0`, src: await fetchImageAsLocalUrl(signedUrl), docType }];

  if (pages.length > 0) {
    renderedPathCache.set(path, pages);
  }
  return pages;
}

/**
 * Resolves a single member's attachments in exact official order:
 * 1) ปพ.6 (grade)
 * 2) ใบรับรองความประพฤติ (conduct)
 */
export async function loadMemberAttachmentPages(member, { isAdmin = false } = {}) {
  if (!member?.id) return [];
  const [gradePages, conductPages] = await Promise.all([
    resolveDocPages({ memberId: member.id, path: member.doc_grade_path, docType: 'grade', isAdmin }).catch((err) => {
      console.error('Failed to load grade doc:', err);
      return [];
    }),
    resolveDocPages({ memberId: member.id, path: member.doc_conduct_path, docType: 'conduct', isAdmin }).catch((err) => {
      console.error('Failed to load conduct doc:', err);
      return [];
    }),
  ]);
  return [...gradePages, ...conductPages];
}
