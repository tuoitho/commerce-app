import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { OrderHistoryPage } from './OrderHistoryPage'
import { useAuth } from '@/context/AuthContext'
import { ToastProvider } from '@/context/ToastContext'
import { ordersApi } from '@/api/orders'
import type { Order, OrderStats } from '@/api/types'

// Mock context hooks
vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

// Mock API modules
vi.mock('@/api/orders', () => ({
  ordersApi: {
    getOrderStats: vi.fn(),
    listOrders: vi.fn(),
  },
}))

const mockStats: OrderStats = {
  pendingConfirmation: 2,
  awaitingPickup: 3,
  awaitingDelivery: 1,
  awaitingReview: 5,
}

const mockOrders: Order[] = [
  {
    id: 'ord-001',
    userId: 'user-1',
    status: 'pending_confirmation',
    paymentMethod: 'cod',
    recipientName: 'Nguyễn Văn A',
    phone: '0912345678',
    provinceName: 'Hà Nội',
    wardName: 'Phường Phúc Xá',
    detailAddress: '123 Đường Cầu Giấy',
    subtotalVnd: '32000000',
    shippingFeeVnd: '0',
    totalVnd: '32000000',
    items: [
      {
        id: 'item-1',
        variantId: 'v-1',
        productId: 'prod-iphone-15',
        brandName: 'Apple',
        productName: 'iPhone 15 Pro Max',
        model: 'A3106',
        imageUrl: 'https://example.com/iphone15.png',
        options: [
          { groupLabel: 'Màu sắc', valueLabel: 'Titan Tự Nhiên' },
          { groupLabel: 'Dung lượng', valueLabel: '256GB' },
        ],
        unitPriceVnd: '32000000',
        quantity: 1,
        lineTotalVnd: '32000000',
      },
    ],
    createdAt: '2026-08-19T10:00:00Z',
    updatedAt: '2026-08-19T10:00:00Z',
    cancellableUntil: new Date(Date.now() + 25 * 60 * 1000).toISOString(),
  },
  {
    id: 'ord-002',
    userId: 'user-1',
    status: 'delivered',
    paymentMethod: 'cod',
    recipientName: 'Nguyễn Văn A',
    phone: '0912345678',
    provinceName: 'Hà Nội',
    wardName: 'Phường Phúc Xá',
    detailAddress: '123 Đường Cầu Giấy',
    subtotalVnd: '24000000',
    shippingFeeVnd: '30000',
    totalVnd: '24030000',
    items: [
      {
        id: 'item-2',
        variantId: 'v-2',
        productId: 'prod-s24',
        brandName: 'Samsung',
        productName: 'Samsung Galaxy S24 Ultra',
        model: 'SM-S928B',
        imageUrl: 'https://example.com/s24.png',
        options: [{ groupLabel: 'Màu sắc', valueLabel: 'Xám Titan' }],
        unitPriceVnd: '24000000',
        quantity: 1,
        lineTotalVnd: '24000000',
      },
    ],
    createdAt: '2026-08-18T09:00:00Z',
    updatedAt: '2026-08-18T15:00:00Z',
  },
]

