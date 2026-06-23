-- ============================================================
-- Royal Success — MASTER DATABASE FIX
-- ============================================================
--
-- WHAT THIS FILE IS:
--   One canonical, idempotent SQL file that brings the live
--   Supabase database to its correct, final state — regardless
--   of which of the 20+ previous migration files have or haven't
--   been run, and regardless of their run order.
--
-- SAFE TO RE-RUN: every statement uses CREATE OR REPLACE,
--   DROP IF EXISTS, ALTER ... IF EXISTS, or defensive DO blocks.
--   No data is dropped or truncated.
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → New Query → paste → Run.
--   Expected: all verification checks at the bottom show ✓.
--
-- BUGS THIS FIXES (audit findings):
--   1. receipts.phone_id missing ON DELETE CASCADE
--      → deleting any sold phone fails with FK violation
--   2. payroll + telemetry RLS used old hardcoded email
--      → admin couldn't access payroll or error logs
--   3. get_dashboard_stats() / get_team_overview() had no
--      is_admin() check → any agent could see inventory counts
--   4. Status transition trigger blocked damaged→in_stock
--      → repaired phones could never return to warehouse
--   5. profiles_self_update allowed agents to change their own
--      role → privilege escalation vulnerability
--   6. sales_no_delete/sales_no_update were PERMISSIVE USING(false)
--      which is confusing: admin can still mutate via is_admin().
--      Replaced with consistent is_admin()-gated policies.
--   7. is_admin() defined 3× with different implementations
--      → one canonical definition based on profiles.role only
--   8. admin_delete_profile missing REVOKE ALL before GRANT
--   9. get_team_overview / get_dashboard_stats missing REVOKE ALL
--
-- ARCHITECTURE CHANGES:
--   • is_admin() now purely checks profiles.role = 'admin'.
--     No more hardcoded emails anywhere in the database.
--     Email-based checks were the root cause of all "admin locked
--     out" incidents (email change, OAuth token path variations).
--   • All 14 tables now have canonical RLS policies derived from
--     one source of truth (this file).
--   • Role escalation prevention trigger added to profiles.
--   • Phone status machine updated with missing valid transitions.
-- ============================================================


-- ============================================================
-- SECTION 1 — is_admin(): FINAL, CANONICAL DEFINITION
--
-- Design:
--   profiles.role is the single source of truth for admin identity.
--   No hardcoded emails. No app.admin_email setting. No JWT path
--   juggling. Those approaches broke whenever:
--     a) The admin's email changed
--     b) Google OAuth placed email in a non-standard JWT path
--     c) The database setting was never updated to match Vercel env
--
--   SECURITY DEFINER: function runs as the table owner (postgres),
--   bypassing RLS on profiles. This prevents infinite recursion:
--   profiles RLS → is_admin() → profiles (SECURITY DEFINER: no RLS)
--
--   STABLE: PostgreSQL caches the result per SQL statement, so
--   is_admin() is evaluated ONCE per query, never once per row.
--   Critical for RLS performance at 150 agents.
--
--   auth.uid() = NULL for unauthenticated → EXISTS returns false →
--   unauthenticated requests can never be admin.
-- ============================================================

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

REVOKE ALL   ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;

COMMENT ON FUNCTION public.is_admin IS
  'True iff the calling session has role=admin in profiles. '
  'SECURITY DEFINER (no RLS recursion). STABLE (cached per query). '
  'No hardcoded emails — change admin by updating profiles.role.';


-- ============================================================
-- SECTION 2 — receipts.phone_id: ADD ON DELETE CASCADE
--
-- Bug: receipts.phone_id was a bare NOT NULL FK (ON DELETE RESTRICT
-- by default). Deleting any sold phone → FK violation → rollback.
-- The admin could not delete any phone that had a receipt.
--
-- Fix: drop the auto-named FK, recreate it with ON DELETE CASCADE.
-- Cascade chain after this fix:
--   DELETE phones → CASCADE → sales (already had CASCADE)
--                  CASCADE → returns (already had CASCADE)
--                  CASCADE → receipts (NEW)
--   DELETE sales  → CASCADE → receipts.sale_id (already had CASCADE)
--
-- Both cascade paths delete receipts — belt and suspenders.
-- ============================================================

