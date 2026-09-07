import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MessageCircle } from 'lucide-react'
import {
  listAdminConversations,
  getAdminConversation,
  listAdminMessages,
  adminSendMessage,
  adminMarkAsRead,
  type ChatConversation,
  type ChatMessage,
} from '@/api/chat'
import { useAdminChatSocket } from '@/hooks/useAdminChatSocket'
import { AdminConversationList } from './chat/AdminConversationList'
import { AdminChatView } from './chat/AdminChatView'

export function AdminMessagesPage() {
  const [searchParams] = useSearchParams()
  const initialOrderId = searchParams.get('orderId') || ''

  const [searchQuery, setSearchQuery] = useState(initialOrderId)
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)

  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [totalItems, setTotalItems] = useState(0)
  const [isLoadingList, setIsLoadingList] = useState(false)

  const [selectedConv, setSelectedConv] = useState<ChatConversation | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [isLoadingOlder, setIsLoadingOlder] = useState(false)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [isSending, setIsSending] = useState(false)

  const selectedConvRef = useRef<ChatConversation | null>(null)
  selectedConvRef.current = selectedConv

  // Real-time socket events
  const handleNewMessage = useCallback((msg: ChatMessage) => {
    if (selectedConvRef.current && selectedConvRef.current.id === msg.conversationId) {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev
        return [...prev, msg]
      })
      adminMarkAsRead(msg.conversationId).catch(() => {})
    }

    setConversations((prev) =>
      prev.map((c) =>
        c.id === msg.conversationId
          ? {
              ...c,
              adminUnreadCount:
                selectedConvRef.current?.id === msg.conversationId
                  ? 0
                  : c.adminUnreadCount + 1,
              lastMessageAt: msg.createdAt,
              lastMessage: {
                id: msg.id,
                senderRole: msg.senderRole,
                messageType: msg.messageType,
                content: msg.content,
                hasMedia: Boolean(msg.media && msg.media.length > 0),
                createdAt: msg.createdAt,
              },
            }
          : c
      )
    )
  }, [])

  const handlePresenceUpdate = useCallback(
    (data: { userId: string; role: string; status: 'online' | 'active' | 'offline'; displayText: string; lastActiveAt: string }) => {
      setConversations((prev) =>
        prev.map((c) => {
          if (c.userId === data.userId) {
            return {
              ...c,
              customerPresence: {
                status: data.status,
                displayText: data.displayText,
                lastActiveAt: data.lastActiveAt,
              },
            }
          }
          return c
        })
      )

      if (selectedConvRef.current?.userId === data.userId) {
        setSelectedConv((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            customerPresence: {
              status: data.status,
              displayText: data.displayText,
              lastActiveAt: data.lastActiveAt,
            },
          }
        })
      }
    },
    []
  )

  const { joinConversation } = useAdminChatSocket({
    onNewMessage: handleNewMessage,
    onPresenceUpdate: handlePresenceUpdate,
  })

  // Select conversation
  const selectConversation = useCallback(
    async (conv: ChatConversation) => {
      setSelectedConv(conv)
      setIsLoadingMessages(true)
      try {
        const fullConv = await getAdminConversation(conv.id)
        setSelectedConv(fullConv)

        const res = await listAdminMessages(conv.id, 20)
        setMessages(res.messages)
        setHasMore(res.hasMore)
        joinConversation(conv.id)

        if (conv.adminUnreadCount > 0) {
          await adminMarkAsRead(conv.id)
          setConversations((prev) =>
            prev.map((c) => (c.id === conv.id ? { ...c, adminUnreadCount: 0 } : c))
          )
        }
      } catch {
        // Ignore
      } finally {
        setIsLoadingMessages(false)
      }
    },
    [joinConversation]
  )

  // Load conversations list
  const fetchConversations = useCallback(async () => {
    setIsLoadingList(true)
    try {
      const res = await listAdminConversations({
        unreadOnly,
        page,
        pageSize,
      })
      let list = res.data || []
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        list = list.filter(
          (c) =>
            c.customerName?.toLowerCase().includes(q) ||
            c.customerEmail?.toLowerCase().includes(q) ||
            c.userId.toLowerCase().includes(q)
        )
      }
      const uniqueList = Array.from(new Map(list.map((c) => [c.id, c])).values())
      setConversations(uniqueList)
      setTotalItems(res.meta?.pagination?.total || uniqueList.length)

      // Auto-select first if none selected
      if (uniqueList.length > 0 && !selectedConvRef.current) {
        selectConversation(uniqueList[0])
      }
    } catch {
      // Ignore
    } finally {
      setIsLoadingList(false)
    }
  }, [searchQuery, unreadOnly, page, pageSize, selectConversation])

  useEffect(() => {
    fetchConversations()
  }, [fetchConversations])

  const loadOlderMessages = useCallback(async () => {
    if (!selectedConv || !hasMore || isLoadingOlder || messages.length === 0) {
      return
    }
    setIsLoadingOlder(true)
    try {
      const oldest = messages[0]
      const res = await listAdminMessages(selectedConv.id, 20, oldest.createdAt)
      if (res.messages.length > 0) {
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id))
          const newOnes = res.messages.filter((m) => !existingIds.has(m.id))
          return [...newOnes, ...prev]
        })
      }
      setHasMore(res.hasMore)
    } catch {
      // Ignore
    } finally {
      setIsLoadingOlder(false)
    }
  }, [selectedConv, hasMore, isLoadingOlder, messages])

  const handleSendMessage = useCallback(
    async (content: string, files?: File[], orderId?: string) => {
      if (!selectedConv) return
      if (!content.trim() && (!files || files.length === 0) && !orderId) return

      setIsSending(true)
      try {
        const msg = await adminSendMessage(selectedConv.id, content, files, orderId)
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev
          return [...prev, msg]
        })
      } catch {
        // Ignore
      } finally {
        setIsSending(false)
      }
    },
    [selectedConv]
  )

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col lg:flex-row bg-slate-50 overflow-hidden">
      {/* Left Sidebar: Conversations List & Filters */}
      <AdminConversationList
        conversations={conversations}
        selectedConvId={selectedConv?.id}
        onSelectConversation={selectConversation}
        isLoading={isLoadingList}
        searchQuery={searchQuery}
        onSearchChange={(q) => {
          setSearchQuery(q)
          setPage(1)
        }}
        unreadOnly={unreadOnly}
        onUnreadOnlyChange={(u) => {
          setUnreadOnly(u)
          setPage(1)
        }}
        totalItems={totalItems}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        onRefresh={fetchConversations}
      />

      {/* Right Main Panel: Active Chat Thread */}
      {selectedConv ? (
        <AdminChatView
          conversation={selectedConv}
          messages={messages}
          hasMore={hasMore}
          isLoadingMessages={isLoadingMessages}
          isLoadingOlder={isLoadingOlder}
          onLoadOlder={loadOlderMessages}
          onSendMessage={handleSendMessage}
          isSending={isSending}
        />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-sm bg-white">
          <MessageCircle className="h-12 w-12 text-slate-300 mb-3" />
          <p className="font-semibold text-slate-600">Chọn cuộc trò chuyện</p>
          <p className="text-xs text-slate-400 mt-1">
            Chọn từ danh sách bên trái để xem nội dung và trả lời khách hàng.
          </p>
        </div>
      )}
    </div>
  )
}
