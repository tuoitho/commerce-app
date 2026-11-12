import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DashboardPage } from './DashboardPage'
import * as dashboardApi from '@/api/dashboard'
import type { DashboardData } from '@/api/dashboard'

vi.mock('@/api/dashboard', async () => {
  const actual = await vi.importActual<typeof import('@/api/dashboard')>('@/api/dashboard')
  return {
    ...actual,
    getDashboard: vi.fn(),
  }
})

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}{location.search}</output>
}

const mockDefaultDashboardData: DashboardData = {
  range: '7d',
  rangeStart: '2026-11-05T17:00:00Z',
  generatedAt: '2026-11-12T03:15:42Z',
  revenue: {
    deliveredVnd: '9007199254740993', // Exceeds Number.MAX_SAFE_INTEGER
    refundedVnd: '25990000',
    netVnd: '-25990000', // Negative revenue
    deliveredOrders: 5,
    averageOrderVnd: '25198000',
  },
  dailyRevenue: [
    { date: '2026-11-06', deliveredVnd: '0', refundedVnd: '0', netVnd: '0' },
    { date: '2026-11-07', deliveredVnd: '0', refundedVnd: '0', netVnd: '0' },
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
    cancelRequestedOrders: 0, // neutral state (0)
    pendingApprovalReturns: 2,
    receivedReturns: 1,
    unrepliedReviews: 7,
    unreadConversations: 4,
  },
  topProducts: [
    {
      productId: 'prod-active-1',
      name: 'iPhone 16 Pro',
      brand: 'Apple',
      imageUrl: 'https://example.com/iphone16.jpg',
      active: true,
      quantitySold: 9,
      revenueVnd: '233910000',
    },
    {
      productId: 'prod-inactive-2',
      name: 'iPhone 14 Pro Cũ',
      brand: 'Apple',
      imageUrl: '',
      active: false,
      quantitySold: 3,
      revenueVnd: '60000000',
    },
  ],
  lowStock: {
    threshold: 5,
    total: 14,
    items: [
      {
        variantId: 'var-1',
        productId: 'prod-low-1',
        productName: 'iPhone 16 Pro Max',
        options: [{ groupLabel: 'Dung lượng', valueLabel: '256GB' }],
        stockQuantity: 0, // out of stock
      },
      {
        variantId: 'var-2',
        productId: 'prod-low-2',
        productName: 'Samsung Galaxy S24',
        options: [
          { groupLabel: 'Màu', valueLabel: 'Đen' },
          { groupLabel: 'Bộ nhớ', valueLabel: '128GB' },
        ],
        stockQuantity: 3,
      },
    ],
  },
}