describe('OrderHistoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'user-1', email: 'user@example.com' },
      accessToken: 'token-123',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })

    vi.mocked(ordersApi.getOrderStats).mockResolvedValue(mockStats)
    vi.mocked(ordersApi.listOrders).mockResolvedValue(mockOrders)
  })

  it('redirects to login when user is unauthenticated', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/orders']}>
          <Routes>
            <Route path="/orders" element={<OrderHistoryPage />} />
            <Route path="/login" element={<div>Trang Đăng Nhập</div>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Trang Đăng Nhập')).toBeInTheDocument()
    })
  })

  it('renders page header, 4 stats cards, and 7 status tabs (Req 10.1, 10.4)', async () => {
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/orders']}>
          <Routes>
            <Route path="/orders" element={<OrderHistoryPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    // Page title
    expect(screen.getByRole('heading', { level: 1, name: /Lịch sử mua hàng/i })).toBeInTheDocument()

    // 4 stats cards
    await waitFor(() => {
      expect(ordersApi.getOrderStats).toHaveBeenCalledTimes(1)
      expect(screen.getByText('2')).toBeInTheDocument() // pendingConfirmation
      expect(screen.getByText('3')).toBeInTheDocument() // awaitingPickup
      expect(screen.getByText('1')).toBeInTheDocument() // awaitingDelivery
      expect(screen.getByText('5')).toBeInTheDocument() // awaitingReview
    })

    // 8 tabs
    const tabLabels = [
      'Tất cả',
      'Chờ xác nhận',
      'Chờ lấy hàng',
      'Chờ giao hàng',
      'Đã giao',
      'Chờ đánh giá',
      'Trả hàng',
      'Đã hủy',
    ]
    tabLabels.forEach((label) => {
      const tabs = screen.getAllByRole('tab', { name: label })
      expect(tabs.length).toBeGreaterThanOrEqual(1)
    })

    // Default tab should be 'Tất cả'
    const allTab = screen.getByRole('tab', { name: 'Tất cả' })
    expect(allTab).toHaveAttribute('aria-selected', 'true')
    expect(ordersApi.listOrders).toHaveBeenCalledWith('all')
  })

  it('renders order list with order ID, date, status, items preview, and total amount (Req 10.3)', async () => {
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/orders']}>
          <Routes>
            <Route path="/orders" element={<OrderHistoryPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText(/Mã đơn: ord-001/i)).toBeInTheDocument()
      expect(screen.getByText(/Mã đơn: ord-002/i)).toBeInTheDocument()
    })

    // Product info
    expect(screen.getByText('iPhone 15 Pro Max')).toBeInTheDocument()
    expect(screen.getByText('Samsung Galaxy S24 Ultra')).toBeInTheDocument()

    // Brand and model
    expect(screen.getByText('Apple')).toBeInTheDocument()
    expect(screen.getByText('(A3106)')).toBeInTheDocument()
    expect(screen.getByText('Samsung')).toBeInTheDocument()

    // Options badges
    expect(screen.getByText('Titan Tự Nhiên')).toBeInTheDocument()
    expect(screen.getByText('256GB')).toBeInTheDocument()

    // Status badges
    expect(screen.getAllByText('Chờ xác nhận').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Đã giao').length).toBeGreaterThanOrEqual(1)

    // Total VND
    expect(screen.getAllByText('32.000.000 ₫').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('24.030.000 ₫').length).toBeGreaterThanOrEqual(1)

    // View detail buttons
    const detailLinks = screen.getAllByRole('link', { name: /Xem chi tiết/i })
    expect(detailLinks.length).toBe(2)
    expect(detailLinks[0]).toHaveAttribute('href', '/orders/ord-001')
    expect(detailLinks[1]).toHaveAttribute('href', '/orders/ord-002')
  })

  it('switches tabs and fetches corresponding status bucket orders (Req 10.2)', async () => {
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/orders']}>
          <Routes>
            <Route path="/orders" element={<OrderHistoryPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(ordersApi.listOrders).toHaveBeenCalledWith('all')
    })

    // Click "Chờ lấy hàng" tab
    const pickupTab = screen.getByRole('tab', { name: 'Chờ lấy hàng' })
    fireEvent.click(pickupTab)

    await waitFor(() => {
      expect(ordersApi.listOrders).toHaveBeenCalledWith('pickup')
      expect(pickupTab).toHaveAttribute('aria-selected', 'true')
    })

    // Click "Đã hủy" tab
    const cancelledTab = screen.getByRole('tab', { name: 'Đã hủy' })
    fireEvent.click(cancelledTab)

    await waitFor(() => {
      expect(ordersApi.listOrders).toHaveBeenCalledWith('cancelled')
      expect(cancelledTab).toHaveAttribute('aria-selected', 'true')
    })
  })

  it('clicking a stats card filters to the matching tab bucket (Req 10.4)', async () => {
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/orders']}>
          <Routes>
            <Route path="/orders" element={<OrderHistoryPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(ordersApi.getOrderStats).toHaveBeenCalled()
    })

    // Find the "Chờ giao hàng" stat button and click it
    const deliveryStatBtn = screen.getByRole('button', { name: /Chờ giao hàng/i })
    fireEvent.click(deliveryStatBtn)

    await waitFor(() => {
      expect(ordersApi.listOrders).toHaveBeenCalledWith('delivery')
      const deliveryTab = screen.getByRole('tab', { name: 'Chờ giao hàng' })
      expect(deliveryTab).toHaveAttribute('aria-selected', 'true')
    })
  })

  it('renders empty state with CTA to catalog when tab has no orders (Req 10.6)', async () => {
    vi.mocked(ordersApi.listOrders).mockResolvedValue([])

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/orders?status=returns']}>
          <Routes>
            <Route path="/orders" element={<OrderHistoryPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Chưa có đơn hàng nào')).toBeInTheDocument()
      expect(screen.getByText(/Khám phá sản phẩm ngay/i)).toBeInTheDocument()
    })

    const ctaLink = screen.getByRole('link', { name: /Khám phá sản phẩm ngay/i })
    expect(ctaLink).toHaveAttribute('href', '/products')
  })

  it('navigates to order detail page when clicking detail link (Req 10.5)', async () => {
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/orders']}>
          <Routes>
            <Route path="/orders" element={<OrderHistoryPage />} />
            <Route path="/orders/:id" element={<div>Trang Chi Tiết Đơn Hàng</div>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText(/Mã đơn: ord-001/i)).toBeInTheDocument()
    })

    const detailButtons = screen.getAllByRole('link', { name: /Xem chi tiết/i })
    fireEvent.click(detailButtons[0])

    await waitFor(() => {
      expect(screen.getByText('Trang Chi Tiết Đơn Hàng')).toBeInTheDocument()
    })
  })

  it('handles order fetch errors gracefully with retry button', async () => {
    vi.mocked(ordersApi.listOrders).mockRejectedValueOnce(new Error('Network error'))

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/orders']}>
          <Routes>
            <Route path="/orders" element={<OrderHistoryPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Lỗi tải danh sách đơn hàng')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Thử lại/i })).toBeInTheDocument()
    })

    // Fix API mock and click retry
    vi.mocked(ordersApi.listOrders).mockResolvedValue(mockOrders)
    fireEvent.click(screen.getByRole('button', { name: /Thử lại/i }))

    await waitFor(() => {
      expect(screen.getByText(/Mã đơn: ord-001/i)).toBeInTheDocument()
    })
  })

  it('clicking card 4 switches to reviewable tab and filters orders', async () => {
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/orders']}>
          <Routes>
            <Route path="/orders" element={<OrderHistoryPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText(/Mã đơn: ord-001/i)).toBeInTheDocument()
    })

    const reviewStatBtn = screen.getByRole('button', { name: /Chờ đánh giá/i })
    fireEvent.click(reviewStatBtn)

    await waitFor(() => {
      expect(ordersApi.listOrders).toHaveBeenCalledWith('reviewable')
      const reviewTab = screen.getByRole('tab', { name: 'Chờ đánh giá' })
      expect(reviewTab).toHaveAttribute('aria-selected', 'true')
    })
  })

  it('renders review buttons according to reviewStatus on order items', async () => {
    const ordersWithReviewStates: Order[] = [
      {
        ...mockOrders[1],
        id: 'ord-review-1',
        items: [
          {
            ...mockOrders[1].items[0],
            id: 'item-eligible',
            productName: 'Eligible Item',
            reviewStatus: 'eligible',
          },
          {
            ...mockOrders[1].items[0],
            id: 'item-reviewed',
            productName: 'Reviewed Item',
            reviewStatus: 'reviewed',
            review: {
              id: 'rev-1',
              rating: 5,
              comment: 'Great',
              editCount: 0,
              media: [],
              createdAt: '2026-08-28T00:00:00Z',
              updatedAt: '2026-08-28T00:00:00Z',
              edited: false,
              canEdit: true,
            },
          },
          {
            ...mockOrders[1].items[0],
            id: 'item-refunded',
            productName: 'Refunded Item',
            reviewStatus: 'refunded',
          },
        ],
      },
    ]

    vi.mocked(ordersApi.listOrders).mockResolvedValue(ordersWithReviewStates)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/orders?status=reviewable']}>
          <Routes>
            <Route path="/orders" element={<OrderHistoryPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Eligible Item')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Đánh giá' })).toBeInTheDocument()
      expect(screen.getByText('Reviewed Item')).toBeInTheDocument()
      expect(screen.getByText(/Đã đánh giá \(5★\)/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Sửa đánh giá' })).toBeInTheDocument()
      expect(screen.getByText('Refunded Item')).toBeInTheDocument()
      expect(screen.getByText('Đã hoàn tiền')).toBeInTheDocument()
    })
  })
})
