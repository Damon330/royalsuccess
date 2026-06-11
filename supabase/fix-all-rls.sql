-- ============================================================
-- Royal Success — Fix ALL RLS policies (run this to restore access)
-- Safe to run multiple times.
-- ============================================================

-- Admin is identified by JWT email — avoids circular profile lookups
-- that cause infinite recursion when policies query the profiles table.

-- ── PROFILES ─────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_admin_read_all"      ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_insert"         ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_update"         ON public.profiles;
DROP POLICY IF EXISTS "profiles_read_own"             ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own"           ON public.profiles;
DROP POLICY IF EXISTS "profiles_self_update"          ON public.profiles;
DROP POLICY IF EXISTS "profiles_teamlead_read_agents" ON public.profiles;

-- Admin: full access via JWT email (no DB lookup = no recursion)
CREATE POLICY "profiles_admin_all" ON public.profiles
  FOR ALL
  USING (auth.jwt() ->> 'email' = current_setting('app.admin_email', true)
      OR auth.jwt() ->> 'email' = 'patrickwlax@gmail.com')
  WITH CHECK (auth.jwt() ->> 'email' = current_setting('app.admin_email', true)
           OR auth.jwt() ->> 'email' = 'patrickwlax@gmail.com');

-- Users read/update their own profile
CREATE POLICY "profiles_read_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_self_update" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Team leads read their agents
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
-- clean up old in-stock policies if present from a previous run
DROP POLICY IF EXISTS "phones_teamlead_read_instock"       ON public.phones;
DROP POLICY IF EXISTS "phones_teamlead_assign"             ON public.phones;

-- Admin: full access
CREATE POLICY "phones_admin_all" ON public.phones
  FOR ALL
  USING (auth.jwt() ->> 'email' = 'patrickwlax@gmail.com')
  WITH CHECK (auth.jwt() ->> 'email' = 'patrickwlax@gmail.com');

-- Agents: read + update their own phones
CREATE POLICY "phones_agent_read_own" ON public.phones
  FOR SELECT USING (assigned_to = auth.uid());

CREATE POLICY "phones_agent_update_own" ON public.phones
  FOR UPDATE
  USING (assigned_to = auth.uid())
  WITH CHECK (assigned_to = auth.uid());

-- Team leads: read their agents' phones
CREATE POLICY "phones_teamlead_read_agents" ON public.phones
  FOR SELECT USING (
    assigned_to IN (
      SELECT id FROM public.profiles WHERE team_lead_id = auth.uid()
    )
  );

-- Team leads: read + manage their own directly-assigned phones (their stock)
CREATE POLICY "phones_teamlead_own" ON public.phones
  FOR ALL USING (assigned_to = auth.uid());

-- Team leads: move phones between their stock and their agents in both directions.
--   USING:      current assigned_to is the team lead OR one of their agents
--   WITH CHECK: new assigned_to is the team lead OR one of their agents
-- This covers:
--   • Reassign from team lead → agent  (USING: own phone, WITH CHECK: agent)
--   • Move agent A → agent B           (USING: agent, WITH CHECK: agent)
--   • Return agent → team lead         (USING: agent, WITH CHECK: own id)
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
  );


-- ── ACTIVITY LOG ─────────────────────────────────────────────
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activity_admin_all"    ON public.activity_log;
DROP POLICY IF EXISTS "activity_teamlead_read"ON public.activity_log;
DROP POLICY IF EXISTS "activity_agent_read"   ON public.activity_log;
DROP POLICY IF EXISTS "activity_insert_auth"  ON public.activity_log;
DROP POLICY IF EXISTS "logs_admin_read"       ON public.activity_log;
DROP POLICY IF EXISTS "logs_insert_own"       ON public.activity_log;
DROP POLICY IF EXISTS "logs_read_own"         ON public.activity_log;

-- Admin: full access
CREATE POLICY "activity_admin_all" ON public.activity_log
  FOR ALL
  USING (auth.jwt() ->> 'email' = 'patrickwlax@gmail.com')
  WITH CHECK (auth.jwt() ->> 'email' = 'patrickwlax@gmail.com');

-- Team leads: read their team's activity
CREATE POLICY "activity_teamlead_read" ON public.activity_log
  FOR SELECT USING (team_lead_id = auth.uid());

-- Agents: read their own activity
CREATE POLICY "activity_agent_read" ON public.activity_log
  FOR SELECT USING (agent_id = auth.uid());

-- Any authenticated user: insert (enforced by app logic)
CREATE POLICY "activity_insert_auth" ON public.activity_log
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);


-- ── SALES ────────────────────────────────────────────────────
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sales_admin_all"              ON public.sales;
DROP POLICY IF EXISTS "sales_read_own"               ON public.sales;
DROP POLICY IF EXISTS "sales_insert_own"             ON public.sales;
DROP POLICY IF EXISTS "sales_teamlead_read_agents"   ON public.sales;

