-- ============================================================
-- Royal Success — Fix stale device settings (all-in-one)
--
-- Fixes:
--   1. "permission denied for schema public" — grants schema
--      access before creating any objects.
--   2. Creates stale_device_settings table if it doesn't exist.
--   3. Creates upsert_stale_device_settings() SECURITY DEFINER
--      RPC so the Save button bypasses RLS entirely.
--   4. Updates INSERT/UPDATE policies to use dual-check
--      (is_admin OR profiles.role=admin).
--
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to re-run.
-- ============================================================

-- ── 0. Fix schema permissions (required in newer Supabase projects) ──
GRANT USAGE, CREATE ON SCHEMA public TO postgres;
GRANT USAGE, CREATE ON SCHEMA public TO authenticated;
GRANT USAGE, CREATE ON SCHEMA public TO anon;
GRANT USAGE, CREATE ON SCHEMA public TO service_role;

-- ── 1. Create table if it doesn't exist ────────────────────────────

CREATE TABLE IF NOT EXISTS public.stale_device_settings (
  id             text        PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  agent_days     integer     NOT NULL DEFAULT 3  CHECK (agent_days BETWEEN 1 AND 90),
  team_lead_days integer     NOT NULL DEFAULT 14 CHECK (team_lead_days BETWEEN 1 AND 90),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid        REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Insert default row if none exists
INSERT INTO public.stale_device_settings (id, agent_days, team_lead_days)
VALUES ('default', 3, 14)
ON CONFLICT (id) DO NOTHING;

-- ── 2. Enable RLS and fix policies with dual-check ─────────────────

ALTER TABLE public.stale_device_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stale_settings_read"         ON public.stale_device_settings;
DROP POLICY IF EXISTS "stale_settings_admin_insert" ON public.stale_device_settings;
DROP POLICY IF EXISTS "stale_settings_admin_update" ON public.stale_device_settings;

-- Any authenticated user can read (non-sensitive config)
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

-- ── 3. Create SECURITY DEFINER RPC (bypasses RLS for the save) ─────

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

-- ── 4. Verification ────────────────────────────────────────────────
SELECT
  id,
  agent_days,
  team_lead_days,
  'table OK' AS status
FROM public.stale_device_settings
WHERE id = 'default';
