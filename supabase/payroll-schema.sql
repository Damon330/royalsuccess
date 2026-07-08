-- ── Payroll System — Royal Success ──────────────────────────────────────────
-- Run in the Supabase SQL Editor ONCE before using the payroll feature.
-- All tables have RLS enabled. Admin email check matches the existing pattern.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. PAYROLL CONFIGS — base salary + commission rule per employee (or global)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_configs (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id         uuid        REFERENCES profiles(id) ON DELETE CASCADE,
  -- NULL employee_id = global default applied to everyone without a specific rule
  base_salary         numeric(12,2) NOT NULL DEFAULT 0,
  payment_frequency   text        NOT NULL DEFAULT 'monthly'
                      CHECK (payment_frequency IN ('daily','weekly','monthly')),
  commission_mode     text        NOT NULL DEFAULT 'fixed'
                      CHECK (commission_mode IN ('fixed','percentage')),
  -- fixed: ₦ per unit sold  |  percentage: decimal e.g. 0.05 = 5% of agreed_price
  commission_value    numeric(12,2) NOT NULL DEFAULT 0,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Enforce at most one config per employee (NULLs allowed for global default)
CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_configs_employee
  ON payroll_configs (employee_id)
  WHERE employee_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. PAYROLL TARGETS — performance targets per employee
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_targets (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  metric          text        NOT NULL CHECK (metric IN ('units','revenue')),
  period          text        NOT NULL CHECK (period IN ('weekly','monthly')),
  target_value    numeric(12,2) NOT NULL CHECK (target_value > 0),
  -- Reward modes:
  --  FIXED_REWARD       → flat bonus when target is met (reward_value = ₦ amount)
  --  ALL_SALES          → per-unit bonus for every unit/₦ sold (reward_value = ₦ per unit or decimal %)
  --  ABOVE_TARGET_ONLY  → per-unit bonus only for units/₦ above the target
  reward_mode     text        NOT NULL
                  CHECK (reward_mode IN ('FIXED_REWARD','ALL_SALES','ABOVE_TARGET_ONLY')),
  reward_value    numeric(12,2) NOT NULL DEFAULT 0 CHECK (reward_value >= 0),
  active          boolean     NOT NULL DEFAULT true,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Only one active target per employee
CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_targets_employee_active
  ON payroll_targets (employee_id)
  WHERE active = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. PAYROLL RUNS — immutable snapshots once generated
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_runs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start    date        NOT NULL,
  period_end      date        NOT NULL,
  frequency       text        NOT NULL CHECK (frequency IN ('weekly','monthly','custom')),
  status          text        NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','approved','paid')),
  generated_by    uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  generated_at    timestamptz NOT NULL DEFAULT now(),
  total_payout    numeric(12,2) NOT NULL DEFAULT 0,
  employee_count  integer     NOT NULL DEFAULT 0,
  notes           text,
  CONSTRAINT runs_period_valid CHECK (period_end >= period_start)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. PAYROLL ENTRIES — per-employee breakdown (immutable once run is generated)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_entries (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id              uuid        NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id         uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  -- Snapshot fields — captured at generation time so edits don't affect past runs
  employee_name       text        NOT NULL,
  employee_role       text        NOT NULL,
  base_salary         numeric(12,2) NOT NULL DEFAULT 0,
  total_commission    numeric(12,2) NOT NULL DEFAULT 0,
  performance_bonus   numeric(12,2) NOT NULL DEFAULT 0,
  total_earnings      numeric(12,2) NOT NULL DEFAULT 0,
  units_sold          integer     NOT NULL DEFAULT 0,
  revenue             numeric(12,2) NOT NULL DEFAULT 0,
  target_met          boolean     NOT NULL DEFAULT false,
  -- Full calculation trace for auditability
  breakdown           jsonb       NOT NULL DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_entries_run
  ON payroll_entries (run_id);

CREATE INDEX IF NOT EXISTS idx_payroll_runs_status_period
  ON payroll_runs (status, period_start DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RLS POLICIES
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE payroll_configs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_targets  ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_runs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_entries  ENABLE ROW LEVEL SECURITY;

-- Admin full access (JWT email check — must match fix-all-rls.sql pattern)
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

-- Employees can read their own payroll entry (view their own pay stub)
CREATE POLICY "employee_read_own_entry" ON payroll_entries
  FOR SELECT USING (employee_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. AUTO-UPDATE updated_at
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_payroll_configs_updated_at ON payroll_configs;
CREATE TRIGGER trg_payroll_configs_updated_at
  BEFORE UPDATE ON payroll_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_payroll_targets_updated_at ON payroll_targets;
CREATE TRIGGER trg_payroll_targets_updated_at
  BEFORE UPDATE ON payroll_targets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
