-- ── Telemetry tables ─────────────────────────────────────────────────────────
-- Run once in the Supabase SQL Editor.
-- error_logs  → JS errors, unhandled rejections, React boundary catches
-- perf_logs   → slow queries (>2s), Web Vitals (CLS, FCP, INP, LCP, TTFB),
--               and per-request latency tracked by tracked() in telemetry.ts

-- ── error_logs ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.error_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  error_type  text NOT NULL,              -- 'JS_ERROR' | 'UNHANDLED_REJECTION' | 'FETCH_ERROR' etc.
  message     text NOT NULL,
  context     jsonb,                      -- stack trace, component stack, extra metadata
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

-- Authenticated users may insert their own error rows
CREATE POLICY "error_logs_insert" ON public.error_logs
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND (user_id = auth.uid() OR user_id IS NULL));

-- Only admin can read error logs
CREATE POLICY "error_logs_admin_read" ON public.error_logs
  FOR SELECT USING (
    auth.jwt() ->> 'email' = current_setting('app.admin_email', true)
    OR auth.jwt() ->> 'email' = 'patrickwlax@gmail.com'
  );

-- No updates or deletes — logs are immutable
CREATE POLICY "error_logs_no_update" ON public.error_logs FOR UPDATE USING (false);
CREATE POLICY "error_logs_no_delete" ON public.error_logs FOR DELETE USING (false);

-- Fast lookup by user and time
CREATE INDEX IF NOT EXISTS idx_error_logs_user_created
  ON public.error_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_error_logs_type_created
  ON public.error_logs (error_type, created_at DESC);


-- ── perf_logs ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.perf_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  label       text NOT NULL,              -- operation name, e.g. 'inventory-page' or 'LCP'
  duration_ms numeric(10, 2) NOT NULL,    -- measured duration in milliseconds
  meta        jsonb,                      -- Web Vitals rating, page, filter, etc.
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.perf_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "perf_logs_insert" ON public.perf_logs
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND (user_id = auth.uid() OR user_id IS NULL));

CREATE POLICY "perf_logs_admin_read" ON public.perf_logs
  FOR SELECT USING (
    auth.jwt() ->> 'email' = current_setting('app.admin_email', true)
    OR auth.jwt() ->> 'email' = 'patrickwlax@gmail.com'
  );

CREATE POLICY "perf_logs_no_update" ON public.perf_logs FOR UPDATE USING (false);
CREATE POLICY "perf_logs_no_delete" ON public.perf_logs FOR DELETE USING (false);

-- Fast lookup for slow query analysis
CREATE INDEX IF NOT EXISTS idx_perf_logs_label_duration
  ON public.perf_logs (label, duration_ms DESC);

CREATE INDEX IF NOT EXISTS idx_perf_logs_created
  ON public.perf_logs (created_at DESC);
