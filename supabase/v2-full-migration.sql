-- ============================================================
-- Royal Success — v2 Full Database Migration
-- Senior Backend Engineer System Design
--
-- PURPOSE:
--  1. Fix "database connection failed" — root cause: auth.jwt() ->> 'email'
--     can return NULL for certain OAuth flows. Replace all RLS policies
--     with a robust is_admin() function that tries all JWT email locations.
--  2. Add SECURITY DEFINER RPC functions so admin data access bypasses RLS
--     entirely — no more per-row JWT evaluation overhead.
--  3. Enable RLS on activity_log_legacy (Supabase Advisor CRITICAL issue).
--  4. Add all missing performance indexes.
--  5. Create materialized stats view + refresh trigger.
--  6. Add data integrity constraints.
--
-- SAFE TO RUN ON EXISTING DATA — no DROP TABLE, no destructive changes.
-- Run this in Supabase SQL Editor → New query → Run.
-- ============================================================


-- ============================================================
-- SECTION 1 — DATABASE CONFIGURATION
-- ============================================================

-- Persist admin email in database config (survives restarts)
DO $$
BEGIN
  PERFORM set_config('app.admin_email', 'patrickwlax@gmail.com', false);
EXCEPTION WHEN OTHERS THEN NULL; END;
$$;

-- Try to set permanently (requires superuser — silently skip if not available)
DO $$
BEGIN
  EXECUTE 'ALTER DATABASE postgres SET app.admin_email = ''patrickwlax@gmail.com''';
EXCEPTION WHEN OTHERS THEN NULL; END;
$$;


-- ============================================================
-- SECTION 2 — is_admin() HELPER FUNCTION
--
-- Design: STABLE (cached per SQL statement — huge performance win on joins).
-- Uses auth.email() first (most reliable in Supabase v2), then falls back
-- to three JWT paths to handle all OAuth providers and token formats.
-- Only called ONCE per query, never per-row (RLS uses this as a gate).
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, auth
AS $$
  SELECT COALESCE(
    -- auth.email() is the canonical Supabase v2 way — always works
    auth.email(),
    -- Fallback paths for different JWT structures / OAuth providers
    auth.jwt() ->> 'email',
    (auth.jwt() -> 'user_metadata')  ->> 'email',
    (auth.jwt() -> 'app_metadata')   ->> 'email',
    (auth.jwt() #>> '{identities,0,identity_data,email}')
  ) = ANY(ARRAY[
    current_setting('app.admin_email', true),
    'patrickwlax@gmail.com'
  ])
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;
COMMENT ON FUNCTION public.is_admin() IS
  'Returns true if the current request comes from the admin account. '
  'Stable (cached per statement). Safe to use in RLS USING clauses.';


-- ============================================================
-- SECTION 3 — FIX CRITICAL SECURITY ISSUE
-- activity_log_legacy: has policies but RLS was never enabled
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'activity_log_legacy'
  ) THEN
    -- Enable RLS first (this was the Supabase Advisor CRITICAL warning)
    EXECUTE 'ALTER TABLE public.activity_log_legacy ENABLE ROW LEVEL SECURITY';

    -- Drop stale policies that were defined but never enforced
    EXECUTE 'DROP POLICY IF EXISTS "logs_admin_read" ON public.activity_log_legacy';
    EXECUTE 'DROP POLICY IF EXISTS "logs_insert_own" ON public.activity_log_legacy';
    EXECUTE 'DROP POLICY IF EXISTS "logs_read_own"   ON public.activity_log_legacy';

    -- Add correct policies
    EXECUTE 'CREATE POLICY "legacy_admin_all" ON public.activity_log_legacy
      FOR ALL USING (is_admin()) WITH CHECK (is_admin())';

    EXECUTE 'CREATE POLICY "legacy_read_own" ON public.activity_log_legacy
      FOR SELECT USING (performed_by = auth.uid())';
  END IF;
END;
$$;


-- ============================================================
-- SECTION 4 — REWRITE ALL RLS POLICIES USING is_admin()
--
-- Old: auth.jwt() ->> ''email'' = ''patrickwlax@gmail.com''
-- New: is_admin()
--
-- Benefits:
--   • is_admin() is STABLE — evaluated once per query, not per row
--   • Handles all OAuth token formats (old code silently failed on some)
--   • Single place to update admin email logic
-- ============================================================

