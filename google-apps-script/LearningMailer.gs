/**
 * Certificate PDF generator + email sender (Google Apps Script).
 * Deploy this file in a separate Apps Script project owned by the council email.
 *
 * Required Script Properties:
 *   - LEARNING_MAILER_URL: Edge Function URL for learning-mailer
 *   - LEARNING_MAILER_SECRET: Shared secret matching Edge Function
 *
 * Optional Script Properties:
 *   - LEARNING_MAILER_EMAIL_ENABLED: Set to "true" to enable sending real emails
 *       (Default is disabled so you can test safely first!)
 *   - LEARNING_MAILER_TEST_EMAIL: Optional test email address.
 *       Used by testLearningCertificateEmail(), and if set while enabled,
 *       redirects all outgoing emails here with a [TEST] prefix.
 *   - LEARNING_PORTAL_URL: Link to learner certificates page
 *       (e.g. "https://<your-domain>/learn/?view=certificates")
 *   - LEARNING_TEMPLATE_CIVIC_1 .. LEARNING_TEMPLATE_CIVIC_5, LEARNING_TEMPLATE_CIVIC_ALL:
 *       Fallback Google Slides IDs (normally supplied from Supabase via job.templateId)
 *
 * Each template is a signed Google Slides file with text placeholders
 * {{NAME}}, {{ISSUED_DATE}}. Set a 5-minute trigger for runLearningMailer.
 * Do not publish the script as a web app.
 */

const DEFAULT_TEMPLATES_ = {
  'civic-1': '1sRQXwOmYZFoag3s5ZMC0Q8LyBQ6euuQ3MGRloLjZr-0',
  'civic-2': '1iZCcQL2N7lvWc7Eg4s-abS94zfXSHPLeMlllUIo0EO0',
  'civic-3': '1SW06QmRhMthVywTxK5gqic3LG3WE7-e-C1jPaXCJPhU',
  'civic-4': '1mDOYUeHHxnVa2nN8mtmui3ZjZicUw1-FrcR_PuBAXcM',
  'civic-5': '1MiTllJOZWl-5vb0LTC8xWkTr-GpdGYyc-JDEoz6pkIg',
  'civic-all': '1qLThJkZy0U4Md50EdAq9eT2Ei-W2OZNJd_U1pnj8qRc',
};

