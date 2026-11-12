import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AdminNotificationBell } from './AdminNotificationBell'
import { postsApi, type NotificationItem } from '@/api/posts'
import * as AuthContextModule from '@/context/AuthContext'

vi.mock('@/api/posts', () => ({
  postsApi: {
    listNotifications: vi.fn(),
    markNotificationRead: vi.fn(),
    markAllNotificationsRead: vi.fn(),
  },
}))

let socketCallbacks: {
  onNotification?: (notif: NotificationItem) => void
  onReconnect?: () => void
} = {}

vi.mock('@/hooks/useAdminChatSocket', () => ({
  useAdminChatSocket: vi.fn((options) => {
    socketCallbacks = options
    return {
      isConnected: true,
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

describe('AdminNotificationBell', () => {
  const mockUser = { id: 'admin-1', email: 'admin@auraphone.vn', role: 'admin' as const }

  beforeEach(() => {
    vi.restoreAllMocks()
    mockNavigate.mockReset()
    socketCallbacks = {}
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockUser,
      role: 'admin',
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
      isLoading: false,
    })
  })

  it('renders bell button and displays unread badge when unreadCount > 0', async () => {
    vi.mocked(postsApi.listNotifications).mockResolvedValue({
      items: [
        {
          id: 'n1',
          recipientId: 'admin-1',
          actorId: 'u1',
          actorName: 'Khách hàng A',
          actorRole: 'customer',
          category: 'post',
          notificationType: 'post_reaction',
          postId: 'p1',
          commentId: null,
          reactionType: 'love',
          excerpt: 'Bài viết test',
          metadata: {},
          isRead: false,
          createdAt: '2026-10-21T09:00:00Z',
        },
      ],
      unreadCount: 1,
    })

    render(
      <MemoryRouter>
        <AdminNotificationBell />
      </MemoryRouter>
    )

    const button = screen.getByRole('button', { name: /thông báo/i })
    expect(button).toBeInTheDocument()

    await waitFor(() => {
      const badge = screen.getByTestId('notification-unread-badge')
      expect(badge).toHaveTextContent('1')
    })
  })

  it('opens dropdown panel on click and displays notifications list', async () => {
    vi.mocked(postsApi.listNotifications).mockResolvedValue({
      items: [
        {
          id: 'n1',
          recipientId: 'admin-1',
          actorId: 'u1',
          actorName: 'Khách hàng A',
          actorRole: 'customer',
          category: 'post',
          notificationType: 'post_comment',
          postId: 'p1',
          commentId: 'c1',
          reactionType: null,
          excerpt: 'Sản phẩm này tuyệt vời',
          metadata: {},
          isRead: false,
          createdAt: '2026-10-21T09:00:00Z',
        },
      ],
      unreadCount: 1,
    })

    render(
      <MemoryRouter>
        <AdminNotificationBell />
      </MemoryRouter>
    )

    const bellBtn = screen.getByRole('button', { name: /thông báo/i })
    fireEvent.click(bellBtn)

    await waitFor(() => {
      expect(screen.getByTestId('notifications-dropdown-panel')).toBeInTheDocument()
      expect(screen.getByText('Khách hàng A')).toBeInTheDocument()
      expect(screen.getByText(/"Sản phẩm này tuyệt vời"/)).toBeInTheDocument()
    })
  })

  it('displays empty state when there are no notifications', async () => {
    vi.mocked(postsApi.listNotifications).mockResolvedValue({
      items: [],
      unreadCount: 0,
    })

    render(
      <MemoryRouter>
        <AdminNotificationBell />
      </MemoryRouter>
    )

    const bellBtn = screen.getByRole('button', { name: /thông báo/i })
    fireEvent.click(bellBtn)

    await waitFor(() => {
      expect(screen.getByText('Bạn chưa có thông báo nào')).toBeInTheDocument()
    })
  })

  it('marks all as read when clicking "Đã đọc tất cả"', async () => {
    vi.mocked(postsApi.listNotifications).mockResolvedValue({
      items: [
        {
          id: 'n1',
          recipientId: 'admin-1',
          actorId: 'u1',
          actorName: 'Khách A',
          actorRole: 'customer',
          category: 'post',
          notificationType: 'post_reaction',
          postId: 'p1',
          commentId: null,
          reactionType: 'like',
          excerpt: '',
          metadata: {},
          isRead: false,
          createdAt: '2026-10-21T09:00:00Z',
        },
      ],
      unreadCount: 1,
    })
    vi.mocked(postsApi.markAllNotificationsRead).mockResolvedValue({ unreadCount: 0 })

    render(
      <MemoryRouter>
        <AdminNotificationBell />
      </MemoryRouter>
    )

    const bellBtn = screen.getByRole('button', { name: /thông báo/i })
    fireEvent.click(bellBtn)

    await waitFor(() => {
      expect(screen.getByTestId('mark-all-read-button')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('mark-all-read-button'))

    await waitFor(() => {
      expect(postsApi.markAllNotificationsRead).toHaveBeenCalledTimes(1)
      expect(screen.queryByTestId('notification-unread-badge')).not.toBeInTheDocument()
    })
  })

  it('navigates to post with commentId and focusTs when clicking comment notification', async () => {
    vi.mocked(postsApi.listNotifications).mockResolvedValue({
      items: [
        {
          id: 'n1',
          recipientId: 'admin-1',
          actorId: 'u1',
          actorName: 'Khách hàng A',
          actorRole: 'customer',
          category: 'post',
          notificationType: 'comment_reply',
          postId: 'post-100',
          commentId: 'comment-200',
          reactionType: null,
          excerpt: 'Em cần tư vấn',
          metadata: {},
          isRead: false,
          createdAt: '2026-10-21T09:00:00Z',
        },
      ],
      unreadCount: 1,
    })
    vi.mocked(postsApi.markNotificationRead).mockResolvedValue({
      id: 'n1',
      isRead: true,
      unreadCount: 0,
    })

    render(
      <MemoryRouter>
        <AdminNotificationBell />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('button', { name: /thông báo/i }))

    await waitFor(() => {
      expect(screen.getByTestId('notification-item-n1')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('notification-item-n1'))

    await waitFor(() => {
      expect(postsApi.markNotificationRead).toHaveBeenCalledWith('n1')
      expect(mockNavigate).toHaveBeenCalledTimes(1)
      const targetUrl = mockNavigate.mock.calls[0][0] as string
      expect(targetUrl).toContain('/posts/post-100?commentId=comment-200&focusTs=')
    })
  })

  it('navigates to post with focus=post and focusTs when clicking post reaction notification', async () => {
    vi.mocked(postsApi.listNotifications).mockResolvedValue({
      items: [
        {
          id: 'n2',
          recipientId: 'admin-1',
          actorId: 'u1',
          actorName: 'Khách hàng B',
          actorRole: 'customer',
          category: 'post',
          notificationType: 'post_reaction',
          postId: 'post-555',
          commentId: null,
          reactionType: 'love',
          excerpt: '',
          metadata: {},
          isRead: false,
          createdAt: '2026-10-21T09:00:00Z',
        },
      ],
      unreadCount: 1,
    })
    vi.mocked(postsApi.markNotificationRead).mockResolvedValue({
      id: 'n2',
      isRead: true,
      unreadCount: 0,
    })

    render(
      <MemoryRouter>
        <AdminNotificationBell />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('button', { name: /thông báo/i }))

    await waitFor(() => {
      expect(screen.getByTestId('notification-item-n2')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('notification-item-n2'))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledTimes(1)
      const targetUrl = mockNavigate.mock.calls[0][0] as string
      expect(targetUrl).toContain('/posts/post-555?focus=post&focusTs=')
    })
  })

  it('receives realtime notification via useAdminChatSocket onNotification and updates count', async () => {
    vi.mocked(postsApi.listNotifications).mockResolvedValue({
      items: [],
      unreadCount: 0,
    })

    render(
      <MemoryRouter>
        <AdminNotificationBell />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.queryByTestId('notification-unread-badge')).not.toBeInTheDocument()
    })

    // Simulate realtime notification from WebSocket
    const realtimeNotif: NotificationItem = {
      id: 'notif-rt-1',
      recipientId: 'admin-1',
      actorId: 'u9',
      actorName: 'Khách VIP',
      actorRole: 'customer',
      category: 'post',
      notificationType: 'post_reaction',
      postId: 'post-vip',
      commentId: null,
      reactionType: 'haha',
      excerpt: '',
      metadata: {},
      isRead: false,
      createdAt: '2026-10-21T09:30:00Z',
    }

    expect(socketCallbacks.onNotification).toBeDefined()
    act(() => {
      socketCallbacks.onNotification!(realtimeNotif)
    })

    await waitFor(() => {
      const badge = screen.getByTestId('notification-unread-badge')
      expect(badge).toHaveTextContent('1')
    })
  })

  it('replaces existing unread notification and moves it to top without incrementing unreadCount on WebSocket notification:new with same id', async () => {
    vi.mocked(postsApi.listNotifications).mockResolvedValue({
      items: [
        {
          id: 'n-top',
          recipientId: 'admin-1',
          actorId: 'u-10',
          actorName: 'Khách Đầu',
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
          recipientId: 'admin-1',
          actorId: 'u-11',
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
            recentActors: [{ id: 'u-11', name: 'Nguyễn Văn A', role: 'customer' }],
          },
          isRead: false,
          createdAt: '2026-10-21T09:00:00Z',
          updatedAt: '2026-10-21T09:00:00Z',
        },
      ],
      unreadCount: 2,
    })

    render(
      <MemoryRouter>
        <AdminNotificationBell />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByTestId('notification-unread-badge')).toHaveTextContent('2')
    })

    const rolledUpNotif: NotificationItem = {
      id: 'n-rollup',
      recipientId: 'admin-1',
      actorId: 'u-12',
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
          { id: 'u-12', name: 'Trần Thị B', role: 'customer' },
          { id: 'u-11', name: 'Nguyễn Văn A', role: 'customer' },
        ],
      },
      isRead: false,
      createdAt: '2026-10-21T09:00:00Z',
      updatedAt: '2026-10-21T09:20:00Z',
    }

    expect(socketCallbacks.onNotification).toBeDefined()
    act(() => {
      socketCallbacks.onNotification!(rolledUpNotif)
    })

    expect(screen.getByTestId('notification-unread-badge')).toHaveTextContent('2')

    fireEvent.click(screen.getByTestId('notification-bell-button'))

    await waitFor(() => {
      const items = screen.getAllByTestId(/^notification-item-/)
      expect(items).toHaveLength(2)
      expect(items[0]).toHaveAttribute('data-testid', 'notification-item-n-rollup')
      expect(items[1]).toHaveAttribute('data-testid', 'notification-item-n-top')
      expect(items[0].textContent).toContain('Trần Thị B và Nguyễn Văn A')
    })
  })

  it('renders grouped actor names for 1, 2, and 3+ actors in Vietnamese', async () => {
    vi.mocked(postsApi.listNotifications).mockResolvedValue({
      items: [
        {
          id: 'n-single',
          recipientId: 'admin-1',
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
          recipientId: 'admin-1',
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
          recipientId: 'admin-1',
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
    })

    render(
      <MemoryRouter>
        <AdminNotificationBell />
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

  it('removes unread notification and decrements unreadCount when receiving actorCount 0 retraction via WebSocket', async () => {
    vi.mocked(postsApi.listNotifications).mockResolvedValue({
      items: [
        {
          id: 'n1',
          recipientId: 'admin-1',
          actorId: 'u1',
          actorName: 'Khách hàng A',
          actorRole: 'customer',
          groupKey: 'post_reaction:p1',
          actorCount: 1,
          category: 'post',
          notificationType: 'post_reaction',
          postId: 'p1',
          commentId: null,
          reactionType: 'love',
          excerpt: 'Bài viết test',
          metadata: {},
          isRead: false,
          createdAt: '2026-10-21T09:00:00Z',
        },
      ],
      unreadCount: 1,
    })

    render(
      <MemoryRouter>
        <AdminNotificationBell />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByTestId('notification-unread-badge')).toHaveTextContent('1')
    })

    act(() => {
      socketCallbacks.onNotification!({
        id: '',
        recipientId: 'admin-1',
        actorId: null,
        actorName: null,
        actorRole: null,
        groupKey: 'post_reaction:p1',
        actorCount: 0,
        category: 'post',
        notificationType: 'post_reaction',
        postId: 'p1',
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
      expect(screen.getByText('Bạn chưa có thông báo nào')).toBeInTheDocument()
    })
  })
})
