-- ============================================================
-- Royal Success — v3 Migration: Scanner, Activity Log, Returns
-- Run AFTER schema.sql (and after migration-v2 if you ran it).
-- Safe to run multiple times — uses IF NOT EXISTS / IF EXISTS.
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

-- ── Add barcode column to phones ──────────────────────────────
ALTER TABLE public.phones
  ADD COLUMN IF NOT EXISTS barcode text,
  ADD COLUMN IF NOT EXISTS imei    text;

-- Add unique constraints only if columns exist and constraint doesn't
DO $$ BEGIN
  ALTER TABLE public.phones ADD CONSTRAINT phones_barcode_unique UNIQUE (barcode);
EXCEPTION WHEN duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.phones ADD CONSTRAINT phones_imei_unique UNIQUE (imei);
EXCEPTION WHEN duplicate_table THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS phones_barcode_idx ON public.phones (barcode);
CREATE INDEX IF NOT EXISTS phones_imei_idx    ON public.phones (imei);

-- ── Sales table ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sales (
  id         uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone_id   uuid        NOT NULL REFERENCES public.phones(id)   ON DELETE CASCADE,
  sold_by    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sold_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sales_phone_id_idx ON public.sales (phone_id);
CREATE INDEX IF NOT EXISTS sales_sold_by_idx  ON public.sales (sold_by);

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sales_admin_all" ON public.sales
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "sales_read_own" ON public.sales
  FOR SELECT USING (sold_by = auth.uid());

CREATE POLICY "sales_insert_own" ON public.sales
  FOR INSERT WITH CHECK (sold_by = auth.uid());

CREATE POLICY "sales_teamlead_read_agents" ON public.sales
  FOR SELECT USING (
    sold_by IN (
      SELECT id FROM public.profiles WHERE team_lead_id = auth.uid()
    )
  );

-- ── Returns table (drop old v2 version if it exists) ─────────
DROP TABLE IF EXISTS public.returns CASCADE;

CREATE TABLE public.returns (
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

CREATE INDEX IF NOT EXISTS returns_phone_id_idx     ON public.returns (phone_id);
CREATE INDEX IF NOT EXISTS returns_returned_by_idx  ON public.returns (returned_by);
CREATE INDEX IF NOT EXISTS returns_status_idx       ON public.returns (return_status);

ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "returns_admin_all" ON public.returns
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "returns_agent_read_own" ON public.returns
  FOR SELECT USING (returned_by = auth.uid());

CREATE POLICY "returns_agent_insert" ON public.returns
  FOR INSERT WITH CHECK (returned_by = auth.uid());

CREATE POLICY "returns_teamlead_read_agents" ON public.returns
  FOR SELECT USING (
    returned_by IN (
      SELECT id FROM public.profiles WHERE team_lead_id = auth.uid()
    )
  );

CREATE POLICY "returns_teamlead_update_agents" ON public.returns
  FOR UPDATE USING (
    returned_by IN (
      SELECT id FROM public.profiles WHERE team_lead_id = auth.uid()
    )
  );

-- ── Activity Log (new schema — rename old if present) ─────────
DO $$
BEGIN
  -- If the old activity_log table exists with the old phone_id column, rename it
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

CREATE INDEX IF NOT EXISTS activity_log_actor_idx      ON public.activity_log (actor_id);
CREATE INDEX IF NOT EXISTS activity_log_action_idx     ON public.activity_log (action_type);
CREATE INDEX IF NOT EXISTS activity_log_created_idx    ON public.activity_log (created_at DESC);
CREATE INDEX IF NOT EXISTS activity_log_team_lead_idx  ON public.activity_log (team_lead_id);
CREATE INDEX IF NOT EXISTS activity_log_agent_idx      ON public.activity_log (agent_id);

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity_admin_all" ON public.activity_log
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "activity_teamlead_read" ON public.activity_log
  FOR SELECT USING (team_lead_id = auth.uid());

CREATE POLICY "activity_agent_read" ON public.activity_log
  FOR SELECT USING (agent_id = auth.uid());

CREATE POLICY "activity_insert_auth" ON public.activity_log
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ── Realtime ──────────────────────────────────────────────────
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_log;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.returns;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.sales;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── log_activity() helper function ────────────────────────────
CREATE OR REPLACE FUNCTION public.log_activity(
  p_actor_id     uuid,
  p_actor_name   text,
  p_role         text,
  p_action_type  text,
  p_entity_type  text,
  p_entity_id    uuid,
  p_entity_label text,
  p_meta         jsonb    DEFAULT NULL,
  p_team_lead_id uuid     DEFAULT NULL,
  p_agent_id     uuid     DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.activity_log (
    actor_id, actor_name, role, action_type,
    entity_type, entity_id, entity_label, meta,
    team_lead_id, agent_id
  ) VALUES (
    p_actor_id, p_actor_name, p_role, p_action_type,
    p_entity_type, p_entity_id, p_entity_label, p_meta,
    p_team_lead_id, p_agent_id
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ── Phone status transition guard trigger ─────────────────────
CREATE OR REPLACE FUNCTION public.validate_phone_status_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF (OLD.status = 'in_stock'  AND NEW.status = 'assigned')  OR
     (OLD.status = 'assigned'  AND NEW.status = 'sold')      OR
     (OLD.status = 'assigned'  AND NEW.status = 'returned')  OR
     (OLD.status = 'returned'  AND NEW.status = 'in_stock')  OR
     (OLD.status = 'returned'  AND NEW.status = 'assigned')  OR
     (NEW.status = 'damaged')
  THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Invalid phone status transition: % → %', OLD.status, NEW.status;
END;
$$;

DROP TRIGGER IF EXISTS phones_status_transition ON public.phones;
CREATE TRIGGER phones_status_transition
  BEFORE UPDATE ON public.phones
  FOR EACH ROW EXECUTE FUNCTION public.validate_phone_status_transition();
