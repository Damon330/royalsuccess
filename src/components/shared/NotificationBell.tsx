import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { useNotifications } from '../../hooks/useNotifications'
import type { Notification } from '../../types'
import { TbBell, TbBellRinging } from 'react-icons/tb'

interface Props { userId: string | undefined }

function relTime(iso: string) {
  return formatDistanceToNow(new Date(iso), { addSuffix: true })
}

export default function NotificationBell({ userId }: Props) {
  const navigate = useNavigate()
  const { notifications, unreadCount, loading, hasMore, markRead, markAllRead, loadMore } =
    useNotifications(userId)

  const [open, setOpen] = useState(false)
  const panelRef        = useRef<HTMLDivElement>(null)
  const sentinelRef     = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  // Infinite scroll inside the panel
  useEffect(() => {
    if (!sentinelRef.current || !open) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && hasMore && !loading) loadMore() },
      { threshold: 0.1 },
    )
    obs.observe(sentinelRef.current)
    return () => obs.disconnect()
  }, [open, hasMore, loading, loadMore])

  function handleNotificationClick(n: Notification) {
    if (!n.read) markRead(n.id)
    setOpen(false)
    if (n.sale_id) navigate(`/admin/receipts`)
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-xl hover:bg-gray-100 transition-colors"
        aria-label="Notifications"
      >
        {unreadCount > 0
          ? <TbBellRinging className="w-6 h-6 text-primary animate-pulse" />
          : <TbBell className="w-6 h-6 text-brand-muted" />}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-brand-border z-50 overflow-hidden">
          {/* Panel header */}
          <div className="px-4 py-3 border-b border-brand-border flex items-center justify-between">
            <h3 className="font-semibold text-brand-text text-sm">Notifications</h3>
            {unreadCount > 0 && (
              <button onClick={markAllRead}
                className="text-xs text-primary font-medium hover:underline">
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto divide-y divide-brand-border">
            {loading && notifications.length === 0 ? (
              <div className="py-8 text-center text-xs text-brand-muted">Loading…</div>
            ) : notifications.length === 0 ? (
              <div className="py-10 text-center text-sm text-brand-muted">No notifications yet.</div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${!n.read ? 'bg-primary-pale' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${!n.read ? 'bg-primary' : 'bg-transparent'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-brand-text truncate">{n.title}</p>
                      <p className="text-xs text-brand-muted mt-0.5 line-clamp-2">{n.body}</p>
                      <p className="text-[10px] text-brand-muted mt-1">{relTime(n.created_at)}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
            <div ref={sentinelRef} className="h-1" />
            {loading && notifications.length > 0 && (
              <div className="py-2 text-center text-xs text-brand-muted">Loading more…</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
