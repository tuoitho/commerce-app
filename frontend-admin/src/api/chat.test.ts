import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  listAdminConversations,
  getAdminConversation,
  listAdminMessages,
  adminSendMessage,
  adminMarkAsRead,
} from './chat'

describe('adminChatApi (ADM-01)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('listAdminConversations calls /admin/chat/conversations with filters and pagination', async () => {
    const mockData = [
      {
        id: 'c1',
        userId: 'u1',
        customerName: 'Nguyễn Văn A',
        customerEmail: 'a@example.com',
        adminUnreadCount: 2,
        lastMessageAt: '2026-09-07T10:00:00Z',
      },
    ]
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: mockData,
        error: null,
        meta: {
          timestamp: new Date().toISOString(),
          pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const res = await listAdminConversations({ unreadOnly: true, page: 1, pageSize: 20 })
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/admin/chat/conversations?page=1&pageSize=20&unreadOnly=true'),
      expect.objectContaining({ method: 'GET' })
    )
    expect(res.data).toHaveLength(1)
    expect(res.data[0].customerName).toBe('Nguyễn Văn A')
  })

  it('getAdminConversation calls GET /admin/chat/conversations/:id', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { id: 'c1', userId: 'u1', customerName: 'Nguyễn Văn A' },
        error: null,
        meta: { timestamp: new Date().toISOString() },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const res = await getAdminConversation('c1')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/admin/chat/conversations/c1'),
      expect.objectContaining({ method: 'GET' })
    )
    expect(res.id).toBe('c1')
  })

  it('listAdminMessages queries messages with limit, before cursor, and returns hasMore', async () => {
    const mockMessages = [
      {
        id: 'm1',
        conversationId: 'c1',
        senderId: 'u1',
        senderRole: 'customer',
        messageType: 'text',
        content: 'Xin chào',
        createdAt: '2026-09-07T10:00:00Z',
      },
    ]
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: mockMessages,
        error: null,
        meta: {
          timestamp: new Date().toISOString(),
          hasMore: true,
          count: 1,
        },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const res = await listAdminMessages('c1', 20, '2026-09-07T10:05:00Z')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/admin/chat/conversations/c1/messages?limit=20&before=2026-09-07T10%3A05%3A00Z'),
      expect.objectContaining({ method: 'GET' })
    )
    expect(res.messages).toHaveLength(1)
    expect(res.hasMore).toBe(true)
  })

  it('adminSendMessage sends json with optional orderId', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        success: true,
        data: {
          id: 'm1',
          content: 'Phản hồi đơn hàng',
          messageType: 'order',
          orderId: 'ord-123',
        },
        error: null,
        meta: { timestamp: new Date().toISOString() },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const res = await adminSendMessage('c1', 'Phản hồi đơn hàng', undefined, 'ord-123')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/admin/chat/conversations/c1/messages'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ content: 'Phản hồi đơn hàng', orderId: 'ord-123' }),
      })
    )
    expect(res.orderId).toBe('ord-123')
  })

  it('adminSendMessage sends FormData when files and orderId are attached', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        success: true,
        data: { id: 'm1', content: 'Dạ shop gửi ảnh đơn', messageType: 'media' },
        error: null,
        meta: { timestamp: new Date().toISOString() },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const file = new File(['dummy'], 'photo.png', { type: 'image/png' })
    const res = await adminSendMessage('c1', 'Dạ shop gửi ảnh đơn', [file], 'ord-456')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/admin/chat/conversations/c1/messages'),
      expect.objectContaining({
        method: 'POST',
        body: expect.any(FormData),
      })
    )
    expect(res.id).toBe('m1')
  })

  it('adminMarkAsRead sends POST /admin/chat/conversations/:id/read', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { conversationId: 'c1', adminUnreadCount: 0 },
        error: null,
        meta: { timestamp: new Date().toISOString() },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await adminMarkAsRead('c1')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/admin/chat/conversations/c1/read'),
      expect.objectContaining({ method: 'POST' })
    )
  })
})
