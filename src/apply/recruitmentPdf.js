// Exact-layout Thai PDF generator for Student Council Recruitment 2570
// Matches official reference layout:
// 1. "ใบสมัคร คณะกรรมการนักเรียน ปีการศึกษา ๒๕๗๐" (1 page per member, centered 3 logos + centered 1.5" photo box + 8 dotted rows + 4 continuation lines + signature)
// 2. "ใบสมัคร คณะกรรมการสภานักเรียน ปีการศึกษา ๒๕๗๐" (29-member party roster, numbered ๑–๒๙)

import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

const A4_W = 595.28;
const A4_H = 841.89;
const MARGIN_X = 64;
const CONTENT_W = A4_W - MARGIN_X * 2;
const INK = rgb(0.08, 0.08, 0.08);
const DOT_COLOR = rgb(0.35, 0.35, 0.35);

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

function extractRoomNumber(classroom) {
  const match = String(classroom || '').match(/\/\s*(\d+)/);
  return match ? match[1] : String(classroom || '').replace(/^ม\.?\s*[4๔]\/?/i, '').trim();
}

function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

let cachedAssetsPromise = null;
async function loadPdfAssets() {
  if (!cachedAssetsPromise) {
    const base = import.meta.env.BASE_URL || '/';
    cachedAssetsPromise = Promise.all([
      fetch(`${base}fonts/Sarabun-Regular.ttf`).then((r) => {
        if (!r.ok) throw new Error('ไม่สามารถโหลดฟอนต์ Sarabun-Regular ได้');
        return r.arrayBuffer();
      }),
      fetch(`${base}fonts/Sarabun-Bold.ttf`).then((r) => {
        if (!r.ok) throw new Error('ไม่สามารถโหลดฟอนต์ Sarabun-Bold ได้');
        return r.arrayBuffer();
      }),
      fetch(`${base}all-logos.png`).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null),
    ]).then(([regularFont, boldFont, logosPng]) => ({ regularFont, boldFont, logosPng }));
  }
  return cachedAssetsPromise;
}

async function createBaseDoc() {
  const { regularFont, boldFont, logosPng } = await loadPdfAssets();
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const font = await pdfDoc.embedFont(regularFont);
  const bold = await pdfDoc.embedFont(boldFont);
  const logosImage = logosPng ? await pdfDoc.embedPng(logosPng) : null;
  return { pdfDoc, font, bold, logosImage };
}

function drawDottedSegment(page, font, xStart, xEnd, y, value = '', size = 13.5) {
  const dotWidth = font.widthOfTextAtSize('.', size);
  const span = Math.max(10, xEnd - xStart);
  const dotCount = Math.floor(span / dotWidth);
  page.drawText('.'.repeat(dotCount), { x: xStart, y: y - 1, size, font, color: DOT_COLOR });

  const clean = String(value || '').trim();
  if (clean) {
    let text = clean;
    while (text.length > 1 && font.widthOfTextAtSize(text, size) > span - 6) {
      text = text.slice(0, -1);
    }
    page.drawText(text, { x: xStart + 4, y: y + 1.5, size, font, color: INK });
  }
}

function wrapThaiText(text, font, size, firstLineWidth, nextLineWidth, maxLines = 5) {
  const clean = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!clean) return [];
  const lines = [];
  const paragraphs = clean.split('\n');

  for (const para of paragraphs) {
    let current = '';
    const limit = () => (lines.length === 0 ? firstLineWidth : nextLineWidth);
    for (const ch of para) {
      const candidate = current + ch;
      if (font.widthOfTextAtSize(candidate, size) > limit() && current.length > 0) {
        lines.push(current);
        current = ch;
        if (lines.length >= maxLines) break;
      } else {
        current = candidate;
      }
    }
    if (lines.length < maxLines && current) {
      lines.push(current);
    }
    if (lines.length >= maxLines) break;
  }
  return lines.slice(0, maxLines);
}