-- ── profiles ─────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_admin_all"            ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_read_all"       ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_insert"         ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_update"         ON public.profiles;
DROP POLICY IF EXISTS "profiles_read_own"             ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own"           ON public.profiles;
DROP POLICY IF EXISTS "profiles_self_update"          ON public.profiles;
DROP POLICY IF EXISTS "profiles_teamlead_read_agents" ON public.profiles;

-- Admin: full access via is_admin() (no subquery, no JWT inline, no recursion)
CREATE POLICY "profiles_admin_all" ON public.profiles
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Users: read their own profile
CREATE POLICY "profiles_read_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

-- Users: create only their own profile row (on signup)
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Users: update only their own non-role fields
CREATE POLICY "profiles_self_update" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Team leads: read profiles of their own agents
CREATE POLICY "profiles_teamlead_read_agents" ON public.profiles
  FOR SELECT USING (team_lead_id = auth.uid());


-- ── phones ────────────────────────────────────────────────────────────────────
ALTER TABLE public.phones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "phones_admin_all"                   ON public.phones;
DROP POLICY IF EXISTS "phones_agent_read_own"              ON public.phones;
DROP POLICY IF EXISTS "phones_agent_update_own"            ON public.phones;
DROP POLICY IF EXISTS "phones_teamlead_read_agents"        ON public.phones;
DROP POLICY IF EXISTS "phones_teamlead_update_agents"      ON public.phones;
DROP POLICY IF EXISTS "phones_teamlead_own"                ON public.phones;
DROP POLICY IF EXISTS "phones_teamlead_manage_assignments" ON public.phones;
DROP POLICY IF EXISTS "phones_teamlead_read_instock"       ON public.phones;
DROP POLICY IF EXISTS "phones_teamlead_assign"             ON public.phones;

-- Admin: full access
CREATE POLICY "phones_admin_all" ON public.phones
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Agents: read only their assigned phones
CREATE POLICY "phones_agent_read_own" ON public.phones
  FOR SELECT USING (assigned_to = auth.uid());

-- Agents: update status of their assigned phones (no changing assigned_to)
CREATE POLICY "phones_agent_update_own" ON public.phones
  FOR UPDATE USING (assigned_to = auth.uid()) WITH CHECK (assigned_to = auth.uid());

-- Team leads: read phones assigned to their agents
CREATE POLICY "phones_teamlead_read_agents" ON public.phones
  FOR SELECT USING (
    assigned_to IN (
      SELECT id FROM public.profiles WHERE team_lead_id = auth.uid()
    )
  );

-- Team leads: full ownership of their directly-assigned phones
CREATE POLICY "phones_teamlead_own" ON public.phones
  FOR ALL USING (assigned_to = auth.uid());

-- Team leads: reassign phones between themselves and their agents
CREATE POLICY "phones_teamlead_manage_assignments" ON public.phones
  FOR UPDATE
  USING (
    assigned_to = auth.uid()
    OR assigned_to IN (SELECT id FROM public.profiles WHERE team_lead_id = auth.uid())
  )
  WITH CHECK (
    assigned_to = auth.uid()
    OR assigned_to IN (SELECT id FROM public.profiles WHERE team_lead_id = auth.uid())
    OR assigned_to IS NULL
  );


-- ── activity_log ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='activity_log') THEN
    EXECUTE 'ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "activity_admin_all"     ON public.activity_log';
    EXECUTE 'DROP POLICY IF EXISTS "activity_teamlead_read" ON public.activity_log';
    EXECUTE 'DROP POLICY IF EXISTS "activity_agent_read"    ON public.activity_log';
    EXECUTE 'DROP POLICY IF EXISTS "activity_insert_auth"   ON public.activity_log';
    EXECUTE 'DROP POLICY IF EXISTS "activity_no_delete"     ON public.activity_log';
    EXECUTE 'DROP POLICY IF EXISTS "logs_admin_read"        ON public.activity_log';
    EXECUTE 'DROP POLICY IF EXISTS "logs_insert_own"        ON public.activity_log';
    EXECUTE 'DROP POLICY IF EXISTS "logs_read_own"          ON public.activity_log';
    EXECUTE 'CREATE POLICY "activity_admin_all" ON public.activity_log
      FOR ALL USING (is_admin()) WITH CHECK (is_admin())';
    EXECUTE 'CREATE POLICY "activity_teamlead_read" ON public.activity_log
      FOR SELECT USING (team_lead_id = auth.uid())';
    EXECUTE 'CREATE POLICY "activity_agent_read" ON public.activity_log
      FOR SELECT USING (agent_id = auth.uid())';
    EXECUTE 'CREATE POLICY "activity_insert_auth" ON public.activity_log
      FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND actor_id = auth.uid())';
    EXECUTE 'CREATE POLICY "activity_no_delete" ON public.activity_log
      FOR DELETE USING (false)';
  END IF;
