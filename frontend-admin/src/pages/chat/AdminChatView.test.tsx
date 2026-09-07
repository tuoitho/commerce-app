import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AdminChatView } from './AdminChatView'
import type { ChatConversation, ChatMessage } from '@/api/chat'

describe('AdminChatView Component (ADM-03)', () => {
  const mockConversation: ChatConversation = {
    id: 'c1',
    userId: 'u1',
    customerName: 'Nguyễn Văn A',
    customerEmail: 'a@example.com',
    adminUnreadCount: 0,
    lastMessageAt: '2026-09-07T10:00:00Z',
    customerPresence: {
      status: 'online',
      displayText: 'Đang hoạt động',
      lastActiveAt: '2026-09-07T10:00:00Z',
    },
  }

  const mockMessages: ChatMessage[] = [
    {
      id: 'm1',
      conversationId: 'c1',
      senderId: 'u1',
      senderRole: 'customer',
      messageType: 'order',
      orderId: 'ord-12345678',
      orderSummary: {
        id: 'ord-12345678',
        status: 'confirmed',
        totalVnd: 500000,
        recipientName: 'Nguyễn Văn A',
        createdAt: '2026-09-07T09:00:00Z',
        itemCount: 2,
        firstItemName: 'Bàn phím cơ',
      },
      content: 'Shop cho mình hỏi về đơn hàng này',
      media: [],
      createdAt: '2026-09-07T09:30:00Z',
    },
    {
      id: 'm2',
      conversationId: 'c1',
      senderId: 'admin1',
      senderRole: 'admin',
      messageType: 'text',
      content: 'Dạ shop chào bạn, shop có thể hỗ trợ gì ạ?',
      media: [],
      createdAt: '2026-09-07T09:35:00Z',
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders messages and OrderMessageCard with admin order link (AC-CHAT-04-02, AC-CHAT-04-03)', () => {
    render(
      <MemoryRouter>
        <AdminChatView
          conversation={mockConversation}
          messages={mockMessages}
          onSendMessage={vi.fn()}
        />
      </MemoryRouter>
    )

    expect(screen.getByRole('heading', { name: 'Nguyễn Văn A' })).toBeInTheDocument()
    expect(screen.getByText('Đang hoạt động')).toBeInTheDocument()

    // OrderMessageCard inside timeline
    expect(screen.getByText('Đơn hàng #ord-1234')).toBeInTheDocument()
    expect(screen.getByText('Đã xác nhận')).toBeInTheDocument()
    expect(screen.getByText('Bàn phím cơ (+1 sản phẩm khác)')).toBeInTheDocument()

    // Link to /admin/orders/ord-12345678
    const orderLink = screen.getByRole('link', { name: /Xem chi tiết/i })
    expect(orderLink).toHaveAttribute('href', '/admin/orders/ord-12345678')

    // Message contents
    expect(screen.getByText('Shop cho mình hỏi về đơn hàng này')).toBeInTheDocument()
    expect(screen.getByText('Dạ shop chào bạn, shop có thể hỗ trợ gì ạ?')).toBeInTheDocument()
  })

  it('triggers onLoadOlder when scrolled near top with hasMore true (AC-CHAT-03-01, AC-CHAT-03-02)', () => {
    const onLoadOlder = vi.fn()
    render(
      <MemoryRouter>
        <AdminChatView
          conversation={mockConversation}
          messages={mockMessages}
          hasMore={true}
          onLoadOlder={onLoadOlder}
          onSendMessage={vi.fn()}
        />
      </MemoryRouter>
    )

    const container = screen.getByTestId('admin-messages-container')
    Object.defineProperty(container, 'scrollTop', { value: 10, writable: true })
    Object.defineProperty(container, 'scrollHeight', { value: 600, writable: true })
    Object.defineProperty(container, 'clientHeight', { value: 300, writable: true })

    fireEvent.scroll(container)
    expect(onLoadOlder).toHaveBeenCalledTimes(1)
  })

  it('shows floating "Có X tin mới" button when scrolled up and new message arrives (AC-CHAT-03-03)', () => {
    const { rerender } = render(
      <MemoryRouter>
        <AdminChatView
          conversation={mockConversation}
          messages={mockMessages}
          onSendMessage={vi.fn()}
        />
      </MemoryRouter>
    )

    const container = screen.getByTestId('admin-messages-container')
    // Scrolled up: distance = 1000 - 200 - 300 = 500 > 100px
    Object.defineProperty(container, 'scrollHeight', { value: 1000, writable: true })
    Object.defineProperty(container, 'clientHeight', { value: 300, writable: true })
    Object.defineProperty(container, 'scrollTop', { value: 200, writable: true })
    fireEvent.scroll(container)

    const newMessages: ChatMessage[] = [
      ...mockMessages,
      {
        id: 'm3',
        conversationId: 'c1',
        senderId: 'u1',
        senderRole: 'customer',
        messageType: 'text',
        content: 'Khách nhắn thêm khi admin đang cuộn xem lịch sử',
        media: [],
        createdAt: '2026-09-07T09:40:00Z',
      },
    ]

    rerender(
      <MemoryRouter>
        <AdminChatView
          conversation={mockConversation}
          messages={newMessages}
          onSendMessage={vi.fn()}
        />
      </MemoryRouter>
    )

    const jumpButton = screen.getByTestId('admin-jump-to-bottom-button')
    expect(jumpButton).toBeInTheDocument()
    expect(jumpButton).toHaveTextContent('Có 1 tin mới')
  })

  it('smoothly scrolls to bottom and hides indicator when clicking jump button (AC-CHAT-03-04)', () => {
    const { rerender } = render(
      <MemoryRouter>
        <AdminChatView
          conversation={mockConversation}
          messages={mockMessages}
          onSendMessage={vi.fn()}
        />
      </MemoryRouter>
    )

    const container = screen.getByTestId('admin-messages-container')
    container.scrollTo = vi.fn()

    // Scrolled up
    Object.defineProperty(container, 'scrollHeight', { value: 1000, writable: true })
    Object.defineProperty(container, 'clientHeight', { value: 300, writable: true })
    Object.defineProperty(container, 'scrollTop', { value: 200, writable: true })
    fireEvent.scroll(container)

    const newMessages: ChatMessage[] = [
      ...mockMessages,
      {
        id: 'm3',
        conversationId: 'c1',
        senderId: 'u1',
        senderRole: 'customer',
        messageType: 'text',
        content: 'Tin nhắn mới',
        media: [],
        createdAt: '2026-09-07T09:40:00Z',
      },
    ]

    rerender(
      <MemoryRouter>
        <AdminChatView
          conversation={mockConversation}
          messages={newMessages}
          onSendMessage={vi.fn()}
        />
      </MemoryRouter>
    )

    const jumpButton = screen.getByTestId('admin-jump-to-bottom-button')
    expect(jumpButton).toBeInTheDocument()

    fireEvent.click(jumpButton)
    expect(screen.queryByTestId('admin-jump-to-bottom-button')).not.toBeInTheDocument()
  })

  it('admin types and sends message via form', () => {
    const onSendMessage = vi.fn()
    render(
      <MemoryRouter>
        <AdminChatView
          conversation={mockConversation}
          messages={mockMessages}
          onSendMessage={onSendMessage}
        />
      </MemoryRouter>
    )

    const textarea = screen.getByPlaceholderText('Nhập phản hồi của quản trị viên... (hoặc dán Ctrl+V ảnh)')
    fireEvent.change(textarea, { target: { value: 'Shop đã tiếp nhận đơn ạ' } })

    const sendBtn = screen.getByLabelText('Gửi phản hồi')
    fireEvent.click(sendBtn)

    expect(onSendMessage).toHaveBeenCalledWith('Shop đã tiếp nhận đơn ạ', [])
  })

  it('renders image and video media attachments properly with controls and metadata (AC-CHAT-02)', () => {
    const messagesWithMedia: ChatMessage[] = [
      {
        id: 'm-media',
        conversationId: 'c1',
        senderId: 'u1',
        senderRole: 'customer',
        messageType: 'media',
        content: 'Khách gửi ảnh và video',
        media: [
          {
            id: 'med-img',
            messageId: 'm-media',
            mediaType: 'image',
            fileName: 'photo.jpg',
            fileSize: 1024,
            contentType: 'image/jpeg',
            url: '/media/chat/med-img',
            createdAt: '2026-09-07T10:00:00Z',
          },
          {
            id: 'med-vid',
            messageId: 'm-media',
            mediaType: 'video',
            fileName: 'clip.mp4',
            fileSize: 1048576,
            contentType: 'video/mp4',
            url: '/media/chat/med-vid',
            createdAt: '2026-09-07T10:00:00Z',
          },
        ],
        createdAt: '2026-09-07T10:00:00Z',
      },
    ]

    const { container } = render(
      <MemoryRouter>
        <AdminChatView
          conversation={mockConversation}
          messages={messagesWithMedia}
          onSendMessage={vi.fn()}
        />
      </MemoryRouter>
    )

    const img = screen.getByRole('img', { name: 'photo.jpg' })
    expect(img).toHaveAttribute('src', '/media/chat/med-img')

    const video = container.querySelector('video')
    expect(video).toBeInTheDocument()
    expect(video).toHaveAttribute('src', '/media/chat/med-vid')
    expect(video).toHaveAttribute('controls')
    expect(video).toHaveAttribute('preload', 'metadata')
  })
})
