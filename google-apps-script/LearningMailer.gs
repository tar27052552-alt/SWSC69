/**
 * Deploy this file in a separate Apps Script project owned by the council email.
 * Set Script Properties: LEARNING_MAILER_URL, LEARNING_MAILER_SECRET,
 * LEARNING_TEMPLATE_CIVIC_1 through LEARNING_TEMPLATE_CIVIC_5.
 * Each template is a signed Google Slides file with text placeholders
 * {{NAME}}, {{ISSUED_DATE}}, {{CERT_NUMBER}}. Set a 5-minute trigger for
 * runLearningMailer. Do not publish the script as a web app.
 */
function learningMailerRequest_(payload) {
  const properties = PropertiesService.getScriptProperties();
  const response = UrlFetchApp.fetch(properties.getProperty('LEARNING_MAILER_URL'), {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-learning-mailer-secret': properties.getProperty('LEARNING_MAILER_SECRET') },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  if (response.getResponseCode() >= 300) {
    throw new Error('Learning mailer API returned ' + response.getResponseCode());
  }
  return JSON.parse(response.getContentText());
}

function learningCertificatePdf_(job) {
  const key = 'LEARNING_TEMPLATE_' + job.subjectId.replace('-', '_').toUpperCase();
  const templateId = job.templateId || PropertiesService.getScriptProperties().getProperty(key);
  if (!templateId) throw new Error('Missing signed template for ' + job.subjectId);
  const copy = DriveApp.getFileById(templateId).makeCopy('Temporary ' + job.certificateNumber);
  try {
    const slides = SlidesApp.openById(copy.getId());
    slides.replaceAllText('{{NAME}}', job.fullName);
    const issued = new Date(job.issuedAt);
    const thaiMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
      'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    const day = Number(Utilities.formatDate(issued, 'Asia/Bangkok', 'd'));
    const month = Number(Utilities.formatDate(issued, 'Asia/Bangkok', 'M'));
    const year = Number(Utilities.formatDate(issued, 'Asia/Bangkok', 'yyyy')) + 543;
    slides.replaceAllText('{{ISSUED_DATE}}', day + ' ' + thaiMonths[month - 1] + ' ' + year);
    slides.replaceAllText('{{CERT_NUMBER}}', job.certificateNumber);
    slides.saveAndClose();
    return copy.getAs(MimeType.PDF).setName(job.certificateNumber + '.pdf');
  } finally {
    copy.setTrashed(true);
  }
}

function runLearningMailer() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    for (let i = 0; i < 5; i++) {
      const job = learningMailerRequest_({ action: 'claim' }).job;
      if (!job) break;
      try {
        let pdf;
        if (job.hasPdf) {
          const stored = learningMailerRequest_({ action: 'pdf', jobId: job.jobId });
          pdf = Utilities.newBlob(Utilities.base64Decode(stored.pdfBase64),
            MimeType.PDF, job.certificateNumber + '.pdf');
        } else {
          pdf = learningCertificatePdf_(job);
          learningMailerRequest_({ action: 'upload', jobId: job.jobId,
            pdfBase64: Utilities.base64Encode(pdf.getBytes()) });
        }
        if (MailApp.getRemainingDailyQuota() < 1) {
          throw new Error('Council email daily quota exhausted');
        }
        MailApp.sendEmail({
          to: job.email,
          subject: 'เกียรติบัตรหลักสูตรพลเมือง DNA เลขที่ ' + job.certificateNumber,
          body: 'เรียน ' + job.fullName + '\n\nแนบเกียรติบัตรรายวิชาที่คุณผ่านเกณฑ์แล้ว เลขที่ ' +
            job.certificateNumber + '\n\nสภานักเรียนโรงเรียนสรรพวิทยาคม',
          attachments: [pdf],
          name: 'สภานักเรียนโรงเรียนสรรพวิทยาคม',
        });
        learningMailerRequest_({ action: 'complete', jobId: job.jobId, success: true });
      } catch (error) {
        learningMailerRequest_({ action: 'complete', jobId: job.jobId,
          success: false, error: String(error) });
      }
    }
  } finally {
    lock.releaseLock();
  }
}
