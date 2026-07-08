-- ============================================================
-- Royal Success - Commercial Hardening Migration
--
-- Run this AFTER the existing migrations/fix scripts.
--
-- Fixes:
--   1. Users cannot self-promote or self-approve via direct Supabase calls.
--   2. Sales are completed atomically in the database.
--   3. Return requests and resolutions are guarded server-side.
--   4. Deleting an agent/team lead always returns held stock to warehouse.
--   5. Payroll admin policies use profiles.role=admin, not a hard-coded email.
--   6. Notifications cannot be forged directly by regular clients.
-- ============================================================

-- ---------- Admin helper ----------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
      AND status = 'active'
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;

-- ---------- Compatibility guards ----------
-- Some older installs created returns with requested_by/status instead of
-- returned_by/return_status. Normalize the live table before the guarded RPCs
-- reference those columns.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'returns'
      AND column_name = 'requested_by'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'returns'
      AND column_name = 'returned_by'
  ) THEN
    ALTER TABLE public.returns RENAME COLUMN requested_by TO returned_by;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'returns'
      AND column_name = 'status'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'returns'
      AND column_name = 'return_status'
  ) THEN
    ALTER TABLE public.returns RENAME COLUMN status TO return_status;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'returns'
  ) THEN
    ALTER TABLE public.returns
      ADD COLUMN IF NOT EXISTS original_sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS notes text,
      ADD COLUMN IF NOT EXISTS rejection_note text,
      ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
  END IF;
END;
$$;

-- ---------- Profile self-update guard ----------
CREATE OR REPLACE FUNCTION public.profile_self_update_allowed(
  p_id uuid,
  p_role public.user_role,
  p_status public.profile_status,
  p_team_lead_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.id = p_id
      AND p.role = p_role
      AND p.status = p_status
      AND p.team_lead_id IS NOT DISTINCT FROM p_team_lead_id
  )
$$;

GRANT EXECUTE ON FUNCTION public.profile_self_update_allowed(uuid, public.user_role, public.profile_status, uuid)
TO authenticated;

DROP POLICY IF EXISTS "profiles_self_update" ON public.profiles;
CREATE POLICY "profiles_self_update" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (public.profile_self_update_allowed(id, role, status, team_lead_id));

