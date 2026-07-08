-- Run once in Supabase → SQL Editor
--
-- Adds admin_delete_phone() — SECURITY DEFINER bypasses RLS entirely.
-- Called by deletePhone() in usePhones.ts.
--
-- Auth check: caller's profiles row must have role = 'admin'.
-- Does NOT depend on is_admin() or email matching — works on any deployment.

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

  -- receipts.phone_id has no ON DELETE CASCADE, so delete receipts first.
  -- sales and returns both have ON DELETE CASCADE and are handled automatically.
  DELETE FROM receipts WHERE phone_id = p_phone_id;
  DELETE FROM phones   WHERE id       = p_phone_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_phone(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_delete_phone(uuid) TO authenticated;
COMMENT ON FUNCTION public.admin_delete_phone(uuid) IS
  'Admin-only: delete a phone from inventory. SECURITY DEFINER bypasses RLS. '
  'Auth: checks profiles.role=admin — no email matching required.';
