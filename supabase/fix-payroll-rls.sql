-- Fix Payroll RLS Policies — run in Supabase SQL Editor
-- Fixes: auth.email() → auth.jwt() ->> 'email', adds hardcoded fallback, adds WITH CHECK.
-- Also fixes a schema contradiction in payroll_entries (NOT NULL + ON DELETE SET NULL).

-- ── Drop broken policies ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "admin_all_payroll_configs"  ON payroll_configs;
DROP POLICY IF EXISTS "admin_all_payroll_targets"  ON payroll_targets;
DROP POLICY IF EXISTS "admin_all_payroll_runs"     ON payroll_runs;
DROP POLICY IF EXISTS "admin_all_payroll_entries"  ON payroll_entries;

-- ── Recreate with correct pattern ─────────────────────────────────────────────

CREATE POLICY "admin_all_payroll_configs" ON payroll_configs
  FOR ALL
  USING (
    auth.jwt() ->> 'email' = current_setting('app.admin_email', true)
    OR auth.jwt() ->> 'email' = 'patrickwlax@gmail.com'
  )
  WITH CHECK (
    auth.jwt() ->> 'email' = current_setting('app.admin_email', true)
    OR auth.jwt() ->> 'email' = 'patrickwlax@gmail.com'
  );

CREATE POLICY "admin_all_payroll_targets" ON payroll_targets
  FOR ALL
  USING (
    auth.jwt() ->> 'email' = current_setting('app.admin_email', true)
    OR auth.jwt() ->> 'email' = 'patrickwlax@gmail.com'
  )
  WITH CHECK (
    auth.jwt() ->> 'email' = current_setting('app.admin_email', true)
    OR auth.jwt() ->> 'email' = 'patrickwlax@gmail.com'
  );

CREATE POLICY "admin_all_payroll_runs" ON payroll_runs
  FOR ALL
  USING (
    auth.jwt() ->> 'email' = current_setting('app.admin_email', true)
    OR auth.jwt() ->> 'email' = 'patrickwlax@gmail.com'
  )
  WITH CHECK (
    auth.jwt() ->> 'email' = current_setting('app.admin_email', true)
    OR auth.jwt() ->> 'email' = 'patrickwlax@gmail.com'
  );

CREATE POLICY "admin_all_payroll_entries" ON payroll_entries
  FOR ALL
  USING (
    auth.jwt() ->> 'email' = current_setting('app.admin_email', true)
    OR auth.jwt() ->> 'email' = 'patrickwlax@gmail.com'
  )
  WITH CHECK (
    auth.jwt() ->> 'email' = current_setting('app.admin_email', true)
    OR auth.jwt() ->> 'email' = 'patrickwlax@gmail.com'
  );

-- Keep the employee self-read policy (unchanged — was correct)
DROP POLICY IF EXISTS "employee_read_own_entry" ON payroll_entries;
CREATE POLICY "employee_read_own_entry" ON payroll_entries
  FOR SELECT USING (employee_id = auth.uid());

-- ── Fix schema contradiction ───────────────────────────────────────────────────
-- employee_id was NOT NULL + ON DELETE SET NULL which is contradictory:
-- PostgreSQL would error when deleting a profile that has payroll entries.
-- payroll_entries are audit snapshots — employee_name is already captured,
-- so employee_id can safely be nullable to allow profile deletion.
ALTER TABLE payroll_entries ALTER COLUMN employee_id DROP NOT NULL;
