import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { NotificationBell } from './NotificationBell'
import { postsApi } from '@/api/posts'
import type { NotificationItem, NotificationListResult } from '@/api/posts'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'

let mockOnNotificationCallback: ((notif: NotificationItem) => void) | undefined
let mockOnReconnectCallback: (() => void) | undefined

vi.mock('@/hooks/useChatSocket', () => ({
  useChatSocket: vi.fn((opts) => {
    mockOnNotificationCallback = opts?.onNotification
    mockOnReconnectCallback = opts?.onReconnect
    return {
      isConnected: true,
      isSupportOnline: false,
      supportLastActiveAt: null,
      sendPing: vi.fn(),
      reconnect: vi.fn(),
      disconnect: vi.fn(),
    }
  }),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/context/ToastContext', () => ({
  useToast: vi.fn(),
}))

vi.mock('@/api/posts', () => ({
  postsApi: {
    listNotifications: vi.fn(),
    markNotificationRead: vi.fn(),
    markAllNotificationsRead: vi.fn(),
  },
}))

describe('NotificationBell Component', () => {
  const sampleNotifications: NotificationItem[] = [
    {
      id: 'n-1',
      recipientId: 'user-1',
      actorId: 'admin-1',
      actorName: 'Quản trị viên',
      actorRole: 'admin',
      category: 'post',
      notificationType: 'post_reaction',
      postId: 'post-100',
      commentId: null,
      reactionType: 'love',
      excerpt: '',
      metadata: {},
      isRead: false,
      createdAt: '2026-10-21T09:00:00Z',
    },
    {
      id: 'n-2',
      recipientId: 'user-1',
      actorId: 'user-2',
      actorName: 'Hoàng Long',
      actorRole: 'customer',
      category: 'post',
      notificationType: 'comment_reply',
      postId: 'post-100',
      commentId: 'comment-200',
      reactionType: null,
      excerpt: 'Máy này dùng rất mượt bạn nhé!',
      metadata: {},
      isRead: true,
      createdAt: '2026-10-21T08:30:00Z',
    },
  ]

  const mockListResult: NotificationListResult = {
    items: sampleNotifications,
    unreadCount: 1,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      user: { id: 'user-1', email: 'user@test.com', role: 'customer' } as any,
      accessToken: 'test-token',
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })
    vi.mocked(useToast).mockReturnValue({
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      toast: vi.fn(),
    })
    vi.mocked(postsApi.listNotifications).mockResolvedValue(mockListResult)
  })

  it('renders bell with unread badge count (Req 6.5, 6.6)', async () => {
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByTestId('notification-unread-badge')).toHaveTextContent('1')
    })
  })

  it('opens notification dropdown and displays notifications list (Req 6.6)', async () => {
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    )

    const bellBtn = screen.getByTestId('notification-bell-button')
    fireEvent.click(bellBtn)

    await waitFor(() => {
      expect(screen.getByText(/Quản trị viên/i)).toBeInTheDocument()
      expect(screen.getByText(/Hoàng Long/i)).toBeInTheDocument()
      expect(screen.getByText(/Máy này dùng rất mượt bạn nhé!/i)).toBeInTheDocument()
    })
  })

  it('marks single notification as read and navigates on notification click (Req 7.1)', async () => {
    vi.mocked(postsApi.markNotificationRead).mockResolvedValue({
      id: 'n-1',
      isRead: true,
      unreadCount: 0,
    })

    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    )

    const bellBtn = screen.getByTestId('notification-bell-button')
    fireEvent.click(bellBtn)

    await waitFor(() => {
      expect(screen.getByText(/Quản trị viên/i)).toBeInTheDocument()
    })

    const notifItem = screen.getByTestId('notification-item-n-1')
    fireEvent.click(notifItem)

    await waitFor(() => {
      expect(postsApi.markNotificationRead).toHaveBeenCalledWith('n-1')
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.stringMatching(/\/posts\/post-100\?focus=post&focusTs=\d+/)
      )
    })
  })

  it('navigates with commentId when clicking a comment reply notification (Req 7.1)', async () => {
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    )

    const bellBtn = screen.getByTestId('notification-bell-button')
    fireEvent.click(bellBtn)

    await waitFor(() => {
      expect(screen.getByText(/Hoàng Long/i)).toBeInTheDocument()
    })

    const notifItem = screen.getByTestId('notification-item-n-2')
    fireEvent.click(notifItem)

    await waitFor(() => {
      // n-2 is already read, so markNotificationRead should not be called again
      expect(postsApi.markNotificationRead).not.toHaveBeenCalled()
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.stringMatching(/\/posts\/post-100\?commentId=comment-200&focusTs=\d+/)
      )
    })
  })

  it('marks all notifications as read when clicking mark-all-read button (Req 6.6)', async () => {
    vi.mocked(postsApi.markAllNotificationsRead).mockResolvedValue({
      unreadCount: 0,
    })

    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    )

    const bellBtn = screen.getByTestId('notification-bell-button')
    fireEvent.click(bellBtn)

    await waitFor(() => {
      expect(screen.getByTestId('mark-all-read-button')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('mark-all-read-button'))

    await waitFor(() => {
      expect(postsApi.markAllNotificationsRead).toHaveBeenCalled()
      expect(screen.queryByTestId('notification-unread-badge')).not.toBeInTheDocument()
    })
  })

  it('handles realtime notification:new via WebSocket and updates unread badge (Req 6.5)', async () => {
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByTestId('notification-unread-badge')).toHaveTextContent('1')
    })

    // Simulate incoming WebSocket notification
    expect(mockOnNotificationCallback).toBeDefined()
    const newNotif: NotificationItem = {
      id: 'n-3',
      recipientId: 'user-1',
      actorId: 'user-3',
      actorName: 'Lan Anh',
      actorRole: 'customer',
      category: 'post',
      notificationType: 'post_comment',
      postId: 'post-100',
      commentId: 'comment-300',
      reactionType: null,
      excerpt: 'Sản phẩm đẹp quá!',
      metadata: {},
      isRead: false,
      createdAt: '2026-10-21T09:30:00Z',
    }

    act(() => {
      mockOnNotificationCallback!(newNotif)
    })

    await waitFor(() => {
      expect(screen.getByTestId('notification-unread-badge')).toHaveTextContent('2')
    })

    fireEvent.click(screen.getByTestId('notification-bell-button'))
    await waitFor(() => {
      const items = screen.getAllByTestId(/^notification-item-/)
      expect(items[0]).toHaveAttribute('data-testid', 'notification-item-n-3')
    })
  })

  it('replaces existing unread notification and moves it to top without incrementing unreadCount on WebSocket notification:new with same id (Req 6.5)', async () => {
    const initialList: NotificationListResult = {
      items: [
        {
          id: 'n-top',
          recipientId: 'user-1',
          actorId: 'user-10',
          actorName: 'Người Dùng Đầu',
          actorRole: 'customer',
          category: 'post',
          notificationType: 'post_comment',
          postId: 'post-100',
          commentId: 'comment-10',
          reactionType: null,
          excerpt: 'Bình luận đầu',
          metadata: {},
          isRead: false,
          createdAt: '2026-10-21T09:10:00Z',
        },
        {
          id: 'n-rollup',
          recipientId: 'user-1',
          actorId: 'user-11',
          actorName: 'Nguyễn Văn A',
          actorRole: 'customer',
          actorCount: 1,
          groupKey: 'post_reaction:post-100',
          category: 'post',
          notificationType: 'post_reaction',
          postId: 'post-100',
          commentId: null,
          reactionType: 'like',
          excerpt: '',
          metadata: {
            recentActors: [{ id: 'user-11', name: 'Nguyễn Văn A', role: 'customer' }],
          },
          isRead: false,
          createdAt: '2026-10-21T09:00:00Z',
          updatedAt: '2026-10-21T09:00:00Z',
        },
      ],
      unreadCount: 2,
    }
    vi.mocked(postsApi.listNotifications).mockResolvedValue(initialList)

    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByTestId('notification-unread-badge')).toHaveTextContent('2')
    })

    const rolledUpNotif: NotificationItem = {
      id: 'n-rollup',
      recipientId: 'user-1',
      actorId: 'user-12',
      actorName: 'Trần Thị B',
      actorRole: 'customer',
      actorCount: 2,
      groupKey: 'post_reaction:post-100',
      category: 'post',
      notificationType: 'post_reaction',
      postId: 'post-100',
      commentId: null,
      reactionType: 'love',
      excerpt: '',
      metadata: {
        recentActors: [
          { id: 'user-12', name: 'Trần Thị B', role: 'customer' },
          { id: 'user-11', name: 'Nguyễn Văn A', role: 'customer' },
        ],
      },
      isRead: false,
      createdAt: '2026-10-21T09:00:00Z',
      updatedAt: '2026-10-21T09:20:00Z',
    }

    act(() => {
      mockOnNotificationCallback!(rolledUpNotif)
    })

    // Unread count must stay 2 (not incremented to 3)
    expect(screen.getByTestId('notification-unread-badge')).toHaveTextContent('2')

    // Open dropdown and verify n-rollup moved to the top and there are still only 2 items
    fireEvent.click(screen.getByTestId('notification-bell-button'))

    await waitFor(() => {
      const items = screen.getAllByTestId(/^notification-item-/)
      expect(items).toHaveLength(2)
      expect(items[0]).toHaveAttribute('data-testid', 'notification-item-n-rollup')
      expect(items[1]).toHaveAttribute('data-testid', 'notification-item-n-top')
      expect(items[0].textContent).toContain('Trần Thị B và Nguyễn Văn A')
    })
  })

  it('renders grouped actor names for 1, 2, and 3+ actors in Vietnamese (Req 6.6)', async () => {
    const groupedNotifications: NotificationListResult = {
      items: [
        {
          id: 'n-single',
          recipientId: 'user-1',
          actorId: 'u-1',
          actorName: 'Nguyễn Văn A',
          actorRole: 'customer',
          actorCount: 1,
          groupKey: 'post_reaction:post-1',
          category: 'post',
          notificationType: 'post_reaction',
          postId: 'post-1',
          commentId: null,
          reactionType: 'like',
          excerpt: '',
          metadata: {
            recentActors: [{ id: 'u-1', name: 'Nguyễn Văn A', role: 'customer' }],
          },
          isRead: false,
          createdAt: '2026-10-21T09:00:00Z',
          updatedAt: '2026-10-21T09:00:00Z',
        },
        {
          id: 'n-two',
          recipientId: 'user-1',
          actorId: 'u-2',
          actorName: 'Trần Thị B',
          actorRole: 'customer',
          actorCount: 2,
          groupKey: 'post_comment:post-1',
          category: 'post',
          notificationType: 'post_comment',
          postId: 'post-1',
          commentId: 'c-2',
          reactionType: null,
          excerpt: 'Hay quá shop',
          metadata: {
            recentActors: [
              { id: 'u-2', name: 'Trần Thị B', role: 'customer' },
              { id: 'u-1', name: 'Nguyễn Văn A', role: 'customer' },
            ],
          },
          isRead: false,
          createdAt: '2026-10-21T09:05:00Z',
          updatedAt: '2026-10-21T09:10:00Z',
        },
        {
          id: 'n-many',
          recipientId: 'user-1',
          actorId: 'u-3',
          actorName: 'Lê Văn C',
          actorRole: 'customer',
          actorCount: 5,
          groupKey: 'comment_reply:c-root',
          category: 'post',
          notificationType: 'comment_reply',
          postId: 'post-1',
          commentId: 'c-5',
          reactionType: null,
          excerpt: 'Đồng ý ạ',
          metadata: {
            recentActors: [
              { id: 'u-3', name: 'Lê Văn C', role: 'customer' },
              { id: 'u-2', name: 'Trần Thị B', role: 'customer' },
            ],
          },
          isRead: false,
          createdAt: '2026-10-21T09:15:00Z',
          updatedAt: '2026-10-21T09:30:00Z',
        },
      ],
      unreadCount: 3,
    }
    vi.mocked(postsApi.listNotifications).mockResolvedValue(groupedNotifications)

    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByTestId('notification-bell-button'))

    await waitFor(() => {
      const singleItem = screen.getByTestId('notification-item-n-single')
      const twoItem = screen.getByTestId('notification-item-n-two')
      const manyItem = screen.getByTestId('notification-item-n-many')

      expect(singleItem.textContent).toContain('Nguyễn Văn A đã bày tỏ cảm xúc')
      expect(twoItem.textContent).toContain('Trần Thị B và Nguyễn Văn A đã bình luận về bài viết:')
      expect(manyItem.textContent).toContain('Lê Văn C, Trần Thị B và 3 người khác đã trả lời bình luận của bạn:')
    })
  })

  it('resyncs notifications when WebSocket reconnects (Req 6.7)', async () => {
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(postsApi.listNotifications).toHaveBeenCalledTimes(1)
    })

    // Simulate socket reconnect
    expect(mockOnReconnectCallback).toBeDefined()
    act(() => {
      mockOnReconnectCallback!()
    })

    await waitFor(() => {
      expect(postsApi.listNotifications).toHaveBeenCalledTimes(2)
    })
  })

  it('removes unread notification and decrements unreadCount when receiving actorCount 0 retraction via WebSocket', async () => {
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByTestId('notification-unread-badge')).toHaveTextContent('1')
    })

    act(() => {
      mockOnNotificationCallback!({
        id: '',
        recipientId: 'user-1',
        actorId: null,
        actorName: null,
        actorRole: null,
        groupKey: 'post_reaction:post-100',
        actorCount: 0,
        category: 'post',
        notificationType: 'post_reaction',
        postId: 'post-100',
        commentId: null,
        reactionType: null,
        excerpt: '',
        metadata: {},
        isRead: false,
        createdAt: '2026-10-21T09:05:00Z',
      })
    })

    await waitFor(() => {
      expect(screen.queryByTestId('notification-unread-badge')).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('notification-bell-button'))
    await waitFor(() => {
      expect(screen.queryByTestId('notification-item-n-1')).not.toBeInTheDocument()
      expect(screen.getByTestId('notification-item-n-2')).toBeInTheDocument()
    })
  })
})
