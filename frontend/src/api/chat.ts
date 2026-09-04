import { apiClient } from './client'
import { tokenStore } from './tokenStore'

export type ChatSenderRole = 'customer' | 'admin'
export type ChatAttachmentType = 'image' | 'video'

export interface ChatAttachment {
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

export interface ChatMessage {
  id: string
  conversationId: string
  senderId: string
  senderRole: ChatSenderRole
  senderName: string
  content: string
  attachedOrderId?: string | null
  attachedOrder?: AttachedOrderCard | null
  attachments: ChatAttachment[]
  createdAt: string
  isRead: boolean
}

export interface Conversation {
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

export interface SendCustomerMessagePayload {
  content: string
  attachedOrderId?: string
  attachmentIds?: string[]
}

export interface WSEventNewMessage {
  type: 'chat:new_message'
  payload: ChatMessage
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
    lastActiveAt: string
  }
}

export interface WSEventPing {
  type: 'ping'
}

export interface WSEventPong {
  type: 'pong'
}

export type WSEvent =
  | WSEventNewMessage
  | WSEventMessagesRead
  | WSEventPresence
  | WSEventPing
  | WSEventPong

export async function getConversation(): Promise<Conversation> {
  return apiClient<Conversation>('/chat/conversation')
}

export async function getMessages(limit = 50, offset = 0): Promise<ChatMessage[]> {
  return apiClient<ChatMessage[]>(`/chat/messages?limit=${limit}&offset=${offset}`)
}

export async function sendMessage(payload: SendCustomerMessagePayload): Promise<ChatMessage> {
  return apiClient<ChatMessage>('/chat/messages', {
    method: 'POST',
    body: payload,
  })
}

export async function markConversationRead(): Promise<{ read: boolean }> {
  return apiClient<{ read: boolean }>('/chat/read', {
    method: 'POST',
  })
}

export async function getCustomerOrders(limit = 10): Promise<AttachedOrderCard[]> {
  return apiClient<AttachedOrderCard[]>(`/chat/orders?limit=${limit}`)
}

export async function uploadMedia(file: File): Promise<ChatAttachment> {
  const formData = new FormData()
  formData.append('file', file)
  return apiClient<ChatAttachment>('/chat/media', {
    method: 'POST',
    body: formData,
  })
}

export function getChatWebSocketUrl(token: string): string {
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

export function getAuthenticatedMediaUrl(url: string, token?: string | null): string {
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

export const buildChatWsUrl = getChatWebSocketUrl

export const chatApi = {
  getConversation,
  getMessages,
  sendMessage,
  markConversationRead,
  getCustomerOrders,
  uploadMedia,
  getChatWebSocketUrl,
  buildChatWsUrl,
  getAuthenticatedMediaUrl,
}
