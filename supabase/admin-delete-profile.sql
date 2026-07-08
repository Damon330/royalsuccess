-- Run this once in Supabase → SQL Editor
-- Atomically cleans up and deletes a user profile.
-- is_admin() is checked server-side so a non-admin can never call this.

CREATE OR REPLACE FUNCTION public.admin_delete_profile(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Unauthorised';
  END IF;

  -- Return all phones held by this user to warehouse stock.
  -- Without this, phones stay status='assigned' with assigned_to=NULL
  -- because the FK is ON DELETE SET NULL (not ON DELETE CASCADE).
  UPDATE phones
     SET status      = 'in_stock',
         assigned_to = NULL,
         assigned_at = NULL
   WHERE assigned_to = p_user_id;

  -- Detach any agents who report to this team lead.
  UPDATE profiles
     SET team_lead_id = NULL
   WHERE team_lead_id = p_user_id;

  -- Delete the profile. The auth.users row is NOT deleted here
  -- (that requires the service-role key / Supabase dashboard).
  -- The user can no longer access the app because every route
  -- requires a valid profile with status='active'.
  DELETE FROM profiles WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_profile(uuid) TO authenticated;
