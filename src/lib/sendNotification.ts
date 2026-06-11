import { supabase } from './supabase'

// Fire-and-forget — mirrors the logActivity pattern. Never blocks the caller.
export function sendNotification(
  recipientId: string,
  type:        string,
  title:       string,
  body:        string,
  saleId?:     string | null,
): void {
  supabase.from('notifications').insert({
    recipient_id: recipientId,
    type,
    title,
    body,
    sale_id: saleId ?? null,
    read:    false,
  }).then(({ error }) => {
    if (error) console.warn('[sendNotification]', error.message)
  })
}
