-- ============================================================
-- Royal Success — v4 Migration: Receipts & Notifications
-- Run AFTER migration-v3.  Safe to re-run.
-- ============================================================

-- ── Receipt sequence ──────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.receipt_seq START 1;

-- ── Extend sales table with buyer data ───────────────────────
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS buyer_name      text,
  ADD COLUMN IF NOT EXISTS buyer_phone     text,
  ADD COLUMN IF NOT EXISTS agreed_price    numeric(12,2),
  ADD COLUMN IF NOT EXISTS payment_method  text
    CHECK (payment_method IN ('CASH','TRANSFER','POS'));

-- ── Receipts table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.receipts (
  id              uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id         uuid          NOT NULL REFERENCES public.sales(id)       ON DELETE CASCADE,
  receipt_number  text          UNIQUE NOT NULL DEFAULT (
    'RS-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.receipt_seq')::text, 5, '0')
  ),
  phone_id        uuid          NOT NULL REFERENCES public.phones(id),
  agent_id        uuid          NOT NULL REFERENCES auth.users(id),
  buyer_name      text          NOT NULL,
  buyer_phone     text          NOT NULL,
  selling_price   numeric(12,2) NOT NULL,
  payment_method  text          NOT NULL CHECK (payment_method IN ('CASH','TRANSFER','POS')),
  generated_at    timestamptz   NOT NULL DEFAULT now(),
  pdf_url         text,
  voided          boolean       NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS receipts_agent_idx   ON public.receipts (agent_id);
CREATE INDEX IF NOT EXISTS receipts_phone_idx   ON public.receipts (phone_id);
CREATE INDEX IF NOT EXISTS receipts_voided_idx  ON public.receipts (voided);

ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "receipts_admin_all" ON public.receipts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "receipts_agent_own" ON public.receipts
  FOR SELECT USING (agent_id = auth.uid());

CREATE POLICY "receipts_agent_insert" ON public.receipts
  FOR INSERT WITH CHECK (agent_id = auth.uid());

CREATE POLICY "receipts_agent_update_own" ON public.receipts
  FOR UPDATE USING (agent_id = auth.uid()) WITH CHECK (agent_id = auth.uid());

CREATE POLICY "receipts_teamlead_agents" ON public.receipts
  FOR SELECT USING (
    agent_id IN (
      SELECT id FROM public.profiles WHERE team_lead_id = auth.uid()
    )
  );

-- ── Notifications table ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id           uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_id uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type         text        NOT NULL DEFAULT 'SALE_COMPLETED',
  title        text        NOT NULL,
  body         text        NOT NULL,
  sale_id      uuid        REFERENCES public.sales(id) ON DELETE SET NULL,
  read         boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notif_recipient_idx  ON public.notifications (recipient_id);
CREATE INDEX IF NOT EXISTS notif_read_idx       ON public.notifications (recipient_id, read);
CREATE INDEX IF NOT EXISTS notif_created_idx    ON public.notifications (created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif_read_own" ON public.notifications
  FOR SELECT USING (recipient_id = auth.uid());

CREATE POLICY "notif_update_own" ON public.notifications
  FOR UPDATE USING (recipient_id = auth.uid()) WITH CHECK (recipient_id = auth.uid());

-- Authenticated users can INSERT (needed to notify admin/TL after a sale)
CREATE POLICY "notif_insert_auth" ON public.notifications
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ── notify_on_sale() — SECURITY DEFINER so it can insert for other users
CREATE OR REPLACE FUNCTION public.notify_on_sale(
  p_sale_id    uuid,
  p_agent_id   uuid,
  p_agent_name text,
  p_phone_label text,
  p_amount     numeric,
  p_payment    text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_title text := 'New Sale by ' || p_agent_name;
  v_body  text := p_phone_label || ' sold for ₦' ||
                  to_char(p_amount, 'FM999,999,999') || ' (' || p_payment || ')';
BEGIN
  -- Notify all admins
  INSERT INTO notifications (recipient_id, type, title, body, sale_id)
  SELECT id, 'SALE_COMPLETED', v_title, v_body, p_sale_id
  FROM profiles WHERE role = 'admin' AND id <> p_agent_id;

  -- Notify agent's team lead (if any)
  INSERT INTO notifications (recipient_id, type, title, body, sale_id)
  SELECT team_lead_id, 'SALE_COMPLETED', v_title, v_body, p_sale_id
  FROM profiles
  WHERE id = p_agent_id AND team_lead_id IS NOT NULL;
END;
$$;

-- ── Realtime ──────────────────────────────────────────────────
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.receipts;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Supabase Storage: create receipts bucket (run manually or via API) ──
-- NOTE: Run this in the Supabase Dashboard → Storage → New bucket:
--   Name: receipts
--   Public: true
-- Or via the REST API / dashboard. SQL cannot create storage buckets.
