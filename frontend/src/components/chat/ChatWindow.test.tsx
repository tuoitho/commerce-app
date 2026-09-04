import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ChatWindow } from './ChatWindow'
import * as chatApiModule from '@/api/chat'
import type { ChatMessage, AttachedOrderCard } from '@/api/chat'

// Mock WebSocket class
class MockWebSocket {
  static instances: MockWebSocket[] = []
  static OPEN = 1
  static CLOSED = 3

  readyState = MockWebSocket.OPEN
  url: string
  onopen: (() => void) | null = null
  onclose: ((event: { code: number; reason: string }) => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: ((error: unknown) => void) | null = null
  sent: string[] = []

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
    setTimeout(() => {
      if (this.onopen && this.readyState === MockWebSocket.OPEN) {
        this.onopen()
      }
    }, 0)
  }

  send(data: string) {
    this.sent.push(data)
  }

  close(code = 1000, reason = '') {
    this.readyState = MockWebSocket.CLOSED
    if (this.onclose) {
      this.onclose({ code, reason })
    }
  }

  receive(data: object) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(data) })
    }
  }
}

describe('ChatWindow', () => {
  const mockOrderCard: AttachedOrderCard = {
    id: 'ord-1001',
    status: 'pending_confirmation',
    totalVnd: 500000,
    createdAt: '2026-09-04T08:00:00Z',
    itemsSummary: [
      {
        productName: 'Bàn phím cơ',
        quantity: 1,
        unitPriceVnd: 500000,
        imageUrl: 'https://example.com/keyboard.jpg',
      },
    ],
    totalItemsCount: 1,
  }

  const mockMessages: ChatMessage[] = [
    {
      id: 'msg-1',
      conversationId: 'conv-123',
      senderId: 'admin-1',
      senderRole: 'admin',
      senderName: 'Hỗ trợ viên',
      content: 'Chào bạn! Shop có thể hỗ trợ gì cho bạn ạ?',
      attachments: [],
      createdAt: '2026-09-04T09:00:00Z',
      isRead: true,
    },
    {
      id: 'msg-2',
      conversationId: 'conv-123',
      senderId: 'user-1',
      senderRole: 'customer',
      senderName: 'Khách hàng',
      content: 'Mình muốn hỏi về tiến độ giao đơn hàng này.',
      attachedOrderId: 'ord-1001',
      attachedOrder: mockOrderCard,
      attachments: [],
      createdAt: '2026-09-04T09:05:00Z',
      isRead: false,
    },
  ]

  beforeEach(() => {
    vi.restoreAllMocks()
    MockWebSocket.instances = []
    vi.stubGlobal('WebSocket', MockWebSocket)
    window.HTMLElement.prototype.scrollIntoView = vi.fn()

    vi.spyOn(chatApiModule, 'getMessages').mockResolvedValue(mockMessages)
    vi.spyOn(chatApiModule, 'getCustomerOrders').mockResolvedValue([mockOrderCard])
    vi.spyOn(chatApiModule, 'sendMessage').mockImplementation(async (payload) => ({
      id: 'msg-new',
      conversationId: 'conv-123',
      senderId: 'user-1',
      senderRole: 'customer',
      senderName: 'Khách hàng',
      content: payload.content,
      attachedOrderId: payload.attachedOrderId || null,
      attachedOrder: payload.attachedOrderId === 'ord-1001' ? mockOrderCard : null,
      attachments: [],
      createdAt: new Date().toISOString(),
      isRead: false,
    }))
    vi.spyOn(chatApiModule, 'markConversationRead').mockResolvedValue({ read: true })
  })

  afterEach(() => {
    MockWebSocket.instances = []
    vi.unstubAllGlobals()
  })

  it('renders root container with chat-window-container testid', async () => {
    render(
      <MemoryRouter>
        <ChatWindow />
      </MemoryRouter>
    )

    expect(screen.getByTestId('chat-window-container')).toBeInTheDocument()
    await waitFor(() => {
      expect(chatApiModule.getMessages).toHaveBeenCalled()
    })
  })

  it('loads and displays message history in chronological order', async () => {
    render(
      <MemoryRouter>
        <ChatWindow />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Chào bạn! Shop có thể hỗ trợ gì cho bạn ạ?')).toBeInTheDocument()
      expect(screen.getByText('Mình muốn hỏi về tiến độ giao đơn hàng này.')).toBeInTheDocument()
    })

    // Sender labels
    expect(screen.getByText('Hỗ trợ viên')).toBeInTheDocument()

    // Read receipt status for customer sent message
    expect(screen.getByText('Đã gửi')).toBeInTheDocument()
  })

  it('displays empty state message when conversation has no messages', async () => {
    vi.spyOn(chatApiModule, 'getMessages').mockResolvedValue([])

    render(
      <MemoryRouter>
        <ChatWindow />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/chưa có tin nhắn nào/i)).toBeInTheDocument()
      expect(screen.getByText(/hãy bắt đầu cuộc trò chuyện/i)).toBeInTheDocument()
    })
  })

  it('renders OrderCardMessage when message has attachedOrder', async () => {
    render(
      <MemoryRouter>
        <ChatWindow />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByTestId('order-card-ord-1001')).toBeInTheDocument()
      expect(screen.getByText(/Bàn phím cơ/i)).toBeInTheDocument()
    })
  })

  it('handles composer typing, character count, and disabled send button when empty', async () => {
    render(
      <MemoryRouter>
        <ChatWindow />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/nhập tin nhắn/i)).toBeInTheDocument()
    })

    const sendBtn = screen.getByTestId('send-message-btn')
    const textarea = screen.getByPlaceholderText(/nhập tin nhắn/i)

    // Initially empty -> send button disabled
    expect(sendBtn).toBeDisabled()
    expect(screen.getByText('0/2000')).toBeInTheDocument()

    // Type text
    fireEvent.change(textarea, { target: { value: 'Đơn hàng của tôi khi nào tới nơi?' } })
    expect(sendBtn).not.toBeDisabled()
    expect(screen.getByText('33/2000')).toBeInTheDocument()
  })

  it('opens OrderPickerModal, selects order, shows preview chip with remove button, and sends message with order', async () => {
    render(
      <MemoryRouter>
        <ChatWindow />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByTestId('attach-order-btn')).toBeInTheDocument()
    })

    // Click attach button to open modal
    fireEvent.click(screen.getByTestId('attach-order-btn'))

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /chọn đơn hàng/i })).toBeInTheDocument()
    })

    // Select order from modal
    const orderItemBtn = screen.getByTestId('order-item-ord-1001')
    fireEvent.click(orderItemBtn)

    // Modal closes and order preview chip appears above composer
    await waitFor(() => {
      const preview = screen.getByTestId('attached-order-preview')
      expect(preview).toBeInTheDocument()
      expect(within(preview).getByText(/ord-1001/i)).toBeInTheDocument()
    })

    // Even if text is empty, send button is enabled because an order is attached!
    const sendBtn = screen.getByTestId('send-message-btn')
    expect(sendBtn).not.toBeDisabled()

    // Send the message
    fireEvent.click(sendBtn)

    await waitFor(() => {
      expect(chatApiModule.sendMessage).toHaveBeenCalledWith({
        content: '',
        attachedOrderId: 'ord-1001',
      })
    })

    // Preview chip is cleared after send
    await waitFor(() => {
      expect(screen.queryByTestId('attached-order-preview')).not.toBeInTheDocument()
    })
  })

  it('removes attached order preview when clicking remove button', async () => {
    render(
      <MemoryRouter>
        <ChatWindow preAttachedOrder={mockOrderCard} />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByTestId('attached-order-preview')).toBeInTheDocument()
    })

    const removeBtn = screen.getByTestId('remove-attached-order-btn')
    fireEvent.click(removeBtn)

    expect(screen.queryByTestId('attached-order-preview')).not.toBeInTheDocument()
  })

  it('submits on Enter keypress (without Shift) and inserts newline on Shift+Enter', async () => {
    render(
      <MemoryRouter>
        <ChatWindow />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/nhập tin nhắn/i)).toBeInTheDocument()
    })

    const textarea = screen.getByPlaceholderText(/nhập tin nhắn/i)
    fireEvent.change(textarea, { target: { value: 'Tin nhắn gửi bằng phím Enter' } })

    // Press Shift+Enter -> does NOT submit
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })
    expect(chatApiModule.sendMessage).not.toHaveBeenCalled()

    // Press Enter -> submits
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

    await waitFor(() => {
      expect(chatApiModule.sendMessage).toHaveBeenCalledWith({
        content: 'Tin nhắn gửi bằng phím Enter',
        attachedOrderId: undefined,
      })
    })
  })

  it('handles realtime incoming messages via socket / callback', async () => {
    const { rerender } = render(
      <MemoryRouter>
        <ChatWindow />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Chào bạn! Shop có thể hỗ trợ gì cho bạn ạ?')).toBeInTheDocument()
    })

    const newAdminMsg: ChatMessage = {
      id: 'msg-realtime-1',
      conversationId: 'conv-123',
      senderId: 'admin-1',
      senderRole: 'admin',
      senderName: 'Hỗ trợ viên',
      content: 'Đơn hàng của bạn đã được bàn giao cho đơn vị vận chuyển rồi nhé!',
      attachments: [],
      createdAt: new Date().toISOString(),
      isRead: false,
    }

    // Pass new message via incomingMessage prop
    rerender(
      <MemoryRouter>
        <ChatWindow incomingMessage={newAdminMsg} />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(
        screen.getByText('Đơn hàng của bạn đã được bàn giao cho đơn vị vận chuyển rồi nhé!')
      ).toBeInTheDocument()
    })
  })

  it('updates customer read receipt to "Đã xem" when admin reads messages', async () => {
    const { rerender } = render(
      <MemoryRouter>
        <ChatWindow />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Đã gửi')).toBeInTheDocument()
    })

    // Simulate read event from admin
    rerender(
      <MemoryRouter>
        <ChatWindow
          messagesReadPayload={{
            conversationId: 'conv-123',
            readerRole: 'admin',
            readAt: new Date().toISOString(),
          }}
        />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Đã xem')).toBeInTheDocument()
    })
  })

  it('displays error banner when sendMessage fails', async () => {
    vi.spyOn(chatApiModule, 'sendMessage').mockRejectedValue(new Error('Network error'))

    render(
      <MemoryRouter>
        <ChatWindow />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/nhập tin nhắn/i)).toBeInTheDocument()
    })

    const textarea = screen.getByPlaceholderText(/nhập tin nhắn/i)
    fireEvent.change(textarea, { target: { value: 'Tin nhắn sẽ bị lỗi' } })

    const sendBtn = screen.getByTestId('send-message-btn')
    fireEvent.click(sendBtn)

    await waitFor(() => {
      expect(screen.getByText(/Không thể gửi tin nhắn/i)).toBeInTheDocument()
    })
  })

  it('disables send button when text exceeds 2000 characters', async () => {
    render(
      <MemoryRouter>
        <ChatWindow />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/nhập tin nhắn/i)).toBeInTheDocument()
    })

    const textarea = screen.getByPlaceholderText(/nhập tin nhắn/i)
    const longText = 'a'.repeat(2001)

    fireEvent.change(textarea, { target: { value: longText } })

    const sendBtn = screen.getByTestId('send-message-btn')
    expect(sendBtn).toBeDisabled()
    expect(screen.getByText('2001/2000')).toBeInTheDocument()
  })

  it('displays validation error message when ApiError has attachedOrderId field', async () => {
    const { ApiError } = await import('@/api/types')
    const validationErr = new ApiError(400, {
      code: 'validation_error',
      message: 'Validation failed',
      fields: {
        attachedOrderId: 'Đơn hàng không hợp lệ hoặc không thuộc tài khoản của bạn',
      },
    })
    vi.spyOn(chatApiModule, 'sendMessage').mockRejectedValue(validationErr)

    render(
      <MemoryRouter>
        <ChatWindow preAttachedOrder={mockOrderCard} />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByTestId('attached-order-preview')).toBeInTheDocument()
    })

    const sendBtn = screen.getByTestId('send-message-btn')
    fireEvent.click(sendBtn)

    await waitFor(() => {
      expect(
        screen.getByText('Đơn hàng không hợp lệ hoặc không thuộc tài khoản của bạn')
      ).toBeInTheDocument()
    })
  })

  it('renders order creation date in attached-order-preview chip', async () => {
    const { formatDateTime } = await import('@/lib/utils')
    render(
      <MemoryRouter>
        <ChatWindow preAttachedOrder={mockOrderCard} />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByTestId('attached-order-preview')).toBeInTheDocument()
    })

    const preview = screen.getByTestId('attached-order-preview')
    expect(within(preview).getByText(formatDateTime(mockOrderCard.createdAt))).toBeInTheDocument()
  })

  it('deduplicates messages when WebSocket push arrives before HTTP response', async () => {
    const newMsg: ChatMessage = {
      id: 'msg-concurrent-999',
      conversationId: 'conv-123',
      senderRole: 'customer',
      senderId: 'usr-1',
      senderName: 'Khách hàng',
      content: 'Tin nhắn gửi đồng thời',
      attachedOrderId: null,
      attachedOrder: null,
      attachments: [],
      isRead: false,
      createdAt: new Date().toISOString(),
    }

    let resolveSendMessage!: (msg: ChatMessage) => void
    const sendPromise = new Promise<ChatMessage>((resolve) => {
      resolveSendMessage = resolve
    })
    vi.spyOn(chatApiModule, 'sendMessage').mockReturnValue(sendPromise)

    const { rerender } = render(
      <MemoryRouter>
        <ChatWindow />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/nhập tin nhắn/i)).toBeInTheDocument()
    })

    const textarea = screen.getByPlaceholderText(/nhập tin nhắn/i)
    fireEvent.change(textarea, { target: { value: 'Tin nhắn gửi đồng thời' } })

    const sendBtn = screen.getByTestId('send-message-btn')
    fireEvent.click(sendBtn)

    // Simulate WebSocket event arriving FIRST while HTTP request is still in flight
    rerender(
      <MemoryRouter>
        <ChatWindow incomingMessage={newMsg} />
      </MemoryRouter>
    )

    // Verify message appears once
    await waitFor(() => {
      expect(screen.getAllByTestId('message-item-msg-concurrent-999')).toHaveLength(1)
    })

    // Now HTTP response resolves
    resolveSendMessage(newMsg)

    // Verify message STILL appears only once (no duplication)
    await waitFor(() => {
      expect(screen.getAllByTestId('message-item-msg-concurrent-999')).toHaveLength(1)
    })
  })

  it('renders attachments in message stream items', async () => {
    const msgWithAtt: ChatMessage = {
      id: 'msg-att-1',
      conversationId: 'conv-123',
      senderRole: 'admin',
      senderId: 'admin-1',
      senderName: 'Hỗ trợ viên',
      content: 'Ảnh chụp sản phẩm cho bạn đây:',
      attachedOrderId: null,
      attachedOrder: null,
      attachments: [
        {
          id: 'att-img-1',
          fileType: 'image',
          fileUrl: 'https://example.com/item.jpg',
          fileName: 'item.jpg',
          fileSize: 2048,
          mimeType: 'image/jpeg',
        },
      ],
      isRead: true,
      createdAt: '2026-09-04T09:10:00Z',
    }

    vi.spyOn(chatApiModule, 'getMessages').mockResolvedValue([msgWithAtt])

    render(
      <MemoryRouter>
        <ChatWindow />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByTestId('message-attachment-image-att-img-1')).toBeInTheDocument()
    })
  })

  it('handles media upload, pending media preview chip, and removes it', async () => {
    const mockAttachment = {
      id: 'att-new-1',
      fileType: 'image' as const,
      fileUrl: '/api/v1/chat/media/att-new-1',
      fileName: 'photo.png',
      fileSize: 1024,
      mimeType: 'image/png',
    }
    vi.spyOn(chatApiModule, 'uploadMedia').mockResolvedValue(mockAttachment)
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:http://localhost/test-blob'),
      revokeObjectURL: vi.fn(),
    })

    render(
      <MemoryRouter>
        <ChatWindow />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByTestId('attach-media-btn')).toBeInTheDocument()
    })

    const fileInput = screen.getByTestId('chat-file-input')
    const file = new File(['test'], 'photo.png', { type: 'image/png' })

    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(chatApiModule.uploadMedia).toHaveBeenCalledWith(file)
      expect(screen.getByTestId('pending-media-preview-container')).toBeInTheDocument()
    })

    // Now remove the pending media
    const removeBtn = screen.getByLabelText(/Xóa tệp photo.png/i)
    fireEvent.click(removeBtn)

    await waitFor(() => {
      expect(screen.queryByTestId('pending-media-preview-container')).not.toBeInTheDocument()
    })
  })

  it('sends message with attachmentIds when media is uploaded and message is submitted', async () => {
    const mockAttachment = {
      id: 'att-new-2',
      fileType: 'image' as const,
      fileUrl: '/api/v1/chat/media/att-new-2',
      fileName: 'snapshot.jpg',
      fileSize: 2048,
      mimeType: 'image/jpeg',
    }
    vi.spyOn(chatApiModule, 'uploadMedia').mockResolvedValue(mockAttachment)
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:http://localhost/test-blob-2'),
      revokeObjectURL: vi.fn(),
    })

    render(
      <MemoryRouter>
        <ChatWindow />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByTestId('attach-media-btn')).toBeInTheDocument()
    })

    const fileInput = screen.getByTestId('chat-file-input')
    const file = new File(['test'], 'snapshot.jpg', { type: 'image/jpeg' })

    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(chatApiModule.uploadMedia).toHaveBeenCalledWith(file)
    })

    // Send button should be enabled even without text because attachment is ready
    const sendBtn = screen.getByTestId('send-message-btn')
    expect(sendBtn).not.toBeDisabled()

    fireEvent.click(sendBtn)

    await waitFor(() => {
      expect(chatApiModule.sendMessage).toHaveBeenCalledWith({
        content: '',
        attachedOrderId: undefined,
        attachmentIds: ['att-new-2'],
      })
    })

    // Pending media should be cleared
    await waitFor(() => {
      expect(screen.queryByTestId('pending-media-preview-container')).not.toBeInTheDocument()
    })
  })

  it('shows NewMessagesScrollBadge when user is scrolled up and admin sends a message, then scrolls to bottom and marks read when clicked', async () => {
    const { rerender, container } = render(
      <MemoryRouter>
        <ChatWindow />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Chào bạn! Shop có thể hỗ trợ gì cho bạn ạ?')).toBeInTheDocument()
    })

    const messagesContainer = container.querySelector('.overflow-y-auto') as HTMLDivElement
    expect(messagesContainer).toBeInTheDocument()

    // Simulate user scrolled up (diff = 1000 - 100 - 400 = 500 >= 40)
    Object.defineProperty(messagesContainer, 'scrollHeight', { value: 1000, configurable: true })
    Object.defineProperty(messagesContainer, 'clientHeight', { value: 400, configurable: true })
    Object.defineProperty(messagesContainer, 'scrollTop', { value: 100, configurable: true })

    fireEvent.scroll(messagesContainer)

    // Incoming admin message arrives while scrolled up
    const adminMsg: ChatMessage = {
      id: 'msg-admin-scrolled-up',
      conversationId: 'conv-123',
      senderRole: 'admin',
      senderId: 'admin-1',
      senderName: 'Hỗ trợ viên',
      content: 'Chào bạn, đơn hàng của bạn đang được đóng gói!',
      attachments: [],
      createdAt: new Date().toISOString(),
      isRead: false,
    }

    rerender(
      <MemoryRouter>
        <ChatWindow incomingMessage={adminMsg} />
      </MemoryRouter>
    )

    // The new messages scroll badge should be displayed
    await waitFor(() => {
      expect(screen.getByTestId('new-messages-scroll-badge')).toBeInTheDocument()
      expect(screen.getByText(/1 tin nhắn mới/i)).toBeInTheDocument()
    })

    // Clicking badge scrolls to bottom and calls markConversationRead
    const badge = screen.getByTestId('new-messages-scroll-badge')
    fireEvent.click(badge)

    await waitFor(() => {
      expect(chatApiModule.markConversationRead).toHaveBeenCalled()
      expect(screen.queryByTestId('new-messages-scroll-badge')).not.toBeInTheDocument()
    })
  })

  it('marks conversation as read when user manually scrolls to bottom with unread messages', async () => {
    const { rerender, container } = render(
      <MemoryRouter>
        <ChatWindow />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Chào bạn! Shop có thể hỗ trợ gì cho bạn ạ?')).toBeInTheDocument()
    })

    const messagesContainer = container.querySelector('.overflow-y-auto') as HTMLDivElement

    // Scrolled up
    Object.defineProperty(messagesContainer, 'scrollHeight', { value: 1000, configurable: true })
    Object.defineProperty(messagesContainer, 'clientHeight', { value: 400, configurable: true })
    Object.defineProperty(messagesContainer, 'scrollTop', { value: 100, configurable: true })
    fireEvent.scroll(messagesContainer)

    // Incoming admin message arrives
    const adminMsg: ChatMessage = {
      id: 'msg-admin-manual-scroll',
      conversationId: 'conv-123',
      senderRole: 'admin',
      senderId: 'admin-1',
      senderName: 'Hỗ trợ viên',
      content: 'Tin nhắn khi đang cuộn lên',
      attachments: [],
      createdAt: new Date().toISOString(),
      isRead: false,
    }

    rerender(
      <MemoryRouter>
        <ChatWindow incomingMessage={adminMsg} />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByTestId('new-messages-scroll-badge')).toBeInTheDocument()
    })

    // Now manually scroll to bottom: 1000 - 590 - 400 = 10 < 40
    Object.defineProperty(messagesContainer, 'scrollTop', { value: 590, configurable: true })
    fireEvent.scroll(messagesContainer)

    await waitFor(() => {
      expect(chatApiModule.markConversationRead).toHaveBeenCalled()
      expect(screen.queryByTestId('new-messages-scroll-badge')).not.toBeInTheDocument()
    })
  })

  it('deduplicates customer sent message when WebSocket echo arrives', async () => {
    const echoMsg: ChatMessage = {
      id: 'msg-echo-123',
      conversationId: 'conv-123',
      senderRole: 'customer',
      senderId: 'user-1',
      senderName: 'Khách hàng',
      content: 'Tin nhắn gửi thử nghiệm echo',
      attachments: [],
      createdAt: new Date().toISOString(),
      isRead: false,
    }

    vi.spyOn(chatApiModule, 'sendMessage').mockResolvedValue(echoMsg)

    const { rerender } = render(
      <MemoryRouter>
        <ChatWindow />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Chào bạn! Shop có thể hỗ trợ gì cho bạn ạ?')).toBeInTheDocument()
    })

    const textarea = screen.getByPlaceholderText('Nhập tin nhắn...')
    fireEvent.change(textarea, { target: { value: 'Tin nhắn gửi thử nghiệm echo' } })

    const sendBtn = screen.getByTestId('send-message-btn')
    fireEvent.click(sendBtn)

    await waitFor(() => {
      expect(chatApiModule.sendMessage).toHaveBeenCalled()
      expect(screen.getByText('Tin nhắn gửi thử nghiệm echo')).toBeInTheDocument()
    })

    // Simulate WebSocket echo arriving with the same message
    rerender(
      <MemoryRouter>
        <ChatWindow incomingMessage={echoMsg} />
      </MemoryRouter>
    )

    // Verify it is not duplicated
    expect(screen.getAllByText('Tin nhắn gửi thử nghiệm echo').length).toBe(1)
  })
})