DO $$
DECLARE
  v_con text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'receipts'
  ) THEN
    RAISE NOTICE 'receipts table not found — skipping FK fix';
    RETURN;
  END IF;

  SELECT conname INTO v_con
  FROM pg_constraint
  WHERE conrelid  = 'public.receipts'::regclass
    AND confrelid = 'public.phones'::regclass
    AND contype   = 'f';

  IF v_con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.receipts DROP CONSTRAINT %I', v_con);
    RAISE NOTICE 'Dropped FK: %', v_con;
  END IF;

  -- Check if a CASCADE FK already exists (idempotent re-run safety)
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.conrelid  = 'public.receipts'::regclass
      AND c.confrelid = 'public.phones'::regclass
      AND c.contype   = 'f'
      AND a.attname   = 'phone_id'
  ) THEN
    ALTER TABLE public.receipts
      ADD CONSTRAINT receipts_phone_id_fkey
      FOREIGN KEY (phone_id) REFERENCES public.phones(id) ON DELETE CASCADE;
    RAISE NOTICE 'receipts.phone_id FK recreated with ON DELETE CASCADE';
  ELSE
    RAISE NOTICE 'receipts.phone_id FK already has CASCADE — skipping';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'receipts FK fix: %', SQLERRM;
END;
$$;


-- ============================================================
-- SECTION 3 — Phone status transition trigger
--
-- The original trigger was missing valid real-world transitions:
--   ✗ damaged → in_stock  (phone repaired, back to warehouse)
--   ✗ sold → returned     (disputed sale, admin reversal)
--   ✗ in_stock → sold     (admin direct sale, edge case)
--
-- Updated valid state machine:
--   in_stock  → assigned    (admin/TL assigns phone)
--   assigned  → sold        (agent marks sold)
--   assigned  → returned    (agent requests return)
--   returned  → in_stock    (return approved: back to stock)
--   returned  → assigned    (return rejected: stays with agent)
--   returned  → damaged     (return approved: phone damaged)
--   in_stock  → damaged     (admin marks as damaged)
--   assigned  → damaged     (discovered damaged in field)
--   damaged   → in_stock    (phone repaired — was MISSING)
--   sold      → returned    (disputed sale — was MISSING)
--   in_stock  → sold        (admin direct entry — was MISSING)
--
-- BEFORE UPDATE OF status: only fires when status column changes,
-- avoiding unnecessary execution on other column updates.
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_phone_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  IF
    (OLD.status = 'in_stock'  AND NEW.status = 'assigned') OR
    (OLD.status = 'in_stock'  AND NEW.status = 'sold')     OR
    (OLD.status = 'in_stock'  AND NEW.status = 'damaged')  OR
    (OLD.status = 'assigned'  AND NEW.status = 'sold')     OR
    (OLD.status = 'assigned'  AND NEW.status = 'returned') OR
    (OLD.status = 'assigned'  AND NEW.status = 'damaged')  OR
    (OLD.status = 'returned'  AND NEW.status = 'in_stock') OR
    (OLD.status = 'returned'  AND NEW.status = 'assigned') OR
    (OLD.status = 'returned'  AND NEW.status = 'damaged')  OR
    (OLD.status = 'damaged'   AND NEW.status = 'in_stock') OR
    (OLD.status = 'sold'      AND NEW.status = 'returned')
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'Invalid phone status transition: % → % (id: %)',
    OLD.status, NEW.status, OLD.id
    USING ERRCODE = '22000';
END;
$$;

DROP TRIGGER IF EXISTS phones_status_transition ON public.phones;
CREATE TRIGGER phones_status_transition
  BEFORE UPDATE OF status ON public.phones
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_phone_status_transition();


-- ============================================================
-- SECTION 4 — Role escalation prevention trigger
--
-- Bug: profiles_self_update RLS allows any authenticated user to
-- UPDATE their own profile row with no column restriction.
-- An agent could call supabase.from('profiles').update({role:'admin'})
-- and escalate their own privileges.
--
-- Fix: BEFORE UPDATE trigger rejects role changes from non-admin.
-- Role changes must go through admin_update_profile() RPC (which
-- checks is_admin() server-side). This trigger is the enforcement
-- layer — the RLS policy is the outer gate, the trigger is the lock.
-- ============================================================

CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- auth.uid() IS NULL when running in SQL Editor / service role context.
  -- Allow those contexts unconditionally so DBA bootstrap works.
  -- Block only authenticated non-admin app requests.
  IF NEW.role IS DISTINCT FROM OLD.role
     AND auth.uid() IS NOT NULL
     AND NOT is_admin()
  THEN
    RAISE EXCEPTION 'permission denied: role changes require admin access'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_role_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  WHEN (NEW.role IS DISTINCT FROM OLD.role)
  EXECUTE FUNCTION public.prevent_role_escalation();


