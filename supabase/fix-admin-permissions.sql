-- ============================================================
-- Royal Success — Fix Admin Permissions (run once in Supabase SQL Editor)
--
-- ROOT CAUSE FIXED:
--   is_admin() returned NULL (not false) for the real admin because
--   auth.email() = ANY(ARRAY[NULL, 'patrickwlax@gmail.com']) evaluates
--   to NULL in SQL when app.admin_email is unset — RLS treats NULL as
--   false, blocking all admin writes silently.
--
-- WHAT THIS FILE DOES:
--   1. Replaces is_admin() with a profiles-table check — works for any
--      admin email on any deployment, no env-var configuration needed.
--   2. Fixes health_check() is_admin field to match the new logic.
--   3. Adds SECURITY DEFINER RPCs for all phone write operations so they
--      bypass RLS entirely (belt-and-suspenders — survives any future
--      is_admin() drift).
--   4. Creates admin_get_phones_page() if missing (used by inventory
--      pagination — fixes the "Failed to fetch" / PGRST202 errors).
--   5. Fixes admin_update_profile() overload ambiguity so approving/editing
--      a user doesn't fail with "Could not choose the best candidate function".
--
-- SAFE TO RE-RUN — all statements use CREATE OR REPLACE / IF NOT EXISTS.
-- ============================================================


-- ── 1. Fix is_admin() ─────────────────────────────────────────────────────────
-- Old: email comparison against a DB setting that was never set.
-- New: profiles-table check — authoritative, no email config required.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;
COMMENT ON FUNCTION public.is_admin() IS
  'Returns true if the caller has role=admin in their profiles row. '
  'SECURITY DEFINER + STABLE (cached per statement). Safe in RLS USING clauses.';


-- ── 2. Fix health_check() ─────────────────────────────────────────────────────
-- Returns is_admin=true now that is_admin() uses the profiles table.
CREATE OR REPLACE FUNCTION public.health_check()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT jsonb_build_object(
    'ok',         true,
    'auth_email', COALESCE(auth.email(), 'unauthenticated'),
    'is_admin',   EXISTS (
                    SELECT 1 FROM public.profiles
                    WHERE id = auth.uid() AND role = 'admin'
                  ),
    'ts',         EXTRACT(EPOCH FROM now())::bigint
  )
$$;

GRANT EXECUTE ON FUNCTION public.health_check() TO authenticated, anon;


