-- ============================================================
-- Royal Success — Stale Device Settings: complete setup
-- Supabase Dashboard → SQL Editor → New Query → paste → Run
-- ============================================================

-- ── 0. Create table (wrapped so permission errors are handled) ─
DO $$
BEGIN
  BEGIN
    EXECUTE '
      CREATE TABLE IF NOT EXISTS public.stale_device_settings (
        id             text        PRIMARY KEY DEFAULT ''default'' CHECK (id = ''default''),
        agent_days     integer     NOT NULL DEFAULT 3  CHECK (agent_days BETWEEN 1 AND 90),
        team_lead_days integer     NOT NULL DEFAULT 14 CHECK (team_lead_days BETWEEN 1 AND 90),
        updated_at     timestamptz NOT NULL DEFAULT now(),
        updated_by     uuid        REFERENCES public.profiles(id) ON DELETE SET NULL
      )
    ';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'Cannot create table (permission denied) — create it manually in Table Editor first, then re-run this SQL.';
    WHEN OTHERS THEN
      RAISE NOTICE 'Table notice: %', SQLERRM;
  END;
END;
$$;

-- ── 1. Default row ─────────────────────────────────────────
INSERT INTO public.stale_device_settings (id, agent_days, team_lead_days)
VALUES ('default', 3, 14)
ON CONFLICT (id) DO NOTHING;

-- ── 2. RLS ─────────────────────────────────────────────────
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

-- ── 3. SECURITY DEFINER RPC ────────────────────────────────
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
  ON CONFLICT (id) DO UPDATE SET
    agent_days     = EXCLUDED.agent_days,
    team_lead_days = EXCLUDED.team_lead_days,
    updated_at     = EXCLUDED.updated_at,
    updated_by     = EXCLUDED.updated_by;
END;
$$;

REVOKE ALL    ON FUNCTION public.upsert_stale_device_settings(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_stale_device_settings(integer, integer) TO authenticated;

-- ── 4. Verify ──────────────────────────────────────────────
SELECT
  id,
  agent_days,
  team_lead_days,
  'Setup complete' AS status
FROM public.stale_device_settings
WHERE id = 'default';
