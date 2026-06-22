-- ============================================================
-- Royal Success — Fix is_admin() + All Admin RLS Policies
--
-- ROOT CAUSE (confirmed by diagnostics):
--   health_check() returns is_admin=null for the current
--   admin account (royalsuccessgadgetwatu908@gmail.com).
--   is_admin() still has only the old email hardcoded
--   (patrickwlax@gmail.com) and the app.admin_email DB
--   setting was never updated (ALTER DATABASE was blocked).
--
-- WHAT BREAKS when is_admin() returns false/null:
--   ✗ Add inventory (INSERT blocked by phones_admin_all RLS)
--   ✗ Delete phones  (DELETE silently drops — no error, no action)
--   ✗ Update phones  (UPDATE silently drops)
--   ✗ Assign phones  (UPDATE silently drops)
--   ✗ View inventory (admin_get_phones_page RPC throws 42501)
--   ✗ View agents    (admin_get_profiles RPC throws 42501)
--   ✗ Approve agents (admin_update_profile RPC throws 42501)
--   ✗ Dashboard stats (admin_dashboard_stats RPC throws 42501)
--   ✗ All payroll / returns / receipts admin access
--
-- FIXES APPLIED:
--   1. is_admin() updated: new email + case-insensitive + profiles fallback
--   2. admin_update_profile() updated: dual-check (is_admin OR profiles.role)
--   3. ALL admin RLS policies updated: dual-check (is_admin OR profiles.role)
--
-- The profiles.role fallback means admin access works even if
-- the email in the JWT doesn't match — as long as the profile
-- row has role='admin' (which AuthContext guarantees on login).
--
-- SAFE TO RE-RUN (all statements are CREATE OR REPLACE / DROP+CREATE).
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run.
-- Expected: final SELECT shows is_admin_result = true.
-- ============================================================


-- ============================================================
-- STEP 1 — Update is_admin()
-- Adds new email, case-insensitive comparison, profiles fallback.
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  RETURN (
    -- Email in top-level JWT claim (case-insensitive)
    lower(coalesce(auth.jwt() ->> 'email', '')) = ANY(ARRAY[
      'royalsuccessgadgetwatu908@gmail.com',
      'patrickwlax@gmail.com'
    ])
    -- Email in user_metadata (Google OAuth sometimes places it here)
    OR lower(coalesce(auth.jwt() -> 'user_metadata' ->> 'email', '')) = ANY(ARRAY[
      'royalsuccessgadgetwatu908@gmail.com',
      'patrickwlax@gmail.com'
    ])
    -- Email in app_metadata
    OR lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'email', '')) = ANY(ARRAY[
      'royalsuccessgadgetwatu908@gmail.com',
      'patrickwlax@gmail.com'
    ])
    -- Database-level setting (works if ALTER DATABASE was run)
    OR lower(coalesce(current_setting('app.admin_email', true), '')) =
       lower(coalesce(auth.jwt() ->> 'email', '___no_match___'))
    -- Profile-based fallback: most resilient — doesn't depend on email config
    -- Works even after an email change, without redeploying anything.
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
END;
$$;

-- Maintain existing grants (is_admin is a public diagnostic helper)
REVOKE ALL   ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;

COMMENT ON FUNCTION public.is_admin IS
  'Returns true when the calling user is the admin. '
  'Checks: JWT email (case-insensitive, 3 paths) + app.admin_email setting + profiles.role=admin.';