-- ---------- Atomic sale completion ----------
CREATE OR REPLACE FUNCTION public.complete_phone_sale(
  p_phone_id uuid,
  p_buyer_name text,
  p_buyer_phone text,
  p_agreed_price numeric,
  p_payment_method text
)
RETURNS TABLE (
  sale_id uuid,
  receipt_id uuid,
  receipt_number text,
  generated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor public.profiles%ROWTYPE;
  v_phone public.phones%ROWTYPE;
  v_sale_id uuid;
  v_receipt_id uuid;
  v_receipt_number text;
  v_generated_at timestamptz;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_actor
  FROM public.profiles
  WHERE id = v_actor_id
    AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'active profile required' USING ERRCODE = '42501';
  END IF;

  IF p_buyer_name IS NULL OR length(trim(p_buyer_name)) < 2 THEN
    RAISE EXCEPTION 'buyer name is required' USING ERRCODE = '22023';
  END IF;

  IF p_buyer_phone IS NULL OR p_buyer_phone !~ '^(070|080|081|090|091)[0-9]{8}$' THEN
    RAISE EXCEPTION 'valid Nigerian buyer phone is required' USING ERRCODE = '22023';
  END IF;

  IF p_agreed_price IS NULL OR p_agreed_price <= 0 THEN
    RAISE EXCEPTION 'sale price must be greater than zero' USING ERRCODE = '22023';
  END IF;

  IF p_payment_method NOT IN ('CASH', 'TRANSFER', 'POS') THEN
    RAISE EXCEPTION 'invalid payment method' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_phone
  FROM public.phones
  WHERE id = p_phone_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'phone not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_phone.assigned_to IS DISTINCT FROM v_actor_id OR v_phone.status <> 'assigned' THEN
    RAISE EXCEPTION 'phone is not assigned to this user' USING ERRCODE = '42501';
  END IF;

  UPDATE public.phones
  SET status = 'sold',
      sold_at = now()
  WHERE id = p_phone_id
    AND status = 'assigned'
    AND assigned_to = v_actor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'phone sale conflict; refresh and try again' USING ERRCODE = '40001';
  END IF;

  INSERT INTO public.sales (
    phone_id, sold_by, sold_at, buyer_name, buyer_phone, agreed_price, payment_method
  )
  VALUES (
    p_phone_id, v_actor_id, now(), trim(p_buyer_name), p_buyer_phone,
    round(p_agreed_price::numeric, 2), p_payment_method
  )
  RETURNING id INTO v_sale_id;

  INSERT INTO public.receipts (
    sale_id, phone_id, agent_id, buyer_name, buyer_phone, selling_price, payment_method
  )
  VALUES (
    v_sale_id, p_phone_id, v_actor_id, trim(p_buyer_name), p_buyer_phone,
    round(p_agreed_price::numeric, 2), p_payment_method
  )
  RETURNING receipts.id, receipts.receipt_number, receipts.generated_at
  INTO v_receipt_id, v_receipt_number, v_generated_at;

  INSERT INTO public.activity_log (
    actor_id, actor_name, role, action_type, entity_type, entity_id, entity_label,
    meta, team_lead_id, agent_id
  )
  VALUES (
    v_actor_id,
    v_actor.full_name,
    v_actor.role::text,
    'SALE_RECORDED',
    'phone',
    p_phone_id,
    v_phone.model || ' / ' || COALESCE(v_phone.imei, v_phone.barcode, v_phone.serial_number),
    jsonb_build_object(
      'model', v_phone.model,
      'imei', v_phone.imei,
      'price', p_agreed_price,
      'payment', p_payment_method,
      'buyer', trim(p_buyer_name),
      'receipt_number', v_receipt_number
    ),
    CASE WHEN v_actor.role = 'team_lead' THEN v_actor.id ELSE v_actor.team_lead_id END,
    CASE WHEN v_actor.role = 'agent' THEN v_actor.id ELSE NULL END
  );

  INSERT INTO public.activity_log (
    actor_id, actor_name, role, action_type, entity_type, entity_id, entity_label,
    meta, team_lead_id, agent_id
  )
  VALUES (
    v_actor_id,
    v_actor.full_name,
    v_actor.role::text,
    'RECEIPT_GENERATED',
    'receipt',
    v_receipt_id,
    v_receipt_number,
    '{}'::jsonb,
    CASE WHEN v_actor.role = 'team_lead' THEN v_actor.id ELSE v_actor.team_lead_id END,
    CASE WHEN v_actor.role = 'agent' THEN v_actor.id ELSE NULL END
  );

  PERFORM public.notify_on_sale(
    v_sale_id,
    v_actor_id,
    v_actor.full_name,
    v_phone.model || ' / ' || COALESCE(v_phone.imei, v_phone.barcode, v_phone.serial_number),
    p_agreed_price,
    p_payment_method
  );

  RETURN QUERY SELECT v_sale_id, v_receipt_id, v_receipt_number, v_generated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_phone_sale(uuid, text, text, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_phone_sale(uuid, text, text, numeric, text) TO authenticated;

-- Sales must be created only through complete_phone_sale() so phone status,
-- receipt, activity, and notifications cannot drift apart.
DROP POLICY IF EXISTS "sales_insert_own" ON public.sales;

-- ---------- Guarded return workflow ----------
CREATE OR REPLACE FUNCTION public.submit_phone_return(
  p_phone_id uuid,
  p_reason text,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor public.profiles%ROWTYPE;
  v_phone public.phones%ROWTYPE;
  v_return_id uuid;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_actor FROM public.profiles WHERE id = v_actor_id AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'active profile required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_phone FROM public.phones WHERE id = p_phone_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'phone not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_phone.assigned_to IS DISTINCT FROM v_actor_id OR v_phone.status <> 'assigned' THEN
    RAISE EXCEPTION 'phone is not assigned to this user' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.returns (
    phone_id, original_sale_id, returned_by, return_reason, return_status, notes
  )
  VALUES (
    p_phone_id, NULL, v_actor_id, COALESCE(NULLIF(trim(p_reason), ''), 'Other'),
    'PENDING', NULLIF(trim(COALESCE(p_notes, '')), '')
  )
  RETURNING id INTO v_return_id;

  UPDATE public.phones
  SET status = 'returned'
  WHERE id = p_phone_id;

  INSERT INTO public.activity_log (
    actor_id, actor_name, role, action_type, entity_type, entity_id, entity_label,
    meta, team_lead_id, agent_id
  )
  VALUES (
    v_actor_id,
    v_actor.full_name,
    v_actor.role::text,
    'SALE_RETURNED',
    'phone',
    p_phone_id,
    v_phone.model || ' / ' || COALESCE(v_phone.imei, v_phone.serial_number),
    jsonb_build_object('reason', p_reason, 'status', 'PENDING'),
    CASE WHEN v_actor.role = 'team_lead' THEN v_actor.id ELSE v_actor.team_lead_id END,
    CASE WHEN v_actor.role = 'agent' THEN v_actor.id ELSE NULL END
  );

  IF v_actor.team_lead_id IS NOT NULL THEN
    PERFORM public.send_notification(
      v_actor.team_lead_id,
      'RETURN_REQUESTED',
      'Return Request',
      v_actor.full_name || ' submitted a return for ' || v_phone.model || '. Reason: ' || p_reason,
      NULL
    );
  END IF;

  RETURN v_return_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_phone_return(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_phone_return(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_phone_return(
  p_return_id uuid,
  p_status text,
  p_rejection_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor public.profiles%ROWTYPE;
  v_ret public.returns%ROWTYPE;
  v_phone public.phones%ROWTYPE;
  v_is_damaged boolean;
  v_phone_status text;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_actor FROM public.profiles WHERE id = v_actor_id AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'active profile required' USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('APPROVED', 'REJECTED') THEN
    RAISE EXCEPTION 'invalid return status' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_ret
  FROM public.returns
  WHERE id = p_return_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'return not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_ret.return_status <> 'PENDING' THEN
    RAISE EXCEPTION 'return is already resolved' USING ERRCODE = '22023';
  END IF;

  IF NOT public.is_admin()
     AND NOT EXISTS (
       SELECT 1
       FROM public.profiles p
       WHERE p.id = v_ret.returned_by
         AND p.team_lead_id = v_actor_id
     ) THEN
    RAISE EXCEPTION 'permission denied: cannot resolve this return' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_phone
  FROM public.phones
  WHERE id = v_ret.phone_id
  FOR UPDATE;

  IF p_status = 'APPROVED' THEN
    v_is_damaged := v_ret.return_reason ~* 'damaged|defective';
    v_phone_status := CASE WHEN v_is_damaged THEN 'damaged' ELSE 'in_stock' END;

    UPDATE public.returns
    SET return_status = 'APPROVED',
        approved_by = v_actor_id,
        resolved_at = now()
    WHERE id = p_return_id;

    UPDATE public.phones
    SET status = v_phone_status::public.phone_status,
        assigned_to = CASE WHEN v_is_damaged THEN v_ret.returned_by ELSE NULL END,
        assigned_at = NULL
    WHERE id = v_ret.phone_id;

    INSERT INTO public.activity_log (
      actor_id, actor_name, role, action_type, entity_type, entity_id, entity_label, meta
    )
    VALUES (
      v_actor_id,
      v_actor.full_name,
      v_actor.role::text,
      'PHONE_UNASSIGNED',
      'phone',
      v_ret.phone_id,
      COALESCE(v_phone.model, v_ret.phone_id::text),
      jsonb_build_object('action', 'RETURN_APPROVED', 'return_id', p_return_id)
    );

    PERFORM public.send_notification(
      v_ret.returned_by,
      'RETURN_APPROVED',
      'Return Approved',
      'Your return request for ' || COALESCE(v_phone.model, 'the phone') ||
      ' was approved by ' || v_actor.full_name || '.',
      NULL
    );
  ELSE
    UPDATE public.returns
    SET return_status = 'REJECTED',
        approved_by = v_actor_id,
        resolved_at = now(),
        rejection_note = NULLIF(trim(COALESCE(p_rejection_note, '')), '')
    WHERE id = p_return_id;

    UPDATE public.phones
    SET status = 'assigned'
    WHERE id = v_ret.phone_id;

    PERFORM public.send_notification(
      v_ret.returned_by,
      'RETURN_REJECTED',
      'Return Rejected',
      'Your return request was rejected by ' || v_actor.full_name ||
      CASE WHEN NULLIF(trim(COALESCE(p_rejection_note, '')), '') IS NULL
        THEN '.'
        ELSE '. Reason: ' || trim(p_rejection_note)
      END,
      NULL
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_phone_return(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_phone_return(uuid, text, text) TO authenticated;

-- Returns must be created/resolved only through guarded RPCs.
DROP POLICY IF EXISTS "returns_agent_insert" ON public.returns;
DROP POLICY IF EXISTS "returns_insert_own" ON public.returns;
DROP POLICY IF EXISTS "returns_teamlead_update_agents" ON public.returns;

-- ---------- Reliable user deletion / stock return ----------
CREATE OR REPLACE FUNCTION public.admin_delete_profile(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission denied: admin only' USING ERRCODE = '42501';
  END IF;

  -- Return every phone directly held by the deleted user.
  UPDATE public.phones
  SET status = 'in_stock',
      assigned_to = NULL,
      assigned_at = NULL
  WHERE assigned_to = p_user_id
    AND status IN ('assigned', 'returned', 'damaged');

  -- If deleting a team lead, also return all phones held by their agents and
  -- detach those agents. This avoids orphaned "on field" stock.
  UPDATE public.phones ph
  SET status = 'in_stock',
      assigned_to = NULL,
      assigned_at = NULL
  WHERE ph.assigned_to IN (
    SELECT id FROM public.profiles WHERE team_lead_id = p_user_id
  )
    AND ph.status IN ('assigned', 'returned', 'damaged');

  UPDATE public.profiles
  SET team_lead_id = NULL
  WHERE team_lead_id = p_user_id;

  DELETE FROM public.profiles WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_profile(uuid) TO authenticated;

-- One-time repair for stock already orphaned by a previous profile delete.
UPDATE public.phones
SET status = 'in_stock',
    assigned_to = NULL,
    assigned_at = NULL
WHERE assigned_to IS NULL
  AND status IN ('assigned', 'returned', 'damaged');

CREATE OR REPLACE FUNCTION public.admin_repair_orphaned_stock()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission denied: admin only' USING ERRCODE = '42501';
  END IF;

  UPDATE public.phones
  SET status = 'in_stock',
      assigned_to = NULL,
      assigned_at = NULL
  WHERE assigned_to IS NULL
    AND status IN ('assigned', 'returned', 'damaged');

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_repair_orphaned_stock() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_repair_orphaned_stock() TO authenticated;

-- Receipt rows are created by complete_phone_sale(). The client may only attach
-- a generated PDF URL through this narrow RPC.
CREATE OR REPLACE FUNCTION public.update_receipt_pdf_url(
  p_receipt_id uuid,
  p_pdf_url text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  IF p_pdf_url IS NULL OR p_pdf_url !~ '^https?://' THEN
    RAISE EXCEPTION 'valid pdf_url is required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.receipts
  SET pdf_url = p_pdf_url
  WHERE id = p_receipt_id
    AND (
      agent_id = v_user_id
      OR public.is_admin()
      OR agent_id IN (
        SELECT id FROM public.profiles WHERE team_lead_id = v_user_id
      )
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'receipt not found or permission denied' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_receipt_pdf_url(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_receipt_pdf_url(uuid, text) TO authenticated;

DROP POLICY IF EXISTS "receipts_agent_insert" ON public.receipts;
DROP POLICY IF EXISTS "receipts_agent_update_own" ON public.receipts;

-- ---------- Guarded stock assignment / unassignment ----------
CREATE OR REPLACE FUNCTION public.assign_phones_to_user(
  p_phone_ids uuid[],
  p_user_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor public.profiles%ROWTYPE;
  v_count integer;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_actor FROM public.profiles WHERE id = v_actor_id AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'active profile required' USING ERRCODE = '42501';
  END IF;

  IF p_phone_ids IS NULL OR array_length(p_phone_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  IF v_actor.role = 'admin' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = p_user_id AND status = 'active' AND role <> 'admin'
    ) THEN
      RAISE EXCEPTION 'assignee must be an active non-admin user' USING ERRCODE = '22023';
    END IF;

    UPDATE public.phones
    SET status = 'assigned',
        assigned_to = p_user_id,
        assigned_at = now()
    WHERE id = ANY(p_phone_ids)
      AND status = 'in_stock'
      AND assigned_to IS NULL;
  ELSIF v_actor.role = 'team_lead' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = p_user_id
        AND status = 'active'
        AND role = 'agent'
        AND team_lead_id = v_actor_id
    ) THEN
      RAISE EXCEPTION 'team leads can assign only to their active agents' USING ERRCODE = '42501';
    END IF;

    UPDATE public.phones
    SET status = 'assigned',
        assigned_to = p_user_id,
        assigned_at = now()
    WHERE id = ANY(p_phone_ids)
      AND status = 'assigned'
      AND assigned_to = v_actor_id;
  ELSE
    RAISE EXCEPTION 'permission denied: cannot assign phones' USING ERRCODE = '42501';
  END IF;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_phones_to_user(uuid[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_phones_to_user(uuid[], uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.unassign_phone_to_stock(p_phone_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_actor FROM public.profiles WHERE id = v_actor_id AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'active profile required' USING ERRCODE = '42501';
  END IF;

  IF v_actor.role = 'admin' THEN
    UPDATE public.phones
    SET status = 'in_stock',
        assigned_to = NULL,
        assigned_at = NULL
    WHERE id = p_phone_id
      AND status = 'assigned';
  ELSIF v_actor.role = 'team_lead' THEN
    UPDATE public.phones ph
    SET status = 'assigned',
        assigned_to = v_actor_id,
        assigned_at = now()
    WHERE ph.id = p_phone_id
      AND ph.status = 'assigned'
      AND ph.assigned_to IN (
        SELECT id FROM public.profiles WHERE team_lead_id = v_actor_id
      );
  ELSE
    RAISE EXCEPTION 'permission denied: cannot unassign phone' USING ERRCODE = '42501';
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'phone not found or not assignable by this user' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.unassign_phone_to_stock(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unassign_phone_to_stock(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.return_phone_to_team_lead(p_phone_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_actor
  FROM public.profiles
  WHERE id = v_actor_id
    AND role = 'agent'
    AND status = 'active'
    AND team_lead_id IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'active agent with team lead required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.phones
  SET status = 'assigned',
      assigned_to = v_actor.team_lead_id,
      assigned_at = now()
  WHERE id = p_phone_id
    AND status = 'assigned'
    AND assigned_to = v_actor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'phone is not assigned to this agent' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.return_phone_to_team_lead(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.return_phone_to_team_lead(uuid) TO authenticated;

-- These broad client-update policies are replaced by the guarded RPCs above.
DROP POLICY IF EXISTS "phones_agent_update_own" ON public.phones;
DROP POLICY IF EXISTS "phones_teamlead_manage_assignments" ON public.phones;
DROP POLICY IF EXISTS "phones_teamlead_own" ON public.phones;
DROP POLICY IF EXISTS "phones_teamlead_read_own" ON public.phones;
CREATE POLICY "phones_teamlead_read_own" ON public.phones
  FOR SELECT USING (assigned_to = auth.uid());

-- ---------- Restrict direct forged inserts ----------
DROP POLICY IF EXISTS "notif_insert_auth" ON public.notifications;
DROP POLICY IF EXISTS "notif_insert_any" ON public.notifications;
DROP POLICY IF EXISTS "notif_insert_system" ON public.notifications;
CREATE POLICY "notif_insert_system" ON public.notifications
  FOR INSERT
  WITH CHECK (public.is_admin());

-- ---------- Payroll policies should follow profile role, not email ----------
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'payroll_configs',
    'payroll_targets',
    'payroll_runs',
    'payroll_entries'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      EXECUTE format('DROP POLICY IF EXISTS "admin_all_%s" ON public.%I', tbl, tbl);
      EXECUTE format('DROP POLICY IF EXISTS "payroll_admin_all" ON public.%I', tbl);
      EXECUTE format(
        'CREATE POLICY "payroll_admin_all" ON public.%I
           FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin())',
        tbl
      );
    END IF;
  END LOOP;
END;
$$;
