-- ============================================================
-- Royal Success — Live RLS + Connection Diagnostic
-- Run this in the Supabase SQL Editor (as the postgres user)
-- to check exactly what the admin user can see.
-- ============================================================

-- 1. Confirm admin email setting
SELECT current_setting('app.admin_email', true) AS configured_admin_email;

-- 2. Verify RLS policies on all core tables
SELECT
  schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('profiles', 'phones', 'sales', 'notifications', 'activity_log', 'returns', 'receipts')
ORDER BY tablename, policyname;

-- 3. Check all tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- 4. Check profiles table columns (confirm created_at exists)
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'profiles'
ORDER BY ordinal_position;

-- 5. Simulate what the admin user sees (run as postgres — bypasses RLS)
-- Compare row count with what the frontend returns.
-- If the frontend returns 0 but this returns rows, it's an RLS policy issue.
SELECT COUNT(*) AS profile_rows_total        FROM public.profiles;
SELECT COUNT(*) AS phones_rows_total         FROM public.phones;
SELECT COUNT(*) AS admin_profiles            FROM public.profiles WHERE role = 'admin';

-- 6. Check for any INVALID policies that might silently block all access
-- (Postgres marks policies as invalid if they reference a dropped function)
SELECT
  polname AS policy_name,
  polrelid::regclass AS table_name,
  CASE WHEN polqual IS NULL THEN 'NO QUAL (unrestricted)' ELSE pg_get_expr(polqual, polrelid) END AS using_expr,
  CASE WHEN polwithcheck IS NULL THEN 'NO CHECK' ELSE pg_get_expr(polwithcheck, polrelid) END AS with_check_expr
FROM pg_policy
WHERE polrelid IN ('public.profiles'::regclass, 'public.phones'::regclass)
ORDER BY polrelid, polname;

-- 7. Confirm auth.jwt() email claim works (for the admin login test)
-- This will be NULL when run as postgres (no JWT) — that is EXPECTED.
-- The value is only non-null for authenticated Supabase client requests.
SELECT auth.jwt() ->> 'email' AS jwt_email;

-- 8. Check if handle_new_user trigger still exists
SELECT trigger_name, event_object_table, action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public';

-- ============================================================
-- Expected results:
--  • profiles_admin_all policy: USING (jwt email = 'patrickwlax@gmail.com')
--  • phones_admin_all policy:   same
--  • profiles table has: id, full_name, phone_number, role, team_lead_id, status, created_at
--  • handle_new_user trigger exists on auth.users
-- ============================================================
