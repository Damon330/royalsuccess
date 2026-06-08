-- ============================================================
-- Royal Success — Fix Everything (Run this in Supabase SQL Editor)
-- ============================================================

-- Step 1: Disable RLS completely so queries always work
ALTER TABLE public.phones DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log DISABLE ROW LEVEL SECURITY;

-- Step 2: Fix admin profile (ensures correct role/status)
INSERT INTO public.profiles (id, full_name, role, status)
SELECT id, 'Admin', 'admin', 'active'
FROM auth.users
WHERE email = 'patrickwlax@gmail.com'
ON CONFLICT (id) DO UPDATE
  SET role = 'admin', status = 'active', full_name = 'Admin';

-- Step 3: Wipe old demo data
DELETE FROM public.activity_log;
DELETE FROM public.phones;
DELETE FROM public.profiles
WHERE id NOT IN (SELECT id FROM auth.users WHERE email = 'patrickwlax@gmail.com');

-- Step 4: Insert demo team leads (fake UUIDs — for demo only)
INSERT INTO public.profiles (id, full_name, role, status, created_at) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Chidi Okonkwo',  'team_lead', 'active', now() - interval '30 days'),
  ('22222222-2222-2222-2222-222222222222', 'Amaka Eze',      'team_lead', 'active', now() - interval '25 days')
ON CONFLICT (id) DO UPDATE SET role = 'team_lead', status = 'active';

-- Step 5: Insert demo agents
INSERT INTO public.profiles (id, full_name, role, status, team_lead_id, created_at) VALUES
  ('33333333-3333-3333-3333-333333333333', 'Emeka Nwosu',   'agent', 'active', '11111111-1111-1111-1111-111111111111', now() - interval '20 days'),
  ('44444444-4444-4444-4444-444444444444', 'Ngozi Adeyemi', 'agent', 'active', '11111111-1111-1111-1111-111111111111', now() - interval '18 days'),
  ('55555555-5555-5555-5555-555555555555', 'Tunde Bakare',  'agent', 'active', '22222222-2222-2222-2222-222222222222', now() - interval '15 days'),
  ('66666666-6666-6666-6666-666666666666', 'Ifeanyi Obi',   'agent', 'active', '22222222-2222-2222-2222-222222222222', now() - interval '12 days')
ON CONFLICT (id) DO UPDATE SET role = 'agent', status = 'active';

-- Step 6: Insert in-stock phones (10 phones)
INSERT INTO public.phones (model, serial_number, status, created_at) VALUES
  ('iPhone 15',        'SN-IP15-001',  'in_stock', now() - interval '10 days'),
  ('iPhone 15',        'SN-IP15-002',  'in_stock', now() - interval '10 days'),
  ('iPhone 15 Pro',    'SN-IP15P-001', 'in_stock', now() - interval '9 days'),
  ('iPhone 15 Pro',    'SN-IP15P-002', 'in_stock', now() - interval '9 days'),
  ('Samsung S24',      'SN-S24-001',   'in_stock', now() - interval '8 days'),
  ('Samsung S24',      'SN-S24-002',   'in_stock', now() - interval '8 days'),
  ('Samsung S24 Ultra','SN-S24U-001',  'in_stock', now() - interval '7 days'),
  ('Tecno Spark 20',   'SN-TS20-001',  'in_stock', now() - interval '6 days'),
  ('Tecno Spark 20',   'SN-TS20-002',  'in_stock', now() - interval '6 days'),
  ('Infinix Note 40',  'SN-IN40-001',  'in_stock', now() - interval '5 days');

-- Step 7: Assigned phones — Emeka (3 phones)
INSERT INTO public.phones (model, serial_number, status, assigned_to, assigned_at, created_at) VALUES
  ('iPhone 14',     'SN-IP14-001', 'assigned', '33333333-3333-3333-3333-333333333333', now() - interval '5 days', now() - interval '14 days'),
  ('iPhone 14',     'SN-IP14-002', 'assigned', '33333333-3333-3333-3333-333333333333', now() - interval '5 days', now() - interval '14 days'),
  ('Samsung S23',   'SN-S23-001',  'assigned', '33333333-3333-3333-3333-333333333333', now() - interval '4 days', now() - interval '13 days');

-- Step 8: Assigned phones — Ngozi (2 phones)
INSERT INTO public.phones (model, serial_number, status, assigned_to, assigned_at, created_at) VALUES
  ('Tecno Camon 30','SN-TC30-001', 'assigned', '44444444-4444-4444-4444-444444444444', now() - interval '3 days', now() - interval '12 days'),
  ('Tecno Camon 30','SN-TC30-002', 'assigned', '44444444-4444-4444-4444-444444444444', now() - interval '3 days', now() - interval '12 days');

-- Step 9: Assigned phones — Tunde and Ifeanyi (2 phones each)
INSERT INTO public.phones (model, serial_number, status, assigned_to, assigned_at, created_at) VALUES
  ('Xiaomi 14',     'SN-XI14-001', 'assigned', '55555555-5555-5555-5555-555555555555', now() - interval '4 days', now() - interval '11 days'),
  ('Xiaomi 14',     'SN-XI14-002', 'assigned', '66666666-6666-6666-6666-666666666666', now() - interval '4 days', now() - interval '11 days');

-- Step 10: Sold phones (5 phones across agents)
INSERT INTO public.phones (model, serial_number, status, assigned_to, assigned_at, sold_at, created_at) VALUES
  ('iPhone 13',     'SN-IP13-001', 'sold', '33333333-3333-3333-3333-333333333333', now() - interval '15 days', now() - interval '10 days', now() - interval '20 days'),
  ('iPhone 13',     'SN-IP13-002', 'sold', '44444444-4444-4444-4444-444444444444', now() - interval '14 days', now() - interval '9 days',  now() - interval '20 days'),
  ('Samsung S22',   'SN-S22-001',  'sold', '55555555-5555-5555-5555-555555555555', now() - interval '12 days', now() - interval '7 days',  now() - interval '18 days'),
  ('Samsung S22',   'SN-S22-002',  'sold', '66666666-6666-6666-6666-666666666666', now() - interval '11 days', now() - interval '6 days',  now() - interval '17 days'),
  ('Tecno Spark 10','SN-TS10-001', 'sold', '55555555-5555-5555-5555-555555555555', now() - interval '10 days', now() - interval '5 days',  now() - interval '16 days');

-- Step 11: Activity logs for all sold phones
INSERT INTO public.activity_log (phone_id, action, performed_by)
SELECT id, 'sold', assigned_to
FROM public.phones
WHERE status = 'sold';

-- Step 12: Activity logs for all assigned phones
INSERT INTO public.activity_log (phone_id, action, performed_by)
SELECT p.id, 'assigned',
  (SELECT id FROM auth.users WHERE email = 'patrickwlax@gmail.com' LIMIT 1)
FROM public.phones p
WHERE p.status IN ('assigned', 'sold');

-- Step 13: Verify everything looks correct
SELECT
  (SELECT count(*) FROM public.profiles)    AS profiles_count,
  (SELECT count(*) FROM public.phones)      AS phones_count,
  (SELECT count(*) FROM public.activity_log) AS logs_count,
  (SELECT count(*) FROM public.phones WHERE status = 'in_stock')  AS in_stock,
  (SELECT count(*) FROM public.phones WHERE status = 'assigned')  AS assigned,
  (SELECT count(*) FROM public.phones WHERE status = 'sold')      AS sold;