-- ── 3. SECURITY DEFINER RPC — insert a single phone ──────────────────────────
CREATE OR REPLACE FUNCTION public.admin_insert_phone(
  p_model         text,
  p_serial_number text,
  p_barcode       text DEFAULT NULL,
  p_imei          text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'permission denied: admin only' USING ERRCODE = '42501';
  END IF;

  INSERT INTO phones (model, serial_number, barcode, imei, status)
  VALUES (
    p_model,
    p_serial_number,
    NULLIF(TRIM(COALESCE(p_barcode, '')), ''),
    NULLIF(TRIM(COALESCE(p_imei,    '')), ''),
    'in_stock'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_insert_phone(text, text, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_insert_phone(text, text, text, text) TO authenticated;
COMMENT ON FUNCTION public.admin_insert_phone(text, text, text, text) IS
  'Admin-only: insert a single phone bypassing RLS. '
  'Auth: profiles.role=admin check inside SECURITY DEFINER.';


-- ── 4. SECURITY DEFINER RPC — bulk insert phones ─────────────────────────────
-- p_rows: JSON array of {model, serial_number, barcode?, imei?}
CREATE OR REPLACE FUNCTION public.admin_insert_phones_bulk(p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'permission denied: admin only' USING ERRCODE = '42501';
  END IF;

  INSERT INTO phones (model, serial_number, barcode, imei, status)
  SELECT
    r->>'model',
    r->>'serial_number',
    NULLIF(TRIM(COALESCE(r->>'barcode', '')), ''),
    NULLIF(TRIM(COALESCE(r->>'imei',    '')), ''),
    'in_stock'
  FROM jsonb_array_elements(p_rows) AS r
  WHERE (r->>'model') IS NOT NULL
    AND (r->>'serial_number') IS NOT NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_insert_phones_bulk(jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_insert_phones_bulk(jsonb) TO authenticated;
COMMENT ON FUNCTION public.admin_insert_phones_bulk(jsonb) IS
  'Admin-only: bulk insert phones bypassing RLS. Returns count of rows inserted.';


-- ── 5. SECURITY DEFINER RPC — update phone model ─────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_update_phone(
  p_phone_id uuid,
  p_model    text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'permission denied: admin only' USING ERRCODE = '42501';
  END IF;

  UPDATE phones SET model = p_model WHERE id = p_phone_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_phone(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_update_phone(uuid, text) TO authenticated;
COMMENT ON FUNCTION public.admin_update_phone(uuid, text) IS
  'Admin-only: update phone model bypassing RLS.';


-- ── 6. SECURITY DEFINER RPC — paginated inventory ────────────────────────────
-- Used by useInventoryPage.ts. Fixes "Failed to fetch" / PGRST202 errors when
-- the function is missing from the database.
--
-- LANGUAGE sql (not plpgsql) is intentional: in plpgsql, RETURNS TABLE output
-- parameters (id, model, …) shadow same-named columns inside the query body,
-- causing "column reference 'id' is ambiguous". LANGUAGE sql has no such scope
-- — output parameter names never enter the query namespace.
--
-- Drop first: Postgres refuses to CREATE OR REPLACE a function when the
-- RETURNS TABLE column list differs from what's already defined ("cannot
-- change return type of existing function"). An earlier version of this
-- function returned a different set/order of columns.
DROP FUNCTION IF EXISTS public.admin_get_phones_page(integer, integer, text, text);

CREATE OR REPLACE FUNCTION public.admin_get_phones_page(
  p_limit  integer DEFAULT 25,
  p_offset integer DEFAULT 0,
  p_status text    DEFAULT NULL,
  p_search text    DEFAULT NULL
)
RETURNS TABLE (
  id            uuid,
  model         text,
  serial_number text,
  barcode       text,
  imei          text,
  status        text,
  assigned_to   uuid,
  assigned_at   timestamptz,
  sold_at       timestamptz,
  created_at    timestamptz,
  total_count   bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    ph.id,
    ph.model,
    ph.serial_number,
    ph.barcode,
    ph.imei,
    ph.status::text,
    ph.assigned_to,
    ph.assigned_at,
    ph.sold_at,
    ph.created_at,
    COUNT(*) OVER ()::bigint
  FROM phones ph
  WHERE
    -- Auth guard: returns zero rows for non-admins (no error, safe for RLS)
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
    AND (p_status IS NULL OR ph.status::text = p_status)
    AND (
      p_search IS NULL
      OR ph.model         ILIKE '%' || p_search || '%'
      OR ph.imei          ILIKE '%' || p_search || '%'
      OR ph.serial_number ILIKE '%' || p_search || '%'
      OR ph.barcode       ILIKE '%' || p_search || '%'
    )
  ORDER BY ph.created_at DESC
  LIMIT  p_limit
  OFFSET p_offset;
$$;

REVOKE ALL ON FUNCTION public.admin_get_phones_page(integer, integer, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_get_phones_page(integer, integer, text, text) TO authenticated;
COMMENT ON FUNCTION public.admin_get_phones_page(integer, integer, text, text) IS
  'Admin-only: paginated phone list with window-function total_count. '
  'Uses LANGUAGE sql to avoid RETURNS TABLE column-name ambiguity with plpgsql. '
  'Used by useInventoryPage for server-side pagination.';


-- ── 7. SECURITY DEFINER RPC — delete phone (handles sold phones) ──────────────
-- FIX: receipts.phone_id has no ON DELETE CASCADE, so deleting a sold phone
-- fails with a FK violation. Delete receipts first, then phones; sales and
-- returns cascade automatically.
CREATE OR REPLACE FUNCTION public.admin_delete_phone(p_phone_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'permission denied: admin only' USING ERRCODE = '42501';
  END IF;

  DELETE FROM receipts WHERE phone_id = p_phone_id;
  DELETE FROM phones   WHERE id       = p_phone_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_phone(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_delete_phone(uuid) TO authenticated;
COMMENT ON FUNCTION public.admin_delete_phone(uuid) IS
  'Admin-only: delete phone from inventory. Explicitly deletes receipts first '
  'because receipts.phone_id has no ON DELETE CASCADE. Sales/returns cascade automatically.';


-- ── 8. SECURITY DEFINER RPC — approve / update a profile ─────────────────────
-- Called by approveUser() and updateRole() in useProfiles.ts.
--
-- Drop any pre-existing overloads first. CREATE OR REPLACE only replaces a
-- function with an IDENTICAL signature — an earlier version of this function
-- declared p_status/p_team_lead_id in the opposite order, so Postgres kept
-- both as separate overloads instead of replacing one. Calling the RPC with
-- named arguments then became ambiguous: "Could not choose the best candidate
-- function". Dropping both possible orderings up front guarantees only one
-- definition survives.
DROP FUNCTION IF EXISTS public.admin_update_profile(uuid, text, text, uuid);
DROP FUNCTION IF EXISTS public.admin_update_profile(uuid, text, uuid, text);

CREATE OR REPLACE FUNCTION public.admin_update_profile(
  p_user_id      uuid,
  p_role         text,
  p_status       text DEFAULT NULL,
  p_team_lead_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'permission denied: admin only' USING ERRCODE = '42501';
  END IF;

  UPDATE profiles
  SET
    role         = p_role::user_role,
    status       = COALESCE(p_status::profile_status, status),
    team_lead_id = p_team_lead_id
  WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_profile(uuid, text, text, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_update_profile(uuid, text, text, uuid) TO authenticated;
COMMENT ON FUNCTION public.admin_update_profile(uuid, text, text, uuid) IS
  'Admin-only: approve or update a user profile. SECURITY DEFINER bypasses RLS. '
  'Auth: checks profiles.role=admin — no email matching required.';
