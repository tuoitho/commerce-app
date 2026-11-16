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

  it('renders 4 admin category tabs, preserves global unreadCount across tab switches, handles cross-tab WS events without double counting, and deep-links order/return notifications', async () => {
    const allItems: NotificationItem[] = [
      {
        id: 'adm-ord-1',
        recipientId: 'admin-1',
        actorId: 'u-1',
        actorName: 'Nguyễn Minh Anh',
        actorRole: 'customer',
        actorCount: 1,
        groupKey: '',
        category: 'order',
        notificationType: 'admin_order_created',
        postId: null,
        commentId: null,
        reactionType: null,
        excerpt: 'Đơn hàng mới #AAAA1111',
        metadata: {
          orderId: 'order-uuid-1',
          orderShortCode: '#AAAA1111',
          targetPath: '/orders/order-uuid-1',
        },
        isRead: false,
        createdAt: '2026-11-15T10:00:00Z',
        updatedAt: '2026-11-15T10:00:00Z',
      },
      {
        id: 'adm-ret-1',
        recipientId: 'admin-1',
        actorId: 'u-2',
        actorName: 'Trần Gia Bảo',
        actorRole: 'customer',
        actorCount: 1,
        groupKey: '',
        category: 'return',
        notificationType: 'admin_return_created',
        postId: null,
        commentId: null,
        reactionType: null,
        excerpt: 'Yêu cầu trả hàng mới cho đơn #BBBB2222',
        metadata: {
          orderId: 'order-uuid-2',
          orderShortCode: '#BBBB2222',
          returnId: 'return-uuid-1',
          targetPath: '/returns/return-uuid-1',
        },
        isRead: false,
        createdAt: '2026-11-15T09:50:00Z',
        updatedAt: '2026-11-15T09:50:00Z',
      },
    ]

    let serverItems: NotificationItem[] = [...allItems]

    vi.mocked(postsApi.listNotifications).mockImplementation(async (params = {}) => {
      const unreadCount = serverItems.filter((item) => !item.isRead).length
      if (params.category && params.category !== 'all') {
        return {
          items: serverItems.filter((item) => item.category === params.category),
          unreadCount,
        }
      }
      return { items: serverItems, unreadCount }
    })
    vi.mocked(postsApi.markNotificationRead).mockImplementation(async (id: string) => {
      serverItems = serverItems.map((item) =>
        item.id === id ? { ...item, isRead: true } : item
      )
      return {
        id,
        isRead: true,
        unreadCount: serverItems.filter((item) => !item.isRead).length,
      }
    })

    render(
      <MemoryRouter>
        <AdminNotificationBell />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByTestId('notification-unread-badge')).toHaveTextContent('2')
    })

    fireEvent.click(screen.getByTestId('notification-bell-button'))

    expect(screen.getByTestId('notification-tab-all')).toHaveTextContent('Tất cả')
    expect(screen.getByTestId('notification-tab-order')).toHaveTextContent('Đơn hàng')
    expect(screen.getByTestId('notification-tab-return')).toHaveTextContent('Trả hàng')
    expect(screen.getByTestId('notification-tab-post')).toHaveTextContent('Bài viết')

    await waitFor(() => {
      const first = screen.getByTestId('notification-item-adm-ord-1')
      expect(first.textContent).toContain('Nguyễn Minh Anh')
      expect(first.textContent).toContain('#AAAA1111')
    })

    // Switch to Post tab (empty), global unreadCount must stay 2
    fireEvent.click(screen.getByTestId('notification-tab-post'))
    await waitFor(() => {
      expect(postsApi.listNotifications).toHaveBeenCalledWith({ limit: 30, category: 'post' })
      expect(screen.getByText('Không có thông báo trong danh mục này')).toBeInTheDocument()
      expect(screen.getByTestId('notification-unread-badge')).toHaveTextContent('2')
    })

    // WS event for another category while on 'post' increments unreadCount without injecting into post tab
    const cancelReqNotif: NotificationItem = {
      id: 'adm-ord-cancel-req',
      recipientId: 'admin-1',
      actorId: 'u-3',
      actorName: 'Lê Thu Hà',
      actorRole: 'customer',
      actorCount: 1,
      groupKey: '',
      category: 'order',
      notificationType: 'admin_order_cancel_requested',
      postId: null,
      commentId: null,
      reactionType: null,
      excerpt: 'Yêu cầu hủy đơn hàng #CCCC3333',
      metadata: {
        orderId: 'order-uuid-3',
        orderShortCode: '#CCCC3333',
        targetPath: '/orders/order-uuid-3',
      },
      isRead: false,
      createdAt: '2026-11-15T10:05:00Z',
      updatedAt: '2026-11-15T10:05:00Z',
    }
    act(() => {
      serverItems = [cancelReqNotif, ...serverItems]
      socketCallbacks.onNotification!(cancelReqNotif)
      // Duplicate push of same unread notification must not double count
      socketCallbacks.onNotification!(cancelReqNotif)
    })

    await waitFor(() => {
      expect(screen.getByTestId('notification-unread-badge')).toHaveTextContent('3')
    })
    expect(screen.queryByTestId('notification-item-adm-ord-cancel-req')).not.toBeInTheDocument()

    // Switch to Order tab and receive admin_order_cancelled in realtime
    fireEvent.click(screen.getByTestId('notification-tab-order'))
    await waitFor(() => {
      expect(postsApi.listNotifications).toHaveBeenCalledWith({ limit: 30, category: 'order' })
      expect(screen.getByTestId('notification-item-adm-ord-1')).toBeInTheDocument()
    })

    const cancelledNotif: NotificationItem = {
      id: 'adm-ord-cancelled',
      recipientId: 'admin-1',
      actorId: 'u-4',
      actorName: 'Phạm Quốc Huy',
      actorRole: 'customer',
      actorCount: 1,
      groupKey: '',
      category: 'order',
      notificationType: 'admin_order_cancelled',
      postId: null,
      commentId: null,
      reactionType: null,
      excerpt: 'Đã hủy đơn hàng #DDDD4444',
      metadata: {
        orderId: 'order-uuid-4',
        orderShortCode: '#DDDD4444',
        targetPath: '/orders/order-uuid-4',
      },
      isRead: false,
      createdAt: '2026-11-15T10:06:00Z',
      updatedAt: '2026-11-15T10:06:00Z',
    }
    act(() => {
      serverItems = [cancelledNotif, ...serverItems]
      socketCallbacks.onNotification!(cancelledNotif)
    })

    await waitFor(() => {
      expect(screen.getByTestId('notification-unread-badge')).toHaveTextContent('4')
      const item = screen.getByTestId('notification-item-adm-ord-cancelled')
      expect(item.textContent).toContain('Phạm Quốc Huy')
      expect(item.textContent).toContain('#DDDD4444')
    })

    // Click order notification -> markNotificationRead + navigate to /orders/:id
    fireEvent.click(screen.getByTestId('notification-item-adm-ord-1'))
    await waitFor(() => {
      expect(postsApi.markNotificationRead).toHaveBeenCalledWith('adm-ord-1')
      expect(mockNavigate).toHaveBeenCalledWith('/orders/order-uuid-1')
    })

    // Reopen, switch to Return tab, click return notification -> navigate to /returns/:id
    fireEvent.click(screen.getByTestId('notification-bell-button'))
    fireEvent.click(screen.getByTestId('notification-tab-return'))
    await waitFor(() => {
      const retItem = screen.getByTestId('notification-item-adm-ret-1')
      expect(retItem.textContent).toContain('Trần Gia Bảo')
      expect(retItem.textContent).toContain('#BBBB2222')
    })

    fireEvent.click(screen.getByTestId('notification-item-adm-ret-1'))
    await waitFor(() => {
      expect(postsApi.markNotificationRead).toHaveBeenCalledWith('adm-ret-1')
      expect(mockNavigate).toHaveBeenCalledWith('/returns/return-uuid-1')
    })
  })

  it('clears previous category items on tab switch, handles fast out-of-order responses, shows error retry state, and supports cross-tab retraction', async () => {
    const initialPost: NotificationItem = {
      id: 'adm-post-1',
      recipientId: 'admin-1',
      actorId: 'u-9',
      actorName: 'Khách Post',
      actorRole: 'customer',
      actorCount: 1,
      groupKey: 'post_reaction:p9',
      category: 'post',
      notificationType: 'post_reaction',
      postId: 'p9',
      commentId: null,
      reactionType: 'love',
      excerpt: '',
      metadata: {},
      isRead: false,
      createdAt: '2026-11-15T09:00:00Z',
    }
    const returnItem: NotificationItem = {
      id: 'adm-ret-fast',
      recipientId: 'admin-1',
      actorId: 'u-10',
      actorName: 'Khách Trả Hàng',
      actorRole: 'customer',
      actorCount: 1,
      groupKey: '',
      category: 'return',
      notificationType: 'admin_return_created',
      postId: null,
      commentId: null,
      reactionType: null,
      excerpt: 'Yêu cầu trả hàng #EEEE5555',
      metadata: {
        orderId: 'o-5',
        orderShortCode: '#EEEE5555',
        returnId: 'r-5',
        targetPath: '/returns/r-5',
      },
      isRead: false,
      createdAt: '2026-11-15T10:00:00Z',
    }

    let resolveOrderPromise!: (value: { items: NotificationItem[]; unreadCount: number }) => void
    let resolveReturnPromise!: (value: { items: NotificationItem[]; unreadCount: number }) => void

    vi.mocked(postsApi.listNotifications).mockImplementation((params = {}) => {
      if (params.category === 'order') {
        return new Promise((resolve) => {
          resolveOrderPromise = resolve
        })
      }
      if (params.category === 'return') {
        return new Promise((resolve) => {
          resolveReturnPromise = resolve
        })
      }
      if (params.category === 'post') {
        return Promise.reject(new Error('failed'))
      }
      return Promise.resolve({ items: [initialPost], unreadCount: 2 })
    })

    render(
      <MemoryRouter>
        <AdminNotificationBell />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByTestId('notification-unread-badge')).toHaveTextContent('2')
    })

    fireEvent.click(screen.getByTestId('notification-bell-button'))
    await waitFor(() => {
      expect(screen.getByTestId('notification-item-adm-post-1')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('notification-tab-order'))
    expect(screen.queryByTestId('notification-item-adm-post-1')).not.toBeInTheDocument()
    expect(screen.getByText('Đang tải thông báo...')).toBeInTheDocument()

    // Switch immediately to Return tab while Order is still in flight
    fireEvent.click(screen.getByTestId('notification-tab-return'))
    expect(screen.getByText('Đang tải thông báo...')).toBeInTheDocument()

    // Late Order response must NOT clear loading state or render stale order item
    await act(async () => {
      resolveOrderPromise({
        items: [
          {
            ...returnItem,
            id: 'adm-ord-stale',
            category: 'order',
            notificationType: 'admin_order_created',
          },
        ],
        unreadCount: 2,
      })
      await Promise.resolve()
    })
    expect(screen.getByText('Đang tải thông báo...')).toBeInTheDocument()
    expect(screen.queryByTestId('notification-item-adm-ord-stale')).not.toBeInTheDocument()

    await act(async () => {
      resolveReturnPromise({ items: [returnItem], unreadCount: 2 })
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(screen.getByTestId('notification-item-adm-ret-fast')).toBeInTheDocument()
    })

    // Cross-tab retraction of hidden post item decrements unreadCount (2 -> 1)
    act(() => {
      socketCallbacks.onNotification!({
        ...initialPost,
        actorCount: 0,
      })
    })
    expect(screen.getByTestId('notification-unread-badge')).toHaveTextContent('1')

    // Failed fetch clears old tab and offers retry button
    fireEvent.click(screen.getByTestId('notification-tab-post'))
    await waitFor(() => {
      expect(screen.queryByTestId('notification-item-adm-ret-fast')).not.toBeInTheDocument()
      expect(screen.getByText('Không thể tải danh sách thông báo')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument()
    })
  })
})