function renderDashboardPage(initialEntries = ['/']) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route
            path="/"
            element={
              <>
                <DashboardPage />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders default range 7d, loads dashboard data, and formats big & negative money correctly', async () => {
    vi.mocked(dashboardApi.getDashboard).mockResolvedValueOnce(mockDefaultDashboardData)

    renderDashboardPage()

    // Skeletons during loading
    expect(screen.getByTestId('dashboard-skeleton')).toBeInTheDocument()

    // Wait for skeleton to disappear and data to render
    await waitFor(() => {
      expect(screen.queryByTestId('dashboard-skeleton')).not.toBeInTheDocument()
    })

    expect(dashboardApi.getDashboard).toHaveBeenCalledWith('7d')

    // Generated at timestamp in VN timezone: 03:15 UTC -> 10:15 VN time
    expect(screen.getByText(/10:15 12\/11\/2026/)).toBeInTheDocument()

    // Old placeholder content is NOT present
    expect(screen.queryByText('Thống kê nhanh')).not.toBeInTheDocument()
    expect(screen.queryByText('Hệ thống')).not.toBeInTheDocument()
    expect(screen.queryByText(/Làm mới dữ liệu/)).not.toBeInTheDocument()

    // Revenue metrics (Req 3.1 - 3.4)
    expect(screen.getByText('Doanh thu đã giao')).toBeInTheDocument()
    expect(screen.getByText('Đã hoàn tiền')).toBeInTheDocument()
    expect(screen.getByText('Doanh thu thuần')).toBeInTheDocument()
    expect(screen.getByText('Số đơn đã giao')).toBeInTheDocument()
    expect(screen.getByText('Giá trị đơn trung bình')).toBeInTheDocument()

    // Check large number > Number.MAX_SAFE_INTEGER formatted exactly
    expect(screen.getByText(/9\.007\.199\.254\.740\.993/)).toBeInTheDocument()
    // Check negative revenue formatted with leading minus sign
    expect(screen.getByText(/-25\.990\.000/)).toBeInTheDocument()

    // Orders summary (Req 5.1)
    expect(screen.getByTestId('orders-new-in-range')).toHaveTextContent('Đơn mới:12')
    expect(screen.getByTestId('orders-cancelled-in-range')).toHaveTextContent('Đơn bị hủy:1')
  })

  it('renders all 9 order statuses with exact href targets (Req 5.2, 5.3)', async () => {
    vi.mocked(dashboardApi.getDashboard).mockResolvedValueOnce(mockDefaultDashboardData)

    renderDashboardPage()

    await waitFor(() => {
      expect(screen.queryByTestId('dashboard-skeleton')).not.toBeInTheDocument()
    })

    expect(screen.getByText('Chờ xác nhận')).toBeInTheDocument()

    const expectedStatuses: Array<{ status: string; label: string }> = [
      { status: 'pending_confirmation', label: 'Chờ xác nhận' },
      { status: 'confirmed', label: 'Đã xác nhận' },
      { status: 'preparing', label: 'Đang chuẩn bị hàng' },
      { status: 'cancel_requested', label: 'Chờ duyệt hủy' },
      { status: 'shipped', label: 'Đã giao cho ĐVVC' },
      { status: 'delivered', label: 'Đã giao' },
      { status: 'cancelled', label: 'Đã hủy' },
      { status: 'partially_returned', label: 'Trả hàng một phần' },
      { status: 'returned', label: 'Đã trả hàng' },
    ]

    for (const item of expectedStatuses) {
      const link = screen.getByTestId(`order-status-${item.status}`)
      expect(link.getAttribute('href')).toBe(`/orders?status=${item.status}`)
    }
  })

  it('renders 6 pending work items with exact href targets and visual highlights (Req 6.1, 6.5)', async () => {
    vi.mocked(dashboardApi.getDashboard).mockResolvedValueOnce(mockDefaultDashboardData)

    renderDashboardPage()

    await waitFor(() => {
      expect(screen.queryByTestId('dashboard-skeleton')).not.toBeInTheDocument()
    })

    expect(screen.getByText('Việc cần xử lý')).toBeInTheDocument()

    const expectedPending: Array<{ id: string; target: string }> = [
      { id: 'pending-confirmation', target: '/orders?status=pending_confirmation' },
      { id: 'cancel-requested', target: '/orders?status=cancel_requested' },
      { id: 'pending-approval-returns', target: '/returns?status=pending_approval' },
      { id: 'received-returns', target: '/returns?status=received' },
      { id: 'unreplied-reviews', target: '/reviews?has_reply=no' },
      { id: 'unread-conversations', target: '/chat?filter=unread' },
    ]

    for (const item of expectedPending) {
      const link = screen.getByTestId(`pending-work-${item.id}`)
      expect(link.getAttribute('href')).toBe(item.target)
    }

    // cancelRequestedOrders has count 0 -> neutral state
    const neutralItem = screen.getByTestId('pending-work-cancel-requested')
    expect(neutralItem.getAttribute('data-highlighted')).toBe('false')

    // pendingConfirmationOrders has count 3 -> highlighted state
    const highlightedItem = screen.getByTestId('pending-work-pending-confirmation')
    expect(highlightedItem.getAttribute('data-highlighted')).toBe('true')
  })

  it('renders top products and handles active link vs inactive non-link (Req 7.1 - 7.6)', async () => {
    vi.mocked(dashboardApi.getDashboard).mockResolvedValueOnce(mockDefaultDashboardData)

    renderDashboardPage()

    await waitFor(() => {
      expect(screen.queryByTestId('dashboard-skeleton')).not.toBeInTheDocument()
    })

    expect(screen.getByText('Sản phẩm bán chạy')).toBeInTheDocument()

    // Active product has link to /products/prod-active-1
    const activeLink = screen.getByTestId('top-product-prod-active-1')
    expect(activeLink.tagName.toLowerCase()).toBe('a')
    expect(activeLink.getAttribute('href')).toBe('/products/prod-active-1')
    expect(within(activeLink).getByText('iPhone 16 Pro')).toBeInTheDocument()
    expect(within(activeLink).getByText('Apple')).toBeInTheDocument()

    // Inactive product has "Đã ngừng bán" badge and is NOT a link
    const inactiveItem = screen.getByTestId('top-product-prod-inactive-2')
    expect(inactiveItem.tagName.toLowerCase()).not.toBe('a')
    expect(screen.getByText('Đã ngừng bán')).toBeInTheDocument()
    expect(inactiveItem.querySelector('a')).toBeNull()
  })

  it('renders low stock items with exact link and "Hết hàng" badge when stock is 0 (Req 8.1 - 8.3)', async () => {
    vi.mocked(dashboardApi.getDashboard).mockResolvedValueOnce(mockDefaultDashboardData)

    renderDashboardPage()

    await waitFor(() => {
      expect(screen.queryByTestId('dashboard-skeleton')).not.toBeInTheDocument()
    })

    expect(screen.getByText(/Biến thể sắp hết hàng/)).toBeInTheDocument()

    // Links to /products/:id
    const lowStockLink1 = screen.getByTestId('low-stock-var-1')
    expect(lowStockLink1.getAttribute('href')).toBe('/products/prod-low-1')
    expect(screen.getByText('Hết hàng')).toBeInTheDocument()

    const lowStockLink2 = screen.getByTestId('low-stock-var-2')
    expect(lowStockLink2.getAttribute('href')).toBe('/products/prod-low-2')
    expect(screen.getByText('Samsung Galaxy S24')).toBeInTheDocument()
  })

  it('switches range and updates URL query param without reload, keeping previous data in-flight (Req 2.2, 2.3, 9.1)', async () => {
    vi.mocked(dashboardApi.getDashboard).mockResolvedValueOnce(mockDefaultDashboardData)

    // Prepare deferred promise for second call (range switch)
    let resolveSecond!: (data: DashboardData) => void
    const secondPromise = new Promise<DashboardData>((resolve) => {
      resolveSecond = resolve
    })
    vi.mocked(dashboardApi.getDashboard).mockReturnValueOnce(secondPromise)

    renderDashboardPage()

    await waitFor(() => {
      expect(screen.queryByTestId('dashboard-skeleton')).not.toBeInTheDocument()
    })

    expect(dashboardApi.getDashboard).toHaveBeenCalledWith('7d')
    expect(screen.getByText(/9\.007\.199\.254\.740\.993/)).toBeInTheDocument()

    const todayButton = screen.getByRole('button', { name: 'Hôm nay' })
    fireEvent.click(todayButton)

    // While in-flight:
    // 1. Old revenue text is still visible
    expect(screen.getByText(/9\.007\.199\.254\.740\.993/)).toBeInTheDocument()
    // 2. Loading indicator "Đang cập nhật..." is present
    await waitFor(() => {
      expect(screen.getByText(/Đang cập nhật\.\.\./)).toBeInTheDocument()
    })
    // 3. dashboard-skeleton is absent
    expect(screen.queryByTestId('dashboard-skeleton')).not.toBeInTheDocument()

    // Resolve second fetch with today's data
    const todayData: DashboardData = {
      ...mockDefaultDashboardData,
      range: 'today',
      revenue: {
        ...mockDefaultDashboardData.revenue,
        deliveredVnd: '50000000',
      },
    }
    resolveSecond(todayData)

    await waitFor(() => {
      expect(screen.queryByText(/Đang cập nhật\.\.\./)).not.toBeInTheDocument()
      expect(screen.getByText(/50\.000\.000/)).toBeInTheDocument()
    })

    expect(dashboardApi.getDashboard).toHaveBeenCalledWith('today')
    expect(screen.getByTestId('location').textContent).toBe('/?range=today')
  })

  it('restores range from URL on initial load and redirects invalid range to 7d (Req 2.3, 2.4)', async () => {
    // Initial entry with ?range=30d
    vi.mocked(dashboardApi.getDashboard).mockResolvedValueOnce({
      ...mockDefaultDashboardData,
      range: '30d',
    })

    const { unmount } = renderDashboardPage(['/?range=30d'])

    await waitFor(() => {
      expect(screen.queryByTestId('dashboard-skeleton')).not.toBeInTheDocument()
    })
    expect(dashboardApi.getDashboard).toHaveBeenCalledWith('30d')
    expect(screen.getByTestId('location').textContent).toBe('/?range=30d')

    unmount()
    vi.resetAllMocks()

    // Initial entry with invalid range ?range=bad -> replaced with 7d
    vi.mocked(dashboardApi.getDashboard).mockResolvedValueOnce(mockDefaultDashboardData)
    renderDashboardPage(['/?range=bad'])

    await waitFor(() => {
      expect(screen.queryByTestId('dashboard-skeleton')).not.toBeInTheDocument()
    })
    expect(dashboardApi.getDashboard).toHaveBeenCalledWith('7d')
    expect(screen.getByTestId('location').textContent).toBe('/?range=7d')
  })

  it('handles "Làm mới" button click by refetching data, keeping previous data in-flight (Req 2.5, 9.1)', async () => {
    vi.mocked(dashboardApi.getDashboard).mockResolvedValueOnce(mockDefaultDashboardData)

    let resolveRefresh!: (data: DashboardData) => void
    const refreshPromise = new Promise<DashboardData>((resolve) => {
      resolveRefresh = resolve
    })
    vi.mocked(dashboardApi.getDashboard).mockReturnValueOnce(refreshPromise)

    renderDashboardPage()

    await waitFor(() => {
      expect(screen.queryByTestId('dashboard-skeleton')).not.toBeInTheDocument()
    })
    expect(dashboardApi.getDashboard).toHaveBeenCalledTimes(1)

    const refreshButton = screen.getByRole('button', { name: /Làm mới/i })
    fireEvent.click(refreshButton)

    // While refreshing in-flight:
    // Old data is retained and "Đang cập nhật..." indicator is visible
    expect(screen.getByText(/9\.007\.199\.254\.740\.993/)).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText(/Đang cập nhật\.\.\./)).toBeInTheDocument()
    })
    expect(screen.queryByTestId('dashboard-skeleton')).not.toBeInTheDocument()

    // Resolve refresh with updated timestamp
    resolveRefresh({
      ...mockDefaultDashboardData,
      generatedAt: '2026-11-12T04:00:00Z',
    })

    await waitFor(() => {
      expect(dashboardApi.getDashboard).toHaveBeenCalledTimes(2)
      expect(screen.queryByText(/Đang cập nhật\.\.\./)).not.toBeInTheDocument()
      expect(screen.getByText(/11:00 12\/11\/2026/)).toBeInTheDocument()
    })
  })

  it('displays error message and retry button on initial load failure without showing 0s (Req 9.2)', async () => {
    vi.mocked(dashboardApi.getDashboard).mockRejectedValueOnce(new Error('Internal error'))

    renderDashboardPage()

    await waitFor(() => {
      expect(screen.getByText('Không thể tải số liệu tổng quan')).toBeInTheDocument()
    })

    // Retry button exists
    const retryBtn = screen.getByRole('button', { name: /Thử lại/i })
    expect(retryBtn).toBeInTheDocument()

    // Must NOT show 0s or empty metric numbers
    expect(screen.queryByText('Doanh thu đã giao')).not.toBeInTheDocument()

    // Clicking retry refetches
    vi.mocked(dashboardApi.getDashboard).mockResolvedValueOnce(mockDefaultDashboardData)
    fireEvent.click(retryBtn)

    await waitFor(() => {
      expect(screen.getByText('Doanh thu đã giao')).toBeInTheDocument()
    })
  })

  it('displays error state and removes stale numbers when refresh fails after successful initial load (Req 9.2, design Error Handling)', async () => {
    vi.mocked(dashboardApi.getDashboard).mockResolvedValueOnce(mockDefaultDashboardData)

    renderDashboardPage()

    await waitFor(() => {
      expect(screen.queryByTestId('dashboard-skeleton')).not.toBeInTheDocument()
    })

    // Initial load rendered numbers
    expect(screen.getByText('Doanh thu đã giao')).toBeInTheDocument()
    expect(screen.getByText(/9\.007\.199\.254\.740\.993/)).toBeInTheDocument()

    // Mock refresh failure
    vi.mocked(dashboardApi.getDashboard).mockRejectedValueOnce(new Error('Network error on refresh'))

    const refreshButton = screen.getByRole('button', { name: /Làm mới/i })
    fireEvent.click(refreshButton)

    // Error message appears
    await waitFor(() => {
      expect(screen.getByText('Không thể tải số liệu tổng quan')).toBeInTheDocument()
    })

    // Old KPI values MUST BE GONE (not passing off stale data as current data)
    expect(screen.queryByText('Doanh thu đã giao')).not.toBeInTheDocument()
    expect(screen.queryByText(/9\.007\.199\.254\.740\.993/)).not.toBeInTheDocument()

    // "Thử lại" button exists and retrying recovers
    const retryBtn = screen.getByRole('button', { name: /Thử lại/i })
    expect(retryBtn).toBeInTheDocument()

    vi.mocked(dashboardApi.getDashboard).mockResolvedValueOnce(mockDefaultDashboardData)
    fireEvent.click(retryBtn)

    await waitFor(() => {
      expect(screen.getByText('Doanh thu đã giao')).toBeInTheDocument()
    })
  })

  it('displays empty state when top products or low stock are empty (Req 7.5, 8.5)', async () => {
    const emptyData: DashboardData = {
      ...mockDefaultDashboardData,
      topProducts: [],
      lowStock: {
        threshold: 5,
        total: 0,
        items: [],
      },
    }

    vi.mocked(dashboardApi.getDashboard).mockResolvedValueOnce(emptyData)

    renderDashboardPage()

    await waitFor(() => {
      expect(screen.queryByTestId('dashboard-skeleton')).not.toBeInTheDocument()
    })

    expect(screen.getByText('Chưa có sản phẩm nào được bán trong kỳ này')).toBeInTheDocument()
    expect(screen.getByText('Không có biến thể nào sắp hết hàng')).toBeInTheDocument()
  })
})