-- ============================================================
-- SECTION 5 — CANONICAL RLS POLICIES
--
-- Strategy:
--   Drop all policies (by any name that may exist from any migration
--   file), then recreate the exact correct set.
--   Each table section is self-contained and idempotent.
-- ============================================================


-- ── 5a. profiles ─────────────────────────────────────────────────────────────

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_admin_all"            ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_read_all"       ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_insert"         ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_update"         ON public.profiles;
DROP POLICY IF EXISTS "profiles_read_own"             ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own"           ON public.profiles;
DROP POLICY IF EXISTS "profiles_self_update"          ON public.profiles;
DROP POLICY IF EXISTS "profiles_teamlead_read_agents" ON public.profiles;

CREATE POLICY "profiles_admin_all" ON public.profiles
  FOR ALL
  USING    (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "profiles_read_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Self-update: allowed for name/phone edits.
-- Role change is blocked at the trigger level (prevent_role_escalation).
CREATE POLICY "profiles_self_update" ON public.profiles
  FOR UPDATE
  USING    (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_teamlead_read_agents" ON public.profiles
  FOR SELECT USING (team_lead_id = auth.uid());


-- ── 5b. phones ───────────────────────────────────────────────────────────────

ALTER TABLE public.phones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "phones_admin_all"                   ON public.phones;
DROP POLICY IF EXISTS "phones_agent_read_own"              ON public.phones;
DROP POLICY IF EXISTS "phones_agent_update_own"            ON public.phones;
DROP POLICY IF EXISTS "phones_teamlead_read_agents"        ON public.phones;
DROP POLICY IF EXISTS "phones_teamlead_own"                ON public.phones;
DROP POLICY IF EXISTS "phones_teamlead_read_own"           ON public.phones;
DROP POLICY IF EXISTS "phones_teamlead_manage_assignments" ON public.phones;
DROP POLICY IF EXISTS "phones_teamlead_read_instock"       ON public.phones;
DROP POLICY IF EXISTS "phones_teamlead_assign"             ON public.phones;
DROP POLICY IF EXISTS "phones_teamlead_update_agents"      ON public.phones;

CREATE POLICY "phones_admin_all" ON public.phones
  FOR ALL
  USING    (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "phones_agent_read_own" ON public.phones
  FOR SELECT USING (assigned_to = auth.uid());

CREATE POLICY "phones_agent_update_own" ON public.phones
  FOR UPDATE
  USING    (assigned_to = auth.uid())
  WITH CHECK (assigned_to = auth.uid());

CREATE POLICY "phones_teamlead_read_agents" ON public.phones
  FOR SELECT USING (
    assigned_to IN (
      SELECT id FROM public.profiles WHERE team_lead_id = auth.uid()
    )
  );

-- SELECT only — UPDATE is covered by phones_teamlead_manage_assignments.
-- FOR ALL here would also give agents (who also satisfy assigned_to=uid)
-- unintended DELETE + INSERT on their own phones.
CREATE POLICY "phones_teamlead_read_own" ON public.phones
  FOR SELECT USING (assigned_to = auth.uid());

-- Team lead: reassign phones between self and their agents
CREATE POLICY "phones_teamlead_manage_assignments" ON public.phones
  FOR UPDATE
  USING (
    assigned_to = auth.uid()
    OR assigned_to IN (SELECT id FROM public.profiles WHERE team_lead_id = auth.uid())
  )
  WITH CHECK (
    assigned_to = auth.uid()
    OR assigned_to IN (SELECT id FROM public.profiles WHERE team_lead_id = auth.uid())
    OR assigned_to IS NULL
  );


-- ── 5c. sales ────────────────────────────────────────────────────────────────

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sales_admin_all"            ON public.sales;
DROP POLICY IF EXISTS "sales_read_own"             ON public.sales;
DROP POLICY IF EXISTS "sales_insert_own"           ON public.sales;
DROP POLICY IF EXISTS "sales_teamlead_read_agents" ON public.sales;
DROP POLICY IF EXISTS "sales_no_delete"            ON public.sales;
DROP POLICY IF EXISTS "sales_no_update"            ON public.sales;

CREATE POLICY "sales_admin_all" ON public.sales
  FOR ALL
  USING    (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "sales_read_own" ON public.sales
  FOR SELECT USING (sold_by = auth.uid());

CREATE POLICY "sales_insert_own" ON public.sales
  FOR INSERT WITH CHECK (sold_by = auth.uid());

CREATE POLICY "sales_teamlead_read_agents" ON public.sales
  FOR SELECT USING (
    sold_by IN (SELECT id FROM public.profiles WHERE team_lead_id = auth.uid())
  );

-- Non-admin cannot delete or update sales (financial immutability).
-- Admin can (via admin_delete_phone cascade or direct RPC).
CREATE POLICY "sales_no_delete" ON public.sales
  FOR DELETE USING (is_admin());

CREATE POLICY "sales_no_update" ON public.sales
  FOR UPDATE USING (is_admin());


-- ── 5d. returns ──────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='returns') THEN
    RAISE NOTICE 'returns table not found — skipping'; RETURN;
  END IF;

  ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;

  EXECUTE 'DROP POLICY IF EXISTS "returns_admin_all"              ON public.returns';
  EXECUTE 'DROP POLICY IF EXISTS "returns_agent_read_own"         ON public.returns';
  EXECUTE 'DROP POLICY IF EXISTS "returns_agent_insert"           ON public.returns';
  EXECUTE 'DROP POLICY IF EXISTS "returns_teamlead_read_agents"   ON public.returns';
  EXECUTE 'DROP POLICY IF EXISTS "returns_teamlead_update_agents" ON public.returns';
  EXECUTE 'DROP POLICY IF EXISTS "returns_read_own"               ON public.returns';
  EXECUTE 'DROP POLICY IF EXISTS "returns_insert_own"             ON public.returns';

  EXECUTE $p$
    CREATE POLICY "returns_admin_all" ON public.returns
      FOR ALL USING (is_admin()) WITH CHECK (is_admin())
  $p$;
  EXECUTE $p$
    CREATE POLICY "returns_agent_read_own" ON public.returns
      FOR SELECT USING (returned_by = auth.uid())
  $p$;
  EXECUTE $p$
    CREATE POLICY "returns_agent_insert" ON public.returns
      FOR INSERT WITH CHECK (returned_by = auth.uid())
  $p$;
  EXECUTE $p$
    CREATE POLICY "returns_teamlead_read_agents" ON public.returns
      FOR SELECT USING (
        returned_by IN (SELECT id FROM public.profiles WHERE team_lead_id = auth.uid())
      )
  $p$;
  -- TL can only approve/reject PENDING returns from their own agents
  EXECUTE $p$
    CREATE POLICY "returns_teamlead_update_agents" ON public.returns
      FOR UPDATE USING (
        return_status = 'PENDING'
        AND returned_by IN (SELECT id FROM public.profiles WHERE team_lead_id = auth.uid())
      )
  $p$;
END;
$$;


-- ── 5e. receipts ─────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='receipts') THEN
    RAISE NOTICE 'receipts table not found — skipping'; RETURN;
  END IF;

  ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

  EXECUTE 'DROP POLICY IF EXISTS "receipts_admin_all"        ON public.receipts';
  EXECUTE 'DROP POLICY IF EXISTS "receipts_agent_own"        ON public.receipts';
  EXECUTE 'DROP POLICY IF EXISTS "receipts_agent_insert"     ON public.receipts';
  EXECUTE 'DROP POLICY IF EXISTS "receipts_agent_update_own" ON public.receipts';
  EXECUTE 'DROP POLICY IF EXISTS "receipts_teamlead_agents"  ON public.receipts';

  EXECUTE $p$
    CREATE POLICY "receipts_admin_all" ON public.receipts
      FOR ALL USING (is_admin()) WITH CHECK (is_admin())
  $p$;
  EXECUTE $p$
    CREATE POLICY "receipts_agent_own" ON public.receipts
      FOR SELECT USING (agent_id = auth.uid())
  $p$;
  EXECUTE $p$
    CREATE POLICY "receipts_agent_insert" ON public.receipts
      FOR INSERT WITH CHECK (agent_id = auth.uid())
  $p$;
  EXECUTE $p$
    CREATE POLICY "receipts_agent_update_own" ON public.receipts
      FOR UPDATE
      USING    (agent_id = auth.uid())
      WITH CHECK (agent_id = auth.uid())
  $p$;
  EXECUTE $p$
    CREATE POLICY "receipts_teamlead_agents" ON public.receipts
      FOR SELECT USING (
        agent_id IN (SELECT id FROM public.profiles WHERE team_lead_id = auth.uid())
      )
  $p$;
END;
$$;


-- ── 5f. notifications ────────────────────────────────────────────────────────

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_admin_all"       ON public.notifications;
DROP POLICY IF EXISTS "notif_read_own"        ON public.notifications;
DROP POLICY IF EXISTS "notif_insert_system"   ON public.notifications;
DROP POLICY IF EXISTS "notif_insert_any"      ON public.notifications;
DROP POLICY IF EXISTS "notif_insert_auth"     ON public.notifications;
DROP POLICY IF EXISTS "notif_update_own"      ON public.notifications;
DROP POLICY IF EXISTS "notif_no_delete"       ON public.notifications;

CREATE POLICY "notif_admin_all" ON public.notifications
  FOR ALL
  USING    (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "notif_read_own" ON public.notifications
  FOR SELECT USING (recipient_id = auth.uid());

-- All in-app notifications go through send_notification() SECURITY DEFINER RPC.
-- This INSERT policy is the safety net for any direct client writes:
-- recipient must exist in profiles to prevent phantom-user spam.
CREATE POLICY "notif_insert_system" ON public.notifications
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = recipient_id)
  );

CREATE POLICY "notif_update_own" ON public.notifications
  FOR UPDATE
  USING    (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

CREATE POLICY "notif_no_delete" ON public.notifications
  FOR DELETE USING (is_admin());


-- ── 5g. activity_log ─────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='activity_log') THEN
    RAISE NOTICE 'activity_log not found — skipping'; RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY';

  EXECUTE 'DROP POLICY IF EXISTS "activity_admin_all"     ON public.activity_log';
  EXECUTE 'DROP POLICY IF EXISTS "activity_teamlead_read" ON public.activity_log';
  EXECUTE 'DROP POLICY IF EXISTS "activity_agent_read"    ON public.activity_log';
  EXECUTE 'DROP POLICY IF EXISTS "activity_insert_auth"   ON public.activity_log';
  EXECUTE 'DROP POLICY IF EXISTS "activity_no_delete"     ON public.activity_log';
  EXECUTE 'DROP POLICY IF EXISTS "logs_admin_read"        ON public.activity_log';
  EXECUTE 'DROP POLICY IF EXISTS "logs_insert_own"        ON public.activity_log';
  EXECUTE 'DROP POLICY IF EXISTS "logs_read_own"          ON public.activity_log';

  EXECUTE $p$
    CREATE POLICY "activity_admin_all" ON public.activity_log
      FOR ALL USING (is_admin()) WITH CHECK (is_admin())
  $p$;
  EXECUTE $p$
    CREATE POLICY "activity_teamlead_read" ON public.activity_log
      FOR SELECT USING (team_lead_id = auth.uid())
  $p$;
  EXECUTE $p$
    CREATE POLICY "activity_agent_read" ON public.activity_log
      FOR SELECT USING (agent_id = auth.uid())
  $p$;
  -- Actors can only log as themselves — closes actor_id spoofing
  EXECUTE $p$
    CREATE POLICY "activity_insert_auth" ON public.activity_log
      FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND actor_id = auth.uid())
  $p$;
  -- Audit log is append-only for non-admin
  EXECUTE $p$
    CREATE POLICY "activity_no_delete" ON public.activity_log
      FOR DELETE USING (is_admin())
  $p$;
