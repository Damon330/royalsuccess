-- ============================================================
-- Royal Success — Complete All-In-One Setup
-- Run this in: Supabase → SQL Editor → New Query → Paste → Run
-- ============================================================
--
--   ADMIN:     patrickwlax@gmail.com         (your existing password)
--   TEAM LEAD: teamlead@royalsuccess.com     Password: Demo1234!
--   AGENT:     agent@royalsuccess.com        Password: Demo1234!
--
-- ============================================================

-- ── 1. Drop ALL problematic FK constraints ───────────────────
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_team_lead_id_fkey;

-- ── 2. Clean up any previous failed demo data ────────────────
DELETE FROM auth.identities
WHERE user_id IN (
  SELECT id FROM auth.users
  WHERE email IN ('teamlead@royalsuccess.com', 'agent@royalsuccess.com')
);
DELETE FROM auth.users
WHERE email IN ('teamlead@royalsuccess.com', 'agent@royalsuccess.com');
DELETE FROM public.profiles WHERE id IN (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '22222222-2222-2222-2222-222222222222',
  '44444444-4444-4444-4444-444444444444',
  '55555555-5555-5555-5555-555555555555',
  '66666666-6666-6666-6666-666666666666'
);

-- ── 3. Create Team Lead auth account (Chidi Okonkwo) ─────────
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'teamlead@royalsuccess.com',
  crypt('Demo1234!', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Chidi Okonkwo"}',
  now() - interval '25 days', now()
);
INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES (
  'teamlead@royalsuccess.com',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","email":"teamlead@royalsuccess.com","email_verified":true,"phone_verified":false}',
  'email', now(), now(), now()
);

-- ── 4. Create Agent auth account (Emeka Nwosu) ───────────────
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) VALUES (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'agent@royalsuccess.com',
  crypt('Demo1234!', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Emeka Nwosu"}',
  now() - interval '20 days', now()
);
INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES (
  'agent@royalsuccess.com',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","email":"agent@royalsuccess.com","email_verified":true,"phone_verified":false}',
  'email', now(), now(), now()
);

-- ── 5. Fix admin profile ──────────────────────────────────────
INSERT INTO public.profiles (id, full_name, role, status)
SELECT id, 'Admin', 'admin', 'active'
FROM auth.users WHERE email = 'patrickwlax@gmail.com'
ON CONFLICT (id) DO UPDATE SET role = 'admin', status = 'active';

-- ── 6. Insert ALL profiles in one go (FKs are dropped — order doesn't matter) ─
INSERT INTO public.profiles (id, full_name, role, status, team_lead_id, created_at) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Chidi Okonkwo',  'team_lead', 'active', NULL,                                   now() - interval '25 days'),
  ('22222222-2222-2222-2222-222222222222', 'Amaka Eze',       'team_lead', 'active', NULL,                                   now() - interval '28 days'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Emeka Nwosu',    'agent',     'active', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now() - interval '20 days'),
  ('44444444-4444-4444-4444-444444444444', 'Ngozi Adeyemi',  'agent',     'active', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now() - interval '18 days'),
  ('55555555-5555-5555-5555-555555555555', 'Tunde Bakare',   'agent',     'active', '22222222-2222-2222-2222-222222222222', now() - interval '15 days'),
  ('66666666-6666-6666-6666-666666666666', 'Ifeanyi Obi',    'agent',     'active', '22222222-2222-2222-2222-222222222222', now() - interval '12 days')
ON CONFLICT (id) DO UPDATE SET
  full_name    = EXCLUDED.full_name,
  role         = EXCLUDED.role,
  status       = EXCLUDED.status,
  team_lead_id = EXCLUDED.team_lead_id;

-- ── 7. Reset phones so we have a clean slate ──────────────────
UPDATE public.phones
SET status = 'in_stock', assigned_to = NULL, assigned_at = NULL, sold_at = NULL
WHERE assigned_to IN (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '22222222-2222-2222-2222-222222222222',
  '44444444-4444-4444-4444-444444444444',
  '55555555-5555-5555-5555-555555555555',
  '66666666-6666-6666-6666-666666666666'
);

-- ── 8. Assign 4 phones to Chidi (Team Lead) ───────────────────
WITH p AS (SELECT id FROM public.phones WHERE status = 'in_stock' ORDER BY created_at LIMIT 4)
UPDATE public.phones SET status = 'assigned', assigned_to = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', assigned_at = now() - interval '6 days'
WHERE id IN (SELECT id FROM p);

-- ── 9. Assign 4 phones to Emeka (Agent) ───────────────────────
WITH p AS (SELECT id FROM public.phones WHERE status = 'in_stock' ORDER BY created_at LIMIT 4)
UPDATE public.phones SET status = 'assigned', assigned_to = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', assigned_at = now() - interval '4 days'
WHERE id IN (SELECT id FROM p);

-- ── 10. Assign phones to display-only members ─────────────────
WITH p AS (SELECT id FROM public.phones WHERE status = 'in_stock' ORDER BY created_at LIMIT 3)
UPDATE public.phones SET status = 'assigned', assigned_to = '44444444-4444-4444-4444-444444444444', assigned_at = now() - interval '3 days'
WHERE id IN (SELECT id FROM p);

WITH p AS (SELECT id FROM public.phones WHERE status = 'in_stock' ORDER BY created_at LIMIT 2)
UPDATE public.phones SET status = 'assigned', assigned_to = '55555555-5555-5555-5555-555555555555', assigned_at = now() - interval '2 days'
WHERE id IN (SELECT id FROM p);

-- ── 11. Mark 1 Emeka phone + 1 Ngozi phone as sold ───────────
WITH p AS (SELECT id FROM public.phones WHERE assigned_to = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' AND status = 'assigned' LIMIT 1)
UPDATE public.phones SET status = 'sold', sold_at = now() - interval '1 day' WHERE id IN (SELECT id FROM p);

WITH p AS (SELECT id FROM public.phones WHERE assigned_to = '44444444-4444-4444-4444-444444444444' AND status = 'assigned' LIMIT 1)
UPDATE public.phones SET status = 'sold', sold_at = now() - interval '2 days' WHERE id IN (SELECT id FROM p);

-- ── 12. Activity logs ─────────────────────────────────────────
DELETE FROM public.activity_log WHERE performed_by IN (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '44444444-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555555'
);
INSERT INTO public.activity_log (phone_id, action, performed_by)
SELECT id, 'assigned', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' FROM public.phones WHERE assigned_to = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
INSERT INTO public.activity_log (phone_id, action, performed_by)
SELECT id, 'assigned', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' FROM public.phones WHERE assigned_to = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
INSERT INTO public.activity_log (phone_id, action, performed_by)
SELECT id, 'sold', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' FROM public.phones WHERE assigned_to = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' AND status = 'sold';
INSERT INTO public.activity_log (phone_id, action, performed_by)
SELECT id, 'sold', '44444444-4444-4444-4444-444444444444' FROM public.phones WHERE assigned_to = '44444444-4444-4444-4444-444444444444' AND status = 'sold';

-- ── 13. Verify ───────────────────────────────────────────────
SELECT u.email, p.full_name, p.role, p.status, COUNT(ph.id) AS phones_count
FROM auth.users u
JOIN public.profiles p ON p.id = u.id
LEFT JOIN public.phones ph ON ph.assigned_to = u.id
WHERE u.email IN ('patrickwlax@gmail.com', 'teamlead@royalsuccess.com', 'agent@royalsuccess.com')
GROUP BY u.email, p.full_name, p.role, p.status
ORDER BY p.role;
