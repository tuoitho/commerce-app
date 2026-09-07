import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AdminConversationList } from './AdminConversationList'
import type { ChatConversation } from '@/api/chat'

describe('AdminConversationList Component (ADM-02)', () => {
  const mockConversations: ChatConversation[] = [
    {
      id: 'c1',
      userId: 'u1',
      customerName: 'Nguyễn Văn A',
      customerEmail: 'a@example.com',
      adminUnreadCount: 3,
      lastMessageAt: '2026-09-07T10:30:00Z',
      customerPresence: {
        status: 'online',
        displayText: 'Đang hoạt động',
        lastActiveAt: '2026-09-07T10:30:00Z',
      },
      lastMessage: {
        id: 'm1',
        senderRole: 'customer',
        messageType: 'text',
        content: 'Shop tư vấn giúp mình với!',
        hasMedia: false,
        createdAt: '2026-09-07T10:30:00Z',
      },
    },
    {
      id: 'c2',
      userId: 'u2',
      customerName: 'Trần Thị B',
      customerEmail: 'b@example.com',
      adminUnreadCount: 0,
      lastMessageAt: '2026-09-07T09:00:00Z',
      customerPresence: {
        status: 'offline',
        displayText: 'Hoạt động 1 giờ trước',
        lastActiveAt: '2026-09-07T09:00:00Z',
      },
      lastMessage: {
        id: 'm2',
        senderRole: 'customer',
        messageType: 'order',
        content: 'Hỏi về đơn hàng này',
        hasMedia: false,
        createdAt: '2026-09-07T09:00:00Z',
      },
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders customer list with names, unread badges, and last messages (AC-CHAT-04-01)', () => {
    const onSelect = vi.fn()
    render(
      <AdminConversationList
        conversations={mockConversations}
        selectedConvId="c1"
        onSelectConversation={onSelect}
        searchQuery=""
        onSearchChange={vi.fn()}
        unreadOnly={false}
        onUnreadOnlyChange={vi.fn()}
        totalItems={2}
        page={1}
        totalPages={1}
        onPageChange={vi.fn()}
        onRefresh={vi.fn()}
      />
    )

    expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument()
    expect(screen.getByText('Trần Thị B')).toBeInTheDocument()
    expect(screen.getByText('3 mới')).toBeInTheDocument()
    expect(screen.getByText('Shop tư vấn giúp mình với!')).toBeInTheDocument()
    expect(screen.getByText(/\[Đơn hàng\]/)).toBeInTheDocument()
  })

  it('displays customer online/offline presence indicator and text (AC-CHAT-06-01, AC-CHAT-06-02)', () => {
    render(
      <AdminConversationList
        conversations={mockConversations}
        selectedConvId="c1"
        onSelectConversation={vi.fn()}
        searchQuery=""
        onSearchChange={vi.fn()}
        unreadOnly={false}
        onUnreadOnlyChange={vi.fn()}
        totalItems={2}
        page={1}
        totalPages={1}
        onPageChange={vi.fn()}
        onRefresh={vi.fn()}
      />
    )

    const onlineDot = screen.getByTestId('presence-dot-c1')
    expect(onlineDot).toHaveClass('bg-emerald-500')
    expect(screen.getByTestId('presence-text-c1')).toHaveTextContent('Đang hoạt động')

    const offlineDot = screen.getByTestId('presence-dot-c2')
    expect(offlineDot).toHaveClass('bg-slate-300')
    expect(screen.getByTestId('presence-text-c2')).toHaveTextContent('Hoạt động 1 giờ trước')
  })

  it('handles conversation selection on click', () => {
    const onSelect = vi.fn()
    render(
      <AdminConversationList
        conversations={mockConversations}
        selectedConvId="c1"
        onSelectConversation={onSelect}
        searchQuery=""
        onSearchChange={vi.fn()}
        unreadOnly={false}
        onUnreadOnlyChange={vi.fn()}
        totalItems={2}
        page={1}
        totalPages={1}
        onPageChange={vi.fn()}
        onRefresh={vi.fn()}
      />
    )

    fireEvent.click(screen.getByTestId('conversation-item-c2'))
    expect(onSelect).toHaveBeenCalledWith(mockConversations[1])
  })

  it('handles search input and unread filter toggle', () => {
    const onSearchChange = vi.fn()
    const onUnreadOnlyChange = vi.fn()

    render(
      <AdminConversationList
        conversations={mockConversations}
        selectedConvId="c1"
        onSelectConversation={vi.fn()}
        searchQuery=""
        onSearchChange={onSearchChange}
        unreadOnly={false}
        onUnreadOnlyChange={onUnreadOnlyChange}
        totalItems={2}
        page={1}
        totalPages={1}
        onPageChange={vi.fn()}
        onRefresh={vi.fn()}
      />
    )

    const searchInput = screen.getByPlaceholderText('Tìm kiếm khách hàng...')
    fireEvent.change(searchInput, { target: { value: 'Nguyễn' } })
    expect(onSearchChange).toHaveBeenCalledWith('Nguyễn')

    const unreadCheckbox = screen.getByRole('checkbox', { name: /Chỉ tin nhắn chưa đọc/i })
    fireEvent.click(unreadCheckbox)
    expect(onUnreadOnlyChange).toHaveBeenCalledWith(true)
  })
})
