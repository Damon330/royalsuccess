import { supabase } from './supabase'
import type { ActivityActionType, Role } from '../types'

interface LogParams {
  actor_id:     string
  actor_name:   string
  role:         Role | string
  action_type:  ActivityActionType
  entity_type:  string
  entity_id?:   string | null
  entity_label: string
  meta?:        Record<string, unknown>
  team_lead_id?: string | null
  agent_id?:    string | null
}

// Fire-and-forget — never blocks the calling flow.
// Activity log failures are non-critical and silently swallowed.
export function logActivity(p: LogParams): void {
  supabase.from('activity_log').insert({
    actor_id:     p.actor_id,
    actor_name:   p.actor_name,
    role:         p.role,
    action_type:  p.action_type,
    entity_type:  p.entity_type,
    entity_id:    p.entity_id   ?? null,
    entity_label: p.entity_label,
    meta:         p.meta        ?? null,
    team_lead_id: p.team_lead_id ?? null,
    agent_id:     p.agent_id    ?? null,
  }).then(({ error }) => {
    if (error) console.warn('[logActivity]', error.message)
  })
}