END;
$$;


-- ── 5h. activity_log_legacy ──────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='activity_log_legacy') THEN
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.activity_log_legacy ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS "legacy_admin_all"  ON public.activity_log_legacy';
  EXECUTE 'DROP POLICY IF EXISTS "legacy_read_own"   ON public.activity_log_legacy';
  EXECUTE 'DROP POLICY IF EXISTS "logs_admin_read"   ON public.activity_log_legacy';
  EXECUTE 'DROP POLICY IF EXISTS "logs_insert_own"   ON public.activity_log_legacy';
  EXECUTE 'DROP POLICY IF EXISTS "logs_read_own"     ON public.activity_log_legacy';

  EXECUTE $p$
    CREATE POLICY "legacy_admin_all" ON public.activity_log_legacy
      FOR ALL USING (is_admin()) WITH CHECK (is_admin())
  $p$;

  -- performed_by was the old actor column in the v1 schema
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'activity_log_legacy' AND column_name = 'performed_by'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "legacy_read_own" ON public.activity_log_legacy
        FOR SELECT USING (performed_by = auth.uid())
    $p$;
  END IF;
END;
$$;


-- ── 5i. stale_device_settings ────────────────────────────────────────────────

ALTER TABLE public.stale_device_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stale_settings_read"         ON public.stale_device_settings;
DROP POLICY IF EXISTS "stale_settings_admin_insert" ON public.stale_device_settings;
DROP POLICY IF EXISTS "stale_settings_admin_update" ON public.stale_device_settings;