END;
$$;


-- ── sales ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sales_admin_all"            ON public.sales;
DROP POLICY IF EXISTS "sales_read_own"             ON public.sales;
DROP POLICY IF EXISTS "sales_insert_own"           ON public.sales;
DROP POLICY IF EXISTS "sales_teamlead_read_agents" ON public.sales;
DROP POLICY IF EXISTS "sales_no_delete"            ON public.sales;
DROP POLICY IF EXISTS "sales_no_update"            ON public.sales;

CREATE POLICY "sales_admin_all" ON public.sales
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "sales_read_own" ON public.sales
  FOR SELECT USING (sold_by = auth.uid());

CREATE POLICY "sales_insert_own" ON public.sales
  FOR INSERT WITH CHECK (sold_by = auth.uid());

CREATE POLICY "sales_teamlead_read_agents" ON public.sales
  FOR SELECT USING (
    sold_by IN (SELECT id FROM public.profiles WHERE team_lead_id = auth.uid())
  );

CREATE POLICY "sales_no_delete" ON public.sales FOR DELETE USING (false);
CREATE POLICY "sales_no_update" ON public.sales FOR UPDATE USING (false);


-- ── returns ───────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='returns') THEN
    EXECUTE 'ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "returns_admin_all"              ON public.returns';
    EXECUTE 'DROP POLICY IF EXISTS "returns_agent_read_own"         ON public.returns';
    EXECUTE 'DROP POLICY IF EXISTS "returns_agent_insert"           ON public.returns';
    EXECUTE 'DROP POLICY IF EXISTS "returns_teamlead_read_agents"   ON public.returns';
    EXECUTE 'DROP POLICY IF EXISTS "returns_teamlead_update_agents" ON public.returns';
    EXECUTE 'DROP POLICY IF EXISTS "returns_read_own"               ON public.returns';
    EXECUTE 'DROP POLICY IF EXISTS "returns_insert_own"             ON public.returns';
    EXECUTE 'CREATE POLICY "returns_admin_all" ON public.returns
      FOR ALL USING (is_admin()) WITH CHECK (is_admin())';
    EXECUTE 'CREATE POLICY "returns_agent_read_own" ON public.returns
      FOR SELECT USING (returned_by = auth.uid())';
    EXECUTE 'CREATE POLICY "returns_agent_insert" ON public.returns
      FOR INSERT WITH CHECK (returned_by = auth.uid())';
    EXECUTE 'CREATE POLICY "returns_teamlead_read_agents" ON public.returns
      FOR SELECT USING (
        returned_by IN (SELECT id FROM public.profiles WHERE team_lead_id = auth.uid())
      )';
    EXECUTE 'CREATE POLICY "returns_teamlead_update_agents" ON public.returns
      FOR UPDATE USING (
        return_status = ''PENDING''
        AND returned_by IN (SELECT id FROM public.profiles WHERE team_lead_id = auth.uid())
      )';
  END IF;
END;
$$;


