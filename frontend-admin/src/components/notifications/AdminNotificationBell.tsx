import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  Bell,
  BellOff,
  CheckCheck,
  Check,
  MessageSquare,
  Package,
  RotateCcw,
  ThumbsUp,
  Heart,
  XCircle,
} from 'lucide-react'
import {
  postsApi,
  type NotificationCategory,
  type NotificationItem,
  type ReactionType,
} from '@/api/posts'
import { useAuth } from '@/context/AuthContext'
import { useAdminChatSocket } from '@/hooks/useAdminChatSocket'
import { formatDateTime } from '@/lib/utils'

export interface AdminNotificationBellProps {
  className?: string
}

type AdminCategoryTab = 'all' | 'order' | 'return' | 'post'

const ADMIN_CATEGORY_TABS: Array<{ id: AdminCategoryTab; label: string }> = [
  { id: 'all', label: 'Tất cả' },
  { id: 'order', label: 'Đơn hàng' },
  { id: 'return', label: 'Trả hàng' },
  { id: 'post', label: 'Bài viết' },
]

const REACTION_EMOJIS: Record<ReactionType, string> = {
  like: '👍',
  love: '❤️',
  haha: '😆',
  wow: '😮',
  sad: '😢',
  angry: '😡',
}

function getMetadataString(item: NotificationItem, key: string): string {
  const val = item.metadata?.[key]
  return typeof val === 'string' ? val.trim() : ''
}

function resolveAdminNotificationTargetPath(notif: NotificationItem): string | null {
  if (notif.postId) {
    const now = Date.now()
    if (notif.commentId) {
      return `/posts/${notif.postId}?commentId=${notif.commentId}&focusTs=${now}`
    }
    return `/posts/${notif.postId}?focus=post&focusTs=${now}`
  }

  const explicitTarget = getMetadataString(notif, 'targetPath')
  if (explicitTarget.startsWith('/')) {
    return explicitTarget
  }

  const returnId = getMetadataString(notif, 'returnId')
  if (returnId) {
    return `/returns/${returnId}`
  }

  const orderId = getMetadataString(notif, 'orderId')
  if (orderId) {
    return `/orders/${orderId}`
  }

  return null
}

