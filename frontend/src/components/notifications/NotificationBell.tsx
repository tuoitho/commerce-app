import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell,
  BellOff,
  CheckCheck,
  Check,
  MessageSquare,
  ThumbsUp,
  Heart,
} from 'lucide-react'
import {
  postsApi,
  type NotificationItem,
  type ReactionType,
} from '@/api/posts'
import { useAuth } from '@/context/AuthContext'
import { useChatSocket } from '@/hooks/useChatSocket'
import { formatDateTime } from '@/lib/utils'

export interface NotificationBellProps {
  className?: string
}

const REACTION_EMOJIS: Record<ReactionType, string> = {
  like: '👍',
  love: '❤️',
  haha: '😆',
  wow: '😮',
  sad: '😢',
  angry: '😡',
}

export function NotificationBell({ className = '' }: NotificationBellProps) {
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()

  const [isOpen, setIsOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)

  const dropdownRef = useRef<HTMLDivElement>(null)
  const notificationsRef = useRef<NotificationItem[]>([])
  notificationsRef.current = notifications

  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated) return
    try {
      setIsLoading(true)
      const res = await postsApi.listNotifications({ limit: 30 })
      const items = res.items || []
      notificationsRef.current = items
      setNotifications(items)
      setUnreadCount(res.unreadCount || 0)
    } catch {
      // Ignore background fetch error
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  // Realtime notification via WebSocket (Req 6.5, 6.7, 8.2)
  useChatSocket({
    enabled: isAuthenticated,
    onNotification: (newNotif) => {
      const prev = notificationsRef.current
      if (newNotif.actorCount === 0) {
        const target = prev.find(
          (item) =>
            !item.isRead &&
            ((newNotif.id && item.id === newNotif.id) ||
              (newNotif.groupKey && item.groupKey === newNotif.groupKey) ||
              (item.notificationType === newNotif.notificationType &&
                item.postId === newNotif.postId &&
                (item.commentId ?? null) === (newNotif.commentId ?? null)))
        )
        if (target) {
          const next = prev.filter((item) => item.id !== target.id)
          notificationsRef.current = next
          setNotifications(next)
          setUnreadCount((c) => Math.max(0, c - 1))
        }
        return
      }
      const existing = prev.find((item) => item.id === newNotif.id)
      const next = existing
        ? [newNotif, ...prev.filter((item) => item.id !== newNotif.id)]
        : [newNotif, ...prev]
      notificationsRef.current = next
      setNotifications(next)

      if (existing) {
        if (existing.isRead && !newNotif.isRead) {
          setUnreadCount((c) => c + 1)
        }
      } else if (!newNotif.isRead) {
        setUnreadCount((c) => c + 1)
      }
    },
    onReconnect: () => {
      fetchNotifications()
    },
  })

  // Close dropdown on click outside or Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  // Handle clicking a notification item (Req 7.1)
  const handleNotificationClick = async (notif: NotificationItem) => {
    setIsOpen(false)

    // Mark as read if not already
    if (!notif.isRead) {
      try {
        await postsApi.markNotificationRead(notif.id)
        setNotifications((prev) =>
          prev.map((item) => (item.id === notif.id ? { ...item, isRead: true } : item))
        )
        setUnreadCount((c) => Math.max(0, c - 1))
      } catch {
        // Continue navigation even if mark read fails
      }
    }

    // Deep link navigation
    if (notif.postId) {
      const now = Date.now()
      if (notif.commentId) {
        navigate(`/posts/${notif.postId}?commentId=${notif.commentId}&focusTs=${now}`)
      } else {
        navigate(`/posts/${notif.postId}?focus=post&focusTs=${now}`)
      }
    }
  }

  // Handle mark single read
  const handleMarkSingleRead = async (e: React.MouseEvent, notifId: string) => {
    e.stopPropagation()
    try {
      await postsApi.markNotificationRead(notifId)
      setNotifications((prev) =>
        prev.map((item) => (item.id === notifId ? { ...item, isRead: true } : item))
      )
      setUnreadCount((c) => Math.max(0, c - 1))
    } catch {
      // Ignore error
    }
  }

  // Handle mark all read (Req 6.6)
  const handleMarkAllRead = async () => {
    try {
      await postsApi.markAllNotificationsRead()
      setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })))
      setUnreadCount(0)
    } catch {
      // Ignore error
    }
  }

  const renderActorLabel = (item: NotificationItem) => {
    const recentActors = Array.isArray(item.metadata?.recentActors)
      ? item.metadata.recentActors
          .filter((a) => a && typeof a.name === 'string' && a.name.trim().length > 0)
          .map((a) => a.name.trim())
      : []

    const actorNames =
      recentActors.length > 0 ? recentActors : [item.actorName || 'Người dùng']
    const count =
      item.actorCount && item.actorCount > 0 ? item.actorCount : recentActors.length || 1

    const actor1 = actorNames[0]
    const actor2 = actorNames[1]

    if (count <= 1) {
      return <span className="font-semibold text-zinc-950">{actor1}</span>
    }

    if (count === 2) {
      if (actor2) {
        return (
          <>
            <span className="font-semibold text-zinc-950">{actor1}</span> và{' '}
            <span className="font-semibold text-zinc-950">{actor2}</span>
          </>
        )
      }
      return (
        <>
          <span className="font-semibold text-zinc-950">{actor1}</span> và{' '}
          <span className="font-semibold text-zinc-950">1 người khác</span>
        </>
      )
    }

    if (actor2) {
      return (
        <>
          <span className="font-semibold text-zinc-950">{actor1}</span>,{' '}
          <span className="font-semibold text-zinc-950">{actor2}</span> và{' '}
          <span className="font-semibold text-zinc-950">{count - 2} người khác</span>
        </>
      )
    }

    return (
      <>
        <span className="font-semibold text-zinc-950">{actor1}</span> và{' '}
        <span className="font-semibold text-zinc-950">{count - 1} người khác</span>
      </>
    )
  }

  const renderNotificationContent = (item: NotificationItem) => {
    const actorNode = renderActorLabel(item)
    const emoji = item.reactionType ? REACTION_EMOJIS[item.reactionType] || '👍' : '👍'

    switch (item.notificationType) {
      case 'post_reaction':
        return (
          <div>
            {actorNode}{' '}
            <span className="text-zinc-600">
              đã bày tỏ cảm xúc {emoji} về bài viết của bạn.
            </span>
          </div>
        )

      case 'comment_reaction':
        return (
          <div>
            {actorNode}{' '}
            <span className="text-zinc-600">
              đã bày tỏ cảm xúc {emoji} về bình luận của bạn
            </span>
            {item.excerpt && (
              <span className="text-zinc-500 italic block line-clamp-1 mt-0.5">
                "{item.excerpt}"
              </span>
            )}
          </div>
        )

      case 'post_comment':
        return (
          <div>
            {actorNode}{' '}
            <span className="text-zinc-600">đã bình luận về bài viết:</span>
            {item.excerpt && (
              <span className="text-zinc-800 font-medium block line-clamp-2 mt-0.5">
                "{item.excerpt}"
              </span>
            )}
          </div>
        )

      case 'comment_reply':
        return (
          <div>
            {actorNode}{' '}
            <span className="text-zinc-600">đã trả lời bình luận của bạn:</span>
            {item.excerpt && (
              <span className="text-zinc-800 font-medium block line-clamp-2 mt-0.5">
                "{item.excerpt}"
              </span>
            )}
          </div>
        )

      default:
        return (
          <div>
            {actorNode}{' '}
            <span className="text-zinc-600">{item.excerpt || 'đã tương tác với bạn.'}</span>
          </div>
        )
    }
  }

  const getNotificationIcon = (item: NotificationItem) => {
    if (item.notificationType === 'post_reaction' || item.notificationType === 'comment_reaction') {
      if (item.reactionType === 'love') {
        return <Heart className="h-3.5 w-3.5 text-rose-500 fill-rose-500" />
      }
      return <ThumbsUp className="h-3.5 w-3.5 text-blue-500 fill-blue-500" />
    }
    return <MessageSquare className="h-3.5 w-3.5 text-emerald-600" />
  }

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      {/* Bell Trigger Button */}
      <button
        type="button"
        data-testid="notification-bell-button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-900 hover:border-zinc-900 transition-colors cursor-pointer"
        aria-label="Thông báo"
        aria-expanded={isOpen}
      >
        <Bell className="h-4 w-4 text-zinc-800" />

        {/* Unread count badge (Req 6.5) */}
        {unreadCount > 0 && (
          <span
            data-testid="notification-unread-badge"
            className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-md bg-rose-600 px-1 text-[10px] font-mono font-bold text-white shadow-2xs"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notifications Dropdown Panel (Req 6.6) */}
      {isOpen && (
        <div
          data-testid="notifications-dropdown-panel"
          className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border border-zinc-200/90 bg-white shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 bg-zinc-50/70">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-zinc-950">Thông báo</span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-mono font-bold text-rose-700">
                  {unreadCount} mới
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                data-testid="mark-all-read-button"
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 transition-colors cursor-pointer"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span>Đã đọc tất cả</span>
              </button>
            )}
          </div>

          {/* List of notifications */}
          <div className="max-h-96 overflow-y-auto divide-y divide-zinc-100 text-xs">
            {isLoading && notifications.length === 0 ? (
              <div className="py-8 text-center text-zinc-400">Đang tải thông báo...</div>
            ) : notifications.length === 0 ? (
              <div className="py-10 text-center text-zinc-400 space-y-2">
                <BellOff className="mx-auto h-8 w-8 text-zinc-300" />
                <p>Bạn chưa có thông báo nào</p>
              </div>
            ) : (
              notifications.map((item) => {
                const primaryActor =
                  item.metadata?.recentActors?.find(
                    (a) => a && typeof a.name === 'string' && a.name.trim().length > 0
                  )?.name ||
                  item.actorName ||
                  'N'
                const initial = primaryActor.charAt(0).toUpperCase()

                return (
                  <div
                    key={item.id}
                    data-testid={`notification-item-${item.id}`}
                    onClick={() => handleNotificationClick(item)}
                    className={`group flex items-start gap-3 p-3.5 transition-colors cursor-pointer ${
                      item.isRead
                        ? 'hover:bg-zinc-50 bg-white'
                        : 'bg-emerald-50/40 hover:bg-emerald-50/70'
                    }`}
                  >
                    {/* Actor avatar / icon */}
                    <div className="relative shrink-0">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-900 text-white font-mono text-xs font-bold select-none">
                        {initial}
                      </div>
                      <div className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-white shadow-2xs">
                        {getNotificationIcon(item)}
                      </div>
                    </div>

                    {/* Notification text and timestamp */}
                    <div className="min-w-0 flex-1 space-y-1">
                      {renderNotificationContent(item)}
                      <span className="text-[11px] text-zinc-400 block">
                        {formatDateTime(item.updatedAt || item.createdAt)}
                      </span>
                    </div>

                    {/* Read status & single mark read button */}
                    <div className="flex flex-col items-end gap-1.5 shrink-0 self-center">
                      {!item.isRead && (
                        <span className="h-2 w-2 rounded-full bg-emerald-600" />
                      )}
                      {!item.isRead && (
                        <button
                          type="button"
                          onClick={(e) => handleMarkSingleRead(e, item.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-emerald-700 transition-opacity cursor-pointer"
                          title="Đánh dấu đã đọc"
                          aria-label="Đánh dấu đã đọc"
                        >
                          <Check className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