-- Admin: full access
CREATE POLICY "sales_admin_all" ON public.sales
  FOR ALL
  USING (auth.jwt() ->> 'email' = 'patrickwlax@gmail.com')
  WITH CHECK (auth.jwt() ->> 'email' = 'patrickwlax@gmail.com');

-- Agents/team leads: read + insert their own sales
CREATE POLICY "sales_read_own" ON public.sales
  FOR SELECT USING (sold_by = auth.uid());

CREATE POLICY "sales_insert_own" ON public.sales
  FOR INSERT WITH CHECK (sold_by = auth.uid());

-- Team leads: read their agents' sales
CREATE POLICY "sales_teamlead_read_agents" ON public.sales
  FOR SELECT USING (
    sold_by IN (
      SELECT id FROM public.profiles WHERE team_lead_id = auth.uid()
    )
  );


-- ── RETURNS ──────────────────────────────────────────────────
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "returns_admin_all"             ON public.returns;
DROP POLICY IF EXISTS "returns_agent_read_own"        ON public.returns;
DROP POLICY IF EXISTS "returns_agent_insert"          ON public.returns;
DROP POLICY IF EXISTS "returns_teamlead_read_agents"  ON public.returns;
DROP POLICY IF EXISTS "returns_teamlead_update_agents"ON public.returns;
DROP POLICY IF EXISTS "returns_read_own"              ON public.returns;
DROP POLICY IF EXISTS "returns_insert_own"            ON public.returns;

-- Admin: full access
CREATE POLICY "returns_admin_all" ON public.returns
  FOR ALL
  USING (auth.jwt() ->> 'email' = 'patrickwlax@gmail.com')
  WITH CHECK (auth.jwt() ->> 'email' = 'patrickwlax@gmail.com');

-- Agents/team leads: read + submit their own returns
CREATE POLICY "returns_agent_read_own" ON public.returns
  FOR SELECT USING (returned_by = auth.uid());

CREATE POLICY "returns_agent_insert" ON public.returns
  FOR INSERT WITH CHECK (returned_by = auth.uid());

-- Team leads: read + resolve their agents' returns
CREATE POLICY "returns_teamlead_read_agents" ON public.returns
  FOR SELECT USING (
    returned_by IN (
      SELECT id FROM public.profiles WHERE team_lead_id = auth.uid()
    )
  );

CREATE POLICY "returns_teamlead_update_agents" ON public.returns
  FOR UPDATE USING (
    returned_by IN (
      SELECT id FROM public.profiles WHERE team_lead_id = auth.uid()
    )
  );


-- ── RECEIPTS ─────────────────────────────────────────────────
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "receipts_admin_all"         ON public.receipts;
DROP POLICY IF EXISTS "receipts_agent_own"         ON public.receipts;
DROP POLICY IF EXISTS "receipts_agent_insert"      ON public.receipts;
DROP POLICY IF EXISTS "receipts_agent_update_own"  ON public.receipts;
DROP POLICY IF EXISTS "receipts_teamlead_agents"   ON public.receipts;

-- Admin: full access
CREATE POLICY "receipts_admin_all" ON public.receipts
  FOR ALL
  USING (auth.jwt() ->> 'email' = 'patrickwlax@gmail.com')
  WITH CHECK (auth.jwt() ->> 'email' = 'patrickwlax@gmail.com');

-- Agents: read, insert, update their own receipts
CREATE POLICY "receipts_agent_own" ON public.receipts
  FOR SELECT USING (agent_id = auth.uid());

CREATE POLICY "receipts_agent_insert" ON public.receipts
  FOR INSERT WITH CHECK (agent_id = auth.uid());

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

DROP POLICY IF EXISTS "notif_read_own"   ON public.notifications;
DROP POLICY IF EXISTS "notif_insert_any" ON public.notifications;
DROP POLICY IF EXISTS "notif_update_own" ON public.notifications;
DROP POLICY IF EXISTS "notif_admin_all"  ON public.notifications;

-- Admin: full access
CREATE POLICY "notif_admin_all" ON public.notifications
  FOR ALL
  USING (auth.jwt() ->> 'email' = 'patrickwlax@gmail.com')
  WITH CHECK (auth.jwt() ->> 'email' = 'patrickwlax@gmail.com');

-- Users: read their own notifications
CREATE POLICY "notif_read_own" ON public.notifications
  FOR SELECT USING (recipient_id = auth.uid());

-- Any authenticated user: insert notifications (app sends to admin)
CREATE POLICY "notif_insert_any" ON public.notifications
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Users: mark their own notifications as read
CREATE POLICY "notif_update_own" ON public.notifications
  FOR UPDATE USING (recipient_id = auth.uid());


-- ── Confirm what's in place ───────────────────────────────────
SELECT tablename, COUNT(*) AS policies
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;
