-- ============================================================
-- Royal Success — Performance indexes & query optimisation
-- Safe to run multiple times (uses CREATE INDEX IF NOT EXISTS).
-- Run this in the Supabase SQL Editor after fix-all-rls.sql.
-- ============================================================


-- ── PHONES ───────────────────────────────────────────────────
-- Most common agent/TL query: assigned_to + status
CREATE INDEX IF NOT EXISTS idx_phones_assigned_to
  ON public.phones (assigned_to)
  WHERE assigned_to IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_phones_status
  ON public.phones (status);

-- Admin inventory filtered by status + sorted by created_at
CREATE INDEX IF NOT EXISTS idx_phones_status_created
  ON public.phones (status, created_at DESC);

-- Insights page: model + status (GROUP BY model, COUNT per status)
CREATE INDEX IF NOT EXISTS idx_phones_model_status
  ON public.phones (model, status);

-- Stale-device alert: assigned phones with assigned_at for date math
CREATE INDEX IF NOT EXISTS idx_phones_assigned_at
  ON public.phones (assigned_at)
  WHERE assigned_to IS NOT NULL AND status = 'assigned';

-- IMEI / barcode lookups during scan
CREATE UNIQUE INDEX IF NOT EXISTS idx_phones_imei
  ON public.phones (imei)
  WHERE imei IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_phones_barcode
  ON public.phones (barcode)
  WHERE barcode IS NOT NULL;


-- ── PROFILES ─────────────────────────────────────────────────
-- Team lead → agents lookup (used in many RLS policies)
CREATE INDEX IF NOT EXISTS idx_profiles_team_lead_id
  ON public.profiles (team_lead_id)
  WHERE team_lead_id IS NOT NULL;

-- Pending user filter (admin agents page)
CREATE INDEX IF NOT EXISTS idx_profiles_status
  ON public.profiles (status);

-- Role filter (sidebar badge, admin pages)
CREATE INDEX IF NOT EXISTS idx_profiles_role
  ON public.profiles (role);


-- ── RETURNS ──────────────────────────────────────────────────
-- Admin returns page: filter by status, sort by created_at
CREATE INDEX IF NOT EXISTS idx_returns_status_created
  ON public.returns (return_status, created_at DESC);

-- Agent: their own pending returns
CREATE INDEX IF NOT EXISTS idx_returns_returned_by
  ON public.returns (returned_by);

-- Phone-specific return history
CREATE INDEX IF NOT EXISTS idx_returns_phone_id
  ON public.returns (phone_id);


-- ── SALES ────────────────────────────────────────────────────
-- Reports: all sales sorted by date
CREATE INDEX IF NOT EXISTS idx_sales_sold_at
  ON public.sales (sold_at DESC);

-- Agent/TL: their own sales
CREATE INDEX IF NOT EXISTS idx_sales_sold_by
  ON public.sales (sold_by);

-- Admin: sales per phone
CREATE INDEX IF NOT EXISTS idx_sales_phone_id
  ON public.sales (phone_id);


-- ── ACTIVITY LOG ─────────────────────────────────────────────
-- Admin activity feed: sorted by date
CREATE INDEX IF NOT EXISTS idx_activity_created_at
  ON public.activity_log (created_at DESC);

-- Agent activity feed
CREATE INDEX IF NOT EXISTS idx_activity_agent_id
  ON public.activity_log (agent_id)
  WHERE agent_id IS NOT NULL;

-- Team lead activity feed
CREATE INDEX IF NOT EXISTS idx_activity_team_lead_id
  ON public.activity_log (team_lead_id)
  WHERE team_lead_id IS NOT NULL;

-- Action type filter (e.g. SALE_RECORDED only)
CREATE INDEX IF NOT EXISTS idx_activity_action_type
  ON public.activity_log (action_type);


-- ── NOTIFICATIONS ─────────────────────────────────────────────
-- Bell dropdown: unread notifications per user
CREATE INDEX IF NOT EXISTS idx_notif_recipient_unread
  ON public.notifications (recipient_id, created_at DESC)
  WHERE read = false;

-- All notifications per user (infinite scroll)
CREATE INDEX IF NOT EXISTS idx_notif_recipient_created
  ON public.notifications (recipient_id, created_at DESC);


-- ── RECEIPTS ─────────────────────────────────────────────────
-- Admin receipts page: sorted by date
CREATE INDEX IF NOT EXISTS idx_receipts_created_at
  ON public.receipts (created_at DESC);

-- Agent's own receipts
CREATE INDEX IF NOT EXISTS idx_receipts_agent_id
  ON public.receipts (agent_id);


-- ── Verify indexes ────────────────────────────────────────────
SELECT
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
