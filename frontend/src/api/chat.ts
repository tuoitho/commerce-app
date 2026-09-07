import { apiClient, apiClientWithMeta } from './client'

export interface ChatPresence {
  status: 'online' | 'active' | 'offline'
  displayText: string
  lastActiveAt: string
}

export interface OrderSummary {
  id: string
  status: string
  totalVnd: number
  recipientName: string
  createdAt: string
  itemCount?: number
  firstItemName?: string
}

export interface ChatMessageMedia {
  id: string
  messageId: string
  mediaType: 'image' | 'video'
  url: string
  contentType: string
  fileSize: number
  fileName: string
  createdAt: string
}

export interface ChatMessage {
  id: string
  conversationId: string
  senderId: string
  senderRole: 'customer' | 'admin'
  messageType: 'text' | 'media' | 'order'
  orderId?: string | null
  orderSummary?: OrderSummary | null
  content: string
  media: ChatMessageMedia[]
  createdAt: string
}

export interface ChatConversation {
  id: string
  userId: string
  customerUnreadCount: number
  adminUnreadCount: number
  customerPresence: ChatPresence
  adminPresence: ChatPresence
  lastMessageAt: string
  createdAt: string
  updatedAt: string
}

export interface ListMessagesResult {
  messages: ChatMessage[]
  hasMore: boolean
}

export async function getOrCreateConversation(): Promise<ChatConversation> {
  return apiClient<ChatConversation>('/chat/conversation', {
    method: 'GET',
  })
}

// Giữ createOrGetConversation để tương thích ngược nếu có chỗ gọi
export async function createOrGetConversation(): Promise<ChatConversation> {
  return getOrCreateConversation()
}

export async function listConversations(): Promise<ChatConversation[]> {
  const conv = await getOrCreateConversation()
  return [conv]
}

export async function getConversation(id: string): Promise<ChatConversation> {
  return apiClient<ChatConversation>(`/chat/conversations/${id}`, {
    method: 'GET',
  })
}

export async function listMessages(conversationId: string, limit = 20, before?: string): Promise<ListMessagesResult> {
  const query = new URLSearchParams()
  query.set('limit', String(limit))
  if (before) {
    query.set('before', before)
  }
  const res = await apiClientWithMeta<ChatMessage[]>(`/chat/conversations/${conversationId}/messages?${query.toString()}`, {
    method: 'GET',
  })
  return {
    messages: res.data || [],
    hasMore: Boolean(res.meta?.hasMore),
  }
}

export async function sendMessage(conversationId: string, content: string, files?: File[], orderId?: string): Promise<ChatMessage> {
  if (files && files.length > 0) {
    const formData = new FormData()
    if (content) {
      formData.append('content', content)
    }
    if (orderId) {
      formData.append('orderId', orderId)
    }
    for (const f of files) {
      formData.append('files', f)
    }
    return apiClient<ChatMessage>(`/chat/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: formData,
    })
  }

  const payload: { content: string; orderId?: string } = { content }
  if (orderId) {
    payload.orderId = orderId
  }

  return apiClient<ChatMessage>(`/chat/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: payload,
  })
}

export async function markAsRead(conversationId: string): Promise<void> {
  await apiClient(`/chat/conversations/${conversationId}/read`, {
    method: 'POST',
  })
}

export async function getTotalUnread(): Promise<{ totalUnread: number }> {
  return apiClient<{ totalUnread: number }>('/chat/unread-count', {
    method: 'GET',
  })
}
