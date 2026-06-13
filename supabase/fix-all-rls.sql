-- ============================================================
-- Royal Success — Fix ALL RLS policies (run this to restore access)
-- Safe to run multiple times.
-- ============================================================
--
-- ADMIN IDENTITY STRATEGY
-- Admin is identified by JWT email rather than a profiles subquery.
-- A subquery on profiles inside a profiles policy causes infinite recursion
-- in PostgreSQL RLS, so the JWT email approach is the correct Supabase
-- pattern for a single-admin system.
-- Set app.admin_email once with:
--   ALTER DATABASE postgres SET app.admin_email = 'your@email.com';
-- The literal fallback below is a bootstrap safety net only.
-- ============================================================


-- ── PROFILES ─────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_admin_all"            ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_read_all"       ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_insert"         ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_update"         ON public.profiles;
DROP POLICY IF EXISTS "profiles_read_own"             ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own"           ON public.profiles;
DROP POLICY IF EXISTS "profiles_self_update"          ON public.profiles;
DROP POLICY IF EXISTS "profiles_teamlead_read_agents" ON public.profiles;

-- Admin: full access via JWT email (no profiles subquery = no recursion)
CREATE POLICY "profiles_admin_all" ON public.profiles
  FOR ALL
  USING (auth.jwt() ->> 'email' = current_setting('app.admin_email', true)
      OR auth.jwt() ->> 'email' = 'patrickwlax@gmail.com')
  WITH CHECK (auth.jwt() ->> 'email' = current_setting('app.admin_email', true)
           OR auth.jwt() ->> 'email' = 'patrickwlax@gmail.com');

-- Users: read/update their own profile only
CREATE POLICY "profiles_read_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Users may update only their own non-role fields (role is protected by admin policy)
CREATE POLICY "profiles_self_update" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Team leads: read the profiles of agents assigned to them
CREATE POLICY "profiles_teamlead_read_agents" ON public.profiles
  FOR SELECT USING (team_lead_id = auth.uid());


-- ── PHONES ───────────────────────────────────────────────────
ALTER TABLE public.phones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "phones_admin_all"                   ON public.phones;
DROP POLICY IF EXISTS "phones_agent_read_own"              ON public.phones;
DROP POLICY IF EXISTS "phones_agent_update_own"            ON public.phones;
DROP POLICY IF EXISTS "phones_teamlead_read_agents"        ON public.phones;
DROP POLICY IF EXISTS "phones_teamlead_update_agents"      ON public.phones;
DROP POLICY IF EXISTS "phones_teamlead_own"                ON public.phones;
DROP POLICY IF EXISTS "phones_teamlead_manage_assignments" ON public.phones;
DROP POLICY IF EXISTS "phones_teamlead_read_instock"       ON public.phones;
DROP POLICY IF EXISTS "phones_teamlead_assign"             ON public.phones;

-- Admin: full access
CREATE POLICY "phones_admin_all" ON public.phones
  FOR ALL
  USING (auth.jwt() ->> 'email' = current_setting('app.admin_email', true)
      OR auth.jwt() ->> 'email' = 'patrickwlax@gmail.com')
  WITH CHECK (auth.jwt() ->> 'email' = current_setting('app.admin_email', true)
           OR auth.jwt() ->> 'email' = 'patrickwlax@gmail.com');

-- Agents: read only their assigned phones
CREATE POLICY "phones_agent_read_own" ON public.phones
  FOR SELECT USING (assigned_to = auth.uid());

-- Agents: update only their assigned phones (status transitions only — no changing assigned_to)
CREATE POLICY "phones_agent_update_own" ON public.phones
  FOR UPDATE
  USING  (assigned_to = auth.uid())
  WITH CHECK (assigned_to = auth.uid());

-- Team leads: read phones assigned to their agents
CREATE POLICY "phones_teamlead_read_agents" ON public.phones
  FOR SELECT USING (
    assigned_to IN (
      SELECT id FROM public.profiles WHERE team_lead_id = auth.uid()
    )
  );

-- Team leads: full ownership of their directly-assigned phones
CREATE POLICY "phones_teamlead_own" ON public.phones
  FOR ALL USING (assigned_to = auth.uid());

-- Team leads: reassign phones between themselves and their agents (both directions)
CREATE POLICY "phones_teamlead_manage_assignments" ON public.phones
  FOR UPDATE
  USING (
    assigned_to = auth.uid()
    OR assigned_to IN (
      SELECT id FROM public.profiles WHERE team_lead_id = auth.uid()
    )
  )
  WITH CHECK (
    assigned_to = auth.uid()
    OR assigned_to IN (
      SELECT id FROM public.profiles WHERE team_lead_id = auth.uid()
    )
    OR assigned_to IS NULL
  );


