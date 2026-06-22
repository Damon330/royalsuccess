-- ============================================================
-- Royal Success — Fix stale device settings save
--
-- BEFORE RUNNING THIS:
--   Create the stale_device_settings table via Supabase
--   Dashboard → Table Editor → New Table (if it doesn't exist).
--   Columns: id (text PK default 'default'), agent_days (int4
--   default 3), team_lead_days (int4 default 14), updated_at
--   (timestamptz default now()), updated_by (uuid nullable).
--
-- This file only creates the RPC + policies (no CREATE TABLE).
-- Safe to re-run in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- ── 0. Ensure default row exists ───────────────────────────────────
INSERT INTO public.stale_device_settings (id, agent_days, team_lead_days)
VALUES ('default', 3, 14)
ON CONFLICT (id) DO NOTHING;

-- ── 1. RLS policies with dual-check ────────────────────────────────
ALTER TABLE public.stale_device_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stale_settings_read"         ON public.stale_device_settings;
DROP POLICY IF EXISTS "stale_settings_admin_insert" ON public.stale_device_settings;
DROP POLICY IF EXISTS "stale_settings_admin_update" ON public.stale_device_settings;

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

GRANT SELECT, INSERT, UPDATE ON public.stale_device_settings TO authenticated;

-- ── 2. SECURITY DEFINER RPC — bypasses RLS for admin save ──────────
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

-- ── 3. Verify ──────────────────────────────────────────────────────
SELECT
  id,
  agent_days,
  team_lead_days,
  'OK — stale settings ready' AS status
FROM public.stale_device_settings
WHERE id = 'default';
