import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getOrCreateConversation,
  listMessages,
  sendMessage,
  markAsRead,
  getTotalUnread,
} from './chat'

describe('chatApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('getOrCreateConversation calls GET /chat/conversation', async () => {
    const mockData = {
      id: 'c1',
      userId: 'u1',
      customerUnreadCount: 0,
      adminUnreadCount: 0,
    }
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: mockData,
        error: null,
        meta: { timestamp: new Date().toISOString() },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const res = await getOrCreateConversation()
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/chat/conversation'),
      expect.objectContaining({
        method: 'GET',
      })
    )
    expect(res.id).toBe('c1')
  })

  it('listMessages returns messages and hasMore metadata', async () => {
    const mockMessages = [
      { id: 'm1', content: 'Tin 1', messageType: 'text' },
      { id: 'm2', content: 'Tin 2', messageType: 'order', orderId: 'ord-1' },
    ]
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: mockMessages,
        error: null,
        meta: { timestamp: new Date().toISOString(), hasMore: true, count: 2 },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const res = await listMessages('c1', 20, '2026-09-01T00:00:00Z')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/chat/conversations/c1/messages?limit=20&before=2026-09-01T00%3A00%3A00Z'),
      expect.objectContaining({ method: 'GET' })
    )
    expect(res.messages).toHaveLength(2)
    expect(res.hasMore).toBe(true)
  })

  it('sendMessage sends orderId in json payload when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        success: true,
        data: { id: 'm1', content: 'Hỏi đơn hàng', messageType: 'order', orderId: 'ord-123' },
        error: null,
        meta: { timestamp: new Date().toISOString() },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const res = await sendMessage('c1', 'Hỏi đơn hàng', undefined, 'ord-123')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/chat/conversations/c1/messages'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ content: 'Hỏi đơn hàng', orderId: 'ord-123' }),
      })
    )
    expect(res.messageType).toBe('order')
  })

  it('sendMessage sends FormData when files and orderId are provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        success: true,
        data: { id: 'm1', content: 'hello', messageType: 'media' },
        error: null,
        meta: { timestamp: new Date().toISOString() },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const file = new File(['dummy'], 'photo.jpg', { type: 'image/jpeg' })
    const res = await sendMessage('c1', 'hello', [file], 'ord-123')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/chat/conversations/c1/messages'),
      expect.objectContaining({
        method: 'POST',
        body: expect.any(FormData),
      })
    )
    expect(res.id).toBe('m1')
  })

  it('markAsRead sends POST /chat/conversations/:id/read', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { conversationId: 'c1', customerUnreadCount: 0 },
        error: null,
        meta: { timestamp: new Date().toISOString() },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await markAsRead('c1')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/chat/conversations/c1/read'),
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('getTotalUnread calls GET /chat/unread-count', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { totalUnread: 5 },
        error: null,
        meta: { timestamp: new Date().toISOString() },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const res = await getTotalUnread()
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/chat/unread-count'),
      expect.objectContaining({ method: 'GET' })
    )
    expect(res.totalUnread).toBe(5)
  })
})
