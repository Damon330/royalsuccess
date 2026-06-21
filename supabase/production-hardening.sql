-- ============================================================
-- Royal Success — Production Hardening Migration
--
-- PURPOSE:
--   Final sweep of security, permissions, and data-integrity
--   issues identified during the full SQL audit.
--
-- SAFE TO RE-RUN — all statements are idempotent (IF NOT EXISTS,
--   CREATE OR REPLACE, DROP IF EXISTS, ON CONFLICT DO NOTHING).
--
-- Run in Supabase SQL Editor → New Query → Run.
-- Expected result: all SELECT checks at the bottom return ✓.
-- ============================================================


-- ============================================================
-- SECTION 1 — FIX MISSING REVOKE/GRANT ON SCALE-HARDENING RPCS
--
-- get_dashboard_stats() and get_team_overview() were created in
-- scale-hardening.sql without revoking PUBLIC execute access first.
-- PostgreSQL grants EXECUTE to PUBLIC by default on new functions,
-- so every authenticated (and anonymous) user could call them.
-- The is_admin() check inside prevents data leakage, but the
-- principle of least privilege requires locking the grant down.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'get_dashboard_stats'
      AND pronamespace = 'public'::regnamespace
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.get_dashboard_stats() FROM PUBLIC';
    EXECUTE 'GRANT  EXECUTE ON FUNCTION public.get_dashboard_stats() TO authenticated';
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'get_team_overview'
      AND pronamespace = 'public'::regnamespace
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.get_team_overview() FROM PUBLIC';
    EXECUTE 'GRANT  EXECUTE ON FUNCTION public.get_team_overview() TO authenticated';
  END IF;
END;
$$;

-- Same treatment for any other SECURITY DEFINER functions that may
-- have been created before the REVOKE pattern was established.
-- is_admin() is intentionally PUBLIC-accessible (it returns a boolean, no data).
-- health_check() is intentionally PUBLIC-accessible (diagnostic, no sensitive data).
DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'notify_on_sale',
    'log_activity',
    'admin_delete_profile'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc WHERE proname = fn AND pronamespace = 'public'::regnamespace
    ) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION public.%I() FROM PUBLIC', fn);
      EXECUTE format('GRANT  EXECUTE ON FUNCTION public.%I() TO authenticated', fn);
    END IF;
  END LOOP;
END;
$$;


-- ============================================================
-- SECTION 2 — ADMIN EMAIL CONFIGURATION AUDIT
--
-- The admin email is stored in three places that must stay in sync:
--
--   1. VITE_ADMIN_EMAIL  — Vercel environment variable (frontend)
--   2. app.admin_email   — PostgreSQL database-level setting
--                          (set in v2-full-migration.sql)
--   3. is_admin()        — Fallback hardcoded email in the function
--
-- If you ever need to change the admin email:
--   a. Update VITE_ADMIN_EMAIL in Vercel dashboard
--   b. Run the following command in this SQL editor:
--        ALTER DATABASE postgres SET app.admin_email = 'new@email.com';
--   c. Update the fallback in is_admin() (CREATE OR REPLACE FUNCTION)
--
-- Current configured value (set in v2-full-migration.sql):
-- ============================================================

SELECT
  current_setting('app.admin_email', true) AS db_admin_email,
  CASE
    WHEN current_setting('app.admin_email', true) IS NOT NULL
     AND current_setting('app.admin_email', true) != ''
    THEN '✓ app.admin_email is configured'
    ELSE '⚠ app.admin_email not set — is_admin() falls back to hardcoded email only'
  END AS status;


-- ============================================================
-- SECTION 3 — ENSURE IMMUTABLE AUDIT TABLES CANNOT BE DELETED
--
-- Sales and activity_log represent financial records. Confirm
-- the no-delete policies are enforced.
-- ============================================================

-- Verify / re-apply no-delete on sales
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='sales') THEN
    -- Ensure policy exists (v2-full-migration already creates this, this is a safety net)
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sales' AND policyname='sales_no_delete'
    ) THEN
      EXECUTE 'CREATE POLICY "sales_no_delete" ON public.sales FOR DELETE USING (false)';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sales' AND policyname='sales_no_update'
    ) THEN
      EXECUTE 'CREATE POLICY "sales_no_update" ON public.sales FOR UPDATE USING (false)';
    END IF;
  END IF;
END;
$$;

-- Verify / re-apply no-delete on activity_log
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='activity_log') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='activity_log' AND policyname='activity_no_delete'
    ) THEN
      EXECUTE 'CREATE POLICY "activity_no_delete" ON public.activity_log FOR DELETE USING (false)';
    END IF;
  END IF;
END;
$$;


-- ============================================================
-- SECTION 4 — CLEANUP: activity_log_legacy
--
-- migration-v3-features.sql renamed the original activity_log to
-- activity_log_legacy. v2-full-migration.sql enables RLS on it.
-- It is safe to DROP this table once you confirm it contains no
-- data you need to preserve (it was the pre-v3 schema format).
--
-- Uncomment the block below ONLY after verifying:
--   SELECT COUNT(*) FROM public.activity_log_legacy;  -- should be 0
-- ============================================================

