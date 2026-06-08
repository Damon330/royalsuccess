# Royal Success — Claude Code Project Guide

## Project Overview

Royal Success is a **phone inventory and field sales tracking system** for a Lagos-based business. It serves three user types across two contexts: admins on desktop, team leads on desktop/tablet, and agents on mobile (Android/iPhone). The app must work as a PWA that installs to the home screen and feels native.

---

## Architecture Decisions (Why, Not Just What)

### Frontend: React + Vite + TypeScript
- Vite gives fast HMR, tree-shaking, and native ES modules — critical for a PWA with lean bundles.
- TypeScript is non-negotiable for a multi-role system: role guards, database types, and API contracts all benefit from static types. Mistakes surface at build time, not in a customer's hands in Lagos.
- React with Context + custom hooks is the right abstraction level — not overkill (no Redux), not under-engineered (not prop-drilling).

### Backend: Supabase (PostgreSQL + Auth + Realtime)
- Supabase gives us a full backend without managing servers. Realtime subscriptions over WebSockets eliminate polling — when an admin assigns a phone, the agent's screen updates instantly.
- Row Level Security (RLS) on every table is the security model. The client never trusts role data from the frontend — every query is filtered server-side by the authenticated user's role.
- Google OAuth + Email/Password both handled by Supabase Auth natively.

### Styling: Tailwind CSS v3
- Utility-first CSS eliminates stylesheet maintenance overhead. Design tokens (colours, spacing) are configured once in `tailwind.config.js` and reused everywhere.
- Mobile-first responsive utilities make the agent view correct by default and the admin desktop view additive.

### PWA
- Vite PWA plugin (`vite-plugin-pwa`) with Workbox handles service worker generation, caching strategy, and manifest — zero manual service worker code.
- Offline-first caching for static assets; dynamic data falls through to Supabase.

---

## Colour System & Design Language

### Brand Colours (configure in tailwind.config.js)
```
primary:    #0F4C35  (deep green — sidebar, primary buttons, headers)
primary-light: #1A6B4A (hover states)
primary-pale:  #E8F5EE (backgrounds, card accents)
accent:     #F0A500  (warning badges, highlights)
danger:     #DC2626  (destructive actions)
surface:    #FFFFFF  (card backgrounds)
bg:         #F3F4F6  (page background)
text:       #111827  (body text)
muted:      #6B7280  (secondary text)
border:     #E5E7EB  (table borders, card borders)
```

### Typography
- Font: Inter (Google Fonts) — clean, highly legible at small sizes on mobile.
- Scale: `text-sm` for table data, `text-base` for body, `text-lg`/`text-xl` for headings.

### Component Design Principles (senior UX thinking)
1. **Role-scoped navigation** — each role sees only their relevant nav. Zero confusion.
2. **Mobile-first for agents** — min tap target 44px. Card layout, no tables. Large "Mark as Sold" CTA.
3. **Confirmation dialogs** — destructive/irreversible actions (marking sold) always require an explicit confirm step. Prevents accidents in the field.
4. **Real-time feedback** — optimistic UI updates on sell action (card fades immediately), then Supabase confirms. User never waits.
5. **Loading states** — every async action has a spinner or skeleton. No blank screens.
6. **Empty states** — every list shows a friendly message when empty. No blank space.
7. **Status badges** — colour-coded: blue for team_lead, green for agent/active, yellow for pending, red for sold/danger.

---

## File Structure

```
royalsuccess/
├── public/
│   ├── icons/              # PWA icons (192x192, 512x512)
│   └── manifest.json       # PWA manifest
├── src/
│   ├── components/
│   │   ├── auth/           # Login, Signup, PendingApproval
│   │   ├── admin/          # Dashboard, Inventory, Agents, AssignPhones, Reports
│   │   ├── teamlead/       # TeamLeadDashboard, AgentRow
│   │   ├── agent/          # AgentDashboard, PhoneCard
│   │   ├── shared/         # Sidebar, Header, StatCard, Badge, Modal, Spinner
│   │   └── ui/             # Button, Input, Select, Table (base design system)
│   ├── hooks/
│   │   ├── useAuth.ts      # Auth context consumer
│   │   ├── usePhones.ts    # Phone CRUD + realtime subscription
│   │   ├── useProfiles.ts  # User/profile management
│   │   └── useActivityLog.ts
│   ├── lib/
│   │   ├── supabase.ts     # Supabase client init
│   │   └── constants.ts    # Role enums, status enums
│   ├── pages/
│   │   ├── LoginPage.tsx
│   │   ├── PendingPage.tsx
│   │   ├── AdminLayout.tsx
│   │   ├── TeamLeadLayout.tsx
│   │   └── AgentLayout.tsx
│   ├── context/
│   │   └── AuthContext.tsx  # Global auth state, profile, role
│   ├── types/
│   │   └── index.ts         # Database types (Profile, Phone, ActivityLog)
│   ├── App.tsx              # Route guard logic
│   ├── main.tsx
│   └── index.css
├── supabase/
│   └── schema.sql           # Full DB schema, RLS policies, triggers
├── .env.example
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
├── package.json
└── README.md
```

