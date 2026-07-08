-- ============================================================
-- Royal Success — v2 Migration: Scanner, IMEI, Returns
-- Run this in Supabase SQL Editor AFTER the base schema.sql
-- ============================================================

-- ── Extend enums ──────────────────────────────────────────────
ALTER TYPE public.phone_status ADD VALUE IF NOT EXISTS 'returned';
ALTER TYPE public.phone_status ADD VALUE IF NOT EXISTS 'damaged';

ALTER TYPE public.activity_action ADD VALUE IF NOT EXISTS 'returned';
ALTER TYPE public.activity_action ADD VALUE IF NOT EXISTS 'scanned';
ALTER TYPE public.activity_action ADD VALUE IF NOT EXISTS 'created';
ALTER TYPE public.activity_action ADD VALUE IF NOT EXISTS 'damaged';

-- ── Add IMEI column to phones ─────────────────────────────────
ALTER TABLE public.phones
  ADD COLUMN IF NOT EXISTS imei text,
  ADD CONSTRAINT phones_imei_unique UNIQUE (imei);

CREATE INDEX IF NOT EXISTS phones_imei_idx ON public.phones (imei);

-- ── Add metadata column to activity_log ───────────────────────
ALTER TABLE public.activity_log
  ADD COLUMN IF NOT EXISTS metadata jsonb;

-- ── Returns table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.returns (
  id            uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone_id      uuid        NOT NULL REFERENCES public.phones(id) ON DELETE CASCADE,
  requested_by  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason        text        NOT NULL,
  notes         text,
  status        text        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by   uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz
);

CREATE INDEX IF NOT EXISTS returns_phone_id_idx     ON public.returns (phone_id);
CREATE INDEX IF NOT EXISTS returns_requested_by_idx ON public.returns (requested_by);
CREATE INDEX IF NOT EXISTS returns_status_idx       ON public.returns (status);

-- ── Enable Realtime on returns ────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.returns;

-- ── RLS on returns ────────────────────────────────────────────
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;

-- Admin: full access
CREATE POLICY "returns_admin_all" ON public.returns
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- Agents/team leads: read their own return requests
CREATE POLICY "returns_read_own" ON public.returns
  FOR SELECT
  USING (requested_by = auth.uid());

-- Agents/team leads: submit returns for phones they hold
CREATE POLICY "returns_insert_own" ON public.returns
  FOR INSERT
  WITH CHECK (
    requested_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.phones ph
      WHERE ph.id = phone_id AND ph.assigned_to = auth.uid()
    )
  );

-- ── State-transition guard trigger ───────────────────────────
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
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Invalid phone status transition: % → %', OLD.status, NEW.status;
END;
$$;

DROP TRIGGER IF EXISTS phones_status_transition ON public.phones;
CREATE TRIGGER phones_status_transition
  BEFORE UPDATE ON public.phones
  FOR EACH ROW EXECUTE FUNCTION public.validate_phone_status_transition();