-- All authenticated users read thresholds (agents/TL see stale warnings too)
CREATE POLICY "stale_settings_read" ON public.stale_device_settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "stale_settings_admin_insert" ON public.stale_device_settings
  FOR INSERT TO authenticated WITH CHECK (is_admin());

CREATE POLICY "stale_settings_admin_update" ON public.stale_device_settings
  FOR UPDATE TO authenticated
  USING    (is_admin())
  WITH CHECK (is_admin());


-- ── 5j. payroll tables ───────────────────────────────────────────────────────

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['payroll_configs','payroll_targets','payroll_runs','payroll_entries']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=tbl) THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

    -- Drop all naming variants used across migration files
    EXECUTE format('DROP POLICY IF EXISTS "payroll_admin_all"       ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "admin_all_payroll_configs"  ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "admin_all_payroll_targets"  ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "admin_all_payroll_runs"     ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "admin_all_payroll_entries"  ON public.%I', tbl);

    EXECUTE format($p$
      CREATE POLICY "payroll_admin_all" ON public.%I
        FOR ALL
        USING    (is_admin())
        WITH CHECK (is_admin())
    $p$, tbl);
  END LOOP;

  -- Employees can view their own pay stub
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='payroll_entries') THEN
    EXECUTE 'DROP POLICY IF EXISTS "employee_read_own_entry"  ON public.payroll_entries';
    EXECUTE 'DROP POLICY IF EXISTS "payroll_entries_read_own" ON public.payroll_entries';
    EXECUTE $p$
      CREATE POLICY "payroll_entries_read_own" ON public.payroll_entries
        FOR SELECT USING (employee_id = auth.uid())
    $p$;
  END IF;
