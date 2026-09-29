# เปิดใช้หลักสูตรพลเมือง DNA รุ่นใหม่

หลักสูตรรุ่น `civic-dna-2026` แยกความคืบหน้าจากรุ่นเดิม ฐานข้อมูลและสื่อจะอยู่ในสถานะร่างจนกว่าผู้ดูแลกดเผยแพร่ในหลังบ้าน อย่าเปิดให้ผู้เรียนจริงก่อนตรวจรายการด้านล่าง

## 1. เตรียม Google OAuth

1. ใน Google Cloud ของโรงเรียน สร้าง OAuth consent screen สำหรับผู้ใช้ภายนอกองค์กร และสร้าง OAuth Client ชนิด Web application
2. ใส่ Authorized redirect URI: `https://pzlcxctnnhjqpbhwcxqx.supabase.co/auth/v1/callback`
3. นำ Client ID และ Client secret ไปตั้งใน Supabase → Authentication → Providers → Google
4. ใน Supabase → Authentication → URL Configuration ตั้ง Site URL เป็นโดเมน Vercel ที่ใช้งานจริง และเพิ่ม Redirect URL ของหน้า `https://<โดเมนจริง>/learn/` (รวม Preview URL ที่จะทดสอบ หากจำเป็น)
5. ทดสอบด้วยบัญชี Google จริงทั้งบัญชีโรงเรียนและบัญชีทั่วไป การตั้ง Google ใน Supabase ไม่ควรปิดวิธีลงชื่อเข้าใช้เดิมของหลังบ้าน

หน้าเรียนใช้ session ใน `swsc-learner-auth`; หลังบ้านยังใช้ session เดิมของตนเอง ห้ามนำ Google Client secret หรือ Supabase service role key ไปใส่ตัวแปร `VITE_*` ใน Vercel

## 2. ติดตั้งฐานข้อมูลและ Edge Functions

รัน migration ใน `supabase/migrations/` ตามลำดับบนโครงการ `pzlcxctnnhjqpbhwcxqx` แล้ว deploy `learning-v2`, `learning-admin`, และ `learning-mailer` หลังจากตรวจ SQL กับฐานข้อมูลทดสอบก่อน ตัวแปรลับของ Edge `LEARNING_MAILER_SECRET` ต้องเป็นค่าเดียวกับใน Apps Script ของบัญชีสภา

การติดตั้ง migration เพียงอย่างเดียวจะไม่เผยแพร่หลักสูตร และจะไม่ลบผลสอบหรือเกียรติบัตรรุ่นเก่า

## 3. นำเนื้อหาเข้าฉบับร่าง

ในเครื่องที่มีโฟลเดอร์ `.learning-source` ให้ใช้ `scripts/extract-learning-pages.py` แล้ว `scripts/prepare-learning-v2.mjs` เพื่อสร้างร่างจาก PDF, Google Forms และรายการวิดีโอเดิม จากนั้นตั้ง `SUPABASE_URL` และ `SUPABASE_SERVICE_ROLE_KEY` เฉพาะใน process ของเครื่องผู้ดูแล แล้วรัน `node scripts/import-learning-v2.mjs` ตัวนำเข้าจะอัปโหลด PDF 12 ไฟล์และภาพหน้าเอกสาร 145 หน้าไปยัง bucket ส่วนตัว แล้วบันทึกเนื้อหาและข้อสอบเป็น **ฉบับร่าง**

ไฟล์ `.learning-source` และเฉลยท้องถิ่นถูก ignore จาก Git อย่า commit หรือส่งต่อ service role key

## 4. ตรวจและเผยแพร่

เข้า `/admin-learning` ด้วยบัญชีผู้ดูแล ตรวจข้อความ ภาพ ตาราง ลำดับหัวข้อและวิดีโอทุกวิชา เทียบคำถาม 10 ข้อและเฉลยกับ Google Forms ต้นฉบับ ตรวจเอกสารที่เป็นภาพสแกน 2 ไฟล์เป็นพิเศษ แก้จุดที่เสนอแก้และอนุมัติเนื้อหา/ข้อสอบครบทั้ง 5 วิชา แล้วกด “เผยแพร่หลักสูตร”

ทดสอบบัญชีผู้เรียน: Google login และ logout, pretest ก่อนอ่าน, คะแนน posttest 5/10, 6/10, 7/10, 8/10, สอบซ้ำ, เข้าบทที่ล็อกผ่าน URL/API, สิทธิ์เปิด PDF และการเรียนต่อบนมือถือ

## 5. เกียรติบัตร

ส่วนนี้เปิดทีหลังได้โดยไม่ให้ผู้ที่ผ่าน 8/10 ต้องสอบใหม่ ให้บัญชีสภาเตรียม **Google Slides ที่มีลายเซ็นแล้ว** แยกรายวิชา 5 ไฟล์ โดยมีช่อง `{{NAME}}`, `{{ISSUED_DATE}}`, `{{CERT_NUMBER}}` ระบบเติม 3 ช่องนี้และแปลงเป็น PDF แบบคงลายเซ็นเดิม ผู้ดูแลใส่ลิงก์/ID ของแบบใบแต่ละวิชาในหลังบ้าน ตรวจสิทธิ์การเข้าถึงของบัญชี Apps Script แล้วอนุมัติครบ 5 วิชาและกดเปิดออกใบ

Apps Script แยกโครงการภายใต้บัญชีสภา ใช้ `google-apps-script/LearningMailer.gs` และ Script Properties `LEARNING_MAILER_URL`, `LEARNING_MAILER_SECRET` พร้อม trigger `runLearningMailer` ทุก 5 นาที PDF จะบันทึกใน Supabase ก่อนส่งเมล ถ้าส่งล้มเหลว PDF และผลสอบยังคงอยู่ เพื่อลองส่งใหม่ได้

ก่อนเปิดใบจริง ให้ทดลองออกใบด้วยบัญชีทดสอบ ตรวจชื่อ วัน เลขใบ ลายเซ็น ความถูกต้องของ PDF สิทธิ์ดาวน์โหลดและการส่งซ้ำ รวมทั้งโควตาเมลของบัญชีสภา

## สถานะของชุดโค้ดนี้

ติดตั้ง migration และ Edge Functions บนโครงการ Supabase จริงแล้ว นำเข้า PDF 12 ไฟล์ ภาพหน้าเอกสาร 145 หน้า และข้อสอบ 50 ข้อใน **ฉบับร่าง** แล้ว โค้ดหน้าเว็บถูก push ไป `main` และ Vercel รายงานว่า deploy สำเร็จ หลักสูตรยังปิดอยู่ ต้องตั้ง Google OAuth และให้ผู้ดูแลตรวจเนื้อหาและเฉลยครบ 5 วิชา แล้วจึงเผยแพร่ ส่วนเกียรติบัตรต้องมีแบบใบที่เซ็นแล้วครบ 5 วิชาก่อนเปิดใช้งาน