async function appendIndividualPage(ctx, member, party, photoData) {
  const { pdfDoc, font, bold, logosImage } = ctx;
  const page = pdfDoc.addPage([A4_W, A4_H]);
  const size = 13.5;

  // 1. Centered 3-logo header (exact match to reference image)
  let cursorY = A4_H - 42;
  if (logosImage) {
    const logoH = 74;
    const logoW = (logosImage.width / logosImage.height) * logoH;
    page.drawImage(logosImage, {
      x: (A4_W - logoW) / 2,
      y: cursorY - logoH,
      width: logoW,
      height: logoH,
    });
    cursorY -= logoH + 22;
  } else {
    cursorY -= 32;
  }

  // 2. Centered Bold Title
  const title = 'ใบสมัคร คณะกรรมการนักเรียน ปีการศึกษา ๒๕๗๐';
  const titleW = bold.widthOfTextAtSize(title, 16);
  page.drawText(title, { x: (A4_W - titleW) / 2, y: cursorY, size: 16, font: bold, color: INK });
  cursorY -= 26;

  // 3. Centered 1.5-inch photo box (1.5" = 108pt x 136pt)
  const boxW = 108;
  const boxH = 136;
  const boxX = (A4_W - boxW) / 2;
  const boxY = cursorY - boxH;
  page.drawRectangle({
    x: boxX,
    y: boxY,
    width: boxW,
    height: boxH,
    borderColor: INK,
    borderWidth: 1.1,
    color: rgb(1, 1, 1),
  });

  let embeddedPhoto = null;
  if (photoData?.found && photoData?.base64) {
    try {
      const bytes = base64ToUint8Array(photoData.base64);
      embeddedPhoto = photoData.mimeType?.includes('png')
        ? await pdfDoc.embedPng(bytes)
        : await pdfDoc.embedJpg(bytes);
    } catch {
      embeddedPhoto = null;
    }
  }

  if (embeddedPhoto) {
    const pad = 2;
    const availW = boxW - pad * 2;
    const availH = boxH - pad * 2;
    const scale = Math.min(availW / embeddedPhoto.width, availH / embeddedPhoto.height);
    const drawW = embeddedPhoto.width * scale;
    const drawH = embeddedPhoto.height * scale;
    page.drawImage(embeddedPhoto, {
      x: boxX + (boxW - drawW) / 2,
      y: boxY + (boxH - drawH) / 2,
      width: drawW,
      height: drawH,
    });
  } else {
    const l1 = 'ติดรูปถ่าย';
    const l2 = 'ขนาด ๑.๕ นิ้ว';
    page.drawText(l1, {
      x: boxX + (boxW - bold.widthOfTextAtSize(l1, 13)) / 2,
      y: boxY + boxH / 2 + 10,
      size: 13,
      font: bold,
      color: INK,
    });
    page.drawText(l2, {
      x: boxX + (boxW - bold.widthOfTextAtSize(l2, 13)) / 2,
      y: boxY + boxH / 2 - 14,
      size: 13,
      font: bold,
      color: INK,
    });
  }

  // 4. Form rows (exact order and labels from reference image)
  const fullName = member?.full_name ? `${member.prefix || ''}${member.full_name}` : '';
  const roomNo = extractRoomNumber(member?.classroom);
  const gpaxStr = member?.gpax !== null && member?.gpax !== undefined && member?.gpax !== ''
    ? Number(member.gpax).toFixed(2)
    : '';
  const birthStr = formatThaiBirthDate(member?.birth_date);
  const ageStr = calculateAge(member?.birth_date);

  const rightX = MARGIN_X + CONTENT_W;
  const lineGap = 28;
  let y = boxY - 46;

  // Helper to draw label + return next x
  const drawLabel = (text, x, yPos) => {
    page.drawText(text, { x, y: yPos, size, font: bold, color: INK });
    return x + bold.widthOfTextAtSize(text, size) + 4;
  };

  // Row 1: ชื่อ-สกุล ... ชื่อเล่น ...
  let x = drawLabel('ชื่อ-สกุล', MARGIN_X, y);
  const nickLabelX = MARGIN_X + 320;
  drawDottedSegment(page, font, x, nickLabelX - 6, y, fullName, size);
  x = drawLabel('ชื่อเล่น', nickLabelX, y);
  drawDottedSegment(page, font, x, rightX, y, member?.nickname || '', size);
  y -= lineGap;

  // Row 2: เลขประจำตัวนักเรียน ... ระดับชั้น ม.๔/... แผนการเรียน ...
  x = drawLabel('เลขประจำตัวนักเรียน', MARGIN_X, y);
  const classLabelX = MARGIN_X + 178;
  drawDottedSegment(page, font, x, classLabelX - 6, y, member?.student_id || '', size);
  x = drawLabel('ระดับชั้น ม.๔/', classLabelX, y);
  const planLabelX = classLabelX + 114;
  drawDottedSegment(page, font, x, planLabelX - 6, y, roomNo, size);
  x = drawLabel('แผนการเรียน', planLabelX, y);
  drawDottedSegment(page, font, x, rightX, y, member?.study_plan || '', size);
  y -= lineGap;

  // Row 3: ผลการเรียนเฉลี่ยภาคเรียนที่ผ่านมา ... วัน/เดือน/ปีเกิด ...
  x = drawLabel('ผลการเรียนเฉลี่ยภาคเรียนที่ผ่านมา', MARGIN_X, y);
  const birthLabelX = MARGIN_X + 278;
  drawDottedSegment(page, font, x, birthLabelX - 6, y, gpaxStr, size);
  x = drawLabel('วัน/เดือน/ปีเกิด', birthLabelX, y);
  drawDottedSegment(page, font, x, rightX, y, birthStr, size);
  y -= lineGap;

  // Row 4: อายุ ... ปี สัญชาติ ... ศาสนา ...
  x = drawLabel('อายุ', MARGIN_X, y);
  const yearLabelX = MARGIN_X + 78;
  drawDottedSegment(page, font, x, yearLabelX - 4, y, ageStr, size);
  x = drawLabel('ปี สัญชาติ', yearLabelX, y);
  const relLabelX = MARGIN_X + 258;
  drawDottedSegment(page, font, x, relLabelX - 6, y, member?.nationality || 'ไทย', size);
  x = drawLabel('ศาสนา', relLabelX, y);
  drawDottedSegment(page, font, x, rightX, y, member?.religion || 'พุทธ', size);
  y -= lineGap;

  // Row 5: เบอร์โทรศัพท์ ...
  x = drawLabel('เบอร์โทรศัพท์', MARGIN_X, y);
  drawDottedSegment(page, font, x, rightX, y, member?.phone || '', size);
  y -= lineGap;

  // Row 6: E-mail ...
  x = drawLabel('E-mail', MARGIN_X, y);
  drawDottedSegment(page, font, x, rightX, y, member?.email || '', size);
  y -= lineGap;

  // Row 7: พรรค ... ดำรงตำแหน่ง/ฝ่าย ...
  x = drawLabel('พรรค', MARGIN_X, y);
  const posLabelX = MARGIN_X + 216;
  drawDottedSegment(page, font, x, posLabelX - 6, y, party?.party_name || '', size);
  x = drawLabel('ดำรงตำแหน่ง/ฝ่าย', posLabelX, y);
  drawDottedSegment(page, font, x, rightX, y, member?.position_label || '', size);
  y -= lineGap;

  // Row 8 + 4 continuation lines: ประสบการณ์หรือผลงาน (ถ้ามี)
  const expStartX = drawLabel('ประสบการณ์หรือผลงาน (ถ้ามี)', MARGIN_X, y);
  const expLines = wrapThaiText(
    member?.experience || '',
    font,
    size,
    rightX - expStartX - 8,
    CONTENT_W - 8,
    5,
  );
  drawDottedSegment(page, font, expStartX, rightX, y, expLines[0] || '', size);
  for (let i = 1; i <= 4; i += 1) {
    y -= lineGap;
    drawDottedSegment(page, font, MARGIN_X, rightX, y, expLines[i] || '', size);
  }

  // 5. Signature block (bottom right)
  const sigY = Math.max(92, y - 58);
  const sigX = MARGIN_X + 265;
  const afterSign = drawLabel('ลงชื่อ', sigX, sigY);
  drawDottedSegment(page, font, afterSign, rightX, sigY, '', size);

  const parenY = sigY - 26;
  page.drawText('(', { x: sigX + 24, y: parenY, size, font, color: INK });
  drawDottedSegment(page, font, sigX + 30, rightX - 8, parenY, fullName, size);
  page.drawText(')', { x: rightX - 6, y: parenY, size, font, color: INK });
}