function learningMailerRequest_(payload) {
  payload.outputMode = 'email';
  const properties = PropertiesService.getScriptProperties();
  const response = UrlFetchApp.fetch(properties.getProperty('LEARNING_MAILER_URL'), {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-learning-mailer-secret': properties.getProperty('LEARNING_MAILER_SECRET') },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  if (response.getResponseCode() >= 300) {
    throw new Error('Learning mailer API returned ' + response.getResponseCode() + ': ' + response.getContentText());
  }
  return JSON.parse(response.getContentText());
}

function formatThaiCertificateDate_(issuedAt, useThaiDigits) {
  const issued = new Date(issuedAt);
  const thaiMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const day = Number(Utilities.formatDate(issued, 'Asia/Bangkok', 'd'));
  const month = Number(Utilities.formatDate(issued, 'Asia/Bangkok', 'M'));
  const year = Number(Utilities.formatDate(issued, 'Asia/Bangkok', 'yyyy')) + 543;
  const toThai = value => String(value).replace(/[0-9]/g, digit => '๐๑๒๓๔๕๖๗๘๙'[Number(digit)]);
  if (useThaiDigits) {
    return toThai(day) + ' ' + thaiMonths[month - 1] + ' พุทธศักราช ' + toThai(year);
  }
  return day + ' ' + thaiMonths[month - 1] + ' พ.ศ. ' + year;
}

function certificateFileName_(job) {
  if (job.subjectId === 'civic-all') return 'เกียรติบัตร_จบหลักสูตรพลเมืองDNA.pdf';
  if (job.subjectOrdinal) return 'เกียรติบัตร_บทที่' + job.subjectOrdinal + '_พลเมืองDNA.pdf';
  return 'เกียรติบัตร_' + String(job.subjectId || 'พลเมืองDNA') + '.pdf';
}

function escapeHtml_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function learningCertificatePdf_(job) {
  const key = 'LEARNING_TEMPLATE_' + String(job.subjectId || '').replace('-', '_').toUpperCase();
  const templateId = job.templateId || PropertiesService.getScriptProperties().getProperty(key) ||
    DEFAULT_TEMPLATES_[job.subjectId];
  if (!templateId) throw new Error('Missing signed template for ' + job.subjectId);
  const copy = DriveApp.getFileById(templateId).makeCopy('Temporary certificate ' + job.certificateId);
  try {
    const slides = SlidesApp.openById(copy.getId());
    slides.replaceAllText('{{NAME}}', job.fullName);
    slides.replaceAllText('{{ISSUED_DATE}}', formatThaiCertificateDate_(job.issuedAt, true));
    slides.replaceAllText('{{CERT_NUMBER}}', '');
    slides.saveAndClose();
    return copy.getAs(MimeType.PDF).setName(certificateFileName_(job));
  } finally {
    copy.setTrashed(true);
  }
}

function sendCertificateEmail_(job, pdf, options) {
  const opts = options || {};
  const properties = PropertiesService.getScriptProperties();
  const testEmail = opts.overrideTo || (properties.getProperty('LEARNING_MAILER_TEST_EMAIL') || '').trim();
  const recipient = testEmail || job.email;
  if (!recipient) throw new Error('Missing recipient email');
  if (MailApp.getRemainingDailyQuota() < 1) {
    throw new Error('Council email daily quota exhausted');
  }

  const certTitle = job.certificateTitle || 'เกียรติบัตรหลักสูตรพลเมือง DNA';
  const issuedDateText = formatThaiCertificateDate_(job.issuedAt, false);
  const portalUrl = (properties.getProperty('LEARNING_PORTAL_URL') || job.portalUrl || '').trim();
  const isTestRedirect = Boolean(testEmail);
  const subjectPrefix = isTestRedirect ? '[ทดสอบส่งเมล] ' : '';
  const passedPhrase = job.subjectId === 'civic-all'
    ? 'ผ่านครบทั้ง 5 วิชา (หลักสูตรพลเมือง DNA)'
    : (job.subjectOrdinal && job.subjectTitle
      ? 'ผ่านวิชาที่ ' + job.subjectOrdinal + ' ' + job.subjectTitle
      : 'ผ่านวิชา ' + (job.subjectTitle || certTitle));
  const subject = subjectPrefix + passedPhrase + ' — เกียรติบัตรสภานักเรียนโรงเรียนสรรพวิทยาคม';

  const plainLines = [
    'เรียน คุณ' + job.fullName,
    '',
    'ขอแสดงความยินดีที่คุณ' + passedPhrase + ' ในหลักสูตรพลเมือง DNA',
    'รายการเกียรติบัตร: ' + certTitle,
    'วันที่ออกเกียรติบัตร: ' + issuedDateText,
    '',
    'ไฟล์เกียรติบัตร (PDF) แนบมากับอีเมลฉบับนี้เรียบร้อยแล้ว',
  ];
  if (portalUrl) {
    plainLines.push('หรือสามารถเข้าดูและดาวน์โหลดย้อนหลังได้ที่: ' + portalUrl);
  }
  plainLines.push('', 'ขอแสดงความนับถือ', 'สภานักเรียนโรงเรียนสรรพวิทยาคม');

  const portalButtonHtml = portalUrl
    ? '<p style="margin:24px 0 0;"><a href="' + escapeHtml_(portalUrl) + '" ' +
      'style="display:inline-block;background:#5e168f;color:#ffffff;text-decoration:none;' +
      'padding:11px 22px;border-radius:8px;font-weight:600;font-size:14px;">เปิดดูเกียรติบัตรบนเว็บไซต์</a></p>'
    : '';

  const testBannerHtml = isTestRedirect
    ? '<div style="background:#fff4e5;border:1px solid #f5c26b;color:#8a4b00;padding:10px 14px;border-radius:8px;margin-bottom:16px;font-size:13px;">' +
      '<strong>โหมดทดสอบ:</strong> อีเมลต้นทางคือ ' + escapeHtml_(job.email || '(ทดสอบ)') + '</div>'
    : '';

  const htmlBody =
    '<div style="font-family:\'Sarabun\',\'Noto Sans Thai\',Tahoma,sans-serif;background:#f6f4fa;padding:28px 16px;color:#231f2d;">' +
      '<div style="max-width:580px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e6dff0;">' +
        '<div style="background:linear-gradient(135deg,#3d0f63,#5e168f);padding:24px 28px;color:#ffffff;">' +
          '<div style="font-size:12px;letter-spacing:0.08em;opacity:0.85;">SWSC · CIVIC DNA LEARNING</div>' +
          '<h1 style="margin:6px 0 0;font-size:20px;font-weight:700;line-height:1.4;">ขอแสดงความยินดี! คุณ' + escapeHtml_(passedPhrase) + '</h1>' +
        '</div>' +
        '<div style="padding:26px 28px;font-size:15px;line-height:1.7;">' +
          testBannerHtml +
          '<p style="margin:0 0 14px;">เรียน คุณ<strong>' + escapeHtml_(job.fullName) + '</strong></p>' +
          '<p style="margin:0 0 16px;">สภานักเรียนโรงเรียนสรรพวิทยาคม ขอแสดงความยินดีที่คุณ<strong>' + escapeHtml_(passedPhrase) + '</strong> ในหลักสูตรพลเมือง DNA</p>' +
          '<div style="background:#faf7fd;border:1px solid #e8def5;border-radius:10px;padding:14px 18px;margin:16px 0;">' +
            '<div style="font-size:13px;color:#6c5b7b;">รายการเกียรติบัตร</div>' +
            '<div style="font-size:16px;font-weight:700;color:#3d0f63;margin:2px 0 8px;">' + escapeHtml_(certTitle) + '</div>' +
            '<div style="font-size:13px;color:#6c5b7b;">วันที่ออกเกียรติบัตร: <strong style="color:#231f2d;">' + escapeHtml_(issuedDateText) + '</strong></div>' +
          '</div>' +
          '<p style="margin:16px 0 0;">ไฟล์เกียรติบัตรฉบับสมบูรณ์ (PDF) ได้แนบมากับอีเมลฉบับนี้แล้ว คุณสามารถเปิดดูหรือบันทึกเก็บไว้ได้ทันที</p>' +
          portalButtonHtml +
          '<hr style="border:none;border-top:1px solid #eeeaf5;margin:26px 0 16px;" />' +
          '<p style="margin:0;font-size:13px;color:#6c5b7b;">ขอแสดงความนับถือ<br /><strong>สภานักเรียนโรงเรียนสรรพวิทยาคม</strong></p>' +
        '</div>' +
      '</div>' +
    '</div>';

  MailApp.sendEmail({
    to: recipient,
    subject: subject,
    body: plainLines.join('\n'),
    htmlBody: htmlBody,
    attachments: [pdf],
    name: 'สภานักเรียนโรงเรียนสรรพวิทยาคม',
  });
}

function runLearningMailer() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  const emailEnabled = PropertiesService.getScriptProperties()
    .getProperty('LEARNING_MAILER_EMAIL_ENABLED') === 'true';
  try {
    for (let i = 0; i < 5; i++) {
      const job = learningMailerRequest_({ action: 'claim' }).job;
      if (!job) break;
      try {
        let pdf;
        if (job.hasPdf) {
          const stored = learningMailerRequest_({ action: 'pdf', jobId: job.jobId });
          pdf = Utilities.newBlob(Utilities.base64Decode(stored.pdfBase64),
            MimeType.PDF, certificateFileName_(job));
        } else {
          pdf = learningCertificatePdf_(job);
          learningMailerRequest_({ action: 'upload', jobId: job.jobId,
            pdfBase64: Utilities.base64Encode(pdf.getBytes()) });
        }
        let emailSent = false;
        if (emailEnabled) {
          sendCertificateEmail_(job, pdf);
          emailSent = true;
        }
        learningMailerRequest_({ action: 'complete', jobId: job.jobId, success: true, emailSent: emailSent });
      } catch (error) {
        learningMailerRequest_({ action: 'complete', jobId: job.jobId,
          success: false, error: String(error) });
      }
    }
  } finally {
    lock.releaseLock();
  }
}

