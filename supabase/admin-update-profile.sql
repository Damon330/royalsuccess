-- ============================================================
-- Royal Success — Admin Update Profile RPC
--
-- Fixes CRITICAL BUG: the frontend's approveUser() and updateRole()
-- used supabase.from('profiles').update(...) directly, which is
-- governed by RLS. When is_admin() returns false (email mismatch
-- between VITE_ADMIN_EMAIL and the auth token), the UPDATE is
-- silently dropped — error is null, 0 rows updated, but the
-- success toast fires anyway.
--
-- This SECURITY DEFINER function bypasses RLS entirely.
-- is_admin() is re-checked *inside* the function as the auth guard.
--
-- SAFE TO RE-RUN (CREATE OR REPLACE).
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run.
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
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'permission denied: admin only' USING ERRCODE = '42501';
  END IF;

  IF p_role NOT IN ('agent', 'team_lead', 'admin') THEN
    RAISE EXCEPTION 'invalid role: %', p_role USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles
  SET
    role         = p_role::public.user_role,
    team_lead_id = p_team_lead_id,
    -- NULL p_status means "preserve current status" (used for role-only changes).
    -- Passing 'active' promotes a pending user during approval.
    status       = COALESCE(p_status::public.profile_status, status)
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found: %', p_user_id USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL   ON FUNCTION public.admin_update_profile(uuid, text, uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_update_profile(uuid, text, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.admin_update_profile IS
  'Admin-only: set role, team_lead, and optionally status on any profile. '
  'SECURITY DEFINER bypasses RLS. is_admin() enforces auth inside.';

-- ── Verification ─────────────────────────────────────────────────────────────
-- Expected: anon_can_call = false, auth_can_call = true
SELECT
  proname,
  prosecdef                                                     AS is_security_definer,
  has_function_privilege('anon',          oid, 'execute')       AS anon_can_call,
  has_function_privilege('authenticated', oid, 'execute')       AS auth_can_call
FROM pg_proc
WHERE proname = 'admin_update_profile'
  AND pronamespace = 'public'::regnamespace;