function appendRosterPages(ctx, party, members = [], targetCount = 29) {
  const { pdfDoc, font, bold, logosImage } = ctx;
  const totalSlots = Math.max(targetCount, members.length, 29);
  const perPage = 15;
  const pageCount = Math.ceil(totalSlots / perPage);
  const size = 12.5;
  const rightX = MARGIN_X + CONTENT_W;

  for (let p = 0; p < pageCount; p += 1) {
    const page = pdfDoc.addPage([A4_W, A4_H]);
    let y = A4_H - 36;

    if (p === 0) {
      if (logosImage) {
        const logoH = 54;
        const logoW = (logosImage.width / logosImage.height) * logoH;
        page.drawImage(logosImage, {
          x: (A4_W - logoW) / 2,
          y: y - logoH,
          width: logoW,
          height: logoH,
        });
        y -= logoH + 16;
      } else {
        y -= 16;
      }
      const title = 'ใบสมัคร คณะกรรมการสภานักเรียน ปีการศึกษา ๒๕๗๐';
      page.drawText(title, {
        x: (A4_W - bold.widthOfTextAtSize(title, 15.5)) / 2,
        y,
        size: 15.5,
        font: bold,
        color: INK,
      });
      y -= 26;

      const labelW = bold.widthOfTextAtSize('ชื่อพรรค', 13.5);
      page.drawText('ชื่อพรรค', { x: MARGIN_X, y, size: 13.5, font: bold, color: INK });
      drawDottedSegment(page, font, MARGIN_X + labelW + 6, rightX, y, party?.party_name || '', 13.5);
      y -= 28;
    } else {
      const subTitle = `ใบสมัคร คณะกรรมการสภานักเรียน ปีการศึกษา ๒๕๗๐ — พรรค ${party?.party_name || ''} (ต่อ)`;
      page.drawText(subTitle, {
        x: (A4_W - bold.widthOfTextAtSize(subTitle, 13.5)) / 2,
        y,
        size: 13.5,
        font: bold,
        color: INK,
      });
      y -= 30;
    }

    const startIdx = p * perPage;
    const endIdx = Math.min(totalSlots, startIdx + perPage);

    for (let i = startIdx; i < endIdx; i += 1) {
      const m = members[i] || null;
      const numLabel = `${toThaiDigits(i + 1)}. ชื่อ-สกุล`;
      const fullName = m?.full_name ? `${m.prefix || ''}${m.full_name}` : '';
      const roomNo = m ? extractRoomNumber(m.classroom) : '';

      // Line 1: ๑. ชื่อ-สกุล ... ชื่อเล่น ...
      page.drawText(numLabel, { x: MARGIN_X, y, size, font: bold, color: INK });
      const x1 = MARGIN_X + bold.widthOfTextAtSize(numLabel, size) + 4;
      const nickX = MARGIN_X + 328;
      drawDottedSegment(page, font, x1, nickX - 6, y, fullName, size);
      page.drawText('ชื่อเล่น', { x: nickX, y, size, font: bold, color: INK });
      const x2 = nickX + bold.widthOfTextAtSize('ชื่อเล่น', size) + 4;
      drawDottedSegment(page, font, x2, rightX, y, m?.nickname || '', size);
      y -= 20;

      // Line 2: ระดับชั้น ม.๔/... ดำรงตำแหน่ง/ฝ่าย ...
      const indentX = MARGIN_X + 22;
      page.drawText('ระดับชั้น ม.๔/', { x: indentX, y, size, font: bold, color: INK });
      const rx1 = indentX + bold.widthOfTextAtSize('ระดับชั้น ม.๔/', size) + 2;
      const posX = indentX + 116;
      drawDottedSegment(page, font, rx1, posX - 6, y, roomNo, size);
      page.drawText('ดำรงตำแหน่ง/ฝ่าย', { x: posX, y, size, font: bold, color: INK });
      const rx2 = posX + bold.widthOfTextAtSize('ดำรงตำแหน่ง/ฝ่าย', size) + 4;
      drawDottedSegment(page, font, rx2, rightX, y, m?.position_label || '', size);
      y -= 24;
    }
  }
}