/**
 * ฟังก์ชันสำหรับทดสอบส่งอีเมลเกียรติบัตรจริง 1 ฉบับเข้าอีเมลผู้ดูแล โดยไม่กระทบคิวผู้เรียนจริง
 * วิธีใช้: เลือกฟังก์ชัน testLearningCertificateEmail ใน Apps Script แล้วกด Run
 * (ตั้ง Script Property LEARNING_MAILER_TEST_EMAIL เป็นอีเมลที่ต้องการรับ หรือใช้เมลเจ้าของสคริปต์อัตโนมัติ)
 */
function testLearningCertificateEmail() {
  const properties = PropertiesService.getScriptProperties();
  const targetEmail = (properties.getProperty('LEARNING_MAILER_TEST_EMAIL') || '').trim() ||
    Session.getActiveUser().getEmail();
  if (!targetEmail) {
    throw new Error('กรุณาตั้งค่า Script Property LEARNING_MAILER_TEST_EMAIL ก่อนรันทดสอบ');
  }
  const sampleJob = {
    certificateId: 'TEST-' + Date.now(),
    subjectId: 'civic-1', // เปลี่ยนเป็น civic-1..civic-5 หรือ civic-all เพื่อทดสอบแต่ละแบบได้
    subjectOrdinal: 1,
    subjectTitle: 'การปกครองระบอบประชาธิปไตยอันมีพระมหากษัตริย์ทรงเป็นประมุข',
    certificateTitle: 'เกียรติบัตรวิชาที่ 1: การปกครองระบอบประชาธิปไตยอันมีพระมหากษัตริย์ทรงเป็นประมุข',
    fullName: 'นักเรียนทดสอบ ระบบสภานักเรียน',
    email: targetEmail,
    issuedAt: new Date().toISOString(),
    templateId: DEFAULT_TEMPLATES_['civic-1'],
  };
  const pdf = learningCertificatePdf_(sampleJob);
  sendCertificateEmail_(sampleJob, pdf, { overrideTo: targetEmail });
  Logger.log('ส่งอีเมลทดสอบพร้อม PDF เรียบร้อยแล้วที่: ' + targetEmail);
}

