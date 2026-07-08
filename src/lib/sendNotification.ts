import { supabase } from './supabase'

// Fire-and-forget — mirrors the logActivity pattern. Never blocks the caller.
export function sendNotification(
  recipientId: string,
  type:        string,
  title:       string,
  body:        string,
  saleId?:     string | null,
): void {
  supabase.rpc('send_notification', {
    p_recipient_id: recipientId,
    p_type:         type,
    p_title:        title,
    p_body:         body,
    p_sale_id:      saleId ?? null,
  }).then(({ error }) => {
    if (error) console.warn('[sendNotification]', error.message)
  })
}
