import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import App from '../App'
import { authApi } from '@/api/auth'
import { tokenStore } from '@/api/tokenStore'
import { getDashboard, type DashboardData } from '@/api/dashboard'

vi.mock('@/api/posts', () => ({
  postsApi: {
    listNotifications: vi.fn().mockResolvedValue({ items: [], unreadCount: 0 }),
    listPosts: vi.fn().mockResolvedValue({ data: [], meta: { pagination: { total: 0 } } }),
  },
}))

vi.mock('@/api/auth', () => ({
  authApi: {
    login: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
    getMe: vi.fn(),
  },
}))

vi.mock('@/api/dashboard', () => ({
  getDashboard: vi.fn(),
}))

const mockDashboardData: DashboardData = {
  range: '7d',
  rangeStart: '2026-11-05T17:00:00Z',
  generatedAt: '2026-11-12T03:15:42Z',
  revenue: {
    deliveredVnd: '125990000',
    refundedVnd: '25990000',
    netVnd: '100000000',
    deliveredOrders: 5,
    averageOrderVnd: '25198000',
  },
  dailyRevenue: [
    { date: '2026-11-06', deliveredVnd: '0', refundedVnd: '0', netVnd: '0' },
  ],
  orders: {
    newInRange: 12,
    cancelledInRange: 1,
    byStatus: {
      pending_confirmation: 3,
      confirmed: 1,
      preparing: 2,
      shipped: 4,
      delivered: 40,
      cancel_requested: 1,
      cancelled: 6,
      partially_returned: 1,
      returned: 2,
    },
  },
  pendingWork: {
    pendingConfirmationOrders: 3,
    cancelRequestedOrders: 1,
    pendingApprovalReturns: 2,
    receivedReturns: 1,
    unrepliedReviews: 7,
    unreadConversations: 4,
  },
  topProducts: [
    {
      productId: 'prod-1',
      name: 'iPhone 16 Pro',
      brand: 'Apple',
      imageUrl: '',
      active: true,
      quantitySold: 9,
      revenueVnd: '233910000',
    },
  ],
  lowStock: {
    threshold: 5,
    total: 14,
    items: [],
  },
}

describe('App Shell', () => {
  const adminUser = { id: 'admin-1', email: 'admin@auraphone.vn', role: 'admin' }

  beforeEach(() => {
    vi.clearAllMocks()
    tokenStore.setToken('token-admin-123')
    window.history.pushState({}, '', '/')
    vi.mocked(authApi.getMe).mockResolvedValue(adminUser)
    vi.mocked(getDashboard).mockResolvedValue(mockDashboardData)
  })

  it('renders the admin dashboard shell with header and brand title', async () => {
    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('AuraPhone Admin')).toBeInTheDocument()
      expect(screen.getByText('Bảng điều khiển quản trị hệ thống AuraPhone')).toBeInTheDocument()
    })
  })

  it('renders sidebar navigation links', async () => {
    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Tổng quan/i })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /Bài viết/i })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /Sản phẩm/i })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /Tin nhắn hỗ trợ/i })).toBeInTheDocument()
      expect(screen.getByText(/Người dùng/i)).toBeInTheDocument()
    })
  })

  it('renders notification bell in header', async () => {
    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /thông báo/i })).toBeInTheDocument()
    })
  })

  it('renders posts page when navigating to /posts', async () => {
    window.history.pushState({}, '', '/posts')
    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /quản lý bài viết/i })).toBeInTheDocument()
    })
  })

  it('renders dashboard components (Cards, Badges, Buttons)', async () => {
    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Tổng quan kinh doanh')).toBeInTheDocument()
      expect(screen.getByText('Doanh thu đã giao')).toBeInTheDocument()
      expect(screen.getByText('Việc cần xử lý')).toBeInTheDocument()
    })

    const actionButton = screen.getByRole('button', { name: /Làm mới/i })
    expect(actionButton).toBeInTheDocument()
  })

  it('handles user interaction on the action button', async () => {
    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Làm mới/i })).toBeInTheDocument()
      expect(getDashboard).toHaveBeenCalledTimes(1)
    })

    const actionButton = screen.getByRole('button', { name: /Làm mới/i })
    fireEvent.click(actionButton)
    await waitFor(() => {
      expect(getDashboard).toHaveBeenCalledTimes(2)
    })
  })

  it('renders product form page when navigating to /products/new', async () => {
    window.history.pushState({}, '', '/products/new')
    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /thêm sản phẩm mới/i })).toBeInTheDocument()
      expect(screen.getByLabelText(/tên sản phẩm/i)).toBeInTheDocument()
    })
  })
})
