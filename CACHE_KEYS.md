# Royal Success — Redis Cache Keys

All keys use Upstash Redis via `src/lib/cache.ts`.
Redis is optional — if `VITE_UPSTASH_REDIS_REST_URL` / `VITE_UPSTASH_REDIS_REST_TOKEN`
are not set, every call falls through to Supabase directly.

---

## Key Inventory

| Key | TTL | Invalidated by |
|---|---|---|
| `inventory:all` | 60 s | Stock add, stock edit, phone assigned, phone returned, phone sold |
| `agents:team:{teamLeadId}` | 300 s | User created, user deactivated, team reassignment |
| `sales:summary:{agentId}:{YYYY-MM-DD}` | 120 s | New sale recorded, return approved |
| `activity:feed:{userId}:page:{n}` | 30 s | Any new `activity_log` INSERT for that user |
| `receipt:{receiptId}` | 600 s | Receipt voided |
| `notifications:unread:{userId}` | 15 s | New notification inserted, notification marked read |

---

## Helper: `CK` in `src/lib/cache.ts`

```ts
CK.inventoryAll()                    // → "inventory:all"
CK.agentsTeam(leadId)                // → "agents:team:abc123"
CK.salesSummary(agentId, "2025-06-08") // → "sales:summary:xyz:2025-06-08"
CK.activityFeedPage(userId, 0)       // → "activity:feed:uid:page:0"
CK.receipt(receiptId)                // → "receipt:rid"
CK.notificationsUnread(userId)       // → "notifications:unread:uid"
```

---

## Vercel Edge Functions

| Route | Cache key used | Fallback |
|---|---|---|
| `GET /api/inventory` | `inventory:all` | Direct Supabase query |
| `GET /api/sales-summary?agentId=…&date=…` | `sales:summary:{agentId}:{date}` | Direct Supabase query |

Both routes validate the Supabase JWT from the `Authorization: Bearer <token>` header.

---

## Setup

1. Create a free database at [upstash.com](https://upstash.com).
2. Copy the **REST URL** and **REST Token** from the dashboard.
3. Add to `.env` and Vercel project settings:
   ```
   VITE_UPSTASH_REDIS_REST_URL=https://…upstash.io
   VITE_UPSTASH_REDIS_REST_TOKEN=AX…
   ```
4. Optionally add your domain to Upstash's **Allowed Origins** for browser security.
