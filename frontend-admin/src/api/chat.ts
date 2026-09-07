import { apiClient, apiClientWithMeta, type ApiResponseWithMeta } from './client'

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

export interface LastMessageSnippet {
  id: string
  senderRole: 'customer' | 'admin'
  messageType: 'text' | 'media' | 'order'
  content: string
  hasMedia: boolean
  createdAt: string
}

export interface ChatConversation {
  id: string
  userId: string
  customerName?: string
  customerEmail?: string
  customerPhone?: string
  lastMessage?: LastMessageSnippet | null
  adminUnreadCount: number
  lastMessageAt: string
  customerPresence: ChatPresence
  adminPresence?: ChatPresence
  createdAt?: string
  updatedAt?: string
}

export interface ListAdminConversationsParams {
  unreadOnly?: boolean
  page?: number
  pageSize?: number
}

export interface ListAdminMessagesResult {
  messages: ChatMessage[]
  hasMore: boolean
}

export async function listAdminConversations(
  params: ListAdminConversationsParams = {}
): Promise<ApiResponseWithMeta<ChatConversation[]>> {
  const query = new URLSearchParams()
  if (params.page) query.set('page', String(params.page))
  if (params.pageSize) query.set('pageSize', String(params.pageSize))
  if (params.unreadOnly) query.set('unreadOnly', 'true')

  return apiClientWithMeta<ChatConversation[]>(`/admin/chat/conversations?${query.toString()}`, {
    method: 'GET',
  })
}

export async function getAdminConversation(id: string): Promise<ChatConversation> {
  return apiClient<ChatConversation>(`/admin/chat/conversations/${id}`, {
    method: 'GET',
  })
}

export async function listAdminMessages(
  conversationId: string,
  limit = 20,
  before?: string
): Promise<ListAdminMessagesResult> {
  const query = new URLSearchParams()
  query.set('limit', String(limit))
  if (before) query.set('before', before)

  const res = await apiClientWithMeta<ChatMessage[]>(
    `/admin/chat/conversations/${conversationId}/messages?${query.toString()}`,
    {
      method: 'GET',
    }
  )

  return {
    messages: res.data || [],
    hasMore: Boolean(res.meta?.hasMore),
  }
}

export async function adminSendMessage(
  conversationId: string,
  content: string,
  files?: File[],
  orderId?: string
): Promise<ChatMessage> {
  if (files && files.length > 0) {
    const formData = new FormData()
    if (content) formData.append('content', content)
    if (orderId) formData.append('orderId', orderId)
    for (const f of files) {
      formData.append('files', f)
    }
    return apiClient<ChatMessage>(`/admin/chat/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: formData,
    })
  }

  const payload: { content: string; orderId?: string } = { content }
  if (orderId) {
    payload.orderId = orderId
  }

  return apiClient<ChatMessage>(`/admin/chat/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: payload,
  })
}

export async function adminMarkAsRead(conversationId: string): Promise<void> {
  await apiClient(`/admin/chat/conversations/${conversationId}/read`, {
    method: 'POST',
  })
}