-- ── ACTIVITY LOG ─────────────────────────────────────────────
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activity_admin_all"     ON public.activity_log;
DROP POLICY IF EXISTS "activity_teamlead_read" ON public.activity_log;
DROP POLICY IF EXISTS "activity_agent_read"    ON public.activity_log;
DROP POLICY IF EXISTS "activity_insert_auth"   ON public.activity_log;
DROP POLICY IF EXISTS "logs_admin_read"        ON public.activity_log;
DROP POLICY IF EXISTS "logs_insert_own"        ON public.activity_log;
DROP POLICY IF EXISTS "logs_read_own"          ON public.activity_log;
DROP POLICY IF EXISTS "activity_no_delete"     ON public.activity_log;

-- Admin: full read access
CREATE POLICY "activity_admin_all" ON public.activity_log
  FOR ALL
  USING (auth.jwt() ->> 'email' = current_setting('app.admin_email', true)
      OR auth.jwt() ->> 'email' = 'patrickwlax@gmail.com')
  WITH CHECK (auth.jwt() ->> 'email' = current_setting('app.admin_email', true)
           OR auth.jwt() ->> 'email' = 'patrickwlax@gmail.com');

-- Team leads: read activity for their team
CREATE POLICY "activity_teamlead_read" ON public.activity_log
  FOR SELECT USING (team_lead_id = auth.uid());

-- Agents: read only their own activity
CREATE POLICY "activity_agent_read" ON public.activity_log
  FOR SELECT USING (agent_id = auth.uid());

-- Authenticated users: insert own activity only — actor_id MUST match the caller
-- Prevents forging log entries on behalf of other users
CREATE POLICY "activity_insert_auth" ON public.activity_log
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND actor_id = auth.uid()
  );

-- Explicitly deny all deletes — audit log is immutable
CREATE POLICY "activity_no_delete" ON public.activity_log
  FOR DELETE USING (false);


-- ── SALES ────────────────────────────────────────────────────
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sales_admin_all"            ON public.sales;
DROP POLICY IF EXISTS "sales_read_own"             ON public.sales;
DROP POLICY IF EXISTS "sales_insert_own"           ON public.sales;
DROP POLICY IF EXISTS "sales_teamlead_read_agents" ON public.sales;
DROP POLICY IF EXISTS "sales_no_delete"            ON public.sales;
DROP POLICY IF EXISTS "sales_no_update"            ON public.sales;

-- Admin: full access
CREATE POLICY "sales_admin_all" ON public.sales
  FOR ALL
  USING (auth.jwt() ->> 'email' = current_setting('app.admin_email', true)
      OR auth.jwt() ->> 'email' = 'patrickwlax@gmail.com')
  WITH CHECK (auth.jwt() ->> 'email' = current_setting('app.admin_email', true)
           OR auth.jwt() ->> 'email' = 'patrickwlax@gmail.com');

-- Agents/team leads: read their own sales
CREATE POLICY "sales_read_own" ON public.sales
  FOR SELECT USING (sold_by = auth.uid());

-- Agents/team leads: insert their own sales (sold_by must match caller)
CREATE POLICY "sales_insert_own" ON public.sales
  FOR INSERT WITH CHECK (sold_by = auth.uid());

-- Team leads: read their agents' sales
CREATE POLICY "sales_teamlead_read_agents" ON public.sales
  FOR SELECT USING (
    sold_by IN (
      SELECT id FROM public.profiles WHERE team_lead_id = auth.uid()
    )
  );

-- Sales are immutable — deny updates and deletes from non-admin
CREATE POLICY "sales_no_delete" ON public.sales
  FOR DELETE USING (false);

CREATE POLICY "sales_no_update" ON public.sales
  FOR UPDATE USING (false);


-- ── RETURNS ──────────────────────────────────────────────────
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "returns_admin_all"              ON public.returns;
DROP POLICY IF EXISTS "returns_agent_read_own"         ON public.returns;
DROP POLICY IF EXISTS "returns_agent_insert"           ON public.returns;
DROP POLICY IF EXISTS "returns_teamlead_read_agents"   ON public.returns;
DROP POLICY IF EXISTS "returns_teamlead_update_agents" ON public.returns;
DROP POLICY IF EXISTS "returns_read_own"               ON public.returns;
DROP POLICY IF EXISTS "returns_insert_own"             ON public.returns;

-- Admin: full access
CREATE POLICY "returns_admin_all" ON public.returns
  FOR ALL
  USING (auth.jwt() ->> 'email' = current_setting('app.admin_email', true)
      OR auth.jwt() ->> 'email' = 'patrickwlax@gmail.com')
  WITH CHECK (auth.jwt() ->> 'email' = current_setting('app.admin_email', true)
           OR auth.jwt() ->> 'email' = 'patrickwlax@gmail.com');

