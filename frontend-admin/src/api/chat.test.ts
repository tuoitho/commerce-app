import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as clientModule from './client'
import {
  listAdminConversations,
  getAdminConversationMessages,
  sendAdminMessage,
  markAdminConversationRead,
  uploadAdminMedia,
  getAuthenticatedAdminMediaUrl,
  getAdminChatWebSocketUrl,
} from './chat'

describe('frontend-admin chat API', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('listAdminConversations calls /admin/chat/conversations with query parameters', async () => {
    const mockData = [
      {
        id: 'conv-1',
        userId: 'u-1',
        customerEmail: 'cust@example.com',
        customerName: 'Khách hàng 1',
        isOnline: true,
        lastMessageAt: '2026-09-04T10:00:00Z',
        lastMessageSnippet: 'Xin chào shop',
        unreadCount: 2,
        createdAt: '2026-09-04T09:00:00Z',
        updatedAt: '2026-09-04T10:00:00Z',
      },
    ]

    const apiClientSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockData)

    const result = await listAdminConversations({ filter: 'unread', search: 'cust', limit: 20, offset: 0 })
    expect(result).toEqual(mockData)
    expect(apiClientSpy).toHaveBeenCalledWith(
      '/admin/chat/conversations?filter=unread&search=cust&limit=20&offset=0'
    )
  })

  it('getAdminConversationMessages calls messages endpoint', async () => {
    const mockMessages = [
      {
        id: 'msg-1',
        conversationId: 'conv-1',
        senderId: 'u-1',
        senderRole: 'customer' as const,
        senderName: 'Khách hàng',
        content: 'Hỏi về đơn hàng',
        attachments: [],
        createdAt: '2026-09-04T10:00:00Z',
        isRead: false,
      },
    ]
    const apiClientSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockMessages)

    const result = await getAdminConversationMessages('conv-1', 50, 0)
    expect(result).toEqual(mockMessages)
    expect(apiClientSpy).toHaveBeenCalledWith(
      '/admin/chat/conversations/conv-1/messages?limit=50&offset=0'
    )
  })

  it('sendAdminMessage posts reply', async () => {
    const mockMsg = {
      id: 'msg-reply-1',
      conversationId: 'conv-1',
      senderId: 'admin-1',
      senderRole: 'admin' as const,
      senderName: 'Hỗ trợ viên',
      content: 'Chào bạn, đơn hàng đang được xử lý',
      attachments: [],
      createdAt: '2026-09-04T10:05:00Z',
      isRead: true,
    }
    const apiClientSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockMsg)

    const result = await sendAdminMessage('conv-1', {
      content: 'Chào bạn, đơn hàng đang được xử lý',
      attachmentIds: ['att-1'],
    })
    expect(result).toEqual(mockMsg)
    expect(apiClientSpy).toHaveBeenCalledWith(
      '/admin/chat/conversations/conv-1/messages',
      {
        method: 'POST',
        body: {
          content: 'Chào bạn, đơn hàng đang được xử lý',
          attachmentIds: ['att-1'],
        },
      }
    )
  })

  it('markAdminConversationRead sends read request', async () => {
    const apiClientSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue({ read: true })
    const result = await markAdminConversationRead('conv-1')
    expect(result).toEqual({ read: true })
    expect(apiClientSpy).toHaveBeenCalledWith(
      '/admin/chat/conversations/conv-1/read',
      {
        method: 'POST',
      }
    )
  })

  it('uploadAdminMedia posts FormData', async () => {
    const mockAtt = {
      id: 'att-1',
      fileType: 'image' as const,
      fileUrl: '/api/v1/chat/media/att-1',
      fileName: 'photo.jpg',
      fileSize: 1024,
      mimeType: 'image/jpeg',
    }
    const apiClientSpy = vi.spyOn(clientModule, 'apiClient').mockResolvedValue(mockAtt)
    const file = new File(['dummy'], 'photo.jpg', { type: 'image/jpeg' })

    const result = await uploadAdminMedia(file)
    expect(result).toEqual(mockAtt)
    expect(apiClientSpy).toHaveBeenCalledWith(
      '/chat/media',
      expect.objectContaining({
        method: 'POST',
      })
    )
  })

  it('getAuthenticatedAdminMediaUrl appends token param', () => {
    const url = getAuthenticatedAdminMediaUrl('/api/v1/chat/media/att-1', 'test-token')
    expect(url).toBe('/api/v1/chat/media/att-1?token=test-token')
  })

  it('getAdminChatWebSocketUrl builds websocket endpoint', () => {
    const wsUrl = getAdminChatWebSocketUrl('test-token')
    expect(wsUrl).toContain('/chat/ws?token=test-token')
  })
})