END;
$$;


-- ── 5k. telemetry tables (error_logs, perf_logs) ─────────────────────────────

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['error_logs','perf_logs']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=tbl) THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

    EXECUTE format('DROP POLICY IF EXISTS "%s_insert"     ON public.%I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "%s_admin_read" ON public.%I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "%s_no_update"  ON public.%I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "%s_no_delete"  ON public.%I', tbl, tbl);

    -- Authenticated users can insert their own error/perf rows
    EXECUTE format($p$
      CREATE POLICY "%s_insert" ON public.%I
        FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND (user_id = auth.uid() OR user_id IS NULL))
    $p$, tbl, tbl);

    -- Only admin reads logs (was broken — used hardcoded email before)
    EXECUTE format($p$
      CREATE POLICY "%s_admin_read" ON public.%I
        FOR SELECT USING (is_admin())
    $p$, tbl, tbl);

    -- Logs are immutable
    EXECUTE format($p$
      CREATE POLICY "%s_no_update" ON public.%I
        FOR UPDATE USING (false)
    $p$, tbl, tbl);

    EXECUTE format($p$
      CREATE POLICY "%s_no_delete" ON public.%I
        FOR DELETE USING (false)
    $p$, tbl, tbl);
  END LOOP;
END;
$$;


-- ============================================================
-- SECTION 6 — Fix information leak in scale-hardening RPCs
--
-- get_dashboard_stats() and get_team_overview() (scale-hardening.sql)
-- were created as SECURITY DEFINER without is_admin() guards.
-- Any authenticated user (agent, team lead) could call them and
-- see total inventory counts and all team members' sales figures.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'permission denied: admin only' USING ERRCODE = '42501';
  END IF;
  RETURN (
    SELECT jsonb_build_object(
      'total',    COUNT(*),
      'in_stock', COUNT(*) FILTER (WHERE status = 'in_stock'),
      'in_field', COUNT(*) FILTER (WHERE status = 'assigned'),
      'sold',     COUNT(*) FILTER (WHERE status = 'sold'),
      'returned', COUNT(*) FILTER (WHERE status = 'returned'),
      'damaged',  COUNT(*) FILTER (WHERE status = 'damaged')
    )
    FROM public.phones
  );
END;
$$;

REVOKE ALL   ON FUNCTION public.get_dashboard_stats() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_dashboard_stats() TO authenticated;