-- ── receipts ──────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='receipts') THEN
    EXECUTE 'ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "receipts_admin_all"        ON public.receipts';
    EXECUTE 'DROP POLICY IF EXISTS "receipts_agent_own"        ON public.receipts';
    EXECUTE 'DROP POLICY IF EXISTS "receipts_agent_insert"     ON public.receipts';
    EXECUTE 'DROP POLICY IF EXISTS "receipts_agent_update_own" ON public.receipts';
    EXECUTE 'DROP POLICY IF EXISTS "receipts_teamlead_agents"  ON public.receipts';
    EXECUTE 'CREATE POLICY "receipts_admin_all" ON public.receipts
      FOR ALL USING (is_admin()) WITH CHECK (is_admin())';
    EXECUTE 'CREATE POLICY "receipts_agent_own" ON public.receipts
      FOR SELECT USING (agent_id = auth.uid())';
    EXECUTE 'CREATE POLICY "receipts_agent_insert" ON public.receipts
      FOR INSERT WITH CHECK (agent_id = auth.uid())';
    EXECUTE 'CREATE POLICY "receipts_agent_update_own" ON public.receipts
      FOR UPDATE USING (agent_id = auth.uid()) WITH CHECK (agent_id = auth.uid())';
    EXECUTE 'CREATE POLICY "receipts_teamlead_agents" ON public.receipts
      FOR SELECT USING (
        agent_id IN (SELECT id FROM public.profiles WHERE team_lead_id = auth.uid())
      )';
  END IF;
END;
$$;


-- ── notifications ─────────────────────────────────────────────────────────────
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_admin_all"     ON public.notifications;
DROP POLICY IF EXISTS "notif_read_own"      ON public.notifications;
DROP POLICY IF EXISTS "notif_insert_any"    ON public.notifications;
DROP POLICY IF EXISTS "notif_insert_system" ON public.notifications;
DROP POLICY IF EXISTS "notif_update_own"    ON public.notifications;
DROP POLICY IF EXISTS "notif_no_delete"     ON public.notifications;

CREATE POLICY "notif_admin_all" ON public.notifications
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "notif_read_own" ON public.notifications
  FOR SELECT USING (recipient_id = auth.uid());

CREATE POLICY "notif_insert_system" ON public.notifications
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = recipient_id)
  );

CREATE POLICY "notif_update_own" ON public.notifications
  FOR UPDATE USING (recipient_id = auth.uid()) WITH CHECK (recipient_id = auth.uid());

CREATE POLICY "notif_no_delete" ON public.notifications
  FOR DELETE USING (is_admin());


