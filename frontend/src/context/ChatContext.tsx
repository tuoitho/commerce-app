import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import {
  type ChatConversation,
  type ChatMessage,
  createOrGetConversation,
  listConversations,
  listMessages,
  sendMessage as apiSendMessage,
  markAsRead as apiMarkAsRead,
  getTotalUnread,
} from '@/api/chat'
import { useChatSocket } from '@/hooks/useChatSocket'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'

interface ChatContextType {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  activeConversation: ChatConversation | null
  conversations: ChatConversation[]
  messages: ChatMessage[]
  hasMore: boolean
  isLoadingOlder: boolean
  totalUnread: number
  isLoading: boolean
  isSending: boolean
  openChat: (orderId?: string) => Promise<void>
  selectConversation: (conv: ChatConversation) => Promise<void>
  closeChat: () => void
  sendChatMessage: (content: string, files?: File[], orderId?: string) => Promise<void>
  loadOlderMessages: () => Promise<void>
  refreshConversations: () => Promise<void>
}

const ChatContext = createContext<ChatContextType | undefined>(undefined)

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const toast = useToast()
  const [isOpen, setIsOpen] = useState(false)
  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [activeConversation, setActiveConversation] = useState<ChatConversation | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [totalUnread, setTotalUnread] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)

  const [hasMore, setHasMore] = useState(false)
  const [isLoadingOlder, setIsLoadingOlder] = useState(false)

  const activeConvRef = useRef<ChatConversation | null>(null)
  activeConvRef.current = activeConversation

  const isOpenRef = useRef(isOpen)
  isOpenRef.current = isOpen

  // Real-time socket callbacks
  const handleNewMessage = useCallback((msg: ChatMessage) => {
    if (activeConvRef.current && activeConvRef.current.id === msg.conversationId) {
      setMessages((prev) => {
        // Prevent duplicates
        if (prev.some((m) => m.id === msg.id)) return prev
        return [...prev, msg]
      })
      // If customer is currently looking at this conversation, mark as read
      if (isOpenRef.current) {
        apiMarkAsRead(msg.conversationId).catch(() => {})
      } else {
        setTotalUnread((prev) => prev + 1)
      }
    } else {
      // Incoming message while not in conversation -> bump unread
      setTotalUnread((prev) => prev + 1)
    }
  }, [])

  const handleReadReceipt = useCallback((data: { conversationId: string; readerRole: string }) => {
    if (activeConvRef.current && activeConvRef.current.id === data.conversationId) {
      // admin marked read
    }
  }, [])

  const handlePresenceUpdate = useCallback(
    (data: { userId: string; role: string; status: 'online' | 'active' | 'offline'; displayText: string; lastActiveAt: string }) => {
      if (data.role === 'admin') {
        setActiveConversation((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            adminPresence: {
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

  const { joinConversation, markRead } = useChatSocket({
    enabled: Boolean(user),
    onNewMessage: handleNewMessage,
    onReadReceipt: handleReadReceipt,
    onPresenceUpdate: handlePresenceUpdate,
  })

  const refreshUnread = useCallback(async () => {
    if (!user) {
      setTotalUnread(0)
      return
    }
    try {
      const res = await getTotalUnread()
      setTotalUnread(res.totalUnread)
    } catch {
      // Ignore
    }
  }, [user])

  const refreshConversations = useCallback(async () => {
    if (!user) return
    try {
      const list = await listConversations()
      const uniqueList = Array.from(new Map(list.map((c) => [c.id, c])).values())
      setConversations(uniqueList)
    } catch {
      // Ignore
    }
  }, [user])

  useEffect(() => {
    if (user) {
      refreshUnread()
      refreshConversations()
    } else {
      setConversations([])
      setActiveConversation(null)
      setMessages([])
      setHasMore(false)
      setTotalUnread(0)
      setIsOpen(false)
    }
  }, [user, refreshUnread, refreshConversations])

  const selectConversation = useCallback(
    async (conv: ChatConversation) => {
      setActiveConversation(conv)
      setIsLoading(true)
      try {
        const res = await listMessages(conv.id, 20)
        setMessages(res.messages)
        setHasMore(res.hasMore)
        joinConversation(conv.id)
        markRead(conv.id)
        await apiMarkAsRead(conv.id)
        refreshUnread()
        setConversations([conv])
      } catch (err: any) {
        toast?.error('Lỗi', 'Không thể tải tin nhắn cuộc hội thoại')
      } finally {
        setIsLoading(false)
      }
    },
    [joinConversation, markRead, refreshUnread, toast]
  )

  const openChat = useCallback(
    async (orderId?: string) => {
      if (!user) {
        toast?.error('Cần đăng nhập', 'Vui lòng đăng nhập để bắt đầu trò chuyện với hỗ trợ')
        return
      }

      setIsOpen(true)
      setIsLoading(true)
      try {
        const conv = await createOrGetConversation()
        await selectConversation(conv)
        if (orderId) {
          const newMsg = await apiSendMessage(conv.id, 'Tôi cần hỗ trợ về đơn hàng này', undefined, orderId)
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev
            return [...prev, newMsg]
          })
        }
      } catch (err: any) {
        toast?.error('Lỗi', err.message || 'Không thể mở hộp thoại tin nhắn')
      } finally {
        setIsLoading(false)
      }
    },
    [user, selectConversation, toast]
  )

  const closeChat = useCallback(() => {
    setIsOpen(false)
  }, [])

  const loadOlderMessages = useCallback(async () => {
    if (!activeConversation || !hasMore || isLoadingOlder || messages.length === 0) {
      return
    }
    setIsLoadingOlder(true)
    try {
      const oldest = messages[0]
      const res = await listMessages(activeConversation.id, 20, oldest.createdAt)
      if (res.messages.length > 0) {
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id))
          const newOnes = res.messages.filter((m) => !existingIds.has(m.id))
          return [...newOnes, ...prev]
        })
      }
      setHasMore(res.hasMore)
    } catch (err) {
      console.error('Failed to load older messages', err)
    } finally {
      setIsLoadingOlder(false)
    }
  }, [activeConversation, hasMore, isLoadingOlder, messages])

  const sendChatMessage = useCallback(
    async (content: string, files?: File[], orderId?: string) => {
      if (!activeConversation) return
      if (!content.trim() && (!files || files.length === 0) && !orderId) return

      setIsSending(true)
      try {
        const newMsg = await apiSendMessage(activeConversation.id, content, files, orderId)
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev
          return [...prev, newMsg]
        })
      } catch (err: any) {
        toast?.error('Lỗi', err.message || 'Không thể gửi tin nhắn')
      } finally {
        setIsSending(false)
      }
    },
    [activeConversation, toast]
  )

  return (
    <ChatContext.Provider
      value={{
        isOpen,
        setIsOpen,
        activeConversation,
        conversations,
        messages,
        hasMore,
        isLoadingOlder,
        totalUnread,
        isLoading,
        isSending,
        openChat,
        selectConversation,
        closeChat,
        sendChatMessage,
        loadOlderMessages,
        refreshConversations,
      }}
    >
      {children}
    </ChatContext.Provider>
  )
}

export function useChat() {
  const context = useContext(ChatContext)
  if (!context) {
    return {
      isOpen: false,
      setIsOpen: () => {},
      activeConversation: null,
      conversations: [],
      messages: [],
      hasMore: false,
      isLoadingOlder: false,
      totalUnread: 0,
      isLoading: false,
      isSending: false,
      openChat: async () => {},
      selectConversation: async () => {},
      closeChat: () => {},
      sendChatMessage: async () => {},
      loadOlderMessages: async () => {},
      refreshConversations: async () => {},
    }
  }
  return context
}
