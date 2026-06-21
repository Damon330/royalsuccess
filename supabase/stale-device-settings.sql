-- ============================================================
-- Royal Success - Configurable stale-device thresholds
--
-- Safe to run repeatedly in the Supabase SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.stale_device_settings (
  id             text        PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  agent_days     integer     NOT NULL DEFAULT 3  CHECK (agent_days BETWEEN 1 AND 90),
  team_lead_days integer     NOT NULL DEFAULT 14 CHECK (team_lead_days BETWEEN 1 AND 90),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     uuid        REFERENCES public.profiles(id) ON DELETE SET NULL
);

INSERT INTO public.stale_device_settings (id, agent_days, team_lead_days)
VALUES ('default', 3, 14)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.stale_device_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stale_settings_read" ON public.stale_device_settings;
DROP POLICY IF EXISTS "stale_settings_admin_insert" ON public.stale_device_settings;
DROP POLICY IF EXISTS "stale_settings_admin_update" ON public.stale_device_settings;

CREATE POLICY "stale_settings_read" ON public.stale_device_settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "stale_settings_admin_insert" ON public.stale_device_settings
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY "stale_settings_admin_update" ON public.stale_device_settings
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT ON public.stale_device_settings TO authenticated;
GRANT INSERT, UPDATE ON public.stale_device_settings TO authenticated;

-- Team overview must use the same thresholds as every client dashboard.
CREATE OR REPLACE FUNCTION public.admin_team_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_result         jsonb;
  v_agent_days     integer := 3;
  v_team_lead_days integer := 14;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'permission denied: admin only' USING ERRCODE = '42501';
  END IF;

  SELECT agent_days, team_lead_days
  INTO v_agent_days, v_team_lead_days
  FROM stale_device_settings
  WHERE id = 'default';

  v_agent_days := COALESCE(v_agent_days, 3);
  v_team_lead_days := COALESCE(v_team_lead_days, 14);

  SELECT jsonb_agg(row_to_json(t)) INTO v_result
  FROM (
    SELECT
      p.id,
      p.full_name,
      p.role,
      p.status,
      p.team_lead_id,
      p.created_at,
      COUNT(ph.id) AS assigned_count,
      COUNT(ph.id) FILTER (WHERE ph.status = 'sold') AS sold_count,
      COUNT(ph.id) FILTER (WHERE ph.status = 'assigned') AS active_count,
      COUNT(ph.id) FILTER (
        WHERE ph.status = 'assigned'
          AND ph.assigned_at IS NOT NULL
          AND (
            (p.role = 'agent' AND ph.assigned_at < NOW() - (v_agent_days || ' days')::interval)
            OR
            (p.role = 'team_lead' AND ph.assigned_at < NOW() - (v_team_lead_days || ' days')::interval)
          )
      ) AS stale_phone_count,
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
GRANT EXECUTE ON FUNCTION public.admin_team_overview() TO authenticated;
