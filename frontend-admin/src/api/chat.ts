import { apiClient } from './client'
import { tokenStore } from './tokenStore'

export type ChatSenderRole = 'customer' | 'admin'
export type ChatAttachmentType = 'image' | 'video'

export interface AdminChatAttachment {
  id: string
  messageId?: string | null
  uploaderId?: string
  fileType: ChatAttachmentType
  fileUrl: string
  fileName: string
  fileSize: number
  mimeType: string
  createdAt?: string
}

export interface AttachedOrderItemSummary {
  productName: string
  quantity: number
  unitPriceVnd: number
  imageUrl: string
}

export interface AttachedOrderCard {
  id: string
  userId?: string
  status: string
  totalVnd: number
  createdAt: string
  itemsSummary: AttachedOrderItemSummary[]
  totalItemsCount: number
}

export interface AdminChatMessage {
  id: string
  conversationId: string
  senderId: string
  senderRole: ChatSenderRole
  senderName: string
  content: string
  attachedOrderId?: string | null
  attachedOrder?: AttachedOrderCard | null
  attachments: AdminChatAttachment[]
  createdAt: string
  isRead: boolean
}

export interface AdminConversation {
  id: string
  userId: string
  customerEmail: string
  customerName: string
  customerLastActive?: string | null
  isOnline: boolean
  lastMessageAt: string
  lastMessageSnippet: string
  unreadCount: number
  createdAt: string
  updatedAt: string
}

export interface AdminSendMessagePayload {
  content?: string
  attachmentIds?: string[]
}

export interface WSEventNewMessage {
  type: 'chat:new_message'
  payload: AdminChatMessage
}

export interface WSEventMessagesRead {
  type: 'chat:messages_read'
  payload: {
    conversationId: string
    readerRole: ChatSenderRole
    readAt: string
  }
}

export interface WSEventPresence {
  type: 'chat:presence'
  payload: {
    userId: string
    role: ChatSenderRole
    isOnline: boolean
    lastActiveAt?: string | null
  }
}

export type WSEvent =
  | WSEventNewMessage
  | WSEventMessagesRead
  | WSEventPresence
  | { type: 'pong' }
  | { type: 'ping' }

export interface ListAdminConversationsParams {
  filter?: 'all' | 'unread'
  search?: string
  limit?: number
  offset?: number
}

export async function listAdminConversations(
  params: ListAdminConversationsParams = {}
): Promise<AdminConversation[]> {
  const { filter = 'all', search = '', limit = 50, offset = 0 } = params
  const searchParam = search.trim() ? `&search=${encodeURIComponent(search.trim())}` : ''
  return apiClient<AdminConversation[]>(
    `/admin/chat/conversations?filter=${filter}${searchParam}&limit=${limit}&offset=${offset}`
  )
}

export async function getAdminConversationMessages(
  conversationId: string,
  limit = 50,
  offset = 0
): Promise<AdminChatMessage[]> {
  return apiClient<AdminChatMessage[]>(
    `/admin/chat/conversations/${conversationId}/messages?limit=${limit}&offset=${offset}`
  )
}

export async function sendAdminMessage(
  conversationId: string,
  payload: AdminSendMessagePayload
): Promise<AdminChatMessage> {
  return apiClient<AdminChatMessage>(
    `/admin/chat/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      body: payload,
    }
  )
}

export async function markAdminConversationRead(
  conversationId: string
): Promise<{ read: boolean }> {
  return apiClient<{ read: boolean }>(
    `/admin/chat/conversations/${conversationId}/read`,
    {
      method: 'POST',
    }
  )
}

export async function uploadAdminMedia(file: File): Promise<AdminChatAttachment> {
  const formData = new FormData()
  formData.append('file', file)
  return apiClient<AdminChatAttachment>('/chat/media', {
    method: 'POST',
    body: formData,
  })
}

export function getAuthenticatedAdminMediaUrl(url: string, token?: string | null): string {
  if (!url || url.startsWith('blob:') || url.startsWith('data:')) {
    return url
  }
  const authToken = token || tokenStore.getToken()
  if (!authToken) {
    return url
  }
  if (url.includes('token=')) {
    return url
  }
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}token=${encodeURIComponent(authToken)}`
}

export function getAdminChatWebSocketUrl(token: string): string {
  const rawBase = import.meta.env.VITE_API_BASE_URL || '/api/v1'
  const cleanBase = rawBase.replace(/\/+$/, '')
  let wsUrl: string
  if (cleanBase.startsWith('http://')) {
    wsUrl = cleanBase.replace('http://', 'ws://')
  } else if (cleanBase.startsWith('https://')) {
    wsUrl = cleanBase.replace('https://', 'wss://')
  } else if (cleanBase.startsWith('ws://') || cleanBase.startsWith('wss://')) {
    wsUrl = cleanBase
  } else {
    const protocol = typeof window !== 'undefined' && window.location?.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = typeof window !== 'undefined' && window.location?.host ? window.location.host : 'localhost:18080'
    const formattedBase = cleanBase.startsWith('/') ? cleanBase : `/${cleanBase}`
    wsUrl = `${protocol}//${host}${formattedBase}`
  }
  return `${wsUrl}/chat/ws?token=${encodeURIComponent(token)}`
}

export const chatAdminApi = {
  listAdminConversations,
  getAdminConversationMessages,
  sendAdminMessage,
  markAdminConversationRead,
  uploadAdminMedia,
  getAuthenticatedAdminMediaUrl,
  getAdminChatWebSocketUrl,
}
