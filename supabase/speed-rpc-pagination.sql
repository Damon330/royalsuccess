-- ============================================================
-- Royal Success speed hardening: paginated admin inventory RPC
-- Run this in Supabase SQL Editor after the main migrations.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION public.admin_get_phones_page(
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0,
  p_status text DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  model text,
  barcode text,
  imei text,
  serial_number text,
  status public.phone_status,
  assigned_to uuid,
  assigned_at timestamptz,
  sold_at timestamptz,
  created_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_search text := NULLIF(BTRIM(p_search), '');
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'permission denied: admin only' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT p.*
    FROM public.phones p
    WHERE
      (p_status IS NULL OR p_status = 'all' OR p.status::text = p_status)
      AND (
        v_search IS NULL
        OR p.model ILIKE '%' || v_search || '%'
        OR p.imei ILIKE '%' || v_search || '%'
        OR p.serial_number ILIKE '%' || v_search || '%'
        OR p.barcode ILIKE '%' || v_search || '%'
      )
  ),
  counted AS (
    SELECT COUNT(*)::bigint AS total_count FROM filtered
  )
  SELECT
    f.id,
    f.model,
    f.barcode,
    f.imei,
    f.serial_number,
    f.status,
    f.assigned_to,
    f.assigned_at,
    f.sold_at,
    f.created_at,
    c.total_count
  FROM filtered f
  CROSS JOIN counted c
  ORDER BY f.created_at DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_phones_page(integer, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_phones_page(integer, integer, text, text) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_phones_created_at_desc ON public.phones (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_phones_status_created_at ON public.phones (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_phones_model_trgm ON public.phones USING gin (model gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_phones_imei_trgm ON public.phones USING gin (imei gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_phones_serial_trgm ON public.phones USING gin (serial_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_phones_barcode_trgm ON public.phones USING gin (barcode gin_trgm_ops);
