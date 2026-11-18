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
  Package,
  RotateCcw,
  Star,
  Radio,
  Store,
} from 'lucide-react'
import {
  postsApi,
  type NotificationCategory,
  type NotificationItem,
  type ReactionType,
} from '@/api/posts'
import { useAuth } from '@/context/AuthContext'
import { useChatSocket } from '@/hooks/useChatSocket'
import { formatDateTime } from '@/lib/utils'

export interface NotificationBellProps {
  className?: string
}

type CategoryFilterKey = 'all' | NotificationCategory

const CATEGORY_TABS: Array<{ key: CategoryFilterKey; label: string }> = [
  { key: 'all', label: 'Tất cả' },
  { key: 'order', label: 'Đơn hàng' },
  { key: 'return', label: 'Đổi trả' },
  { key: 'review', label: 'Đánh giá' },
  { key: 'live', label: 'Live' },
  { key: 'post', label: 'Bài viết' },
]

const REACTION_EMOJIS: Record<ReactionType, string> = {
  like: '👍',
  love: '❤️',
  haha: '😆',
  wow: '😮',
  sad: '😢',
  angry: '😡',
}

function resolveNotificationTargetPath(notif: NotificationItem): string | null {
  const explicitTarget =
    typeof notif.metadata?.targetPath === 'string' ? notif.metadata.targetPath.trim() : ''
  if (explicitTarget.startsWith('/')) {
    return explicitTarget
  }
  if (notif.postId) {
    const now = Date.now()
    if (notif.commentId) {
      return `/posts/${notif.postId}?commentId=${notif.commentId}&focusTs=${now}`
    }
    return `/posts/${notif.postId}?focus=post&focusTs=${now}`
  }
  if (notif.category === 'live' && typeof notif.metadata?.sessionId === 'string') {
    return `/live/${notif.metadata.sessionId}`
  }
  if (notif.category === 'review') {
    return '/reviews'
  }
  if (
    (notif.category === 'order' || notif.category === 'return') &&
    typeof notif.metadata?.orderId === 'string'
  ) {
    return `/orders/${notif.metadata.orderId}`
  }
  return null
}

function isSystemStoreNotification(item: NotificationItem): boolean {
  return !item.actorId && item.category !== 'post'
}