-- DO $$
-- BEGIN
--   IF EXISTS (
--     SELECT 1 FROM information_schema.tables
--     WHERE table_schema='public' AND table_name='activity_log_legacy'
--   ) THEN
--     -- Confirm it's empty before dropping
--     IF (SELECT COUNT(*) FROM public.activity_log_legacy) = 0 THEN
--       DROP TABLE public.activity_log_legacy;
--       RAISE NOTICE 'activity_log_legacy dropped (was empty)';
--     ELSE
--       RAISE NOTICE 'activity_log_legacy has rows — skipping drop. Review data first.';
--     END IF;
--   END IF;
-- END;
-- $$;


-- ============================================================
-- SECTION 5 — UNIQUE CONSTRAINT SAFETY FOR SERIAL_NUMBER
--
-- phones.serial_number has a UNIQUE constraint from schema.sql.
-- Verify it still exists (could have been dropped by a demo script).
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.phones'::regclass
      AND contype = 'u'
      AND conname = 'phones_serial_number_key'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename  = 'phones'
      AND indexdef LIKE '%serial_number%'
      AND indexdef LIKE '%UNIQUE%'
  ) THEN
    EXECUTE 'ALTER TABLE public.phones ADD CONSTRAINT phones_serial_number_key UNIQUE (serial_number)';
    RAISE NOTICE 'phones.serial_number UNIQUE constraint re-applied';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not re-add serial_number constraint (duplicate values exist?): %', SQLERRM;
END;
$$;


-- ============================================================
-- SECTION 6 — VERIFY ALL CRITICAL TABLES HAVE RLS ENABLED
-- ============================================================

SELECT
  t.table_name,
  CASE WHEN c.relrowsecurity THEN '✓ RLS enabled' ELSE '⛔ RLS DISABLED — CRITICAL' END AS rls_status
FROM information_schema.tables t
JOIN pg_class c ON c.relname = t.table_name AND c.relnamespace = 'public'::regnamespace
WHERE t.table_schema = 'public'
  AND t.table_name IN (
    'profiles', 'phones', 'sales', 'returns', 'receipts',
    'notifications', 'activity_log', 'payroll_configs',
    'payroll_targets', 'payroll_runs', 'payroll_entries',
    'error_logs', 'perf_logs', 'stale_device_settings'
  )
ORDER BY t.table_name;


-- ============================================================
-- SECTION 7 — VERIFY FUNCTION PERMISSIONS (all SECURITY DEFINER
--   RPCs should have execute granted only to 'authenticated',
--   not to 'PUBLIC')
-- ============================================================

SELECT
  p.proname                                    AS function_name,
  p.prosecdef                                  AS is_security_definer,
  has_function_privilege('anon', p.oid, 'execute')         AS anon_can_call,
  has_function_privilege('authenticated', p.oid, 'execute') AS auth_can_call,
  CASE
    WHEN p.prosecdef AND has_function_privilege('anon', p.oid, 'execute')
    THEN '⚠ SECURITY DEFINER accessible by anon'
    WHEN NOT p.prosecdef AND has_function_privilege('anon', p.oid, 'execute')
    THEN 'ok (non-definer, anon access expected for public functions)'
    ELSE '✓'
  END AS status
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN (
    'is_admin', 'health_check',
    'admin_get_phones', 'admin_get_profiles',
    'admin_get_phones_page',
    'admin_dashboard_stats', 'admin_team_overview',
    'admin_stale_alerts', 'admin_delete_profile',
    'send_notification', 'notify_on_sale', 'log_activity',
    'get_dashboard_stats', 'get_team_overview',
    'auth_email_exists'
  )
ORDER BY p.proname;


-- ============================================================
-- SECTION 8 — POLICY COUNT SUMMARY
-- Expected minimum policy counts per table:
--   profiles:      5+   (admin_all, read_own, insert_own, self_update, teamlead_read_agents)
--   phones:        5+   (admin_all, agent_read_own, agent_update_own, teamlead_read, teamlead_own)
--   sales:         5+   (admin_all, read_own, insert_own, teamlead, no_delete)
--   notifications: 5+   (admin_all, read_own, insert_system, update_own, no_delete)
--   activity_log:  5+   (admin_all, teamlead_read, agent_read, insert_auth, no_delete)
-- ============================================================

SELECT
  tablename,
  COUNT(*) AS policy_count,
  CASE
    WHEN COUNT(*) >= 5 THEN '✓'
    WHEN COUNT(*) >= 3 THEN '⚠ low — check for missing policies'
    ELSE '⛔ critically low'
  END AS status
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('profiles', 'phones', 'sales', 'returns', 'receipts', 'notifications', 'activity_log')
GROUP BY tablename
ORDER BY tablename;


-- ============================================================
-- SECTION 9 — FINAL HEALTH CHECK
-- Run health_check() to confirm admin session and DB config.
-- Expected: {"ok":true, "is_admin":true, "auth_email":"<your email>"}
-- ============================================================

SELECT public.health_check();

-- ============================================================
-- POST-RUN CHECKLIST
-- ✓ Section 6 shows RLS enabled on ALL listed tables
-- ✓ Section 7 shows no SECURITY DEFINER function accessible by anon
--   (except is_admin/health_check/auth_email_exists which are intentional)
-- ✓ Section 8 shows 5+ policies on all critical tables
-- ✓ Section 9 health_check returns is_admin=true with correct email
-- ✓ Section 2 db_admin_email matches your VITE_ADMIN_EMAIL env var
-- ============================================================
