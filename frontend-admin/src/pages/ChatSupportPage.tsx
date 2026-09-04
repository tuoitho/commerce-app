import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Search,
  X,
  MessageSquare,
  RefreshCw,
  User,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import {
  listAdminConversations,
  getAdminConversationMessages,
  sendAdminMessage,
  markAdminConversationRead,
  type AdminConversation,
  type AdminChatMessage,
  type AdminSendMessagePayload,
} from '@/api/chat'
import { formatChatTime, formatRelativeTime, formatUnreadCount } from '@/lib/chatUtils'
import { AdminChatDetail } from '@/components/chat/AdminChatDetail'
import { useAdminChatSocket } from '@/hooks/useAdminChatSocket'

export function ChatSupportPage() {
  const { conversationId } = useParams<{ conversationId?: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Search input debounce (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  // Fetch conversations with TanStack query
  const {
    data: conversations = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<AdminConversation[], Error>({
    queryKey: ['admin-conversations', filter, debouncedSearch],
    queryFn: () => listAdminConversations({ filter, search: debouncedSearch }),
    refetchInterval: 10000, // Background polling fallback
  })

  // Selected conversation
  const selectedConversation = useMemo(() => {
    if (!conversationId) return null
    return conversations.find((c) => c.id === conversationId) || null
  }, [conversationId, conversations])

  // Total unread count across all conversations
  const totalUnread = useMemo(() => {
    return conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0)
  }, [conversations])

  // Fetch messages for active conversation
  const {
    data: messages = [],
    isLoading: isLoadingMessages,
    isError: isErrorMessages,
    error: messagesError,
    refetch: refetchMessages,
  } = useQuery<AdminChatMessage[], Error>({
    queryKey: ['admin-conversation-messages', conversationId],
    queryFn: () => getAdminConversationMessages(conversationId!),
    enabled: Boolean(conversationId),
    refetchInterval: 5000,
  })

  // Seen messages deduplication
  const seenMessageIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (messages) {
      messages.forEach((m) => seenMessageIdsRef.current.add(m.id))
    }
  }, [messages])

  useEffect(() => {
    seenMessageIdsRef.current = new Set()
  }, [conversationId])

  // Mark conversation as read
  const handleMarkAsRead = useCallback(async () => {
    if (!conversationId) return
    try {
      await markAdminConversationRead(conversationId)
      queryClient.setQueriesData<AdminConversation[]>(
        { queryKey: ['admin-conversations'] },
        (old = []) =>
          old.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c))
      )
      queryClient.invalidateQueries({ queryKey: ['admin-conversations-unread-badge'] })
    } catch {
      // Ignore
    }
  }, [conversationId, queryClient])

  // Send message
  const handleSendMessage = async (payload: AdminSendMessagePayload) => {
    if (!conversationId) return
    const newMsg = await sendAdminMessage(conversationId, payload)
    seenMessageIdsRef.current.add(newMsg.id)

    queryClient.setQueryData<AdminChatMessage[]>(
      ['admin-conversation-messages', conversationId],
      (old = []) => [...old, newMsg]
    )

    queryClient.setQueriesData<AdminConversation[]>(
      { queryKey: ['admin-conversations'] },
      (old = []) =>
        old.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                lastMessageSnippet: newMsg.content || 'Đã gửi tệp đính kèm',
                lastMessageAt: newMsg.createdAt,
              }
            : c
        )
    )
  }

  // Realtime WebSocket integration
  useAdminChatSocket({
    onNewMessage: (newMsg) => {
      const isCurrent = newMsg.conversationId === conversationId

      if (isCurrent) {
        if (!seenMessageIdsRef.current.has(newMsg.id)) {
          seenMessageIdsRef.current.add(newMsg.id)
          queryClient.setQueryData<AdminChatMessage[]>(
            ['admin-conversation-messages', conversationId],
            (old = []) => (old.some((m) => m.id === newMsg.id) ? old : [...old, newMsg])
          )
        }
        queryClient.invalidateQueries({ queryKey: ['admin-conversation-messages', conversationId] })
      }

      queryClient.setQueriesData<AdminConversation[]>(
        { queryKey: ['admin-conversations'] },
        (old = []) => {
          const exists = old.some((c) => c.id === newMsg.conversationId)
          if (!exists) {
            queryClient.invalidateQueries({ queryKey: ['admin-conversations'] })
            return old
          }
          return old.map((c) => {
            if (c.id === newMsg.conversationId) {
              return {
                ...c,
                lastMessageSnippet: newMsg.content || 'Đã gửi tệp đính kèm',
                lastMessageAt: newMsg.createdAt,
                unreadCount:
                  isCurrent || newMsg.senderRole === 'admin'
                    ? c.unreadCount
                    : c.unreadCount + 1,
              }
            }
            return c
          })
        }
      )
      queryClient.invalidateQueries({ queryKey: ['admin-conversations-unread-badge'] })
    },
    onMessagesRead: (payload) => {
      if (payload.conversationId === conversationId) {
        queryClient.setQueryData<AdminChatMessage[]>(
          ['admin-conversation-messages', conversationId],
          (old = []) =>
            old.map((m) => (m.senderRole === 'admin' ? { ...m, isRead: true } : m))
        )
      }
      if (payload.readerRole === 'admin') {
        queryClient.setQueriesData<AdminConversation[]>(
          { queryKey: ['admin-conversations'] },
          (old = []) =>
            old.map((c) =>
              c.id === payload.conversationId ? { ...c, unreadCount: 0 } : c
            )
        )
        queryClient.invalidateQueries({ queryKey: ['admin-conversations-unread-badge'] })
      }
    },
    onPresenceChange: (payload) => {
      queryClient.setQueriesData<AdminConversation[]>(
        { queryKey: ['admin-conversations'] },
        (old = []) =>
          old.map((c) =>
            c.userId === payload.userId
              ? {
                  ...c,
                  isOnline: payload.isOnline,
                  customerLastActive: payload.lastActiveAt || c.customerLastActive,
                }
              : c
          )
      )
    },
  })

  const handleSelectConversation = (conv: AdminConversation) => {
    navigate(`/chat/${conv.id}`)
  }

  return (
    <div
      data-testid="chat-support-page"
      className="flex flex-col h-[calc(100vh-8.5rem)] -m-8 overflow-hidden bg-slate-100"
    >
      {/* Main Two-Column Master-Detail Layout */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Column: Conversation Sidebar */}
        <aside
          data-testid="conversations-sidebar"
          className="w-80 sm:w-96 border-r border-slate-200 bg-white flex flex-col shrink-0 overflow-hidden"
        >
          {/* Header & Title */}
          <div className="p-4 border-b border-slate-100 pb-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">Hội thoại</h2>
                {totalUnread > 0 && (
                  <span
                    data-testid="total-unread-badge"
                    className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700"
                  >
                    {totalUnread} chưa đọc
                  </span>
                )}
              </div>
              <button
                type="button"
                data-testid="refresh-conversations-btn"
                onClick={() => refetch()}
                disabled={isFetching}
                title="Làm mới danh sách"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin text-blue-600' : ''}`} />
              </button>
            </div>

            {/* Search Input */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                data-testid="chat-search-input"
                placeholder="Tìm theo email, mã đơn hàng..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-9 pr-8 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition"
              />
              {searchInput && (
                <button
                  type="button"
                  data-testid="clear-search-btn"
                  onClick={() => setSearchInput('')}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Filter Tabs */}
            <div className="flex rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                data-testid="filter-tab-all"
                onClick={() => setFilter('all')}
                className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition ${
                  filter === 'all'
                    ? 'bg-white text-blue-700 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tất cả
              </button>
              <button
                type="button"
                data-testid="filter-tab-unread"
                onClick={() => setFilter('unread')}
                className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition flex items-center justify-center gap-1.5 ${
                  filter === 'unread'
                    ? 'bg-white text-blue-700 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>Chưa đọc</span>
                {totalUnread > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white">
                    {totalUnread > 99 ? '99+' : totalUnread}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Conversations List Scrollable Stream */}
          <div data-testid="conversation-list" className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {isLoading ? (
              <div
                data-testid="conversations-loading"
                className="flex flex-col items-center justify-center h-48 text-slate-400 gap-2"
              >
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                <span className="text-xs">Đang tải danh sách hội thoại...</span>
              </div>
            ) : isError ? (
              <div
                data-testid="conversations-error"
                className="p-6 text-center text-rose-600 flex flex-col items-center gap-2"
              >
                <AlertCircle className="h-6 w-6 text-rose-500" />
                <p className="text-xs font-medium">{error?.message || 'Không thể tải danh sách hội thoại'}</p>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="mt-1 rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition"
                >
                  Thử lại
                </button>
              </div>
            ) : conversations.length === 0 ? (
              <div
                data-testid="conversations-empty"
                className="flex flex-col items-center justify-center h-48 px-6 text-center text-slate-400"
              >
                <MessageSquare className="h-8 w-8 text-slate-300 mb-2" />
                <p className="text-xs font-medium text-slate-600">
                  {debouncedSearch
                    ? 'Không tìm thấy cuộc hội thoại nào'
                    : filter === 'unread'
                    ? 'Không có tin nhắn chưa đọc'
                    : 'Chưa có cuộc hội thoại nào'}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  {debouncedSearch ? 'Hãy thử tìm kiếm với từ khóa khác' : 'Tin nhắn từ khách hàng sẽ xuất hiện ở đây'}
                </p>
              </div>
            ) : (
              conversations.map((conv) => {
                const isSelected = conversationId === conv.id
                return (
                  <button
                    key={conv.id}
                    type="button"
                    data-testid={`conversation-item-${conv.id}`}
                    onClick={() => handleSelectConversation(conv)}
                    className={`w-full text-left p-3.5 transition flex items-start gap-3 relative ${
                      isSelected
                        ? 'bg-blue-50/90 border-l-4 border-blue-600'
                        : 'hover:bg-slate-50/80 border-l-4 border-transparent'
                    }`}
                  >
                    {/* User Avatar with Presence Indicator */}
                    <div className="relative shrink-0">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-slate-600 font-semibold text-xs uppercase">
                        {conv.customerName ? conv.customerName.slice(0, 2) : <User className="h-5 w-5" />}
                      </div>
                      <span
                        data-testid={`presence-indicator-${conv.id}`}
                        title={conv.isOnline ? 'Đang trực tuyến' : formatRelativeTime(conv.customerLastActive)}
                        className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white ${
                          conv.isOnline ? 'bg-emerald-500' : 'bg-slate-300'
                        }`}
                      />
                    </div>

                    {/* Information */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <h4 className="text-xs font-semibold text-slate-900 truncate">
                          {conv.customerName || conv.customerEmail}
                        </h4>
                        <span className="text-[10px] text-slate-400 shrink-0 tabular-nums">
                          {formatChatTime(conv.lastMessageAt)}
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-500 truncate mb-1">
                        {conv.customerEmail}
                      </p>

                      <div className="flex items-center justify-between gap-2">
                        <p
                          className={`text-xs truncate ${
                            conv.unreadCount > 0 ? 'font-semibold text-slate-800' : 'text-slate-400'
                          }`}
                        >
                          {conv.lastMessageSnippet || 'Chưa có tin nhắn'}
                        </p>

                        {conv.unreadCount > 0 && (
                          <span
                            data-testid={`unread-badge-${conv.id}`}
                            className="flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[10px] font-bold text-white shrink-0"
                          >
                            {formatUnreadCount(conv.unreadCount)}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </aside>

        {/* Right Column: Chat Detail Area */}
        <main
          data-testid="admin-chat-detail-panel"
          className="flex-1 flex flex-col bg-white overflow-hidden"
        >
          {selectedConversation ? (
            <AdminChatDetail
              conversation={selectedConversation}
              messages={messages}
              isLoadingMessages={isLoadingMessages}
              isErrorMessages={isErrorMessages}
              errorMessage={messagesError?.message}
              onRetryMessages={() => refetchMessages()}
              onSendMessage={handleSendMessage}
              onMarkAsRead={handleMarkAsRead}
            />
          ) : (
            <div
              data-testid="no-conversation-selected"
              className="flex-1 flex flex-col items-center justify-center p-8 text-center"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-100 text-slate-400 mb-4 shadow-xs">
                <MessageSquare className="h-8 w-8" />
              </div>
              <h3 className="text-base font-bold text-slate-800 mb-1">
                Chưa chọn cuộc hội thoại
              </h3>
              <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
                Vui lòng chọn một cuộc hội thoại từ danh sách bên trái để xem nội dung trao đổi, thông tin đơn hàng và phản hồi khách hàng.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
export default ChatSupportPage