export function NotificationBell({ className = '' }: NotificationBellProps) {
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()

  const [isOpen, setIsOpen] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilterKey>('all')
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [fetchError, setFetchError] = useState(false)

  const dropdownRef = useRef<HTMLDivElement>(null)
  const notificationsRef = useRef<NotificationItem[]>([])
  notificationsRef.current = notifications
  const selectedCategoryRef = useRef<CategoryFilterKey>(selectedCategory)
  selectedCategoryRef.current = selectedCategory
  const knownUnreadIdsRef = useRef<Set<string>>(new Set())
  const fetchRequestIdRef = useRef(0)

  const fetchNotifications = useCallback(
    async (category: CategoryFilterKey = selectedCategoryRef.current) => {
      if (!isAuthenticated) return
      const requestId = ++fetchRequestIdRef.current
      try {
        setFetchError(false)
        setIsLoading(true)
        const res = await postsApi.listNotifications(
          category === 'all' ? { limit: 30 } : { limit: 30, category }
        )
        if (fetchRequestIdRef.current !== requestId || selectedCategoryRef.current !== category) {
          return
        }
        const items = res.items || []
        const totalUnread = res.unreadCount || 0
        if (totalUnread === 0) {
          knownUnreadIdsRef.current.clear()
        } else if (category === 'all') {
          knownUnreadIdsRef.current = new Set(
            items.filter((i) => !i.isRead && i.id).map((i) => i.id)
          )
        } else {
          for (const item of items) {
            if (!item.id) continue
            if (item.isRead) knownUnreadIdsRef.current.delete(item.id)
            else knownUnreadIdsRef.current.add(item.id)
          }
        }
        notificationsRef.current = items
        setNotifications(items)
        setUnreadCount(totalUnread)
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
    [isAuthenticated]
  )

  useEffect(() => {
    void fetchNotifications(selectedCategoryRef.current)
  }, [fetchNotifications])

  const handleCategoryChange = (category: CategoryFilterKey) => {
    if (selectedCategoryRef.current === category && !fetchError) {
      return
    }
    selectedCategoryRef.current = category
    setSelectedCategory(category)
    notificationsRef.current = []
    setNotifications([])
    setFetchError(false)
    setIsLoading(true)
    void fetchNotifications(category)
  }

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

      const existing = prev.find((item) => item.id === newNotif.id)
      const matchesActiveTab =
        selectedCategoryRef.current === 'all' ||
        newNotif.category === selectedCategoryRef.current

      if (matchesActiveTab) {
        const next = existing
          ? [newNotif, ...prev.filter((item) => item.id !== newNotif.id)]
          : [newNotif, ...prev]
        notificationsRef.current = next
        setNotifications(next)
      }

      if (!newNotif.isRead) {
        const wasKnownUnread =
          (existing && !existing.isRead) ||
          (newNotif.id ? knownUnreadIdsRef.current.has(newNotif.id) : false)
        if (newNotif.id) {
          knownUnreadIdsRef.current.add(newNotif.id)
        }
        if (!wasKnownUnread) {
          setUnreadCount((c) => c + 1)
        }
      } else if (newNotif.id) {
        knownUnreadIdsRef.current.delete(newNotif.id)
      }
    },
    onReconnect: () => {
      fetchNotifications(selectedCategoryRef.current)
    },
  })

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

    const targetPath = resolveNotificationTargetPath(notif)
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

  const renderStoreMessage = (item: NotificationItem, actionLabel: string) => {
    const productName =
      typeof item.metadata?.productName === 'string' ? item.metadata.productName : ''
    const sessionTitle =
      typeof item.metadata?.sessionTitle === 'string' ? item.metadata.sessionTitle : ''

    return (
      <div>
        <span className="font-semibold text-zinc-950">Cửa hàng</span>{' '}
        <span className="text-zinc-600">{actionLabel}</span>
        {productName && (
          <span className="text-zinc-700 font-medium block mt-0.5">{productName}</span>
        )}
        {sessionTitle && !item.excerpt && (
          <span className="text-zinc-700 font-medium block mt-0.5">{sessionTitle}</span>
        )}
        {item.excerpt && (
          <span className="text-zinc-600 block line-clamp-2 mt-0.5">{item.excerpt}</span>
        )}
      </div>
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

      case 'order_confirmed':
        return renderStoreMessage(item, 'đã xác nhận đơn hàng:')
      case 'order_preparing':
        return renderStoreMessage(item, 'đang chuẩn bị đơn hàng:')
      case 'order_shipped':
        return renderStoreMessage(item, 'đã gửi đơn hàng:')
      case 'order_delivered':
        return renderStoreMessage(item, 'đã giao đơn hàng thành công:')
      case 'order_cancel_approved':
        return renderStoreMessage(item, 'đã duyệt yêu cầu hủy đơn:')
      case 'order_cancel_declined':
        return renderStoreMessage(item, 'đã từ chối hủy đơn hàng:')
      case 'order_payment_expired':
        return renderStoreMessage(item, 'đã hủy đơn do quá hạn thanh toán MoMo:')

      case 'return_approved':
        return renderStoreMessage(item, 'đã duyệt yêu cầu trả hàng:')
      case 'return_rejected':
        return renderStoreMessage(item, 'đã từ chối yêu cầu trả hàng:')
      case 'return_received':
        return renderStoreMessage(item, 'đã nhận lại sản phẩm hoàn:')
      case 'return_refunded':
        return renderStoreMessage(item, 'đã hoàn tiền yêu cầu trả hàng:')

      case 'review_replied':
        return renderStoreMessage(item, 'đã phản hồi đánh giá của bạn:')

      case 'livestream_started':
        return renderStoreMessage(item, 'đã bắt đầu phiên livestream:')

      default:
        return isSystemStoreNotification(item) ? (
          renderStoreMessage(item, 'gửi thông báo:')
        ) : (
          <div>
            {actorNode}{' '}
            <span className="text-zinc-600">{item.excerpt || 'đã tương tác với bạn.'}</span>
          </div>
        )
    }
  }

  const getNotificationIcon = (item: NotificationItem) => {
    if (item.category === 'order') {
      return <Package className="h-3.5 w-3.5 text-emerald-600" />
    }
    if (item.category === 'return') {
      return <RotateCcw className="h-3.5 w-3.5 text-amber-600" />
    }
    if (item.category === 'review') {
      return <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
    }
    if (item.category === 'live') {
      return <Radio className="h-3.5 w-3.5 text-rose-600" />
    }
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
      <button
        type="button"
        data-testid="notification-bell-button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-900 hover:border-zinc-900 transition-colors cursor-pointer"
        aria-label="Thông báo"
        aria-expanded={isOpen}
      >
        <Bell className="h-4 w-4 text-zinc-800" />

        {unreadCount > 0 && (
          <span
            data-testid="notification-unread-badge"
            className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-md bg-rose-600 px-1 text-[10px] font-mono font-bold text-white shadow-2xs"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          data-testid="notifications-dropdown-panel"
          className="fixed left-2 right-2 top-[4.25rem] sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[26rem] rounded-2xl border border-zinc-200/90 bg-white shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
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

          {/* Category Filter Tabs */}
          <div
            role="tablist"
            aria-label="Lọc danh mục thông báo"
            className="flex items-center gap-1.5 overflow-x-auto border-b border-zinc-100 bg-zinc-50/40 px-3 py-2"
          >
            {CATEGORY_TABS.map((tab) => {
              const active = selectedCategory === tab.key
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  data-testid={`notification-tab-${tab.key}`}
                  onClick={() => handleCategoryChange(tab.key)}
                  className={`shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                    active
                      ? 'bg-zinc-900 text-white'
                      : 'bg-white text-zinc-600 border border-zinc-200 hover:border-zinc-400 hover:text-zinc-900'
                  }`}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>

          {/* List of notifications */}
          <div className="max-h-96 overflow-y-auto divide-y divide-zinc-100 text-xs">
            {isLoading && notifications.length === 0 ? (
              <div className="py-8 text-center text-zinc-400">Đang tải thông báo...</div>
            ) : fetchError && notifications.length === 0 ? (
              <div className="py-8 text-center text-zinc-500 space-y-2 px-4">
                <p>Không thể tải danh sách thông báo</p>
                <button
                  type="button"
                  onClick={() => void fetchNotifications(selectedCategory)}
                  className="inline-flex items-center rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:border-zinc-400 transition-colors cursor-pointer"
                >
                  Thử lại
                </button>
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-10 text-center text-zinc-400 space-y-2">
                <BellOff className="mx-auto h-8 w-8 text-zinc-300" />
                <p>
                  {selectedCategory === 'all'
                    ? 'Bạn chưa có thông báo nào'
                    : 'Chưa có thông báo nào trong mục này'}
                </p>
              </div>
            ) : (
              notifications.map((item) => {
                const isSystem = isSystemStoreNotification(item)
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
                    <div className="relative shrink-0">
                      {isSystem ? (
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-700 text-white select-none">
                          <Store className="h-4 w-4" />
                        </div>
                      ) : (
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-900 text-white font-mono text-xs font-bold select-none">
                          {initial}
                        </div>
                      )}
                      <div className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-white shadow-2xs">
                        {getNotificationIcon(item)}
                      </div>
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      {renderNotificationContent(item)}
                      <span className="text-[11px] text-zinc-400 block">
                        {formatDateTime(item.updatedAt || item.createdAt)}
                      </span>
                    </div>

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