-- ============================================================
-- STEP 2 — Update admin_update_profile (approval / role-change RPC)
-- Adds profiles.role fallback so it works even if is_admin()
-- has a stale email list after a future admin account change.
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_update_profile(
  p_user_id      uuid,
  p_role         text,
  p_team_lead_id uuid    DEFAULT NULL,
  p_status       text    DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT (
    is_admin()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  ) THEN
    RAISE EXCEPTION 'permission denied: admin only' USING ERRCODE = '42501';
  END IF;

  IF p_role NOT IN ('agent', 'team_lead', 'admin') THEN
    RAISE EXCEPTION 'invalid role: %', p_role USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles
  SET
    role         = p_role::public.user_role,
    team_lead_id = p_team_lead_id,
    status       = COALESCE(p_status::public.profile_status, status)
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found: %', p_user_id USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL   ON FUNCTION public.admin_update_profile(uuid, text, uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_update_profile(uuid, text, uuid, text) TO authenticated;


-- ============================================================
-- STEP 3 — Replace all is_admin()-only RLS policies
-- New policies use (is_admin() OR profiles.role='admin').
-- If is_admin() returns false for any reason, the profiles
-- check guarantees the admin still gets through.
-- ============================================================

-- Reusable expression (can't be a variable in DDL, so we repeat it):
-- USING/WITH CHECK:
--   is_admin()
--   OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')

-- ── phones ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "phones_admin_all" ON public.phones;
CREATE POLICY "phones_admin_all" ON public.phones
  FOR ALL
  USING (
    is_admin()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    is_admin()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── profiles ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "profiles_admin_all" ON public.profiles;
CREATE POLICY "profiles_admin_all" ON public.profiles
  FOR ALL
  USING (
    is_admin()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    is_admin()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── sales ──────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "sales_admin_all" ON public.sales;
CREATE POLICY "sales_admin_all" ON public.sales
  FOR ALL
  USING (
    is_admin()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    is_admin()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── notifications ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "notif_admin_all"  ON public.notifications;
DROP POLICY IF EXISTS "notif_no_delete"  ON public.notifications;
CREATE POLICY "notif_admin_all" ON public.notifications
  FOR ALL
  USING (
    is_admin()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    is_admin()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
CREATE POLICY "notif_no_delete" ON public.notifications
  FOR DELETE USING (
    is_admin()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── stale_device_settings ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "stale_settings_admin_insert" ON public.stale_device_settings;
DROP POLICY IF EXISTS "stale_settings_admin_update" ON public.stale_device_settings;
CREATE POLICY "stale_settings_admin_insert" ON public.stale_device_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    is_admin()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
CREATE POLICY "stale_settings_admin_update" ON public.stale_device_settings
  FOR UPDATE TO authenticated
  USING (
    is_admin()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    is_admin()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── activity_log ───────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='activity_log') THEN
    EXECUTE 'DROP POLICY IF EXISTS "activity_admin_all" ON public.activity_log';
    EXECUTE $p$
      CREATE POLICY "activity_admin_all" ON public.activity_log
        FOR ALL
        USING (
          is_admin()
          OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
        )
        WITH CHECK (
          is_admin()
          OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
        )
    $p$;
  END IF;
END $$;

-- ── activity_log_legacy ────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='activity_log_legacy') THEN
    EXECUTE 'DROP POLICY IF EXISTS "legacy_admin_all" ON public.activity_log_legacy';
    EXECUTE $p$
      CREATE POLICY "legacy_admin_all" ON public.activity_log_legacy
        FOR ALL
        USING (
          is_admin()
          OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
        )
        WITH CHECK (
          is_admin()
          OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
        )
    $p$;
  END IF;
END $$;

-- ── returns ────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='returns') THEN
    EXECUTE 'DROP POLICY IF EXISTS "returns_admin_all" ON public.returns';
    EXECUTE $p$
      CREATE POLICY "returns_admin_all" ON public.returns
        FOR ALL
        USING (
          is_admin()
          OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
        )
        WITH CHECK (
          is_admin()
          OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
        )
    $p$;
  END IF;
END $$;

-- ── receipts ───────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='receipts') THEN
    EXECUTE 'DROP POLICY IF EXISTS "receipts_admin_all" ON public.receipts';
    EXECUTE $p$
      CREATE POLICY "receipts_admin_all" ON public.receipts
        FOR ALL
        USING (
          is_admin()
          OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
        )
        WITH CHECK (
          is_admin()
          OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
        )
    $p$;
  END IF;
END $$;

-- ── payroll + telemetry tables ─────────────────────────────────────────────────
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'payroll_configs', 'payroll_targets', 'payroll_runs', 'payroll_entries',
    'error_logs', 'perf_logs'
  ] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=tbl) THEN
      EXECUTE format('DROP POLICY IF EXISTS "payroll_admin_all" ON public.%I', tbl);
      EXECUTE format('DROP POLICY IF EXISTS "logs_admin_all"    ON public.%I', tbl);
      EXECUTE format($p$
        CREATE POLICY "payroll_admin_all" ON public.%I
          FOR ALL
          USING (
            is_admin()
            OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
          )
          WITH CHECK (
            is_admin()
            OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
          )
      $p$, tbl);
    END IF;
  END LOOP;
END $$;


-- ============================================================
-- STEP 4 — Verification
-- health_check() must return is_admin=true after this runs.
-- If you still see is_admin=false/null, sign out and sign
-- back in to refresh the JWT, then check again.
-- ============================================================
SELECT public.health_check();

SELECT
  is_admin()              AS is_admin_result,
  lower(auth.jwt() ->> 'email') AS jwt_email
;