---

## Database Schema Rules

- All tables have RLS enabled. Never disable RLS.
- Every read/write is governed by `auth.uid()` — the server enforces role, not the client.
- Admin is identified by matching `auth.email()` to the `VITE_ADMIN_EMAIL` env var in policies.
- The `profiles` table is the source of truth for roles. Populated via a trigger on `auth.users` insert.
- Realtime is enabled on the `phones` table only (to keep subscription load minimal).

### RLS Policy Pattern
```sql
-- agents can only read their own phones
CREATE POLICY "agents_read_own_phones" ON phones
  FOR SELECT USING (assigned_to = auth.uid());

-- team leads can read phones of their agents
CREATE POLICY "teamleads_read_agent_phones" ON phones
  FOR SELECT USING (
    assigned_to IN (
      SELECT id FROM profiles WHERE team_lead_id = auth.uid()
    )
  );
```

---

## Routing & Role Guards (App.tsx pattern)

```
/login           → public, redirect to dashboard if authed
/pending         → authed but status=pending
/admin/*         → role=admin only
/teamlead/*      → role=team_lead only
/agent           → role=agent only
```

The `AuthContext` resolves: session → profile → role → redirect. No component renders until role is confirmed. This eliminates flash-of-wrong-content.

---

## Supabase Realtime Pattern

```typescript
// Subscribe to phones table changes (in usePhones.ts)
supabase
  .channel('phones-realtime')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'phones' }, (payload) => {
    // update local state based on payload.eventType
  })
  .subscribe();
```

Always unsubscribe in the cleanup function of useEffect.

---

## Environment Variables

```env
VITE_SUPABASE_URL=        # From Supabase project settings
VITE_SUPABASE_ANON_KEY=   # From Supabase project settings (public anon key)
VITE_ADMIN_EMAIL=         # The fixed admin email (e.g. admin@royalsuccess.com)
```

Google OAuth client ID is configured in the Supabase dashboard under Auth → Providers → Google. No separate env var needed in the frontend.

---

## Development Commands

```bash
npm run dev        # Start dev server
npm run build      # Production build
npm run preview    # Preview production build
npm run typecheck  # Run TypeScript compiler check
```

---

## Coding Standards

- **TypeScript strict mode** — no `any`, no `ts-ignore`.
- **No inline styles** — all styling via Tailwind classes.
- **No comments explaining what code does** — name things well instead.
- **Every async function** has explicit error handling with a user-facing toast/alert.
- **No console.log** in production code.
- **Database queries** are in hooks, never in components. Components only call hook functions.
- **Supabase client** is a singleton in `lib/supabase.ts` — never instantiate it elsewhere.
- **Role checks** happen at the routing level AND in Supabase RLS. Frontend role checks are UX, not security.

---

## PWA Requirements

- `manifest.json`: name="Royal Success", short_name="RoyalSuccess", theme_color="#0F4C35", background_color="#0F4C35", display="standalone"
- Icons: 192×192 and 512×512 (maskable)
- Service worker strategy: NetworkFirst for API calls, CacheFirst for static assets
- iOS meta tags in `index.html` for standalone mode (`apple-mobile-web-app-capable`)

---

## Deployment Target: Vercel

- Vercel auto-detects Vite. Build command: `npm run build`. Output: `dist/`.
- All env vars set in Vercel project settings (not committed to repo).
- Supabase URL whitelisting: add the Vercel domain to Supabase Auth allowed URLs.

---

## Key UX Decisions Documented

| Decision | Reason |
|---|---|
| Optimistic UI on "Mark as Sold" | Field agents have unreliable connections; immediate feedback prevents double-taps |
| Confirmation modal before selling | Phone sales are irreversible; prevents accidental taps on mobile |
| Pending approval screen | Prevents unauthorised access before admin review; shows clear next step |
| Team lead cannot see other team leads | Data isolation by design; each lead owns only their team |
| Admin email via env var | Single admin, no role escalation attack surface, zero DB lookup needed |
| Supabase Realtime only on phones | Minimises WebSocket load; profiles change rarely |
| PWA over React Native | Web-first reduces friction (no app store); PWA install covers 90% of native UX needs |
