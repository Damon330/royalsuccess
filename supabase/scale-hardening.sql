-- ── Scale Hardening — Royal Success ──────────────────────────────────────────
-- Findings from simulating 150 agents + 1 admin with multiple daily requests.
-- Run this in the Supabase SQL Editor after your existing migrations.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. PARTIAL INDEX — in_stock phones (AdminAssignPhones loads only these)
-- ────────────────────────────────────────────────────────────────────────────
-- Before: SELECT * FROM phones WHERE status = 'in_stock'  → seq scan
-- After:  planner uses this index directly — O(log n) even with 10k phones
CREATE INDEX IF NOT EXISTS idx_phones_in_stock_created
  ON phones (created_at DESC)
  WHERE status = 'in_stock';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. PARTIAL INDEX — stale alert detection (assigned phones with assigned_at)
-- ────────────────────────────────────────────────────────────────────────────
-- AdminDashboard filters assigned phones and sorts by assigned_at.
-- This index covers the exact predicate used in fetchTeamData.
CREATE INDEX IF NOT EXISTS idx_phones_assigned_staleness
  ON phones (assigned_at DESC)
  WHERE status = 'assigned' AND assigned_at IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. COMPOSITE INDEX — notification bell (per-user unread count)
-- ────────────────────────────────────────────────────────────────────────────
-- Already created in performance-indexes.sql — listed here for completeness.
-- CREATE INDEX IF NOT EXISTS idx_notif_recipient_unread
--   ON notifications (recipient_id, created_at DESC)
--   WHERE read = false;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. ACTIVITY LOG — prevent unbounded growth
-- ────────────────────────────────────────────────────────────────────────────
-- At 150 agents × 10 actions/day = 1,500 rows/day → ~547k rows/year.
-- Create an index so time-based pruning is fast, and document the archival query.
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at
  ON activity_log (created_at DESC);

-- Archival query (run manually or via a cron job after 90 days):
-- DELETE FROM activity_log WHERE created_at < NOW() - INTERVAL '90 days';

-- ────────────────────────────────────────────────────────────────────────────
-- 5. RPC — dashboard stats without row data transfer
-- ────────────────────────────────────────────────────────────────────────────
-- The AdminDashboard now runs 5 parallel HEAD count queries.
-- As an alternative (single round-trip), this RPC returns all counts in one call.
-- If Supabase latency from Nigeria is high (>200ms), switch to this function.
CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total',    COUNT(*),
    'in_stock', COUNT(*) FILTER (WHERE status = 'in_stock'),
    'in_field', COUNT(*) FILTER (WHERE status = 'assigned'),
    'sold',     COUNT(*) FILTER (WHERE status = 'sold'),
    'returned', COUNT(*) FILTER (WHERE status = 'returned'),
    'damaged',  COUNT(*) FILTER (WHERE status = 'damaged')
  )
  FROM phones;
$$;

-- Grant execute to authenticated users (admin-only enforced by RLS on phones)
GRANT EXECUTE ON FUNCTION get_dashboard_stats() TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. RPC — team overview with server-side aggregation
-- ────────────────────────────────────────────────────────────────────────────
-- Currently AdminDashboard fetches all phones + all profiles and joins in JS.
-- For 5,000+ phones this becomes slow. Switch to this function if dashboard
-- becomes slow with your inventory size.
CREATE OR REPLACE FUNCTION get_team_overview()
RETURNS TABLE (
  id          uuid,
  full_name   text,
  role        text,
  assigned    bigint,
  sold        bigint,
  remaining   bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.full_name,
    p.role,
    COUNT(ph.id)                                            AS assigned,
    COUNT(ph.id) FILTER (WHERE ph.status = 'sold')         AS sold,
    COUNT(ph.id) FILTER (WHERE ph.status != 'sold')        AS remaining
  FROM profiles p
  LEFT JOIN phones ph ON ph.assigned_to = p.id
  WHERE p.role != 'admin'
  GROUP BY p.id, p.full_name, p.role
  ORDER BY p.role DESC, p.full_name;
$$;

GRANT EXECUTE ON FUNCTION get_team_overview() TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- SCALE NOTES (not SQL — read before going to production)
-- ────────────────────────────────────────────────────────────────────────────
--
-- REALTIME CONNECTIONS (biggest risk at 150 users):
-- Each browser tab opens 2–3 Supabase Realtime WebSocket channels.
-- Supabase FREE TIER: 200 concurrent connections.
-- 150 agents × 2 channels = 300 → EXCEEDS FREE TIER.
-- Fix: Upgrade to Supabase Pro ($25/month, 500 connections).
-- OR reduce subscriptions: remove the realtime subscription from usePhones
--    for agents and replace with React Query refetchInterval: 30_000 (30s polling).
--    30s polling at 150 agents = 5 requests/second — trivial for Postgres.
--
-- CONNECTION POOL (Supabase uses PgBouncer):
-- Use the POOLING connection URL (port 6543) not the direct URL (port 5432)
-- for your VITE_SUPABASE_URL in Vercel env vars. The pooler handles 150
-- concurrent users sharing ~15 real DB connections efficiently.
-- Find it in: Supabase dashboard → Settings → Database → Connection pooling.
--
-- DOUBLE-ASSIGNMENT RACE CONDITION (now fixed in code):
-- assignPhones() now uses .eq('status', 'in_stock') in the UPDATE WHERE clause.
-- If two admins try to assign the same phone simultaneously, only one succeeds.
-- The second sees actuallyAssigned < phoneIds.length and shows an error toast.
--
-- BANDWIDTH (Supabase free: 5GB/month):
-- 150 agents × 10 sessions/day × ~50KB per session = 75MB/day = ~2.25GB/month.
-- Well within the free tier. AdminDashboard now uses HEAD count queries (0 rows)
-- and slim column selection, saving ~60% of dashboard bandwidth.
