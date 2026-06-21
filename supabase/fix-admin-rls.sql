-- ============================================================
-- ⚠️  SUPERSEDED — DO NOT RUN THIS FILE AGAIN  ⚠️
-- ============================================================
--
-- This was an early emergency fix script. It hardcodes the admin
-- email directly in each RLS policy using the fragile pattern:
--   auth.jwt() ->> 'email' = 'patrickwlax@gmail.com'
--
-- This approach is unreliable for Google OAuth tokens where the
-- email may sit in a different JWT path.
--
-- THE CANONICAL REPLACEMENT IS: v2-full-migration.sql
--   • Defines a STABLE is_admin() function that handles all JWT paths
--   • Uses is_admin() in all RLS policies — evaluated once per query
--   • Adds proper REVOKE/GRANT on all SECURITY DEFINER functions
--
-- Running this file again would DOWNGRADE policies to the fragile
-- inline email pattern, potentially breaking admin access under
-- certain OAuth flows.
-- ============================================================

-- ============================================================
-- Royal Success — Admin RLS Fix (SUPERSEDED — see warning above)
-- ============================================================

-- Step 1: Fix the admin profile directly
UPDATE public.profiles
SET role = 'admin', status = 'active'
WHERE id = (SELECT id FROM auth.users WHERE email = 'patrickwlax@gmail.com');

-- Step 2: Verify it worked (check this shows role=admin, status=active)
SELECT id, full_name, role, status
FROM public.profiles
WHERE id = (SELECT id FROM auth.users WHERE email = 'patrickwlax@gmail.com');

-- Step 3: Replace ALL admin policies with email-based versions
-- (These work from the JWT token directly, no DB lookup needed)

-- Phones: full admin access
DROP POLICY IF EXISTS "phones_admin_all" ON public.phones;
CREATE POLICY "phones_admin_all"
  ON public.phones FOR ALL
  USING (auth.jwt() ->> 'email' = 'patrickwlax@gmail.com')
  WITH CHECK (auth.jwt() ->> 'email' = 'patrickwlax@gmail.com');

-- Profiles: admin can read all
DROP POLICY IF EXISTS "profiles_admin_read_all" ON public.profiles;
CREATE POLICY "profiles_admin_read_all"
  ON public.profiles FOR SELECT
  USING (auth.jwt() ->> 'email' = 'patrickwlax@gmail.com');

-- Profiles: admin can insert
DROP POLICY IF EXISTS "profiles_admin_insert" ON public.profiles;
CREATE POLICY "profiles_admin_insert"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.jwt() ->> 'email' = 'patrickwlax@gmail.com' OR auth.uid() = id);

-- Profiles: admin can update any profile
DROP POLICY IF EXISTS "profiles_admin_update" ON public.profiles;
CREATE POLICY "profiles_admin_update"
  ON public.profiles FOR UPDATE
  USING (auth.jwt() ->> 'email' = 'patrickwlax@gmail.com' OR auth.uid() = id);

-- Activity log: admin full access
DROP POLICY IF EXISTS "logs_admin_read" ON public.activity_log;
CREATE POLICY "logs_admin_read"
  ON public.activity_log FOR ALL
  USING (
    auth.jwt() ->> 'email' = 'patrickwlax@gmail.com'
    OR performed_by = auth.uid()
  )
  WITH CHECK (
    auth.jwt() ->> 'email' = 'patrickwlax@gmail.com'
    OR performed_by = auth.uid()
  );

-- Step 4: Confirm all policies are in place
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
