-- Create finance_fee_payments table for Fee tracking
CREATE TABLE IF NOT EXISTS public.finance_fee_payments (
    id SERIAL PRIMARY KEY,
    fee_id INTEGER REFERENCES public.finance_fees(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    user_name TEXT,
    nickname TEXT,
    paid BOOLEAN DEFAULT FALSE,
    paid_date TEXT,
    amount NUMERIC,
    slip_url TEXT,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.finance_fee_payments ENABLE ROW LEVEL SECURITY;

-- Allow Public / Authenticated Read & Write
DROP POLICY IF EXISTS "Public read finance_fee_payments" ON public.finance_fee_payments;
CREATE POLICY "Public read finance_fee_payments" ON public.finance_fee_payments FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public write finance_fee_payments" ON public.finance_fee_payments;
CREATE POLICY "Public write finance_fee_payments" ON public.finance_fee_payments FOR ALL USING (true);
