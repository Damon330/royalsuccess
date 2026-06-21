import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { withTimeout } from '../lib/withTimeout'
import { playSaleSound, playAlertSound, primeAudioContext } from '../lib/saleSound'
import { invalidateKeys } from '../lib/cache'
import type { Notification } from '../types'

const PAGE_SIZE = 20

export function useNotifications(userId: string | undefined) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount,   setUnreadCount]   = useState(0)
  const [loading,       setLoading]       = useState(true)
  const [hasMore,       setHasMore]       = useState(true)
  const offsetRef       = useRef(0)
  const isFirstLoad     = useRef(true)

  const fetchNotifications = useCallback(async (reset = false) => {
    if (!userId) return
    if (reset) { offsetRef.current = 0; setLoading(true) }
    try {
      const { data, error } = await withTimeout(
        supabase
          .from('notifications')
          .select('*')
          .eq('recipient_id', userId)
          .order('created_at', { ascending: false })
          .range(offsetRef.current, offsetRef.current + PAGE_SIZE - 1),
        8000,
      )
      if (error) throw error
      const rows = data ?? []
      if (reset) {
        setNotifications(rows)
      } else {
        setNotifications((prev) => [...prev, ...rows])
      }
      setHasMore(rows.length === PAGE_SIZE)
      offsetRef.current += rows.length
      const newUnread = rows.filter((n) => !n.read).length
      // Functional update avoids stale-closure issues when loading additional pages:
      // on reset we count only the incoming page; on load-more we add to existing count.
      if (reset) {
        setUnreadCount(newUnread)
      } else {
        setUnreadCount((prev) => prev + newUnread)
      }
    } catch {
      // silent — non-critical feature
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  useEffect(() => {
    if (!userId) return
    fetchNotifications(true)

    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'notifications',
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          const n = payload.new as Notification
          setNotifications((prev) => [n, ...prev])
          setUnreadCount((c) => c + 1)

          // Play sound on live arrival (not first page load)
          if (!isFirstLoad.current) {
            if (n.type === 'SALE_COMPLETED') {
              playSaleSound()
            } else {
              playAlertSound()
            }
          }

          invalidateKeys(`notifications:unread:${userId}`)
        },
      )
      .subscribe()

    isFirstLoad.current = false

    // Prime AudioContext on first user interaction
    document.addEventListener('click', primeAudioContext, { once: true })

    return () => {
      channel.unsubscribe()
      supabase.removeChannel(channel)
    }
  }, [userId, fetchNotifications])

  async function markRead(id: string) {
    await supabase.from('notifications').update({ read: true }).eq('id', id)
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n))
    setUnreadCount((c) => Math.max(0, c - 1))
    invalidateKeys(`notifications:unread:${userId}`)
  }

  async function markAllRead() {
    if (!userId) return
    await supabase.from('notifications').update({ read: true })
      .eq('recipient_id', userId).eq('read', false)
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    setUnreadCount(0)
    invalidateKeys(`notifications:unread:${userId}`)
  }

  async function loadMore() {
    if (!hasMore || loading) return
    await fetchNotifications(false)
  }

  return {
    notifications,
    unreadCount,
    loading,
    hasMore,
    markRead,
    markAllRead,
    loadMore,
    refetch: () => fetchNotifications(true),
  }
}
