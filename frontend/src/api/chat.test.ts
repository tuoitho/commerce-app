import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  chatApi,
  getConversation,
  getMessages,
  sendMessage,
  markConversationRead,
  getCustomerOrders,
  uploadMedia,
  getChatWebSocketUrl,
  type Conversation,
  type ChatMessage,
  type AttachedOrderCard,
  type ChatAttachment,
} from './chat'

describe('chatApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const mockConversation: Conversation = {
    id: 'conv-123',
    userId: 'user-1',
    customerEmail: 'customer@example.com',
    customerName: 'Nguyen Van A',
    customerLastActive: '2026-09-04T10:00:00.000Z',
    isOnline: true,
    lastMessageAt: '2026-09-04T10:05:00.000Z',
    lastMessageSnippet: 'Xin chào',
    unreadCount: 2,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-04T10:05:00.000Z',
  }

  const mockMessage: ChatMessage = {
    id: 'msg-1',
    conversationId: 'conv-123',
    senderId: 'user-1',
    senderRole: 'customer',
    senderName: 'Nguyen Van A',
    content: 'Em muốn hỏi về đơn hàng',
    attachedOrderId: null,
    attachedOrder: null,
    attachments: [],
    createdAt: '2026-09-04T10:05:00.000Z',
    isRead: false,
  }

  const mockOrderCard: AttachedOrderCard = {
    id: 'ord-123',
    status: 'pending_confirmation',
    totalVnd: 500000,
    createdAt: '2026-09-03T12:00:00.000Z',
    itemsSummary: [
      {
        productName: 'Áo thun nam',
        quantity: 2,
        unitPriceVnd: 250000,
        imageUrl: 'https://example.com/item.jpg',
      },
    ],
    totalItemsCount: 2,
  }

  const mockAttachment: ChatAttachment = {
    id: 'att-123',
    fileType: 'image',
    fileUrl: '/api/v1/chat/media/att-123',
    fileName: 'photo.png',
    fileSize: 10240,
    mimeType: 'image/png',
  }

  it('getConversation calls GET /chat/conversation', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: mockConversation,
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await getConversation()
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/chat/conversation'),
      expect.anything()
    )
    expect(result).toEqual(mockConversation)
  })

  it('getMessages calls GET /chat/messages with pagination query params', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: [mockMessage],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await getMessages(20, 40)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/chat/messages?limit=20&offset=40'),
      expect.anything()
    )
    expect(result).toEqual([mockMessage])
  })

  it('sendMessage calls POST /chat/messages with payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        success: true,
        data: mockMessage,
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const payload = {
      content: 'Cần hỗ trợ gấp',
      attachedOrderId: 'ord-123',
      attachmentIds: ['att-1'],
    }

    const result = await sendMessage(payload)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/chat/messages'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(payload),
      })
    )
    expect(result).toEqual(mockMessage)
  })

  it('markConversationRead calls POST /chat/read', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { read: true },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await markConversationRead()
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/chat/read'),
      expect.objectContaining({
        method: 'POST',
      })
    )
    expect(result).toEqual({ read: true })
  })

  it('getCustomerOrders calls GET /chat/orders with limit', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: [mockOrderCard],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await getCustomerOrders(5)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/chat/orders?limit=5'),
      expect.anything()
    )
    expect(result).toEqual([mockOrderCard])
  })

  it('uploadMedia calls POST /chat/media with FormData', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        success: true,
        data: mockAttachment,
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const file = new File(['dummy-content'], 'test.png', { type: 'image/png' })
    const result = await uploadMedia(file)

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/chat/media'),
      expect.objectContaining({
        method: 'POST',
        body: expect.any(FormData),
      })
    )
    expect(result).toEqual(mockAttachment)
  })

  it('getChatWebSocketUrl constructs valid ws url with query token and handles trailing slashes', () => {
    const url = getChatWebSocketUrl('fake-token-123')
    expect(url).toContain('/chat/ws?token=fake-token-123')
    expect(url).not.toContain('//chat/ws')
    expect(chatApi.buildChatWsUrl).toBe(getChatWebSocketUrl)
  })

  it('exports chatApi object with all functions', () => {
    expect(chatApi.getConversation).toBe(getConversation)
    expect(chatApi.getMessages).toBe(getMessages)
    expect(chatApi.sendMessage).toBe(sendMessage)
    expect(chatApi.markConversationRead).toBe(markConversationRead)
    expect(chatApi.getCustomerOrders).toBe(getCustomerOrders)
    expect(chatApi.uploadMedia).toBe(uploadMedia)
    expect(chatApi.getChatWebSocketUrl).toBe(getChatWebSocketUrl)
    expect(chatApi.buildChatWsUrl).toBe(getChatWebSocketUrl)
  })
})
