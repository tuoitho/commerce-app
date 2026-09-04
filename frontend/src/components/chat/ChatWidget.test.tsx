import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ChatWidget } from './ChatWidget'
import { formatRelativeTime, formatUnreadCount } from '@/lib/chatUtils'
import * as AuthContextModule from '@/context/AuthContext'
import * as chatApiModule from '@/api/chat'

// Mock useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({
      pathname: '/products/laptop-1',
      search: '?color=silver',
    }),
  }
})

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

describe('formatUnreadCount & formatRelativeTime helpers', () => {
  it('formats unread count correctly', () => {
    expect(formatUnreadCount(0)).toBe('')
    expect(formatUnreadCount(-1)).toBe('')
    expect(formatUnreadCount(5)).toBe('5')
    expect(formatUnreadCount(99)).toBe('99')
    expect(formatUnreadCount(100)).toBe('99+')
    expect(formatUnreadCount(999)).toBe('99+')
  })

  it('formats relative active time correctly in Vietnamese', () => {
    expect(formatRelativeTime(null)).toBe('Không trực tuyến')
    expect(formatRelativeTime('')).toBe('Không trực tuyến')
    expect(formatRelativeTime('invalid-date')).toBe('Không trực tuyến')

    const now = new Date()
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString()
    expect(formatRelativeTime(fiveMinutesAgo)).toBe('Hoạt động 5 phút trước')

    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString()
    expect(formatRelativeTime(twoHoursAgo)).toBe('Hoạt động 2 giờ trước')

    const justNow = new Date(now.getTime() - 20 * 1000).toISOString()
    expect(formatRelativeTime(justNow)).toBe('Vừa mới truy cập')
  })
})