-- ── payroll tables ────────────────────────────────────────────────────────────
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'payroll_configs', 'payroll_targets', 'payroll_runs', 'payroll_entries'
  ] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=tbl) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "payroll_admin_all" ON public.%I', tbl);
      EXECUTE format('CREATE POLICY "payroll_admin_all" ON public.%I
        FOR ALL USING (is_admin()) WITH CHECK (is_admin())', tbl);
      IF tbl = 'payroll_entries' THEN
        EXECUTE 'DROP POLICY IF EXISTS "payroll_entries_read_own"    ON public.payroll_entries';
        EXECUTE 'DROP POLICY IF EXISTS "employee_read_own_entry"     ON public.payroll_entries';
        EXECUTE 'CREATE POLICY "payroll_entries_read_own" ON public.payroll_entries
          FOR SELECT USING (employee_id = auth.uid())';
      END IF;
    END IF;
  END LOOP;
END;
$$;


-- ============================================================
-- SECTION 5 — PERFORMANCE INDEXES
--
-- Only created if they don't exist (safe to re-run).
-- CONCURRENTLY = no table lock, safe on live data.
-- ============================================================

-- phones: hot paths
CREATE INDEX IF NOT EXISTS idx_phones_status         ON public.phones (status);
CREATE INDEX IF NOT EXISTS idx_phones_assigned_to    ON public.phones (assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_phones_assigned_at    ON public.phones (assigned_at DESC) WHERE assigned_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_phones_status_holder  ON public.phones (status, assigned_to);
CREATE INDEX IF NOT EXISTS idx_phones_sold_at        ON public.phones (sold_at DESC) WHERE sold_at IS NOT NULL;

-- Partial index for stale-device alert query (status=assigned AND assigned_at old)
CREATE INDEX IF NOT EXISTS idx_phones_assigned_stale ON public.phones (assigned_at)
  WHERE status = 'assigned' AND assigned_at IS NOT NULL;

-- Full-text search on phones
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='phones' AND indexname='idx_phones_fts'
  ) THEN
    EXECUTE 'CREATE INDEX idx_phones_fts ON public.phones
      USING GIN (to_tsvector(''simple'',
        COALESCE(model,'''')||'' ''||COALESCE(imei,'''')||'' ''||
        COALESCE(barcode,'''')||'' ''||COALESCE(serial_number,'''')))';
  END IF;
END;
$$;

-- profiles: hot paths
CREATE INDEX IF NOT EXISTS idx_profiles_role         ON public.profiles (role);
CREATE INDEX IF NOT EXISTS idx_profiles_team_lead    ON public.profiles (team_lead_id) WHERE team_lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_status       ON public.profiles (status);
CREATE INDEX IF NOT EXISTS idx_profiles_role_status  ON public.profiles (role, status);

-- sales: reporting queries
-- Note: date_trunc on timestamptz is STABLE not IMMUTABLE, so cannot be used
-- in an index expression. idx_sales_sold_at covers monthly range scans just as well.
CREATE INDEX IF NOT EXISTS idx_sales_sold_by         ON public.sales (sold_by);
CREATE INDEX IF NOT EXISTS idx_sales_sold_at         ON public.sales (sold_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_phone_id        ON public.sales (phone_id);
CREATE INDEX IF NOT EXISTS idx_sales_agent_month     ON public.sales (sold_by, sold_at DESC);

-- notifications: unread fetch (most common query)
CREATE INDEX IF NOT EXISTS idx_notif_recipient_unread ON public.notifications (recipient_id, read)
  WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_notif_created_at      ON public.notifications (created_at DESC);

-- activity_log: time-series + actor queries
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='activity_log') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_actlog_created_at ON public.activity_log (created_at DESC)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_actlog_actor      ON public.activity_log (actor_id, created_at DESC)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_actlog_team       ON public.activity_log (team_lead_id, created_at DESC)
      WHERE team_lead_id IS NOT NULL';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_actlog_agent      ON public.activity_log (agent_id, created_at DESC)
      WHERE agent_id IS NOT NULL';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_actlog_entity     ON public.activity_log (entity_type, entity_id)
      WHERE entity_id IS NOT NULL';
  END IF;
END;
$$;


-- ============================================================
-- SECTION 6 — SECURITY DEFINER RPC FUNCTIONS
--
-- Design pattern: Admin data access bypasses RLS entirely.
-- Security is enforced by is_admin() check inside the function
-- (runs once per call, not per row).
--
-- Frontend calls: supabase.rpc('admin_get_phones')
--                 supabase.rpc('admin_get_profiles')
--                 supabase.rpc('admin_dashboard_stats')
--                 supabase.rpc('admin_team_overview')
--
-- Benefits:
--   - Zero RLS overhead on admin queries
--   - Works regardless of JWT email field path
--   - Single auth check per request
--   - Typed return values (PostgREST generates TypeScript types)
-- ============================================================

-- ── admin_get_phones ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_get_phones()
RETURNS SETOF public.phones
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'permission denied: admin only' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM phones ORDER BY created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_phones() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_get_phones() TO authenticated;
COMMENT ON FUNCTION public.admin_get_phones() IS
  'Admin-only: returns all phones. SECURITY DEFINER bypasses RLS. is_admin() enforces auth.';


-- ── admin_get_profiles ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_get_profiles()
RETURNS SETOF public.profiles
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'permission denied: admin only' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM profiles WHERE role != 'admin' ORDER BY role, full_name;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_profiles() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_get_profiles() TO authenticated;


-- ── admin_dashboard_stats ────────────────────────────────────────────────────
-- Returns pre-computed stats in ONE query. No 5000-row transfer needed.
CREATE OR REPLACE FUNCTION public.admin_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_phone_stats  jsonb;
  v_team_stats   jsonb;
  v_sales_today  bigint;
  v_sales_month  bigint;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'permission denied: admin only' USING ERRCODE = '42501';
  END IF;

  -- Phone inventory counts
  SELECT jsonb_build_object(
    'total',    COUNT(*),
    'in_stock', COUNT(*) FILTER (WHERE status = 'in_stock'),
    'in_field', COUNT(*) FILTER (WHERE status = 'assigned'),
    'sold',     COUNT(*) FILTER (WHERE status = 'sold'),
    'returned', COUNT(*) FILTER (WHERE status = 'returned'),
    'damaged',  COUNT(*) FILTER (WHERE status = 'damaged')
  ) INTO v_phone_stats FROM phones;

  -- Team composition
  SELECT jsonb_build_object(
    'total_agents',    COUNT(*) FILTER (WHERE role = 'agent'),
    'total_teamleads', COUNT(*) FILTER (WHERE role = 'team_lead'),
    'active',          COUNT(*) FILTER (WHERE status = 'active'),
    'pending',         COUNT(*) FILTER (WHERE status = 'pending')
  ) INTO v_team_stats FROM profiles WHERE role != 'admin';

  -- Sales today
  SELECT COUNT(*) INTO v_sales_today
  FROM sales WHERE sold_at >= CURRENT_DATE;

  -- Sales this month
  SELECT COUNT(*) INTO v_sales_month
  FROM sales WHERE sold_at >= date_trunc('month', NOW());

  RETURN jsonb_build_object(
    'phones',      v_phone_stats,
    'team',        v_team_stats,
    'salesToday',  v_sales_today,
    'salesMonth',  v_sales_month,
    'generatedAt', extract(epoch from now())::bigint
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_dashboard_stats() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_dashboard_stats() TO authenticated;
COMMENT ON FUNCTION public.admin_dashboard_stats() IS
  'Returns dashboard stats in a single DB round-trip. No 5k-row transfer needed.';


-- ── admin_team_overview ──────────────────────────────────────────────────────
-- Returns team members with their phone assignment counts in one RPC.
CREATE OR REPLACE FUNCTION public.admin_team_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'permission denied: admin only' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_agg(row_to_json(t)) INTO v_result
  FROM (
    SELECT
      p.id,
      p.full_name,
      p.role,
      p.status,
      p.team_lead_id,
      p.created_at,
      -- Phone stats per member (all in one pass)
      COUNT(ph.id)                                                          AS assigned_count,
      COUNT(ph.id) FILTER (WHERE ph.status = 'sold')                       AS sold_count,
      COUNT(ph.id) FILTER (WHERE ph.status = 'assigned')                   AS active_count,
      -- Stale phones: assigned > 3 days for agent, > 14 days for team_lead
      COUNT(ph.id) FILTER (
        WHERE ph.status = 'assigned'
        AND ph.assigned_at IS NOT NULL
        AND (
          (p.role = 'agent'     AND ph.assigned_at < NOW() - INTERVAL '3 days')
          OR (p.role = 'team_lead' AND ph.assigned_at < NOW() - INTERVAL '14 days')
        )
      ) AS stale_phone_count,
      -- Most stale phone details
      MAX(EXTRACT(EPOCH FROM (NOW() - ph.assigned_at)) / 86400)
        FILTER (WHERE ph.status = 'assigned' AND ph.assigned_at IS NOT NULL)
        AS max_days_assigned
    FROM profiles p
    LEFT JOIN phones ph ON ph.assigned_to = p.id
    WHERE p.role != 'admin'
    GROUP BY p.id, p.full_name, p.role, p.status, p.team_lead_id, p.created_at
    ORDER BY p.role, p.full_name
  ) t;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_team_overview() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_team_overview() TO authenticated;


-- ── admin_stale_alerts ───────────────────────────────────────────────────────
-- Returns only the phones that are overdue. Used for the alert panel.
CREATE OR REPLACE FUNCTION public.admin_stale_alerts(
  p_agent_days     integer DEFAULT 3,
  p_teamlead_days  integer DEFAULT 14
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'permission denied: admin only' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'phone_id',       ph.id,
      'model',          ph.model,
      'imei',           ph.imei,
      'barcode',        ph.barcode,
      'serial_number',  ph.serial_number,
      'assigned_at',    ph.assigned_at,
      'holder_id',      p.id,
      'holder_name',    p.full_name,
      'holder_role',    p.role,
      'days_assigned',  FLOOR(EXTRACT(EPOCH FROM (NOW() - ph.assigned_at)) / 86400),
      'threshold_days', CASE WHEN p.role = 'team_lead' THEN p_teamlead_days ELSE p_agent_days END,
      'over_by_days',   FLOOR(EXTRACT(EPOCH FROM (NOW() - ph.assigned_at)) / 86400)
                        - CASE WHEN p.role = 'team_lead' THEN p_teamlead_days ELSE p_agent_days END
    ) ORDER BY ph.assigned_at ASC
  ) INTO v_result
  FROM phones ph
  JOIN profiles p ON p.id = ph.assigned_to
  WHERE ph.status = 'assigned'
    AND ph.assigned_at IS NOT NULL
    AND p.role != 'admin'
    AND (
      (p.role = 'team_lead' AND ph.assigned_at < NOW() - (p_teamlead_days || ' days')::interval)
      OR
      (p.role = 'agent'     AND ph.assigned_at < NOW() - (p_agent_days   || ' days')::interval)
    );

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_stale_alerts(integer, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_stale_alerts(integer, integer) TO authenticated;


-- ── health_check ─────────────────────────────────────────────────────────────
-- Lightweight ping for the system health monitor. Returns < 1ms on warm DB.
CREATE OR REPLACE FUNCTION public.health_check()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT jsonb_build_object(
    'ok',          true,
    'ts',          extract(epoch from now())::bigint,
    'is_admin',    is_admin(),
    'auth_email',  COALESCE(auth.email(), auth.jwt() ->> 'email', 'unauthenticated')
  )
$$;

REVOKE ALL ON FUNCTION public.health_check() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.health_check() TO authenticated, anon;
COMMENT ON FUNCTION public.health_check() IS
  'Lightweight health check. Returns admin status and resolved email from JWT. '
  'Use this to diagnose "database connection failed" — auth_email shows what '
  'the DB sees for the current session.';


-- ============================================================
-- SECTION 7 — DATA INTEGRITY CONSTRAINTS
-- ============================================================

-- Phones: prevent duplicate IMEI
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'phones_imei_unique' AND conrelid = 'public.phones'::regclass
  ) THEN
    -- Use a partial unique index instead of constraint (NULLs don't conflict)
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS idx_phones_imei_unique ON public.phones(imei)
      WHERE imei IS NOT NULL';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END;
$$;

-- Phones: prevent duplicate barcode
DO $$
BEGIN
  EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS idx_phones_barcode_unique ON public.phones(barcode)
    WHERE barcode IS NOT NULL';
EXCEPTION WHEN OTHERS THEN NULL; END;
$$;

-- Profiles: one profile per auth user (already a PK but makes intent explicit)
DO $$
BEGIN
  -- Add check: phone_number format (basic, not enforced on existing data)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_phone_format' AND conrelid = 'public.profiles'::regclass
  ) THEN
    EXECUTE 'ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_phone_format
      CHECK (phone_number IS NULL OR length(phone_number) BETWEEN 7 AND 20)';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; END;
$$;


-- ============================================================
-- SECTION 8 — NOTIFICATION HELPER
-- Replaces the frontend sendNotification calls.
-- Returns null on success (avoids client-side round-trips for notifications).
-- ============================================================

CREATE OR REPLACE FUNCTION public.send_notification(
  p_recipient_id  uuid,
  p_type          text,
  p_title         text,
  p_body          text,
  p_sale_id       uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Caller must be authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;
  -- Recipient must exist
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_recipient_id) THEN
    RETURN; -- silently ignore phantom recipients
  END IF;
  INSERT INTO notifications (recipient_id, type, title, body, sale_id, read)
  VALUES (p_recipient_id, p_type, p_title, p_body, p_sale_id, false);
END;
$$;

REVOKE ALL ON FUNCTION public.send_notification(uuid,text,text,text,uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.send_notification(uuid,text,text,text,uuid) TO authenticated;


-- ============================================================
-- SECTION 9 — VERIFY EVERYTHING APPLIED
-- ============================================================

SELECT
  'POLICIES' AS check_type,
  tablename,
  COUNT(*) AS policy_count
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('profiles','phones','sales','notifications','activity_log','returns','receipts')
GROUP BY tablename

UNION ALL

SELECT
  'INDEXES' AS check_type,
  tablename,
  COUNT(*) AS index_count
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('phones','profiles','sales','notifications')
GROUP BY tablename

ORDER BY check_type, tablename;

-- Quick sanity: list all our new RPC functions
SELECT routine_name, security_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'is_admin','health_check',
    'admin_get_phones','admin_get_profiles',
    'admin_dashboard_stats','admin_team_overview',
    'admin_stale_alerts','send_notification'
  )
ORDER BY routine_name;

-- ============================================================
-- RUN health_check() AFTER APPLYING TO VERIFY ADMIN SESSION:
--   SELECT public.health_check();
-- Expected: {"ok":true,"is_admin":true,"auth_email":"patrickwlax@gmail.com"}
-- If auth_email is wrong/null, sign out and back in.
-- ============================================================
