# Royal Success — Phone Inventory & Field Sales App

A full-stack PWA for tracking phone inventory and field sales across admin, team leads, and agents.

**Tech stack:** React + Vite + TypeScript · Supabase (Auth, PostgreSQL, Realtime) · Tailwind CSS · vite-plugin-pwa

---

## Quick Start

### 1. Clone and install

```bash
npm install
```

### 2. Set up Supabase

1. Go to [supabase.com](https://supabase.com) and create a new project (free tier works).
2. In the Supabase dashboard → **SQL Editor**, paste and run the contents of `supabase/schema.sql`.
3. In **Project Settings → API**, copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public key** → `VITE_SUPABASE_ANON_KEY`

### 3. Configure Google OAuth

1. Go to [console.cloud.google.com](https://console.cloud.google.com).
2. Create a project → **APIs & Services → Credentials → Create OAuth 2.0 Client ID**.
3. Set Authorized redirect URIs: `https://<your-supabase-project-id>.supabase.co/auth/v1/callback`
4. Copy the **Client ID** and **Client Secret**.
5. In Supabase dashboard → **Authentication → Providers → Google**, paste the credentials and enable.

### 4. Set environment variables

Copy `.env.example` to `.env` and fill in:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_ADMIN_EMAIL=your-admin-email@example.com
```

> `VITE_ADMIN_EMAIL` is the email address that will have permanent admin access. Sign in with this email first — it bypasses the pending approval flow automatically.

### 5. Generate PWA icons (optional)

```bash
npm install -D canvas
node scripts/generate-icons.mjs
```

Or drop your own 192×192 and 512×512 PNGs into `public/icons/`.

### 6. Run development server

```bash
npm run dev
```

---

## Deployment (Vercel)

1. Push to GitHub.
2. Import repo in [vercel.com](https://vercel.com) → **New Project**.
3. Vercel auto-detects Vite. Build command: `npm run build`. Output: `dist`.
4. Add your 3 environment variables in **Project Settings → Environment Variables**.
5. In Supabase → **Authentication → URL Configuration**, add your Vercel domain to **Redirect URLs**.

---

## Roles & Access

| Role | Access |
|---|---|
| `admin` | Full access — inventory, agents, assign phones, reports |
| `team_lead` | Own phones + view/track their agents' phones |
| `agent` | Own phones only — mark as sold via mobile-optimised UI |

- New sign-ups land on a **Pending** screen until the admin approves them.
- The admin email (set via `VITE_ADMIN_EMAIL`) is never pending — it gets admin access on first sign-in.

---

## PWA Installation

**Android (Chrome):** Tap the browser menu → "Add to Home Screen"  
**iPhone (Safari):** Tap the Share button → "Add to Home Screen"

The app opens in standalone mode (no browser bar) when launched from the home screen.

---

## Project Structure

```
src/
├── components/
│   ├── admin/       AdminDashboard, AdminInventory, AdminAgents, AdminAssignPhones, AdminReports
│   ├── agent/       AgentDashboard (mobile-first)
│   ├── teamlead/    TeamLeadDashboard
│   └── shared/      Button, Badge, Modal, Spinner, StatCard, Sidebar, Header
├── context/         AuthContext (session + profile + role)
├── hooks/           useAuth, usePhones, useProfiles
├── lib/             supabase.ts, constants.ts
├── pages/           LoginPage, PendingPage, Admin/TeamLead/AgentLayout
└── types/           index.ts (Profile, Phone, ActivityLog, enums)
supabase/
└── schema.sql       Full DB schema, RLS policies, triggers, indexes
```

---

## Database Schema

- **profiles** — user records (role, status, team_lead_id)
- **phones** — inventory items (model, serial, status, assigned_to)
- **activity_log** — audit trail of assignments and sales

All tables have Row Level Security (RLS). Supabase Realtime is enabled on `phones` only.
