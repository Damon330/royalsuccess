-- ============================================================
-- Royal Success — admin_delete_phone RPC
--
-- ROOT CAUSE of delete failure:
--   receipts.phone_id references phones(id) WITHOUT ON DELETE CASCADE.
--   When Postgres tries to delete a sold phone the receipt row blocks
--   it with a FK violation. sales.phone_id DOES have ON DELETE CASCADE,
--   but receipts.phone_id does not.
--
-- FIX:
--   SECURITY DEFINER RPC that:
--     1. Checks caller is admin.
--     2. Deletes all receipts for this phone (no cascade, must be explicit).
--     3. Deletes the phone — Postgres cascades to sales automatically.
--
-- SAFE TO RE-RUN.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_delete_phone(p_phone_id uuid)
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

  -- receipts.phone_id has no ON DELETE CASCADE, so handle it explicitly.
  DELETE FROM public.receipts WHERE phone_id = p_phone_id;

  -- Phone delete cascades to sales (ON DELETE CASCADE is set on sales.phone_id).
  DELETE FROM public.phones WHERE id = p_phone_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'phone not found: %', p_phone_id USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL   ON FUNCTION public.admin_delete_phone(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_delete_phone(uuid) TO authenticated;