/**
 * ทดสอบสร้าง PDF และส่งอีเมลครบทั้ง 6 แบบ (วิชาที่ 1–5 + รวม 5 วิชา) เข้าอีเมลทดสอบทีเดียว
 * (ใช้โควตาเมล 6 ฉบับ — ไม่กระทบคิวผู้เรียนจริง)
 */
function testAllSixCertificateEmails() {
  const properties = PropertiesService.getScriptProperties();
  const targetEmail = (properties.getProperty('LEARNING_MAILER_TEST_EMAIL') || '').trim() ||
    Session.getActiveUser().getEmail();
  if (!targetEmail) {
    throw new Error('กรุณาตั้งค่า Script Property LEARNING_MAILER_TEST_EMAIL ก่อนรันทดสอบ');
  }
  const samples = [
    { subjectId: 'civic-1', subjectOrdinal: 1, subjectTitle: 'การปกครองระบอบประชาธิปไตยอันมีพระมหากษัตริย์ทรงเป็นประมุข', title: 'เกียรติบัตรวิชาที่ 1: การปกครองระบอบประชาธิปไตยอันมีพระมหากษัตริย์ทรงเป็นประมุข' },
    { subjectId: 'civic-2', subjectOrdinal: 2, subjectTitle: 'การเป็นพลเมืองคุณภาพ', title: 'เกียรติบัตรวิชาที่ 2: การเป็นพลเมืองคุณภาพ' },
    { subjectId: 'civic-3', subjectOrdinal: 3, subjectTitle: 'การมีส่วนร่วมทางการเมืองของพลเมือง', title: 'เกียรติบัตรวิชาที่ 3: การมีส่วนร่วมทางการเมืองของพลเมือง' },
    { subjectId: 'civic-4', subjectOrdinal: 4, subjectTitle: 'การขับเคลื่อนศูนย์ส่งเสริมพัฒนาประชาธิปไตย (ศส.ปชต.)', title: 'เกียรติบัตรวิชาที่ 4: การขับเคลื่อนศูนย์ส่งเสริมพัฒนาประชาธิปไตย (ศส.ปชต.)' },
    { subjectId: 'civic-5', subjectOrdinal: 5, subjectTitle: 'ฝึกปฏิบัติ ศส.ปชต. สู่ กปน.มืออาชีพ', title: 'เกียรติบัตรวิชาที่ 5: ฝึกปฏิบัติ ศส.ปชต. สู่ กปน.มืออาชีพ' },
    { subjectId: 'civic-all', subjectOrdinal: null, subjectTitle: '', title: 'เกียรติบัตรจบหลักสูตรพลเมือง DNA (รวม 5 วิชา)' },
  ];
  const nowIso = new Date().toISOString();
  samples.forEach(function (item) {
    const sampleJob = {
      certificateId: 'TEST-' + item.subjectId + '-' + Date.now(),
      subjectId: item.subjectId,
      subjectOrdinal: item.subjectOrdinal,
      subjectTitle: item.subjectTitle,
      certificateTitle: item.title,
      fullName: 'นักเรียนทดสอบ ระบบสภานักเรียน',
      email: targetEmail,
      issuedAt: nowIso,
      templateId: DEFAULT_TEMPLATES_[item.subjectId],
    };
    const pdf = learningCertificatePdf_(sampleJob);
    sendCertificateEmail_(sampleJob, pdf, { overrideTo: targetEmail });
  });
  Logger.log('ส่งอีเมลทดสอบครบทั้ง 6 แบบเรียบร้อยแล้วที่: ' + targetEmail);
}