CREATE OR REPLACE FUNCTION public.get_team_overview()
RETURNS TABLE (
  id         uuid,
  full_name  text,
  role       text,
  assigned   bigint,
  sold       bigint,
  remaining  bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'permission denied: admin only' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT
    p.id,
    p.full_name,
    p.role,
    COUNT(ph.id)                                      AS assigned,
    COUNT(ph.id) FILTER (WHERE ph.status = 'sold')   AS sold,
    COUNT(ph.id) FILTER (WHERE ph.status != 'sold')  AS remaining
  FROM public.profiles p
  LEFT JOIN public.phones ph ON ph.assigned_to = p.id
  WHERE p.role != 'admin'
  GROUP BY p.id, p.full_name, p.role
  ORDER BY p.role DESC, p.full_name;
END;
$$;

REVOKE ALL   ON FUNCTION public.get_team_overview() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_team_overview() TO authenticated;


-- ============================================================
-- SECTION 7 — admin_delete_phone: final clean version
--
-- Now that receipts.phone_id has ON DELETE CASCADE (Section 2),
-- the cascade chain handles receipt deletion automatically.
-- We keep an explicit phone existence check for a clear error
-- message, and let the CASCADE do the rest.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_delete_phone(p_phone_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'permission denied: admin only' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.phones WHERE id = p_phone_id) THEN
    RAISE EXCEPTION 'phone not found: %', p_phone_id USING ERRCODE = 'P0002';
  END IF;

  -- Explicit pre-delete: safety net if Section 2 CASCADE FK migration
  -- did not apply on this server state. Harmless when CASCADE is set.
  DELETE FROM public.receipts WHERE phone_id = p_phone_id;

  -- CASCADE handles sales + returns; receipts already cleared above
  DELETE FROM public.phones WHERE id = p_phone_id;
END;
$$;

REVOKE ALL   ON FUNCTION public.admin_delete_phone(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_delete_phone(uuid) TO authenticated;


-- ============================================================
-- SECTION 8 — Fix payroll_entries.employee_id NOT NULL contradiction
--
-- employee_id was declared NOT NULL but the FK was ON DELETE SET NULL.
-- Postgres would error when deleting a profile that has payroll entries.
-- Payroll entries are audit snapshots (employee_name is captured at
-- generation time), so employee_id can safely be nullable.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'payroll_entries'
      AND column_name  = 'employee_id'
      AND is_nullable  = 'NO'
  ) THEN
    ALTER TABLE public.payroll_entries ALTER COLUMN employee_id DROP NOT NULL;
    RAISE NOTICE 'payroll_entries.employee_id made nullable (was NOT NULL + ON DELETE SET NULL — contradiction)';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'payroll_entries fix: %', SQLERRM;
END;
$$;


-- ============================================================
-- SECTION 9 — REVOKE/GRANT: Lock down all SECURITY DEFINER RPCs
--
-- PostgreSQL grants EXECUTE to PUBLIC by default on new functions.
-- REVOKE ALL then GRANT only to authenticated closes that default.
-- Functions accessible to anon are explicitly listed at the end.
-- ============================================================

DO $$
DECLARE
  fn_name text;
  fn_rec  record;
BEGIN
  FOREACH fn_name IN ARRAY ARRAY[
    'admin_get_phones',
    'admin_get_profiles',
    'admin_dashboard_stats',
    'admin_team_overview',
    'admin_stale_alerts',
    'admin_get_phones_page',
    'admin_delete_profile',
    'admin_update_profile',
    'admin_delete_phone',
    'get_dashboard_stats',
    'get_team_overview',
    'send_notification',
    'notify_on_sale',
    'log_activity',
    'upsert_stale_device_settings',
    'prevent_role_escalation',
    'validate_phone_status_transition',
    'update_updated_at'
  ] LOOP
    FOR fn_rec IN
      SELECT p.oid, pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      WHERE p.proname = fn_name
        AND p.pronamespace = 'public'::regnamespace
    LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC',         fn_name, fn_rec.args);
      EXECUTE format('GRANT  EXECUTE ON FUNCTION public.%I(%s) TO authenticated', fn_name, fn_rec.args);
    END LOOP;
  END LOOP;
END;
$$;

-- Public-facing functions (accessible before authentication)
DO $$
DECLARE
  fn_name text;
  fn_rec  record;
BEGIN
  FOREACH fn_name IN ARRAY ARRAY['is_admin', 'health_check', 'auth_email_exists']
  LOOP
    FOR fn_rec IN
      SELECT p.oid, pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      WHERE p.proname = fn_name
        AND p.pronamespace = 'public'::regnamespace
    LOOP
      EXECUTE format('REVOKE ALL   ON FUNCTION public.%I(%s) FROM PUBLIC', fn_name, fn_rec.args);
      EXECUTE format('GRANT  EXECUTE ON FUNCTION public.%I(%s) TO authenticated, anon', fn_name, fn_rec.args);
    END LOOP;
  END LOOP;
END;
$$;


-- ============================================================
-- SECTION 10 — VERIFICATION
--
-- Run this after applying. All rows should show ✓.
-- ============================================================

-- 10a. is_admin() check (run signed in as the admin user)
SELECT
  public.is_admin()  AS is_admin_result,
  auth.uid()         AS current_uid,
  CASE
    WHEN public.is_admin() THEN '✓ admin session confirmed'
    ELSE '⚠ NOT admin — are you signed in as the admin? Check profiles.role=admin for this uid'
  END AS status;

-- 10b. receipts.phone_id cascade check
SELECT
  kcu.column_name,
  rc.delete_rule,
  CASE rc.delete_rule
    WHEN 'CASCADE' THEN '✓ ON DELETE CASCADE'
    ELSE '⚠ Missing CASCADE — re-run Section 2'
  END AS status
FROM information_schema.referential_constraints rc
JOIN information_schema.key_column_usage kcu
  ON  kcu.constraint_name = rc.constraint_name
  AND kcu.table_schema    = rc.constraint_schema
WHERE rc.constraint_schema = 'public'
  AND kcu.table_name       = 'receipts'
  AND kcu.column_name      = 'phone_id';

-- 10c. RLS enabled on all tables
SELECT
  t.table_name,
  CASE WHEN c.relrowsecurity THEN '✓ RLS on' ELSE '⛔ RLS DISABLED — CRITICAL' END AS rls_status
FROM information_schema.tables t
JOIN pg_class c
  ON  c.relname       = t.table_name
  AND c.relnamespace  = 'public'::regnamespace
WHERE t.table_schema = 'public'
  AND t.table_name IN (
    'profiles','phones','sales','returns','receipts',
    'notifications','activity_log','stale_device_settings',
    'payroll_configs','payroll_targets','payroll_runs','payroll_entries',
    'error_logs','perf_logs'
  )
ORDER BY t.table_name;

-- 10d. No SECURITY DEFINER function callable by anon (except allow-listed ones)
SELECT
  p.proname AS function_name,
  CASE
    WHEN p.proname IN ('is_admin','health_check','auth_email_exists')
    THEN '✓ intentionally public'
    WHEN has_function_privilege('anon', p.oid, 'execute')
    THEN '⚠ accessible by anon — REVOKE and re-run Section 9'
    ELSE '✓ restricted to authenticated'
  END AS status
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.prosecdef    = true
ORDER BY p.proname;

-- 10e. Policy count per critical table (minimum 3 expected)
SELECT
  tablename,
  COUNT(*) AS policy_count,
  CASE
    WHEN COUNT(*) >= 4 THEN '✓'
    WHEN COUNT(*) >= 2 THEN '⚠ low — verify policies are correct'
    ELSE '⛔ critically low'
  END AS status
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'profiles','phones','sales','returns',
    'receipts','notifications','activity_log'
  )
