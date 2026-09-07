import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ChatMessageList } from './ChatMessageList'
import type { ChatMessage } from '@/api/chat'

const mockMessages: ChatMessage[] = [
  {
    id: 'm1',
    conversationId: 'c1',
    senderId: 'u1',
    senderRole: 'customer',
    messageType: 'text',
    content: 'Tin nhắn 1',
    media: [],
    createdAt: '2026-09-07T10:00:00Z',
  },
  {
    id: 'm2',
    conversationId: 'c1',
    senderId: 'admin1',
    senderRole: 'admin',
    messageType: 'text',
    content: 'Tin nhắn 2 từ admin',
    media: [],
    createdAt: '2026-09-07T10:01:00Z',
  },
]

describe('ChatMessageList Component (FE-02)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders initial list of messages (AC-CHAT-03-01)', () => {
    render(
      <MemoryRouter>
        <ChatMessageList messages={mockMessages} />
      </MemoryRouter>
    )

    expect(screen.getByText('Tin nhắn 1')).toBeInTheDocument()
    expect(screen.getByText('Tin nhắn 2 từ admin')).toBeInTheDocument()
    expect(screen.queryByTestId('jump-to-bottom-button')).not.toBeInTheDocument()
  })

  it('triggers onLoadOlder when scrolled near top and hasMore is true (AC-CHAT-03-02)', () => {
    const onLoadOlder = vi.fn()
    render(
      <MemoryRouter>
        <ChatMessageList
          messages={mockMessages}
          hasMore={true}
          isLoadingOlder={false}
          onLoadOlder={onLoadOlder}
        />
      </MemoryRouter>
    )

    const container = screen.getByTestId('chat-message-list-container')
    // Set container measurements
    Object.defineProperty(container, 'scrollTop', { value: 10, writable: true })
    Object.defineProperty(container, 'scrollHeight', { value: 500, writable: true })
    Object.defineProperty(container, 'clientHeight', { value: 300, writable: true })

    fireEvent.scroll(container)
    expect(onLoadOlder).toHaveBeenCalledTimes(1)
  })

  it('shows loading indicator when isLoadingOlder is true', () => {
    render(
      <MemoryRouter>
        <ChatMessageList
          messages={mockMessages}
          hasMore={true}
          isLoadingOlder={true}
        />
      </MemoryRouter>
    )

    expect(screen.getByTestId('loading-older-indicator')).toBeInTheDocument()
    expect(screen.getByText('Đang tải tin nhắn cũ...')).toBeInTheDocument()
  })

  it('shows "Có X tin mới" button when scrolled up and new message arrives (AC-CHAT-03-03)', () => {
    const { rerender } = render(
      <MemoryRouter>
        <ChatMessageList messages={mockMessages} />
      </MemoryRouter>
    )

    const container = screen.getByTestId('chat-message-list-container')

    // Simulate user scrolled up: scrollHeight = 1000, clientHeight = 300, scrollTop = 200 (distance = 500px > 100px)
    Object.defineProperty(container, 'scrollHeight', { value: 1000, writable: true })
    Object.defineProperty(container, 'clientHeight', { value: 300, writable: true })
    Object.defineProperty(container, 'scrollTop', { value: 200, writable: true })
    fireEvent.scroll(container)

    // New message arrives
    const newMessages: ChatMessage[] = [
      ...mockMessages,
      {
        id: 'm3',
        conversationId: 'c1',
        senderId: 'admin1',
        senderRole: 'admin',
        messageType: 'text',
        content: 'Tin nhắn mới khi đang cuộn ở trên',
        media: [],
        createdAt: '2026-09-07T10:05:00Z',
      },
    ]

    rerender(
      <MemoryRouter>
        <ChatMessageList messages={newMessages} />
      </MemoryRouter>
    )

    const jumpButton = screen.getByTestId('jump-to-bottom-button')
    expect(jumpButton).toBeInTheDocument()
    expect(jumpButton).toHaveTextContent('Có 1 tin mới')
  })

  it('smoothly scrolls to bottom and hides indicator when clicking jump button (AC-CHAT-03-04)', () => {
    const { rerender } = render(
      <MemoryRouter>
        <ChatMessageList messages={mockMessages} />
      </MemoryRouter>
    )

    const container = screen.getByTestId('chat-message-list-container')
    container.scrollTo = vi.fn()

    // Scrolled up
    Object.defineProperty(container, 'scrollHeight', { value: 1000, writable: true })
    Object.defineProperty(container, 'clientHeight', { value: 300, writable: true })
    Object.defineProperty(container, 'scrollTop', { value: 200, writable: true })
    fireEvent.scroll(container)

    // New message
    const newMessages: ChatMessage[] = [
      ...mockMessages,
      {
        id: 'm3',
        conversationId: 'c1',
        senderId: 'admin1',
        senderRole: 'admin',
        messageType: 'text',
        content: 'Tin nhắn mới',
        media: [],
        createdAt: '2026-09-07T10:05:00Z',
      },
    ]

    rerender(
      <MemoryRouter>
        <ChatMessageList messages={newMessages} />
      </MemoryRouter>
    )

    const jumpButton = screen.getByTestId('jump-to-bottom-button')
    expect(jumpButton).toBeInTheDocument()

    fireEvent.click(jumpButton)

    // Button should disappear
    expect(screen.queryByTestId('jump-to-bottom-button')).not.toBeInTheDocument()
  })

  it('auto-scrolls and does not show indicator when user is near bottom (AC-CHAT-03-05)', () => {
    const { rerender } = render(
      <MemoryRouter>
        <ChatMessageList messages={mockMessages} />
      </MemoryRouter>
    )

    const container = screen.getByTestId('chat-message-list-container')
    container.scrollTo = vi.fn()

    // User is near bottom: distance <= 100px
    Object.defineProperty(container, 'scrollHeight', { value: 600, writable: true })
    Object.defineProperty(container, 'clientHeight', { value: 300, writable: true })
    Object.defineProperty(container, 'scrollTop', { value: 250, writable: true }) // distance = 50 <= 100
    fireEvent.scroll(container)

    // New message arrives
    const newMessages: ChatMessage[] = [
      ...mockMessages,
      {
        id: 'm3',
        conversationId: 'c1',
        senderId: 'admin1',
        senderRole: 'admin',
        messageType: 'text',
        content: 'Tin nhắn mới gần đáy',
        media: [],
        createdAt: '2026-09-07T10:05:00Z',
      },
    ]

    rerender(
      <MemoryRouter>
        <ChatMessageList messages={newMessages} />
      </MemoryRouter>
    )

    // Should NOT show the indicator button
    expect(screen.queryByTestId('jump-to-bottom-button')).not.toBeInTheDocument()
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
        <ChatMessageList messages={messagesWithMedia} />
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
