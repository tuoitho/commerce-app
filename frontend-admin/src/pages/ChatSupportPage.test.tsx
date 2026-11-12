import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChatSupportPage } from './ChatSupportPage'
import * as chatApiModule from '@/api/chat'
import type { AdminConversation } from '@/api/chat'

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}{location.search}</output>
}

function renderWithClient(initialEntry = '/chat') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            path="/chat"
            element={
              <>
                <ChatSupportPage />
                <LocationProbe />
              </>
            }
          />
          <Route
            path="/chat/:conversationId"
            element={
              <>
                <ChatSupportPage />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('ChatSupportPage', () => {
  const mockConversations: AdminConversation[] = [
    {
      id: 'conv-101',
      userId: 'usr-1',
      customerEmail: 'nguyen.van.a@example.com',
      customerName: 'Nguyễn Văn A',
      customerLastActive: new Date().toISOString(),
      isOnline: true,
      lastMessageAt: '2026-09-04T10:00:00Z',
      lastMessageSnippet: 'Shop cho mình hỏi đơn hàng ORD-123 khi nào giao?',
      unreadCount: 3,
      createdAt: '2026-09-04T08:00:00Z',
      updatedAt: '2026-09-04T10:00:00Z',
    },
    {
      id: 'conv-102',
      userId: 'usr-2',
      customerEmail: 'tran.thi.b@example.com',
      customerName: 'Trần Thị B',
      customerLastActive: '2026-09-04T09:00:00Z',
      isOnline: false,
      lastMessageAt: '2026-09-04T09:15:00Z',
      lastMessageSnippet: 'Cảm ơn shop nhiều nhé!',
      unreadCount: 0,
      createdAt: '2026-09-03T15:00:00Z',
      updatedAt: '2026-09-04T09:15:00Z',
    },
  ]

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(chatApiModule, 'listAdminConversations').mockResolvedValue(mockConversations)
  })

  it('renders page layout with search input, filter tabs, and conversation list', async () => {
    renderWithClient('/chat')

    expect(screen.getByTestId('chat-support-page')).toBeInTheDocument()
    expect(screen.getByTestId('conversations-sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('chat-search-input')).toBeInTheDocument()
    expect(screen.getByTestId('filter-tab-all')).toBeInTheDocument()
    expect(screen.getByTestId('filter-tab-unread')).toBeInTheDocument()

    // Shows no conversation selected placeholder initially
    expect(screen.getByTestId('no-conversation-selected')).toBeInTheDocument()

    // Wait for conversation list to load
    await waitFor(() => {
      expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument()
      expect(screen.getByText('Trần Thị B')).toBeInTheDocument()
    })

    // Checks presence indicators and snippets
    expect(screen.getByText('Shop cho mình hỏi đơn hàng ORD-123 khi nào giao?')).toBeInTheDocument()
    expect(screen.getByText('Cảm ơn shop nhiều nhé!')).toBeInTheDocument()

    // Checks unread count badges
    expect(screen.getByTestId('unread-badge-conv-101')).toHaveTextContent('3')
    expect(screen.queryByTestId('unread-badge-conv-102')).not.toBeInTheDocument()

    // Checks total unread badge in header
    expect(screen.getByTestId('total-unread-badge')).toHaveTextContent('3 chưa đọc')
  })

  it('switches filter between "Tất cả" and "Chưa đọc"', async () => {
    renderWithClient('/chat')

    await waitFor(() => {
      expect(chatApiModule.listAdminConversations).toHaveBeenCalledWith(
        expect.objectContaining({ filter: 'all' })
      )
    })

    // Click "Chưa đọc" tab
    const unreadTab = screen.getByTestId('filter-tab-unread')
    fireEvent.click(unreadTab)

    await waitFor(() => {
      expect(chatApiModule.listAdminConversations).toHaveBeenCalledWith(
        expect.objectContaining({ filter: 'unread' })
      )
    })
  })

  it('handles search input with debouncing and clearing', async () => {
    renderWithClient('/chat')

    await waitFor(() => {
      expect(screen.getByTestId('chat-search-input')).toBeInTheDocument()
    })

    const searchInput = screen.getByTestId('chat-search-input')
    fireEvent.change(searchInput, { target: { value: 'ORD-123' } })

    // Debounced search will be triggered
    await waitFor(
      () => {
        expect(chatApiModule.listAdminConversations).toHaveBeenCalledWith(
          expect.objectContaining({ search: 'ORD-123' })
        )
      },
      { timeout: 1000 }
    )

    // Clear search button appears
    const clearBtn = screen.getByTestId('clear-search-btn')
    fireEvent.click(clearBtn)

    expect(searchInput).toHaveValue('')
  })

  it('selects conversation and displays detail header panel', async () => {
    renderWithClient('/chat')

    await waitFor(() => {
      expect(screen.getByTestId('conversation-item-conv-101')).toBeInTheDocument()
    })

    // Click first conversation
    fireEvent.click(screen.getByTestId('conversation-item-conv-101'))

    // Right panel displays active conversation container
    await waitFor(() => {
      expect(screen.getByTestId('admin-chat-detail-container')).toBeInTheDocument()
      expect(screen.queryByTestId('no-conversation-selected')).not.toBeInTheDocument()
    })
  })

  it('renders conversation detail directly when route has conversationId param', async () => {
    renderWithClient('/chat/conv-102')

    await waitFor(() => {
      expect(screen.getByTestId('admin-chat-detail-container')).toBeInTheDocument()
      expect(screen.getAllByText('Trần Thị B').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('displays empty state when no conversations exist', async () => {
    vi.spyOn(chatApiModule, 'listAdminConversations').mockResolvedValue([])

    renderWithClient('/chat')

    await waitFor(() => {
      expect(screen.getByTestId('conversations-empty')).toBeInTheDocument()
      expect(screen.getByText(/chưa có cuộc hội thoại nào/i)).toBeInTheDocument()
    })
  })

  it('displays error state and allows retry on failure', async () => {
    vi.spyOn(chatApiModule, 'listAdminConversations').mockRejectedValue(
      new Error('Lỗi kết nối máy chủ')
    )

    renderWithClient('/chat')

    await waitFor(() => {
      expect(screen.getByTestId('conversations-error')).toBeInTheDocument()
      expect(screen.getByText('Lỗi kết nối máy chủ')).toBeInTheDocument()
    })

    // Click retry
    const retryBtn = screen.getByRole('button', { name: /thử lại/i })
    expect(retryBtn).toBeInTheDocument()
    fireEvent.click(retryBtn)

    await waitFor(() => {
      expect(chatApiModule.listAdminConversations).toHaveBeenCalledTimes(2)
    })
  })

  it('loads and renders messages for selected conversation and supports sending reply', async () => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
    const mockMessages = [
      {
        id: 'msg-1',
        conversationId: 'conv-101',
        senderId: 'usr-1',
        senderRole: 'customer' as const,
        senderName: 'Nguyễn Văn A',
        content: 'Shop ơi có giao hỏa tốc không?',
        attachments: [],
        createdAt: '2026-09-04T10:00:00Z',
        isRead: false,
      },
    ]

    const getMessagesSpy = vi
      .spyOn(chatApiModule, 'getAdminConversationMessages')
      .mockResolvedValue(mockMessages)
    const sendReplySpy = vi.spyOn(chatApiModule, 'sendAdminMessage').mockResolvedValue({
      id: 'msg-reply-1',
      conversationId: 'conv-101',
      senderId: 'admin-1',
      senderRole: 'admin' as const,
      senderName: 'Hỗ trợ viên',
      content: 'Dạ có giao hỏa tốc trong 2 giờ ạ!',
      attachments: [],
      createdAt: '2026-09-04T10:05:00Z',
      isRead: true,
    })
    const markReadSpy = vi
      .spyOn(chatApiModule, 'markAdminConversationRead')
      .mockResolvedValue({ read: true })

    renderWithClient('/chat/conv-101')

    await waitFor(() => {
      expect(getMessagesSpy).toHaveBeenCalledWith('conv-101')
      expect(screen.getByText('Shop ơi có giao hỏa tốc không?')).toBeInTheDocument()
    })

    // Marked as read was called
    await waitFor(() => {
      expect(markReadSpy).toHaveBeenCalledWith('conv-101')
    })

    // Type reply
    const textarea = screen.getByTestId('admin-chat-textarea')
    fireEvent.change(textarea, { target: { value: 'Dạ có giao hỏa tốc trong 2 giờ ạ!' } })

    const sendBtn = screen.getByTestId('admin-send-message-btn')
    expect(sendBtn).not.toBeDisabled()
    fireEvent.click(sendBtn)

    await waitFor(() => {
      expect(sendReplySpy).toHaveBeenCalledWith('conv-101', {
        content: 'Dạ có giao hỏa tốc trong 2 giờ ạ!',
        attachmentIds: undefined,
      })
      expect(screen.getByText('Dạ có giao hỏa tốc trong 2 giờ ạ!')).toBeInTheDocument()
    })
  })

  it('initializes unread filter tab from URL ?filter=unread and fetches unread conversations', async () => {
    renderWithClient('/chat?filter=unread')

    await waitFor(() => {
      expect(chatApiModule.listAdminConversations).toHaveBeenCalledWith(
        expect.objectContaining({ filter: 'unread' })
      )
    })

    const unreadTab = screen.getByTestId('filter-tab-unread')
    expect(unreadTab.className).toContain('text-blue-700')
  })

  it('falls back to "all" filter when URL has invalid ?filter= parameter', async () => {
    renderWithClient('/chat?filter=invalid_filter')

    await waitFor(() => {
      expect(chatApiModule.listAdminConversations).toHaveBeenCalledWith(
        expect.objectContaining({ filter: 'all' })
      )
    })

    const allTab = screen.getByTestId('filter-tab-all')
    expect(allTab.className).toContain('text-blue-700')
  })

  it('updates URL search params when changing filter tabs', async () => {
    renderWithClient('/chat')

    await waitFor(() => {
      expect(screen.getByTestId('filter-tab-unread')).toBeInTheDocument()
    })

    // Click "Chưa đọc"
    fireEvent.click(screen.getByTestId('filter-tab-unread'))
    expect(screen.getByTestId('location').textContent).toBe('/chat?filter=unread')

    // Click "Tất cả"
    fireEvent.click(screen.getByTestId('filter-tab-all'))
    expect(screen.getByTestId('location').textContent).toBe('/chat')
  })

  it('preserves query string when selecting a conversation', async () => {
    renderWithClient('/chat?filter=unread')

    await waitFor(() => {
      expect(screen.getByTestId('conversation-item-conv-101')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('conversation-item-conv-101'))

    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toBe('/chat/conv-101?filter=unread')
    })
  })
})