function triggerPdfDownload(pdfBytes, filename) {
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export async function downloadMemberApplicationPdf(member, party, photoData = null) {
  const ctx = await createBaseDoc();
  await appendIndividualPage(ctx, member, party, photoData);
  const bytes = await ctx.pdfDoc.save();
  const safeName = (member?.student_id || member?.full_name || 'applicant').replace(/[^\w\u0E00-\u0E7F-]/g, '_');
  triggerPdfDownload(bytes, `ใบสมัคร_${safeName}_2570.pdf`);
}

export async function downloadPartyRosterPdf(party, members = [], targetCount = 29) {
  const ctx = await createBaseDoc();
  appendRosterPages(ctx, party, members, targetCount);
  const bytes = await ctx.pdfDoc.save();
  const safeParty = (party?.party_name || 'party').replace(/[^\w\u0E00-\u0E7F-]/g, '_');
  triggerPdfDownload(bytes, `บัญชีรายชื่อพรรค_${safeParty}_2570.pdf`);
}

export async function downloadFullPartyBundlePdf(party, members = [], photoMap = {}, targetCount = 29) {
  const ctx = await createBaseDoc();
  appendRosterPages(ctx, party, members, targetCount);
  for (const m of members) {
    await appendIndividualPage(ctx, m, party, photoMap[m.id] || null);
  }
  const bytes = await ctx.pdfDoc.save();
  const safeParty = (party?.party_name || 'party').replace(/[^\w\u0E00-\u0E7F-]/g, '_');
  triggerPdfDownload(bytes, `ชุดใบสมัครทั้งพรรค_${safeParty}_2570.pdf`);
}
