-- ============================================================
-- Royal Success — Demo Seed Data
-- Run this in Supabase SQL Editor AFTER running schema.sql
-- Creates 2 team leads, 4 agents, and 40 phones with activity
-- Demo password for all users: Demo1234!
-- ============================================================

-- ── Step 1: Create demo auth users ────────────────────────────
INSERT INTO auth.users (
  id, instance_id, aud, role,
  email, encrypted_password, email_confirmed_at,
  created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  is_super_admin
) VALUES
  -- Team Leads
  (
    'aaaaaaaa-0001-0001-0001-aaaaaaaaaaaa',
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'chidi@royalsuccess.demo',
    crypt('Demo1234!', gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Chidi Okonkwo"}', false
  ),
  (
    'bbbbbbbb-0002-0002-0002-bbbbbbbbbbbb',
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'amaka@royalsuccess.demo',
    crypt('Demo1234!', gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Amaka Eze"}', false
  ),
  -- Agents under Chidi
  (
    'cccccccc-0003-0003-0003-cccccccccccc',
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'emeka@royalsuccess.demo',
    crypt('Demo1234!', gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Emeka Nwosu"}', false
  ),
  (
    'dddddddd-0004-0004-0004-dddddddddddd',
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'ngozi@royalsuccess.demo',
    crypt('Demo1234!', gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Ngozi Adeyemi"}', false
  ),
  -- Agents under Amaka
  (
    'eeeeeeee-0005-0005-0005-eeeeeeeeeeee',
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'tunde@royalsuccess.demo',
    crypt('Demo1234!', gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Tunde Bakare"}', false
  ),
  (
    'ffffffff-0006-0006-0006-ffffffffffff',
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'blessing@royalsuccess.demo',
    crypt('Demo1234!', gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Blessing Obi"}', false
  )
ON CONFLICT (id) DO NOTHING;

-- ── Step 2: Create auth identities (needed for email sign-in) ──
INSERT INTO auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
) VALUES
  (gen_random_uuid(), 'aaaaaaaa-0001-0001-0001-aaaaaaaaaaaa', 'chidi@royalsuccess.demo',
   '{"sub":"aaaaaaaa-0001-0001-0001-aaaaaaaaaaaa","email":"chidi@royalsuccess.demo"}',
   'email', now(), now(), now()),
  (gen_random_uuid(), 'bbbbbbbb-0002-0002-0002-bbbbbbbbbbbb', 'amaka@royalsuccess.demo',
   '{"sub":"bbbbbbbb-0002-0002-0002-bbbbbbbbbbbb","email":"amaka@royalsuccess.demo"}',
   'email', now(), now(), now()),
  (gen_random_uuid(), 'cccccccc-0003-0003-0003-cccccccccccc', 'emeka@royalsuccess.demo',
   '{"sub":"cccccccc-0003-0003-0003-cccccccccccc","email":"emeka@royalsuccess.demo"}',
   'email', now(), now(), now()),
  (gen_random_uuid(), 'dddddddd-0004-0004-0004-dddddddddddd', 'ngozi@royalsuccess.demo',
   '{"sub":"dddddddd-0004-0004-0004-dddddddddddd","email":"ngozi@royalsuccess.demo"}',
   'email', now(), now(), now()),
  (gen_random_uuid(), 'eeeeeeee-0005-0005-0005-eeeeeeeeeeee', 'tunde@royalsuccess.demo',
   '{"sub":"eeeeeeee-0005-0005-0005-eeeeeeeeeeee","email":"tunde@royalsuccess.demo"}',
   'email', now(), now(), now()),
  (gen_random_uuid(), 'ffffffff-0006-0006-0006-ffffffffffff', 'blessing@royalsuccess.demo',
   '{"sub":"ffffffff-0006-0006-0006-ffffffffffff","email":"blessing@royalsuccess.demo"}',
   'email', now(), now(), now())
ON CONFLICT DO NOTHING;

-- ── Step 3: Set up profiles with roles ────────────────────────
-- The trigger already created pending profiles, now we update them
UPDATE public.profiles SET
  full_name = 'Chidi Okonkwo', role = 'team_lead', status = 'active'
WHERE id = 'aaaaaaaa-0001-0001-0001-aaaaaaaaaaaa';

UPDATE public.profiles SET
  full_name = 'Amaka Eze', role = 'team_lead', status = 'active'
WHERE id = 'bbbbbbbb-0002-0002-0002-bbbbbbbbbbbb';

UPDATE public.profiles SET
  full_name = 'Emeka Nwosu', role = 'agent', status = 'active',
  team_lead_id = 'aaaaaaaa-0001-0001-0001-aaaaaaaaaaaa'
WHERE id = 'cccccccc-0003-0003-0003-cccccccccccc';

UPDATE public.profiles SET
  full_name = 'Ngozi Adeyemi', role = 'agent', status = 'active',
  team_lead_id = 'aaaaaaaa-0001-0001-0001-aaaaaaaaaaaa'
WHERE id = 'dddddddd-0004-0004-0004-dddddddddddd';

UPDATE public.profiles SET
  full_name = 'Tunde Bakare', role = 'agent', status = 'active',
  team_lead_id = 'bbbbbbbb-0002-0002-0002-bbbbbbbbbbbb'
WHERE id = 'eeeeeeee-0005-0005-0005-eeeeeeeeeeee';

UPDATE public.profiles SET
  full_name = 'Blessing Obi', role = 'agent', status = 'active',
  team_lead_id = 'bbbbbbbb-0002-0002-0002-bbbbbbbbbbbb'
WHERE id = 'ffffffff-0006-0006-0006-ffffffffffff';

-- ── Step 4: Insert phones ──────────────────────────────────────

-- 8 phones in stock (unassigned)
INSERT INTO public.phones (model, serial_number, status) VALUES
  ('iPhone 15 Pro Max', 'APPL-15PM-001', 'in_stock'),
  ('iPhone 15 Pro Max', 'APPL-15PM-002', 'in_stock'),
  ('Samsung Galaxy S24 Ultra', 'SMSG-S24U-001', 'in_stock'),
  ('Samsung Galaxy S24 Ultra', 'SMSG-S24U-002', 'in_stock'),
  ('Tecno Camon 30', 'TECN-C30-001', 'in_stock'),
  ('Tecno Camon 30', 'TECN-C30-002', 'in_stock'),
  ('Infinix Note 40 Pro', 'INFX-N40P-001', 'in_stock'),
  ('Infinix Note 40 Pro', 'INFX-N40P-002', 'in_stock');

-- Phones assigned to Chidi (team lead) — 3 assigned, 2 sold
INSERT INTO public.phones (model, serial_number, status, assigned_to, assigned_at) VALUES
  ('iPhone 15', 'APPL-15-C01', 'assigned', 'aaaaaaaa-0001-0001-0001-aaaaaaaaaaaa', now() - interval '10 days'),
  ('iPhone 15', 'APPL-15-C02', 'assigned', 'aaaaaaaa-0001-0001-0001-aaaaaaaaaaaa', now() - interval '10 days'),
  ('Samsung Galaxy S24', 'SMSG-S24-C01', 'assigned', 'aaaaaaaa-0001-0001-0001-aaaaaaaaaaaa', now() - interval '10 days');

INSERT INTO public.phones (model, serial_number, status, assigned_to, assigned_at, sold_at) VALUES
  ('Samsung Galaxy S24', 'SMSG-S24-C02', 'sold', 'aaaaaaaa-0001-0001-0001-aaaaaaaaaaaa', now() - interval '12 days', now() - interval '5 days'),
  ('Tecno Spark 20 Pro', 'TECN-S20P-C01', 'sold', 'aaaaaaaa-0001-0001-0001-aaaaaaaaaaaa', now() - interval '12 days', now() - interval '3 days');

-- Phones assigned to Emeka (agent under Chidi) — 4 assigned, 3 sold
INSERT INTO public.phones (model, serial_number, status, assigned_to, assigned_at) VALUES
  ('Tecno Camon 20', 'TECN-C20-E01', 'assigned', 'cccccccc-0003-0003-0003-cccccccccccc', now() - interval '8 days'),
  ('Infinix Hot 40i', 'INFX-H40I-E01', 'assigned', 'cccccccc-0003-0003-0003-cccccccccccc', now() - interval '8 days');

INSERT INTO public.phones (model, serial_number, status, assigned_to, assigned_at, sold_at) VALUES
  ('iPhone 14', 'APPL-14-E01', 'sold', 'cccccccc-0003-0003-0003-cccccccccccc', now() - interval '15 days', now() - interval '9 days'),
  ('iPhone 14', 'APPL-14-E02', 'sold', 'cccccccc-0003-0003-0003-cccccccccccc', now() - interval '15 days', now() - interval '7 days'),
  ('Samsung Galaxy A55', 'SMSG-A55-E01', 'sold', 'cccccccc-0003-0003-0003-cccccccccccc', now() - interval '15 days', now() - interval '4 days');

-- Phones assigned to Ngozi (agent under Chidi) — 4 assigned, 1 sold
INSERT INTO public.phones (model, serial_number, status, assigned_to, assigned_at) VALUES
  ('Samsung Galaxy A35', 'SMSG-A35-N01', 'assigned', 'dddddddd-0004-0004-0004-dddddddddddd', now() - interval '6 days'),
  ('Tecno Camon 20', 'TECN-C20-N01', 'assigned', 'dddddddd-0004-0004-0004-dddddddddddd', now() - interval '6 days'),
  ('Infinix Note 30', 'INFX-N30-N01', 'assigned', 'dddddddd-0004-0004-0004-dddddddddddd', now() - interval '6 days');

INSERT INTO public.phones (model, serial_number, status, assigned_to, assigned_at, sold_at) VALUES
  ('Itel A70', 'ITEL-A70-N01', 'sold', 'dddddddd-0004-0004-0004-dddddddddddd', now() - interval '10 days', now() - interval '2 days');

-- Phones assigned to Tunde (agent under Amaka) — 3 assigned, 3 sold
INSERT INTO public.phones (model, serial_number, status, assigned_to, assigned_at) VALUES
  ('iPhone 13', 'APPL-13-T01', 'assigned', 'eeeeeeee-0005-0005-0005-eeeeeeeeeeee', now() - interval '7 days'),
  ('Samsung Galaxy S23', 'SMSG-S23-T01', 'assigned', 'eeeeeeee-0005-0005-0005-eeeeeeeeeeee', now() - interval '7 days'),
  ('Tecno Phantom X2', 'TECN-PX2-T01', 'assigned', 'eeeeeeee-0005-0005-0005-eeeeeeeeeeee', now() - interval '7 days');

INSERT INTO public.phones (model, serial_number, status, assigned_to, assigned_at, sold_at) VALUES
  ('Infinix Zero 30', 'INFX-Z30-T01', 'sold', 'eeeeeeee-0005-0005-0005-eeeeeeeeeeee', now() - interval '14 days', now() - interval '8 days'),
  ('Tecno Spark 10 Pro', 'TECN-S10P-T01', 'sold', 'eeeeeeee-0005-0005-0005-eeeeeeeeeeee', now() - interval '14 days', now() - interval '6 days'),
  ('Samsung Galaxy A54', 'SMSG-A54-T01', 'sold', 'eeeeeeee-0005-0005-0005-eeeeeeeeeeee', now() - interval '14 days', now() - interval '1 day');

-- Phones assigned to Blessing (agent under Amaka) — 3 assigned, 2 sold
INSERT INTO public.phones (model, serial_number, status, assigned_to, assigned_at) VALUES
  ('iPhone 12', 'APPL-12-B01', 'assigned', 'ffffffff-0006-0006-0006-ffffffffffff', now() - interval '5 days'),
  ('Tecno Camon 19', 'TECN-C19-B01', 'assigned', 'ffffffff-0006-0006-0006-ffffffffffff', now() - interval '5 days'),
  ('Infinix Hot 30i', 'INFX-H30I-B01', 'assigned', 'ffffffff-0006-0006-0006-ffffffffffff', now() - interval '5 days');

INSERT INTO public.phones (model, serial_number, status, assigned_to, assigned_at, sold_at) VALUES
  ('Samsung Galaxy M34', 'SMSG-M34-B01', 'sold', 'ffffffff-0006-0006-0006-ffffffffffff', now() - interval '9 days', now() - interval '3 days'),
  ('Itel P40', 'ITEL-P40-B01', 'sold', 'ffffffff-0006-0006-0006-ffffffffffff', now() - interval '9 days', now() - interval '1 day');

-- Phones assigned to Amaka (team lead) — 2 assigned, 1 sold
INSERT INTO public.phones (model, serial_number, status, assigned_to, assigned_at) VALUES
  ('iPhone 15 Plus', 'APPL-15PL-A01', 'assigned', 'bbbbbbbb-0002-0002-0002-bbbbbbbbbbbb', now() - interval '9 days'),
  ('Samsung Galaxy S24+', 'SMSG-S24P-A01', 'assigned', 'bbbbbbbb-0002-0002-0002-bbbbbbbbbbbb', now() - interval '9 days');

INSERT INTO public.phones (model, serial_number, status, assigned_to, assigned_at, sold_at) VALUES
  ('Tecno Phantom V Fold', 'TECN-PVF-A01', 'sold', 'bbbbbbbb-0002-0002-0002-bbbbbbbbbbbb', now() - interval '11 days', now() - interval '4 days');

-- ── Step 5: Seed activity log ──────────────────────────────────
-- (admin user id — replace with your actual admin UUID if needed,
--  or leave as-is; these are just audit records for the demo)

INSERT INTO public.activity_log (phone_id, action, performed_by, timestamp)
SELECT p.id, 'assigned',
  (SELECT id FROM public.profiles WHERE role = 'admin' LIMIT 1),
  p.assigned_at
FROM public.phones p
WHERE p.assigned_to IS NOT NULL AND p.assigned_at IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.activity_log (phone_id, action, performed_by, timestamp)
SELECT p.id, 'sold',
  p.assigned_to,
  p.sold_at
FROM public.phones p
WHERE p.status = 'sold' AND p.sold_at IS NOT NULL
ON CONFLICT DO NOTHING;