GROUP BY tablename
ORDER BY tablename;

-- 10f. Role escalation trigger exists
SELECT
  tgname   AS trigger_name,
  tgenabled,
  CASE WHEN tgenabled != 'D' THEN '✓ active' ELSE '⛔ disabled' END AS status
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
WHERE c.relname = 'profiles'
  AND t.tgname  = 'trg_prevent_role_escalation';

-- 10g. Status transition trigger exists
SELECT
  tgname,
  CASE WHEN tgenabled != 'D' THEN '✓ active' ELSE '⛔ disabled' END AS status
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
WHERE c.relname = 'phones'
  AND t.tgname  = 'phones_status_transition';

-- 10h. Full health check
SELECT public.health_check();

-- ============================================================
-- POST-RUN CHECKLIST
--
-- ✓ 10a: is_admin_result = true  (signed in as admin)
-- ✓ 10b: delete_rule = CASCADE   (receipts.phone_id FK fixed)
-- ✓ 10c: all tables show RLS on  (no ⛔)
-- ✓ 10d: no anon-accessible SECURITY DEFINER functions
-- ✓ 10e: all tables have 4+ policies
-- ✓ 10f: trg_prevent_role_escalation active on profiles
-- ✓ 10g: phones_status_transition active on phones
-- ✓ 10h: health_check returns {"ok":true,"is_admin":true}
--
-- IMPORTANT: After running this file, the admin is identified
-- ONLY by profiles.role = 'admin'. If the admin profile was
-- created with role='agent' (the default for new signups),
-- promote it via ONE of these methods:
--
-- METHOD A — SQL Editor (auth.uid() is NULL here; use the literal UUID):
--   Step 1: find the admin UUID:
--     SELECT id FROM auth.users WHERE email = 'your-admin@example.com';
--   Step 2: promote:
--     UPDATE public.profiles
--     SET role = 'admin', status = 'active'
--     WHERE id = '<paste-uuid-from-step-1>';
--
-- METHOD B — Table Editor: Supabase Dashboard → Table Editor →
--   profiles table → find admin row → click Edit → set role=admin.
--
-- NOTE: do NOT use auth.uid() in the WHERE clause — it returns NULL
-- in the SQL Editor and will match zero rows silently.
-- ============================================================