describe('ChatWidget', () => {
  const mockUser = {
    id: 'user-1',
    email: 'customer@example.com',
    role: 'customer' as const,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  }

  const mockConversation: chatApiModule.Conversation = {
    id: 'conv-123',
    userId: 'user-1',
    customerEmail: 'customer@example.com',
    customerName: 'Khách Hàng A',
    customerLastActive: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    isOnline: true,
    lastMessageAt: '2026-09-04T10:00:00Z',
    lastMessageSnippet: 'Xin chào bạn',
    unreadCount: 3,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-04T10:00:00Z',
  }

  beforeEach(() => {
    vi.restoreAllMocks()
    MockWebSocket.instances = []
    vi.stubGlobal('WebSocket', MockWebSocket)
    mockNavigate.mockClear()

    vi.spyOn(chatApiModule, 'getConversation').mockResolvedValue(mockConversation)
    vi.spyOn(chatApiModule, 'markConversationRead').mockResolvedValue({ read: true })
  })

  afterEach(() => {
    MockWebSocket.instances = []
    vi.unstubAllGlobals()
  })

  it('renders floating circular button fixed at bottom-right', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: null,
      role: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })

    render(
      <MemoryRouter>
        <ChatWidget />
      </MemoryRouter>
    )

    const button = screen.getByRole('button', { name: /khung trò chuyện/i })
    expect(button).toBeInTheDocument()
    expect(button.className).toContain('fixed')
    expect(button.className).toContain('bottom-6')
    expect(button.className).toContain('right-6')
    expect(button.className).toContain('z-50')
  })

  it('shows login prompt when unauthenticated user clicks widget', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: null,
      role: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })

    render(
      <MemoryRouter>
        <ChatWidget />
      </MemoryRouter>
    )

    const trigger = screen.getByRole('button', { name: /khung trò chuyện/i })
    fireEvent.click(trigger)

    expect(screen.getByText('Đăng nhập để trò chuyện')).toBeInTheDocument()
    expect(
      screen.getByText(/Vui lòng đăng nhập để bắt đầu trò chuyện với nhân viên hỗ trợ/i)
    ).toBeInTheDocument()

    const loginButton = screen.getByRole('button', { name: /^Đăng nhập$/i })
    fireEvent.click(loginButton)

    expect(mockNavigate).toHaveBeenCalledWith(
      '/login?redirect=%2Fproducts%2Flaptop-1%3Fcolor%3Dsilver'
    )
  })

  it('displays unread badge when authenticated and unreadCount > 0', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockUser,
      role: 'customer',
      accessToken: 'token-123',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })

    render(
      <MemoryRouter>
        <ChatWidget />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByTestId('unread-badge')).toBeInTheDocument()
      expect(screen.getByTestId('unread-badge')).toHaveTextContent('3')
    })
  })

  it('formats badge as 99+ when unreadCount exceeds 99', async () => {
    vi.spyOn(chatApiModule, 'getConversation').mockResolvedValue({
      ...mockConversation,
      unreadCount: 150,
    })

    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockUser,
      role: 'customer',
      accessToken: 'token-123',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })

    render(
      <MemoryRouter>
        <ChatWidget />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByTestId('unread-badge')).toHaveTextContent('99+')
    })
  })

  it('toggles popup chat window when authenticated user clicks widget', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockUser,
      role: 'customer',
      accessToken: 'token-123',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })

    render(
      <MemoryRouter>
        <ChatWidget />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByTestId('unread-badge')).toBeInTheDocument()
    })

    const trigger = screen.getByRole('button', { name: /mở khung trò chuyện/i })
    fireEvent.click(trigger)

    // Popup opens
    expect(screen.getByText('Đội ngũ hỗ trợ')).toBeInTheDocument()
    expect(screen.getByTestId('chat-window-container')).toBeInTheDocument()

    // Mark conversation read should be called when opening with unread messages
    expect(chatApiModule.markConversationRead).toHaveBeenCalled()

    // Clicking close button in header closes the popup
    const closeBtn = screen.getByTestId('close-chat-popup')
    fireEvent.click(closeBtn)

    expect(screen.queryByText('Đội ngũ hỗ trợ')).not.toBeInTheDocument()
  })

  it('displays support online status and offline relative time correctly', async () => {
    vi.spyOn(chatApiModule, 'getConversation').mockResolvedValue({
      ...mockConversation,
      isOnline: true,
      unreadCount: 0,
    })

    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockUser,
      role: 'customer',
      accessToken: 'token-123',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })

    render(
      <MemoryRouter>
        <ChatWidget />
      </MemoryRouter>
    )

    // Wait for conversation to load online state
    await waitFor(() => {
      expect(chatApiModule.getConversation).toHaveBeenCalled()
    })

    const trigger = screen.getByRole('button', { name: /khung trò chuyện/i })
    fireEvent.click(trigger)

    // Should show "Đang trực tuyến"
    await waitFor(() => {
      expect(screen.getByTestId('presence-text')).toHaveTextContent('Đang trực tuyến')
      expect(screen.getByTestId('presence-indicator')).toHaveClass('bg-emerald-500')
    })
  })

  it('displays Không trực tuyến initially when offline without using customerLastActive, and updates on admin presence WS event', async () => {
    vi.spyOn(chatApiModule, 'getConversation').mockResolvedValue({
      ...mockConversation,
      isOnline: false,
      unreadCount: 0,
      customerLastActive: '2026-09-04T09:00:00Z',
    })

    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockUser,
      role: 'customer',
      accessToken: 'token-123',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })

    render(
      <MemoryRouter>
        <ChatWidget />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(chatApiModule.getConversation).toHaveBeenCalled()
      expect(MockWebSocket.instances.length).toBeGreaterThan(0)
    })

    const trigger = screen.getByRole('button', { name: /khung trò chuyện/i })
    fireEvent.click(trigger)

    // Initially support is offline and supportLastActiveAt is null -> "Không trực tuyến"
    expect(screen.getByTestId('presence-text')).toHaveTextContent('Không trực tuyến')
    expect(screen.getByTestId('presence-indicator')).toHaveClass('bg-slate-400')

    // Simulate admin presence event via WebSocket
    const ws = MockWebSocket.instances[0]
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    act(() => {
      ws.receive({
        type: 'chat:presence',
        payload: {
          userId: 'admin-1',
          role: 'admin',
          isOnline: false,
          lastActiveAt: fiveMinutesAgo,
        },
      })
    })

    await waitFor(() => {
      expect(screen.getByTestId('presence-text')).toHaveTextContent('Hoạt động 5 phút trước')
    })
  })

  it('increments unread count and shows badge when receiving new admin message while closed', async () => {
    vi.spyOn(chatApiModule, 'getConversation').mockResolvedValue({
      ...mockConversation,
      unreadCount: 0,
    })

    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockUser,
      role: 'customer',
      accessToken: 'token-123',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })

    render(
      <MemoryRouter>
        <ChatWidget />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(MockWebSocket.instances.length).toBeGreaterThan(0)
    })

    expect(screen.queryByTestId('unread-badge')).not.toBeInTheDocument()

    // Simulate incoming admin message via WebSocket
    act(() => {
      const ws = MockWebSocket.instances[0]
      ws.receive({
        type: 'chat:new_message',
        payload: {
          id: 'msg-admin-1',
          conversationId: 'conv-123',
          senderId: 'admin-1',
          senderRole: 'admin',
          senderName: 'Hỗ trợ viên',
          content: 'Xin chào, chúng tôi có thể giúp gì cho bạn?',
          attachments: [],
          createdAt: new Date().toISOString(),
          isRead: false,
        },
      })
    })

    await waitFor(() => {
      expect(screen.getByTestId('unread-badge')).toBeInTheDocument()
      expect(screen.getByTestId('unread-badge')).toHaveTextContent('1')
    })
  })

  it('opens chat window and attaches order when receiving open-chat-with-order event', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockUser,
      role: 'customer',
      accessToken: 'token-123',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })

    const mockOrderCard: chatApiModule.AttachedOrderCard = {
      id: 'ord-event-999',
      status: 'confirmed',
      totalVnd: 750000,
      createdAt: '2026-09-04T10:00:00Z',
      itemsSummary: [
        {
          productName: 'Tai nghe chụp tai',
          quantity: 1,
          unitPriceVnd: 750000,
          imageUrl: '',
        },
      ],
      totalItemsCount: 1,
    }

    render(
      <MemoryRouter>
        <ChatWidget />
      </MemoryRouter>
    )

    // Dispatch event
    act(() => {
      window.dispatchEvent(
        new CustomEvent('open-chat-with-order', {
          detail: { order: mockOrderCard, orderId: mockOrderCard.id },
        })
      )
    })

    // Chat popup should be open and order preview chip should be displayed
    await waitFor(() => {
      expect(screen.getByTestId('chat-window-container')).toBeInTheDocument()
      expect(screen.getByTestId('attached-order-preview')).toBeInTheDocument()
      expect(screen.getByText(/ord-event-999/i)).toBeInTheDocument()
    })
  })
})
