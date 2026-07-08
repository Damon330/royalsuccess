-- ============================================================
-- Royal Success — Fix: Create Missing Tables
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to run even if some tables already exist.
-- ============================================================

-- ── Extensions ────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Extend phone_status enum ──────────────────────────────────
DO $$ BEGIN
  ALTER TYPE public.phone_status ADD VALUE 'returned';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE public.phone_status ADD VALUE 'damaged';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Add barcode / imei columns to phones ──────────────────────
ALTER TABLE public.phones
  ADD COLUMN IF NOT EXISTS barcode text,
  ADD COLUMN IF NOT EXISTS imei    text;

CREATE INDEX IF NOT EXISTS phones_barcode_idx ON public.phones (barcode);
CREATE INDEX IF NOT EXISTS phones_imei_idx    ON public.phones (imei);

-- ── Sales table ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sales (
  id              uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone_id        uuid          NOT NULL REFERENCES public.phones(id)   ON DELETE CASCADE,
  sold_by         uuid          NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sold_at         timestamptz   NOT NULL DEFAULT now(),
  buyer_name      text,
  buyer_phone     text,
  agreed_price    numeric(12,2),
  payment_method  text CHECK (payment_method IN ('CASH','TRANSFER','POS'))
);

CREATE INDEX IF NOT EXISTS sales_phone_id_idx ON public.sales (phone_id);
CREATE INDEX IF NOT EXISTS sales_sold_by_idx  ON public.sales (sold_by);

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "sales_admin_all" ON public.sales
    FOR ALL USING (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "sales_read_own" ON public.sales
    FOR SELECT USING (sold_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "sales_insert_own" ON public.sales
    FOR INSERT WITH CHECK (sold_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "sales_teamlead_read_agents" ON public.sales
    FOR SELECT USING (
      sold_by IN (SELECT id FROM public.profiles WHERE team_lead_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Returns table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.returns (
  id               uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone_id         uuid        NOT NULL REFERENCES public.phones(id)   ON DELETE CASCADE,
  original_sale_id uuid        REFERENCES public.sales(id)             ON DELETE SET NULL,
  returned_by      uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  approved_by      uuid        REFERENCES public.profiles(id)          ON DELETE SET NULL,
  return_reason    text        NOT NULL,
  return_status    text        NOT NULL DEFAULT 'PENDING'
                               CHECK (return_status IN ('PENDING','APPROVED','REJECTED')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  resolved_at      timestamptz,
  notes            text,
  rejection_note   text
);

CREATE INDEX IF NOT EXISTS returns_phone_id_idx    ON public.returns (phone_id);
CREATE INDEX IF NOT EXISTS returns_returned_by_idx ON public.returns (returned_by);
CREATE INDEX IF NOT EXISTS returns_status_idx      ON public.returns (return_status);

ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "returns_admin_all" ON public.returns
    FOR ALL USING (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "returns_agent_read_own" ON public.returns
    FOR SELECT USING (returned_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "returns_agent_insert" ON public.returns
    FOR INSERT WITH CHECK (returned_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "returns_teamlead_read_agents" ON public.returns
    FOR SELECT USING (
      returned_by IN (SELECT id FROM public.profiles WHERE team_lead_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "returns_teamlead_update_agents" ON public.returns
    FOR UPDATE USING (
      returned_by IN (SELECT id FROM public.profiles WHERE team_lead_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Activity Log ──────────────────────────────────────────────
-- The original schema.sql has activity_log with old columns (phone_id, performed_by).
-- Rename it if that old version exists, then create the new schema.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'activity_log'
      AND column_name  = 'phone_id'
  ) THEN
    ALTER TABLE public.activity_log RENAME TO activity_log_legacy;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.activity_log (
  id           uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  actor_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_name   text        NOT NULL,
  role         text        NOT NULL,
  action_type  text        NOT NULL,
  entity_type  text        NOT NULL,
  entity_id    uuid,
  entity_label text        NOT NULL DEFAULT '',
  meta         jsonb,
  team_lead_id uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  agent_id     uuid        REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS activity_log_actor_idx   ON public.activity_log (actor_id);
CREATE INDEX IF NOT EXISTS activity_log_action_idx  ON public.activity_log (action_type);
CREATE INDEX IF NOT EXISTS activity_log_created_idx ON public.activity_log (created_at DESC);

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "activity_admin_all" ON public.activity_log
    FOR ALL USING (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "activity_insert_auth" ON public.activity_log
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Receipt sequence & table ───────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.receipt_seq START 1;

CREATE TABLE IF NOT EXISTS public.receipts (
  id              uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_id         uuid          NOT NULL REFERENCES public.sales(id)  ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS receipts_agent_idx  ON public.receipts (agent_id);
CREATE INDEX IF NOT EXISTS receipts_phone_idx  ON public.receipts (phone_id);
CREATE INDEX IF NOT EXISTS receipts_voided_idx ON public.receipts (voided);

ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "receipts_admin_all" ON public.receipts
    FOR ALL USING (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "receipts_agent_own" ON public.receipts
    FOR SELECT USING (agent_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "receipts_agent_insert" ON public.receipts
    FOR INSERT WITH CHECK (agent_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "receipts_teamlead_agents" ON public.receipts
    FOR SELECT USING (
      agent_id IN (SELECT id FROM public.profiles WHERE team_lead_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

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

CREATE INDEX IF NOT EXISTS notif_recipient_idx ON public.notifications (recipient_id);
CREATE INDEX IF NOT EXISTS notif_read_idx      ON public.notifications (recipient_id, read);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "notif_read_own" ON public.notifications
    FOR SELECT USING (recipient_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "notif_update_own" ON public.notifications
    FOR UPDATE USING (recipient_id = auth.uid()) WITH CHECK (recipient_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "notif_insert_auth" ON public.notifications
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Realtime ──────────────────────────────────────────────────
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.returns;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.receipts;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_log;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
