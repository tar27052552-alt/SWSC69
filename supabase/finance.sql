-- 1. ล้างข้อมูลเก่า (ถ้ามี)
DROP TABLE IF EXISTS public.finance_requests;
DROP TABLE IF EXISTS public.finance_fees;

-- 2. สร้างตารางคำขอเบิกเงิน (finance_requests)
CREATE TABLE IF NOT EXISTS public.finance_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL,
  amount integer NOT NULL,
  requester text NOT NULL,
  dept_id integer NOT NULL,
  date text NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  note text NOT NULL DEFAULT '',
  approved_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. สร้างตารางเก็บเงินสมาชิก (finance_fees)
CREATE TABLE IF NOT EXISTS public.finance_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  amount integer NOT NULL,
  date text NOT NULL,
  payments jsonb NOT NULL DEFAULT '{}', -- เก็บข้อมูลผู้ชำระเงินเป็น { "user_id": true }
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. ตั้งค่าสิทธิ์เข้าถึง (Grants)
GRANT ALL ON public.finance_requests TO anon, authenticated;
GRANT ALL ON public.finance_fees TO anon, authenticated;
