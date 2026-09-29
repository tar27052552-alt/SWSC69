# บทเรียนพลเมือง DNA: การเตรียมเปิดใช้งาน

สถานะปัจจุบัน: โค้ดและโครงสร้างข้อมูลอยู่ในสาขา `codex/learning-portal` แต่ทั้ง 5 วิชายัง `published=false` จึงยังไม่มีการออกใบจริง

## ข้อมูลต้นฉบับที่ต้องได้รับ

1. Google Forms ข้อสอบชุดเดียวต่อวิชาทั้ง 5 วิชา วิชาละ 10 ข้อ พร้อมเฉลยที่ผู้ดูแลตรวจแล้ว (ใช้ชุดเดียวกันก่อนเรียนและหลังเรียน) ฟอร์มก่อน/หลังของวิชาที่ 1 ตรวจแล้วว่ามี 10 ข้อ แต่ยังต้องตรวจเฉลยและอีก 4 วิชา
2. บทนำ หัวข้อ จุดประสงค์ และลิงก์สื่อการเรียนจาก Google Sites อยู่ใน `src/learn/lessonCatalog.js` แล้ว หน้าเว็บแสดงสื่อจาก Google Drive/YouTube ต้นฉบับผ่านตัวดูในหน้า ผู้ดูแลควรตรวจสิทธิ์การเข้าถึงและความครบถ้วนของแต่ละลิงก์ก่อนเปิดใช้
3. ไฟล์เกียรติบัตรที่มีลายเซ็นอนุมัติแล้ว 5 ไฟล์ แยกวิชา สำหรับระบบนี้ให้ใช้ Google Slides โดยคงลายเซ็นเดิมและวางช่องข้อความ `{{NAME}}`, `{{ISSUED_DATE}}`, `{{CERT_NUMBER}}`

ห้ามตั้ง `published=true` ก่อนตรวจข้อสอบและแบบใบของวิชานั้นครบถ้วน

## ขั้นตอนหลังได้รับไฟล์

1. ใช้ migration `20260929064517_learning_portal.sql` และ `20260929120249_learning_course_progress.sql` ตามลำดับกับฐานข้อมูล Supabase ที่ถูกต้อง
2. กรอกไฟล์ JSON ตาม `learning-content.example.json` แล้วเรียก `node scripts/import-learning-content.mjs <ไฟล์จริง>` ด้วย `SUPABASE_URL` และ `SUPABASE_SERVICE_ROLE_KEY` ในเครื่องผู้ดูแล ห้ามส่งไฟล์เฉลยหรือ service role key ขึ้น Git
3. Deploy Edge Function `learning` โดยเปิด JWT verification และ `learning-mailer` โดยปิด JWT verification เพราะมี `x-learning-mailer-secret` ตรวจเอง ตั้งค่า secret `LEARNING_MAILER_SECRET` เป็นค่าสุ่มยาวอย่างน้อย 32 ไบต์
4. ตั้งค่า Supabase Auth Custom SMTP ของบัญชีสภา พร้อม Site URL และ Redirect URL `https://<โดเมนเว็บ>/learn/` จึงจะส่งลิงก์เข้าสู่ระบบไปยังอีเมลทั่วไปได้
5. นำ `google-apps-script/LearningMailer.gs` ไปวางใน Apps Script ที่บัญชีสภาเป็นเจ้าของ ตั้ง Script Properties `LEARNING_MAILER_URL` = URL Edge Function `learning-mailer`, `LEARNING_MAILER_SECRET` = ค่าเดียวกับ Edge Function และ `LEARNING_TEMPLATE_CIVIC_1` ถึง `_5` = Google Slides ID ของใบที่เซ็นแล้ว ตั้ง time trigger ทุก 5 นาทีและอนุญาตสิทธิ์ Drive, Slides, MailApp, UrlFetch
6. ทดสอบเส้นทาง 5 วิชาด้วยบัญชีอีเมลทดสอบ: ก่อนเรียนต้องทำก่อนดูสื่อ, คะแนนหลังเรียน 5/10 ยังล็อกบทถัดไป, 6/10 และ 7/10 เปิดบทถัดไปแต่ยังไม่มีใบ, 8/10 ออกใบ, สอบซ้ำ, ใบเลขเดิม, ชื่อ/วัน/ลายเซ็น, PDF ส่วนตัว, อีเมลแนบ, ส่งซ้ำเมื่อเมลไม่ถึง, และกรณีโควตาหมด
7. หลังตรวจครบ จึงตั้ง `learning_subjects.published=true` และ deploy เว็บปัจจุบัน

เกียรติบัตรที่ออกแล้วจะเก็บใน private Supabase Storage และผลสอบจะคงอยู่แม้การส่งอีเมลล้มเหลว งานส่งจะลองใหม่โดยรักษา PDF เดิมไว้
