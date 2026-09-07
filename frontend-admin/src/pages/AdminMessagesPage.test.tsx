import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminMessagesPage } from './AdminMessagesPage'
import * as chatApi from '@/api/chat'

vi.mock('@/api/chat', () => ({
  listAdminConversations: vi.fn(),
  getAdminConversation: vi.fn(),
  listAdminMessages: vi.fn(),
  adminSendMessage: vi.fn(),
  adminMarkAsRead: vi.fn(),
}))

vi.mock('@/hooks/useAdminChatSocket', () => ({
  useAdminChatSocket: () => ({
    isConnected: true,
    joinConversation: vi.fn(),
    sendMessage: vi.fn(),
    markRead: vi.fn(),
    reconnect: vi.fn(),
  }),
}))

describe('AdminMessagesPage', () => {
  const mockConversation: chatApi.ChatConversation = {
    id: 'c1-12345678',
    userId: 'u1-98765432',
    customerName: 'Trần Thị B',
    customerEmail: 'b@example.com',
    adminUnreadCount: 1,
    customerPresence: { status: 'online', displayText: 'Đang hoạt động', lastActiveAt: '' },
    adminPresence: { status: 'online', displayText: 'Đang hoạt động', lastActiveAt: '' },
    lastMessageAt: '2026-09-03T20:00:00Z',
    createdAt: '2026-09-03T19:00:00Z',
    updatedAt: '2026-09-03T20:00:00Z',
  }

  const mockMessages: chatApi.ChatMessage[] = [
    {
      id: 'm1',
      conversationId: 'c1-12345678',
      senderId: 'u1-98765432',
      senderRole: 'customer',
      messageType: 'order',
      orderId: 'o1-11223344',
      orderSummary: {
        id: 'o1-11223344',
        status: 'confirmed',
        totalVnd: 1250000,
        recipientName: 'Trần Thị B',
        createdAt: '2026-09-03T18:00:00Z',
        firstItemName: 'Aura Phone Pro',
        itemCount: 1,
      },
      content: 'Shop ơi có giao hỏa tốc được không?',
      media: [],
      createdAt: '2026-09-03T20:00:00Z',
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(chatApi.listAdminConversations).mockResolvedValue({
      data: [mockConversation],
      meta: {
        timestamp: new Date().toISOString(),
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
      },
      message: '',
    })

    vi.mocked(chatApi.getAdminConversation).mockResolvedValue(mockConversation)
    vi.mocked(chatApi.listAdminMessages).mockResolvedValue({
      messages: mockMessages,
      hasMore: false,
    })
    vi.mocked(chatApi.adminMarkAsRead).mockResolvedValue()
  })

  it('renders conversations list, order message card, and message content', async () => {
    render(
      <MemoryRouter initialEntries={['/messages']}>
        <Routes>
          <Route path="/messages" element={<AdminMessagesPage />} />
        </Routes>
      </MemoryRouter>
    )

    // Left panel renders
    await waitFor(() => {
      expect(screen.getAllByText('Trần Thị B').length).toBeGreaterThanOrEqual(1)
      expect(chatApi.adminMarkAsRead).toHaveBeenCalledWith('c1-12345678')
    })

    // Selected conversation Order Context Card inside message timeline
    await waitFor(() => {
      expect(screen.getByText(/Đơn hàng #o1-1122/)).toBeInTheDocument()
      expect(screen.getByText('Đã xác nhận')).toBeInTheDocument()
      expect(screen.getByText('Aura Phone Pro')).toBeInTheDocument()
    })

    // Message thread renders
    expect(screen.getByText('Shop ơi có giao hỏa tốc được không?')).toBeInTheDocument()
  })

  it('admin types and sends reply message', async () => {
    vi.mocked(chatApi.adminSendMessage).mockResolvedValue({
      id: 'm2',
      conversationId: 'c1-12345678',
      senderId: 'admin-1',
      senderRole: 'admin',
      messageType: 'text',
      content: 'Dạ được bạn nhé, shop sẽ gửi ngay!',
      media: [],
      createdAt: '2026-09-03T20:02:00Z',
    })

    render(
      <MemoryRouter initialEntries={['/messages']}>
        <Routes>
          <Route path="/messages" element={<AdminMessagesPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText('Nhập phản hồi của quản trị viên... (hoặc dán Ctrl+V ảnh)')
      ).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('Nhập phản hồi của quản trị viên... (hoặc dán Ctrl+V ảnh)')
    fireEvent.change(input, { target: { value: 'Dạ được bạn nhé, shop sẽ gửi ngay!' } })

    const sendBtn = screen.getByRole('button', { name: /Gửi/i })
    fireEvent.click(sendBtn)

    await waitFor(() => {
      expect(chatApi.adminSendMessage).toHaveBeenCalledWith(
        'c1-12345678',
        'Dạ được bạn nhé, shop sẽ gửi ngay!',
        [],
        undefined
      )
    })
  })
})