export function AdminNotificationBell({ className = '' }: AdminNotificationBellProps) {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [isOpen, setIsOpen] = useState(false)
  const [activeCategory, setActiveCategory] = useState<AdminCategoryTab>('all')
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [fetchError, setFetchError] = useState(false)

  const dropdownRef = useRef<HTMLDivElement>(null)
  const notificationsRef = useRef<NotificationItem[]>([])
  const selectedCategoryRef = useRef<AdminCategoryTab>('all')
  const knownUnreadIdsRef = useRef<Set<string>>(new Set())
  const fetchRequestIdRef = useRef(0)

  notificationsRef.current = notifications

  const fetchNotifications = useCallback(
    async (category: AdminCategoryTab = selectedCategoryRef.current) => {
      if (!user) return
      const requestId = ++fetchRequestIdRef.current
      try {
        setFetchError(false)
        setIsLoading(true)
        const params: { limit: number; category?: NotificationCategory } = { limit: 30 }
        if (category !== 'all') {
          params.category = category
        }
        const res = await postsApi.listNotifications(params)
        if (fetchRequestIdRef.current !== requestId || selectedCategoryRef.current !== category) {
          return
        }
        const items = res.items || []
        notificationsRef.current = items
        setNotifications(items)

        const totalUnread = res.unreadCount || 0
        setUnreadCount(totalUnread)

        if (totalUnread === 0) {
          knownUnreadIdsRef.current.clear()
        } else if (category === 'all') {
          knownUnreadIdsRef.current = new Set(
            items.filter((i) => !i.isRead && i.id).map((i) => i.id)
          )
        } else {
          for (const item of items) {
            if (!item.id) continue
            if (item.isRead) {
              knownUnreadIdsRef.current.delete(item.id)
            } else {
              knownUnreadIdsRef.current.add(item.id)
            }
          }
        }
      } catch {
        if (fetchRequestIdRef.current !== requestId || selectedCategoryRef.current !== category) {
          return
        }
        notificationsRef.current = []
        setNotifications([])
        setFetchError(true)
      } finally {
        if (fetchRequestIdRef.current === requestId) {
          setIsLoading(false)
        }
      }
    },
    [user]
  )

  useEffect(() => {
    void fetchNotifications(selectedCategoryRef.current)
  }, [fetchNotifications])

  const handleCategoryChange = (category: AdminCategoryTab) => {
    if (selectedCategoryRef.current === category && !fetchError) {
      return
    }
    selectedCategoryRef.current = category
    setActiveCategory(category)
    notificationsRef.current = []
    setNotifications([])
    setFetchError(false)
    setIsLoading(true)
    void fetchNotifications(category)
  }

  // Realtime notification via WebSocket (API/WS contracts WS-NOTIFICATIONS@3)
  useAdminChatSocket({
    enabled: Boolean(user),
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
          knownUnreadIdsRef.current.delete(target.id)
          const next = prev.filter((item) => item.id !== target.id)
          notificationsRef.current = next
          setNotifications(next)
          setUnreadCount((c) => Math.max(0, c - 1))
        } else if (newNotif.id && knownUnreadIdsRef.current.has(newNotif.id)) {
          knownUnreadIdsRef.current.delete(newNotif.id)
          setUnreadCount((c) => Math.max(0, c - 1))
        }
        return
      }

      const wasKnownUnread = knownUnreadIdsRef.current.has(newNotif.id)
      if (!newNotif.isRead && !wasKnownUnread) {
        knownUnreadIdsRef.current.add(newNotif.id)
        setUnreadCount((c) => c + 1)
      } else if (newNotif.isRead && wasKnownUnread) {
        knownUnreadIdsRef.current.delete(newNotif.id)
        setUnreadCount((c) => Math.max(0, c - 1))
      }

      const currentCategory = selectedCategoryRef.current
      const matchesFilter = currentCategory === 'all' || newNotif.category === currentCategory
      if (!matchesFilter) {
        return
      }

      const existing = prev.find((item) => item.id === newNotif.id)
      const next = existing
        ? [newNotif, ...prev.filter((item) => item.id !== newNotif.id)]
        : [newNotif, ...prev]
      notificationsRef.current = next
      setNotifications(next)
    },
    onReconnect: () => {
      void fetchNotifications(selectedCategoryRef.current)
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

  const handleNotificationClick = async (notif: NotificationItem) => {
    setIsOpen(false)

    if (!notif.isRead) {
      try {
        await postsApi.markNotificationRead(notif.id)
        knownUnreadIdsRef.current.delete(notif.id)
        setNotifications((prev) =>
          prev.map((item) => (item.id === notif.id ? { ...item, isRead: true } : item))
        )
        setUnreadCount((c) => Math.max(0, c - 1))
      } catch {
        // Continue navigation even if mark read fails
      }
    }

    const targetPath = resolveAdminNotificationTargetPath(notif)
    if (targetPath) {
      navigate(targetPath)
    }
  }

  const handleMarkSingleRead = async (e: React.MouseEvent, notifId: string) => {
    e.stopPropagation()
    try {
      await postsApi.markNotificationRead(notifId)
      knownUnreadIdsRef.current.delete(notifId)
      setNotifications((prev) =>
        prev.map((item) => (item.id === notifId ? { ...item, isRead: true } : item))
      )
      setUnreadCount((c) => Math.max(0, c - 1))
    } catch {
      // Ignore error
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await postsApi.markAllNotificationsRead()
      knownUnreadIdsRef.current.clear()
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
      recentActors.length > 0
        ? recentActors
        : [item.actorName || (item.actorId === null ? 'Hệ thống' : 'Khách hàng')]
    const count =
      item.actorCount && item.actorCount > 0 ? item.actorCount : recentActors.length || 1

    const actor1 = actorNames[0]
    const actor2 = actorNames[1]

    if (count <= 1) {
      return <span className="font-semibold text-slate-900">{actor1}</span>
    }

    if (count === 2) {
      if (actor2) {
        return (
          <>
            <span className="font-semibold text-slate-900">{actor1}</span> và{' '}
            <span className="font-semibold text-slate-900">{actor2}</span>
          </>
        )
      }
      return (
        <>
          <span className="font-semibold text-slate-900">{actor1}</span> và{' '}
          <span className="font-semibold text-slate-900">1 người khác</span>
        </>
      )
    }

    if (actor2) {
      return (
        <>
          <span className="font-semibold text-slate-900">{actor1}</span>,{' '}
          <span className="font-semibold text-slate-900">{actor2}</span> và{' '}
          <span className="font-semibold text-slate-900">{count - 2} người khác</span>
        </>
      )
    }

    return (
      <>
        <span className="font-semibold text-slate-900">{actor1}</span> và{' '}
        <span className="font-semibold text-slate-900">{count - 1} người khác</span>
      </>
    )
  }

  const renderNotificationContent = (item: NotificationItem) => {
    const actorNode = renderActorLabel(item)
    const emoji = item.reactionType ? REACTION_EMOJIS[item.reactionType] || '👍' : '👍'
    const orderCode = getMetadataString(item, 'orderShortCode')

    switch (item.notificationType) {
      case 'admin_order_created':
        return (
          <div>
            {actorNode}{' '}
            <span className="text-slate-600">
              vừa đặt đơn hàng mới{' '}
              {orderCode && <strong className="font-semibold text-slate-900">{orderCode}</strong>}
            </span>
          </div>
        )

      case 'admin_order_cancel_requested':
        return (
          <div>
            {actorNode}{' '}
            <span className="text-slate-600">
              yêu cầu hủy đơn hàng{' '}
              {orderCode && <strong className="font-semibold text-slate-900">{orderCode}</strong>}
            </span>
          </div>
        )

      case 'admin_order_cancelled':
        return (
          <div>
            {actorNode}{' '}
            <span className="text-slate-600">
              đã hủy đơn hàng{' '}
              {orderCode && <strong className="font-semibold text-slate-900">{orderCode}</strong>}
            </span>
          </div>
        )

      case 'admin_return_created':
        return (
          <div>
            {actorNode}{' '}
            <span className="text-slate-600">
              gửi yêu cầu trả hàng{' '}
              {orderCode ? (
                <>
                  cho đơn <strong className="font-semibold text-slate-900">{orderCode}</strong>
                </>
              ) : null}
            </span>
          </div>
        )

      case 'post_reaction':
        return (
          <div>
            {actorNode}{' '}
            <span className="text-slate-600">
              đã bày tỏ cảm xúc {emoji} về bài viết của bạn.
            </span>
          </div>
        )

      case 'comment_reaction':
        return (
          <div>
            {actorNode}{' '}
            <span className="text-slate-600">
              đã bày tỏ cảm xúc {emoji} về bình luận của bạn
            </span>
            {item.excerpt && (
              <span className="text-slate-500 italic block line-clamp-1 mt-0.5">
                "{item.excerpt}"
              </span>
            )}
          </div>
        )

      case 'post_comment':
        return (
          <div>
            {actorNode}{' '}
            <span className="text-slate-600">đã bình luận về bài viết:</span>
            {item.excerpt && (
              <span className="text-slate-800 font-medium block line-clamp-2 mt-0.5">
                "{item.excerpt}"
              </span>
            )}
          </div>
        )

      case 'comment_reply':
        return (
          <div>
            {actorNode}{' '}
            <span className="text-slate-600">đã trả lời bình luận của bạn:</span>
            {item.excerpt && (
              <span className="text-slate-800 font-medium block line-clamp-2 mt-0.5">
                "{item.excerpt}"
              </span>
            )}
          </div>
        )

      default:
        return (
          <div>
            {actorNode}{' '}
            <span className="text-slate-600">{item.excerpt || 'đã tương tác với bạn.'}</span>
          </div>
        )
    }
  }

  const getNotificationIcon = (item: NotificationItem) => {
    switch (item.notificationType) {
      case 'admin_order_created':
        return <Package className="h-3.5 w-3.5 text-blue-600" />
      case 'admin_order_cancel_requested':
        return <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
      case 'admin_order_cancelled':
        return <XCircle className="h-3.5 w-3.5 text-rose-600" />
      case 'admin_return_created':
        return <RotateCcw className="h-3.5 w-3.5 text-orange-600" />
      case 'post_reaction':
      case 'comment_reaction':
        if (item.reactionType === 'love') {
          return <Heart className="h-3.5 w-3.5 text-rose-500 fill-rose-500" />
        }
        return <ThumbsUp className="h-3.5 w-3.5 text-blue-500 fill-blue-500" />
      default:
        return <MessageSquare className="h-3.5 w-3.5 text-blue-600" />
    }
  }

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      {/* Bell Trigger Button */}
      <button
        type="button"
        data-testid="notification-bell-button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer"
        aria-label="Thông báo"
        aria-expanded={isOpen}
      >
        <Bell className="h-4 w-4 text-slate-700" />

        {/* Unread count badge */}
        {unreadCount > 0 && (
          <span
            data-testid="notification-unread-badge"
            className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white shadow-xs"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notifications Dropdown Panel */}
      {isOpen && (
        <div
          data-testid="notifications-dropdown-panel"
          className="absolute right-0 mt-2 w-[min(calc(100vw-2rem),24rem)] sm:w-96 rounded-2xl border border-slate-200 bg-white shadow-xl z-50 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 bg-slate-50/70">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-slate-900">Thông báo</span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                  {unreadCount} mới
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                data-testid="mark-all-read-button"
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800 transition-colors cursor-pointer"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span>Đã đọc tất cả</span>
              </button>
            )}
          </div>

          {/* Category filter tabs */}
          <div
            role="tablist"
            aria-label="Lọc danh mục thông báo quản trị"
            className="flex items-center gap-1.5 overflow-x-auto border-b border-slate-100 bg-white px-3 py-2"
          >
            {ADMIN_CATEGORY_TABS.map((tab) => {
              const isSelected = activeCategory === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  data-testid={`notification-tab-${tab.id}`}
                  onClick={() => handleCategoryChange(tab.id)}
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>

          {/* List of notifications */}
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 text-xs">
            {isLoading && notifications.length === 0 ? (
              <div className="py-8 text-center text-slate-400">Đang tải thông báo...</div>
            ) : fetchError && notifications.length === 0 ? (
              <div className="py-8 text-center text-slate-500 space-y-2 px-4">
                <p>Không thể tải danh sách thông báo</p>
                <button
                  type="button"
                  onClick={() => void fetchNotifications(activeCategory)}
                  className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Thử lại
                </button>
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-10 text-center text-slate-400 space-y-2">
                <BellOff className="mx-auto h-8 w-8 text-slate-300" />
                <p>
                  {activeCategory === 'all'
                    ? 'Bạn chưa có thông báo nào'
                    : 'Không có thông báo trong danh mục này'}
                </p>
              </div>
            ) : (
              notifications.map((item) => {
                const primaryActor =
                  item.metadata?.recentActors?.find(
                    (a) => a && typeof a.name === 'string' && a.name.trim().length > 0
                  )?.name ||
                  item.actorName ||
                  'H'
                const initial = primaryActor.charAt(0).toUpperCase()

                return (
                  <div
                    key={item.id}
                    data-testid={`notification-item-${item.id}`}
                    onClick={() => handleNotificationClick(item)}
                    className={`group flex items-start gap-3 p-3.5 transition-colors cursor-pointer ${
                      item.isRead
                        ? 'hover:bg-slate-50 bg-white'
                        : 'bg-blue-50/40 hover:bg-blue-50/70'
                    }`}
                  >
                    {/* Actor avatar / icon */}
                    <div className="relative shrink-0">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-white font-bold text-xs select-none">
                        {initial}
                      </div>
                      <div className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-white shadow-xs">
                        {getNotificationIcon(item)}
                      </div>
                    </div>

                    {/* Notification text and timestamp */}
                    <div className="min-w-0 flex-1 space-y-1">
                      {renderNotificationContent(item)}
                      <span className="text-[11px] text-slate-400 block">
                        {formatDateTime(item.updatedAt || item.createdAt)}
                      </span>
                    </div>

                    {/* Read status & single mark read button */}
                    <div className="flex flex-col items-end gap-1.5 shrink-0 self-center">
                      {!item.isRead && (
                        <span className="h-2 w-2 rounded-full bg-blue-600" />
                      )}
                      {!item.isRead && (
                        <button
                          type="button"
                          onClick={(e) => handleMarkSingleRead(e, item.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-blue-700 transition-opacity cursor-pointer"
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
