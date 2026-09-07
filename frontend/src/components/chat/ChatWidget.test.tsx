import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ChatWidget } from './ChatWidget'
import { useChat } from '@/context/ChatContext'
import { useAuth } from '@/context/AuthContext'
import { listOrders } from '@/api/orders'

vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/context/ChatContext', () => ({
  useChat: vi.fn(),
}))

vi.mock('@/api/orders', () => ({
  listOrders: vi.fn(),
}))

describe('ChatWidget Component (FE-04)', () => {
  const mockOpenChat = vi.fn()
  const mockCloseChat = vi.fn()
  const mockSendChatMessage = vi.fn()
  const mockSelectConversation = vi.fn()
  const mockLoadOlderMessages = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'u1', email: 'test@example.com', role: 'customer' },
      accessToken: 'token',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })

    vi.mocked(listOrders).mockResolvedValue([
      {
        id: 'o1-12345678',
        userId: 'u1',
        status: 'confirmed',
        totalVnd: 250000,
        recipientName: 'Nguyen Van A',
        recipientPhone: '0901234567',
        shippingAddress: '123 Le Loi',
        paymentMethod: 'cod',
        paymentStatus: 'pending',
        createdAt: '2026-09-03T20:00:00Z',
        updatedAt: '2026-09-03T20:00:00Z',
        items: [
          {
            id: 'item-1',
            orderId: 'o1-12345678',
            productId: 'p1',
            productName: 'iPhone 15 Pro Max',
            quantity: 1,
            unitPriceVnd: 250000,
            totalPriceVnd: 250000,
            productSlug: 'iphone-15',
            productImage: '',
          },
        ],
      },
    ] as any)
  })

  it('renders floating chat bubble with badge when closed (AC-CHAT-05-01)', () => {
    vi.mocked(useChat).mockReturnValue({
      isOpen: false,
      setIsOpen: vi.fn(),
      activeConversation: null,
      conversations: [],
      messages: [],
      hasMore: false,
      isLoadingOlder: false,
      totalUnread: 3,
      isLoading: false,
      isSending: false,
      openChat: mockOpenChat,
      selectConversation: mockSelectConversation,
      closeChat: mockCloseChat,
      sendChatMessage: mockSendChatMessage,
      loadOlderMessages: mockLoadOlderMessages,
      refreshConversations: vi.fn(),
    })

    render(
      <MemoryRouter>
        <ChatWidget />
      </MemoryRouter>
    )

    const bubble = screen.getByLabelText('Mở hộp thoại hỗ trợ trực tuyến')
    expect(bubble).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()

    fireEvent.click(bubble)
    expect(mockOpenChat).toHaveBeenCalled()
  })

  it('renders chat dialog when isOpen is true with admin presence and messages (AC-CHAT-05-02, AC-CHAT-06-03)', () => {
    vi.mocked(useChat).mockReturnValue({
      isOpen: true,
      setIsOpen: vi.fn(),
      activeConversation: {
        id: 'c1',
        userId: 'u1',
        customerUnreadCount: 0,
        adminUnreadCount: 0,
        customerPresence: { status: 'online', displayText: 'Đang hoạt động', lastActiveAt: '' },
        adminPresence: { status: 'online', displayText: 'Đang trực tuyến', lastActiveAt: '' },
        lastMessageAt: '',
        createdAt: '',
        updatedAt: '',
      },
      conversations: [],
      messages: [
        {
          id: 'm1',
          conversationId: 'c1',
          senderId: 'u1',
          senderRole: 'customer',
          messageType: 'order',
          orderId: 'o1-12345678',
          orderSummary: {
            id: 'o1-12345678',
            status: 'confirmed',
            totalVnd: 250000,
            recipientName: 'Nguyen Van A',
            createdAt: '2026-09-03T20:00:00Z',
            firstItemName: 'iPhone 15 Pro Max',
            itemCount: 1,
          },
          content: 'Tôi muốn hỏi về đơn hàng này',
          media: [],
          createdAt: '2026-09-03T20:00:00Z',
        },
        {
          id: 'm2',
          conversationId: 'c1',
          senderId: 'admin1',
          senderRole: 'admin',
          messageType: 'text',
          content: 'Dạ đơn của bạn đang được đóng gói, ngày mai sẽ giao ạ!',
          media: [],
          createdAt: '2026-09-03T20:05:00Z',
        },
      ],
      hasMore: false,
      isLoadingOlder: false,
      totalUnread: 0,
      isLoading: false,
      isSending: false,
      openChat: mockOpenChat,
      selectConversation: mockSelectConversation,
      closeChat: mockCloseChat,
      sendChatMessage: mockSendChatMessage,
      loadOlderMessages: mockLoadOlderMessages,
      refreshConversations: vi.fn(),
    })

    render(
      <MemoryRouter>
        <ChatWidget />
      </MemoryRouter>
    )

    // Header and presence
    expect(screen.getByText('Hỗ trợ khách hàng')).toBeInTheDocument()
    expect(screen.getByText('Đang trực tuyến')).toBeInTheDocument()
    expect(screen.getByTestId('admin-presence-indicator')).toHaveClass('bg-emerald-400')

    // Order summary card inside message timeline
    expect(screen.getByText(/Đơn hàng #o1-1234/)).toBeInTheDocument()
    expect(screen.getByText('Đã xác nhận')).toBeInTheDocument()
    expect(screen.getByText('iPhone 15 Pro Max')).toBeInTheDocument()

    // Message thread
    expect(screen.getByText('Tôi muốn hỏi về đơn hàng này')).toBeInTheDocument()
    expect(screen.getByText('Dạ đơn của bạn đang được đóng gói, ngày mai sẽ giao ạ!')).toBeInTheDocument()

    // Send text message
    const input = screen.getByPlaceholderText('Nhập tin nhắn... (hoặc dán Ctrl+V ảnh)')
    expect(input).toBeInTheDocument()

    fireEvent.change(input, { target: { value: 'Cảm ơn shop nhiều!' } })
    const sendButton = screen.getByLabelText('Gửi tin nhắn')
    fireEvent.click(sendButton)

    expect(mockSendChatMessage).toHaveBeenCalledWith('Cảm ơn shop nhiều!', [])
  })

  it('allows attaching order via OrderSelectorModal inside chat input (AC-CHAT-01-01)', async () => {
    vi.mocked(useChat).mockReturnValue({
      isOpen: true,
      setIsOpen: vi.fn(),
      activeConversation: {
        id: 'c1',
        userId: 'u1',
        customerUnreadCount: 0,
        adminUnreadCount: 0,
        customerPresence: { status: 'online', displayText: 'Đang hoạt động', lastActiveAt: '' },
        adminPresence: { status: 'online', displayText: 'Đang trực tuyến', lastActiveAt: '' },
        lastMessageAt: '',
        createdAt: '',
        updatedAt: '',
      },
      conversations: [],
      messages: [],
      hasMore: false,
      isLoadingOlder: false,
      totalUnread: 0,
      isLoading: false,
      isSending: false,
      openChat: mockOpenChat,
      selectConversation: mockSelectConversation,
      closeChat: mockCloseChat,
      sendChatMessage: mockSendChatMessage,
      loadOlderMessages: mockLoadOlderMessages,
      refreshConversations: vi.fn(),
    })

    render(
      <MemoryRouter>
        <ChatWidget />
      </MemoryRouter>
    )

    const attachOrderBtn = screen.getByLabelText('Đính kèm đơn hàng')
    fireEvent.click(attachOrderBtn)

    await waitFor(() => {
      expect(screen.getByTestId('order-selector-modal')).toBeInTheDocument()
      expect(screen.getByText(/#o1-1234/)).toBeInTheDocument()
    })

    const selectOrderBtn = screen.getByTestId('select-order-o1-12345678')
    fireEvent.click(selectOrderBtn)

    expect(mockSendChatMessage).toHaveBeenCalledWith('Tôi muốn hỏi về đơn hàng này', undefined, 'o1-12345678')
  })
})
