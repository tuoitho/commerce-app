import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AdminChatDetail } from './AdminChatDetail'
import type { AdminConversation, AdminChatMessage } from '@/api/chat'

describe('AdminChatDetail', () => {
  const mockConversation: AdminConversation = {
    id: 'conv-1',
    userId: 'user-1',
    customerEmail: 'customer@example.com',
    customerName: 'Nguyễn Văn A',
    customerLastActive: '2026-09-04T10:00:00Z',
    isOnline: true,
    lastMessageAt: '2026-09-04T10:05:00Z',
    lastMessageSnippet: 'Shop tư vấn giúp mình',
    unreadCount: 0,
    createdAt: '2026-09-04T09:00:00Z',
    updatedAt: '2026-09-04T10:05:00Z',
  }

  const mockMessages: AdminChatMessage[] = [
    {
      id: 'msg-1',
      conversationId: 'conv-1',
      senderId: 'user-1',
      senderRole: 'customer',
      senderName: 'Nguyễn Văn A',
      content: 'Chào shop, đơn hàng này bao giờ giao vậy?',
      attachedOrderId: 'ord-100',
      attachedOrder: {
        id: 'ord-100',
        status: 'confirmed',
        totalVnd: 15000000,
        createdAt: '2026-09-04T09:30:00Z',
        totalItemsCount: 1,
        itemsSummary: [
          {
            productName: 'iPad Air 5 64GB',
            quantity: 1,
            unitPriceVnd: 15000000,
            imageUrl: '',
          },
        ],
      },
      attachments: [],
      createdAt: '2026-09-04T10:00:00Z',
      isRead: true,
    },
    {
      id: 'msg-2',
      conversationId: 'conv-1',
      senderId: 'admin-1',
      senderRole: 'admin',
      senderName: 'Hỗ trợ viên',
      content: 'Dạ đơn hàng đang được chuẩn bị để bàn giao cho shipper ạ!',
      attachments: [
        {
          id: 'att-img-1',
          fileType: 'image',
          fileUrl: '/api/v1/chat/media/att-img-1',
          fileName: 'bill.jpg',
          fileSize: 1024,
          mimeType: 'image/jpeg',
        },
      ],
      createdAt: '2026-09-04T10:05:00Z',
      isRead: false,
    },
  ]

  beforeEach(() => {
    vi.restoreAllMocks()
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
  })

  it('renders conversation header with customer name and online presence', () => {
    render(
      <MemoryRouter>
        <AdminChatDetail
          conversation={mockConversation}
          messages={mockMessages}
          isLoadingMessages={false}
          isErrorMessages={false}
          onRetryMessages={vi.fn()}
          onSendMessage={vi.fn()}
          onMarkAsRead={vi.fn()}
        />
      </MemoryRouter>
    )

    expect(screen.getAllByText('Nguyễn Văn A').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('customer@example.com')).toBeInTheDocument()
    expect(screen.getByText('Đang trực tuyến')).toBeInTheDocument()
  })

  it('renders messages with bubbles, order card, and attachments', () => {
    render(
      <MemoryRouter>
        <AdminChatDetail
          conversation={mockConversation}
          messages={mockMessages}
          isLoadingMessages={false}
          isErrorMessages={false}
          onRetryMessages={vi.fn()}
          onSendMessage={vi.fn()}
          onMarkAsRead={vi.fn()}
        />
      </MemoryRouter>
    )

    // Customer message
    expect(screen.getByText('Chào shop, đơn hàng này bao giờ giao vậy?')).toBeInTheDocument()
    // Order card
    expect(screen.getByTestId('order-card-ord-100')).toBeInTheDocument()
    expect(screen.getByText('iPad Air 5 64GB')).toBeInTheDocument()

    // Admin reply
    expect(screen.getByText('Dạ đơn hàng đang được chuẩn bị để bàn giao cho shipper ạ!')).toBeInTheDocument()
    expect(screen.getByText('Đã gửi')).toBeInTheDocument()

    // Attachment
    expect(screen.getByTestId('attachment-image-att-img-1')).toBeInTheDocument()
  })

  it('opens lightbox when clicking image attachment', () => {
    render(
      <MemoryRouter>
        <AdminChatDetail
          conversation={mockConversation}
          messages={mockMessages}
          isLoadingMessages={false}
          isErrorMessages={false}
          onRetryMessages={vi.fn()}
          onSendMessage={vi.fn()}
          onMarkAsRead={vi.fn()}
        />
      </MemoryRouter>
    )

    const imgBtn = screen.getByTestId('attachment-image-att-img-1')
    fireEvent.click(imgBtn)

    expect(screen.getByTestId('image-lightbox-modal')).toBeInTheDocument()
  })

  it('renders loading state when isLoadingMessages is true', () => {
    render(
      <MemoryRouter>
        <AdminChatDetail
          conversation={mockConversation}
          messages={[]}
          isLoadingMessages={true}
          isErrorMessages={false}
          onRetryMessages={vi.fn()}
          onSendMessage={vi.fn()}
          onMarkAsRead={vi.fn()}
        />
      </MemoryRouter>
    )

    expect(screen.getByTestId('admin-messages-loading')).toBeInTheDocument()
  })

  it('renders error state and triggers onRetryMessages', () => {
    const onRetry = vi.fn()
    render(
      <MemoryRouter>
        <AdminChatDetail
          conversation={mockConversation}
          messages={[]}
          isLoadingMessages={false}
          isErrorMessages={true}
          errorMessage="Lỗi mạng"
          onRetryMessages={onRetry}
          onSendMessage={vi.fn()}
          onMarkAsRead={vi.fn()}
        />
      </MemoryRouter>
    )

    expect(screen.getByTestId('admin-messages-error')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Thử lại'))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('deduplicates messages with duplicate IDs safely without repeating elements', () => {
    const duplicateMessages = [
      mockMessages[0],
      { ...mockMessages[0] }, // exact duplicate ID
      mockMessages[1],
    ]

    render(
      <MemoryRouter>
        <AdminChatDetail
          conversation={mockConversation}
          messages={duplicateMessages}
          isLoadingMessages={false}
          isErrorMessages={false}
          onRetryMessages={vi.fn()}
          onSendMessage={vi.fn()}
          onMarkAsRead={vi.fn()}
        />
      </MemoryRouter>
    )

    // Should only render 1 instance of msg-1
    const renderedMsg1 = screen.getAllByTestId('admin-chat-message-msg-1')
    expect(renderedMsg1.length).toBe(1)
  })
})
