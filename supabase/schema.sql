-- ============================================================
-- Royal Success — Supabase PostgreSQL Schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- ── Extensions ────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── Enums ─────────────────────────────────────────────────────
create type public.user_role as enum ('admin', 'team_lead', 'agent');
create type public.profile_status as enum ('pending', 'active');
create type public.phone_status as enum ('in_stock', 'assigned', 'sold');
create type public.activity_action as enum ('assigned', 'sold');

-- ── Profiles ──────────────────────────────────────────────────
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text not null default '',
  phone_number  text,
  role          public.user_role not null default 'agent',
  team_lead_id  uuid references public.profiles(id) on delete set null,
  status        public.profile_status not null default 'pending',
  created_at    timestamptz not null default now()
);

-- ── Phones ────────────────────────────────────────────────────
create table public.phones (
  id             uuid primary key default uuid_generate_v4(),
  model          text not null,
  serial_number  text not null unique,
  status         public.phone_status not null default 'in_stock',
  assigned_to    uuid references public.profiles(id) on delete set null,
  assigned_at    timestamptz,
  sold_at        timestamptz,
  created_at     timestamptz not null default now()
);

-- ── Activity Log ──────────────────────────────────────────────
create table public.activity_log (
  id            uuid primary key default uuid_generate_v4(),
  phone_id      uuid not null references public.phones(id) on delete cascade,
  action        public.activity_action not null,
  performed_by  uuid not null references public.profiles(id) on delete cascade,
  timestamp     timestamptz not null default now()
);

-- ── Indexes ───────────────────────────────────────────────────
create index on public.phones (assigned_to);
create index on public.phones (status);
create index on public.profiles (team_lead_id);
create index on public.profiles (status);
create index on public.activity_log (phone_id);
create index on public.activity_log (performed_by);

-- ── Trigger: auto-create profile on sign-up ───────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'pending'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── Enable Realtime on phones table ───────────────────────────
alter publication supabase_realtime add table public.phones;

-- ── Row Level Security ─────────────────────────────────────────
alter table public.profiles     enable row level security;
alter table public.phones       enable row level security;
alter table public.activity_log enable row level security;

-- ┌──────────────────────────────────────────────────────────────┐
-- │  PROFILES policies                                           │
-- └──────────────────────────────────────────────────────────────┘

-- Everyone reads their own profile
create policy "profiles_read_own"
  on public.profiles for select
  using (auth.uid() = id);

-- Admin reads all profiles
create policy "profiles_admin_read_all"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Team leads read profiles of their own agents
create policy "profiles_teamlead_read_agents"
  on public.profiles for select
  using (team_lead_id = auth.uid());

-- Any authenticated user can insert their own profile row
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Admin can update any profile (approvals, role assignments)
create policy "profiles_admin_update"
  on public.profiles for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Users can update their own profile
create policy "profiles_self_update"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ┌──────────────────────────────────────────────────────────────┐
-- │  PHONES policies                                             │
-- └──────────────────────────────────────────────────────────────┘

-- Admin has full access to all phones
create policy "phones_admin_all"
  on public.phones for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Agents read their own assigned phones
create policy "phones_agent_read_own"
  on public.phones for select
  using (assigned_to = auth.uid());

-- Agents can update their own phones (mark as sold)
create policy "phones_agent_update_own"
  on public.phones for update
  using (assigned_to = auth.uid())
  with check (assigned_to = auth.uid());

-- Team leads read phones of their agents
create policy "phones_teamlead_read_agents"
  on public.phones for select
  using (
    assigned_to in (
      select id from public.profiles
      where team_lead_id = auth.uid()
    )
  );

-- Team leads read and update their own phones
create policy "phones_teamlead_own"
  on public.phones for all
  using (assigned_to = auth.uid());

-- ┌──────────────────────────────────────────────────────────────┐
-- │  ACTIVITY LOG policies                                       │
-- └──────────────────────────────────────────────────────────────┘

-- Admin reads all log entries
create policy "logs_admin_read"
  on public.activity_log for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Users insert their own log entries
create policy "logs_insert_own"
  on public.activity_log for insert
  with check (performed_by = auth.uid());

-- Users read their own log entries
create policy "logs_read_own"
  on public.activity_log for select
  using (performed_by = auth.uid());
