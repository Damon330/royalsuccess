-- ============================================================
-- Royal Success — Fix stale device settings save
--
-- ROOT CAUSE:
--   stale_device_settings INSERT/UPDATE policies use only
--   is_admin(), so the admin account can't save if is_admin()
--   returns false (before fix-is-admin.sql is run).
--
-- FIX:
--   1. Create upsert_stale_device_settings() SECURITY DEFINER
--      RPC — bypasses RLS, checks admin via dual method.
--   2. Patch the SELECT / INSERT / UPDATE policies to use
--      dual-check (is_admin OR profiles.role=admin) so direct
--      table access also works after fix-is-admin.sql runs.
--
-- Safe to re-run.
-- ============================================================

-- ── 1. SECURITY DEFINER RPC (preferred code path) ──────────

CREATE OR REPLACE FUNCTION public.upsert_stale_device_settings(
  p_agent_days     integer,
  p_team_lead_days integer
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

  IF p_agent_days < 1 OR p_agent_days > 90 THEN
    RAISE EXCEPTION 'agent_days must be between 1 and 90' USING ERRCODE = '22023';
  END IF;

  IF p_team_lead_days < 1 OR p_team_lead_days > 90 THEN
    RAISE EXCEPTION 'team_lead_days must be between 1 and 90' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.stale_device_settings
    (id, agent_days, team_lead_days, updated_at, updated_by)
  VALUES
    ('default', p_agent_days, p_team_lead_days, now(), auth.uid())
  ON CONFLICT (id) DO UPDATE
  SET
    agent_days     = EXCLUDED.agent_days,
    team_lead_days = EXCLUDED.team_lead_days,
    updated_at     = EXCLUDED.updated_at,
    updated_by     = EXCLUDED.updated_by;
END;
$$;

REVOKE ALL   ON FUNCTION public.upsert_stale_device_settings(integer, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.upsert_stale_device_settings(integer, integer) TO authenticated;

-- ── 2. Patch RLS policies with dual-check ──────────────────
-- (belt-and-suspenders for any direct table access)

DROP POLICY IF EXISTS "stale_settings_read"          ON public.stale_device_settings;
DROP POLICY IF EXISTS "stale_settings_admin_insert"  ON public.stale_device_settings;
DROP POLICY IF EXISTS "stale_settings_admin_update"  ON public.stale_device_settings;

-- Any authenticated user can read (it is non-sensitive config)
CREATE POLICY "stale_settings_read" ON public.stale_device_settings
  FOR SELECT TO authenticated USING (true);

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

-- ── 3. Ensure default row exists ───────────────────────────
INSERT INTO public.stale_device_settings (id, agent_days, team_lead_days)
VALUES ('default', 3, 14)
ON CONFLICT (id) DO NOTHING;

SELECT 'upsert_stale_device_settings RPC created OK' AS result;