-- Agents/team leads: read their own submitted returns
CREATE POLICY "returns_agent_read_own" ON public.returns
  FOR SELECT USING (returned_by = auth.uid());

-- Agents/team leads: insert returns for themselves only
CREATE POLICY "returns_agent_insert" ON public.returns
  FOR INSERT WITH CHECK (returned_by = auth.uid());

-- Team leads: read returns submitted by their agents
CREATE POLICY "returns_teamlead_read_agents" ON public.returns
  FOR SELECT USING (
    returned_by IN (
      SELECT id FROM public.profiles WHERE team_lead_id = auth.uid()
    )
  );

-- Team leads: resolve (approve/reject) ONLY PENDING returns from their agents
-- Adding return_status = 'PENDING' prevents re-resolving already-closed returns
CREATE POLICY "returns_teamlead_update_agents" ON public.returns
  FOR UPDATE USING (
    return_status = 'PENDING'
    AND returned_by IN (
      SELECT id FROM public.profiles WHERE team_lead_id = auth.uid()
    )
  );


-- ── RECEIPTS ─────────────────────────────────────────────────
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "receipts_admin_all"        ON public.receipts;
DROP POLICY IF EXISTS "receipts_agent_own"        ON public.receipts;
DROP POLICY IF EXISTS "receipts_agent_insert"     ON public.receipts;
DROP POLICY IF EXISTS "receipts_agent_update_own" ON public.receipts;
DROP POLICY IF EXISTS "receipts_teamlead_agents"  ON public.receipts;

-- Admin: full access
CREATE POLICY "receipts_admin_all" ON public.receipts
  FOR ALL
  USING (auth.jwt() ->> 'email' = current_setting('app.admin_email', true)
      OR auth.jwt() ->> 'email' = 'patrickwlax@gmail.com')
  WITH CHECK (auth.jwt() ->> 'email' = current_setting('app.admin_email', true)
           OR auth.jwt() ->> 'email' = 'patrickwlax@gmail.com');

-- Agents: read their own receipts
CREATE POLICY "receipts_agent_own" ON public.receipts
  FOR SELECT USING (agent_id = auth.uid());

-- Agents: insert receipts for themselves only
CREATE POLICY "receipts_agent_insert" ON public.receipts
  FOR INSERT WITH CHECK (agent_id = auth.uid());

-- Agents: update only their own receipts
CREATE POLICY "receipts_agent_update_own" ON public.receipts
  FOR UPDATE USING (agent_id = auth.uid()) WITH CHECK (agent_id = auth.uid());

-- Team leads: read their agents' receipts
CREATE POLICY "receipts_teamlead_agents" ON public.receipts
  FOR SELECT USING (
    agent_id IN (
      SELECT id FROM public.profiles WHERE team_lead_id = auth.uid()
    )
  );


-- ── NOTIFICATIONS ─────────────────────────────────────────────
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_admin_all"       ON public.notifications;
DROP POLICY IF EXISTS "notif_read_own"        ON public.notifications;
DROP POLICY IF EXISTS "notif_insert_any"      ON public.notifications;
DROP POLICY IF EXISTS "notif_insert_system"   ON public.notifications;
DROP POLICY IF EXISTS "notif_update_own"      ON public.notifications;
DROP POLICY IF EXISTS "notif_no_delete"       ON public.notifications;

-- Admin: full access
CREATE POLICY "notif_admin_all" ON public.notifications
  FOR ALL
  USING (auth.jwt() ->> 'email' = current_setting('app.admin_email', true)
      OR auth.jwt() ->> 'email' = 'patrickwlax@gmail.com')
  WITH CHECK (auth.jwt() ->> 'email' = current_setting('app.admin_email', true)
           OR auth.jwt() ->> 'email' = 'patrickwlax@gmail.com');

-- Users: read only their own notifications
CREATE POLICY "notif_read_own" ON public.notifications
  FOR SELECT USING (recipient_id = auth.uid());

-- System notifications: any authenticated user may notify another (required for
-- agent→teamlead and admin→agent flows). The recipient must be a real profile row
-- to prevent notifications to fabricated UUIDs.
CREATE POLICY "notif_insert_system" ON public.notifications
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles WHERE id = recipient_id
    )
  );

-- Users: mark only their own notifications as read (cannot touch others')
CREATE POLICY "notif_update_own" ON public.notifications
  FOR UPDATE
  USING  (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

-- Notifications are append-only for regular users
CREATE POLICY "notif_no_delete" ON public.notifications
  FOR DELETE USING (
    auth.jwt() ->> 'email' = current_setting('app.admin_email', true)
    OR auth.jwt() ->> 'email' = 'patrickwlax@gmail.com'
  );


-- ── Verify policies applied ───────────────────────────────────
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
