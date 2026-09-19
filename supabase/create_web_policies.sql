-- Create web_policies table for Student Council Portal
CREATE TABLE IF NOT EXISTS public.web_policies (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'นโยบายสภาฯ',
    description TEXT,
    icon TEXT DEFAULT '📌',
    status TEXT DEFAULT 'ดำเนินการ',
    status_color TEXT DEFAULT '#8b5cf6',
    progress INTEGER DEFAULT 0,
    highlights JSONB DEFAULT '[]'::jsonb,
    target TEXT DEFAULT 'นักเรียนโรงเรียนสรรพวิทยาคมทุกคน',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.web_policies ENABLE ROW LEVEL SECURITY;

-- Allow Public Read
DROP POLICY IF EXISTS "Public read web_policies" ON public.web_policies;
CREATE POLICY "Public read web_policies" ON public.web_policies FOR SELECT USING (true);

-- Allow Public / Authenticated Write
DROP POLICY IF EXISTS "Public write web_policies" ON public.web_policies;
CREATE POLICY "Public write web_policies" ON public.web_policies FOR ALL USING (true);

-- Insert Initial Policies
INSERT INTO public.web_policies (title, category, description, icon, status, status_color, progress, highlights, target)
VALUES 
(
  'ส่งเสริมสิทธิและเสียงสะท้อนของนักเรียน (Student Voice & Rights)',
  'นโยบายด้านประชาธิปไตย',
  'เปิดช่องทางการรับฟังความคิดเห็นและข้อเสนอแนะจากนักเรียนทุกระดับชั้นอย่างโปร่งใส พร้อมผลักดันสู่การแก้ไขปัญหาจริงร่วมกับฝ่ายบริหารโรงเรียน',
  '📢',
  'ดำเนินการแล้ว 80%',
  '#3b82f6',
  80,
  '["จัดทำกล่องรับฟังความคิดเห็นออนไลน์ผ่านเว็บสภาฯ", "จัดการประชุมรับฟังเสียงตัวแทนห้องเรียน", "สรุปข้อเสนอแนะส่งต่อคณะครูและฝ่ายบริหาร"]'::jsonb,
  'นักเรียนทุกคน'
),
(
  'ยกระดับกิจกรรมและการมีส่วนร่วมของนักเรียน (Active Student Activities)',
  'นโยบายด้านกิจกรรมและนันทนาการ',
  'สนับสนุนกิจกรรมสร้างสรรค์ ทั้งด้านดนตรี ศิลปะ กีฬา และวิชาการ เพื่อส่งเสริมศักยภาพและความสุขในการเรียนรู้ของนักเรียนสรรพวิทยาคม',
  '🎨',
  'กำลังดำเนินการ',
  '#ec4899',
  65,
  '["จัดกิจกรรมวันสำคัญและงานสานสัมพันธ์นักเรียน", "สนับสนุนการแข่งขันกีฬาและนันทนาการภายใน", "เปิดพื้นที่แสดงความสามารถของนักเรียน"]'::jsonb,
  'นักเรียนทุกระดับชั้น'
),
(
  'ขับเคลื่อนสิ่งแวดล้อมและห้องเรียนน่าอยู่ (Green & Clean School)',
  'นโยบายด้านบริการและสิ่งแวดล้อม',
  'รณรงค์การคัดแยกขยะ ระบบขยะแลกแต้ม และการดูแลรักษาความสะอาดในพื้นที่ส่วนกลาง เพื่อสร้างสภาพแวดล้อมที่เอื้อต่อการเรียนรู้',
  '🌱',
  'ดำเนินการต่อเนื่อง',
  '#10b981',
  75,
  '["ส่งเสริมระบบขยะแลกแต้มร่วมกับโรงเรียน", "จัดเวรดูแลรักษาความสะอาดพื้นที่สภานักเรียน", "รณรงค์ลดการใช้พลาสติกแบบใช้ครั้งเดียว"]'::jsonb,
  'บุคลากรและนักเรียนทุกคน'
),
(
  'พัฒนาระบบสารสนเทศสภานักเรียนสู่ยุคดิจิทัล (Digital Student Council)',
  'นโยบายด้านเทคโนโลยีและสารสนเทศ',
  'พัฒนาระบบบริการข้อมูล ข่าวสาร ปฏิทินกิจกรรม และระบบสืบค้นเกียรติบัตรออนไลน์ เพื่อความสะดวกรวดเร็วและเข้าถึงง่ายตลอด 24 ชั่วโมง',
  '💻',
  'สำเร็จแล้ว',
  '#8b5cf6',
  95,
  '["เปิดตัวเว็บไซต์ทางการ SWSC.OFFICIAL", "ระบบปฏิทินกิจกรรมและข่าวสารแบบเรียลไทม์", "ระบบค้นหาและดาวน์โหลดเกียรติบัตรออนไลน์"]'::jsonb,
  'ครู นักเรียน และผู้ปกครอง'
);
