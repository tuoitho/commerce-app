import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { OrderDetailPage } from './OrderDetailPage'
import { useAuth } from '@/context/AuthContext'
import { useCart } from '@/context/CartContext'
import { ToastProvider } from '@/context/ToastContext'
import { ordersApi } from '@/api/orders'
import type { NotificationItem } from '@/api/posts'
import { ApiError, type Order } from '@/api/types'

let mockOnNotification: ((notif: NotificationItem) => void) | undefined

// Mock context hooks
vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/context/CartContext', () => ({
  useCart: vi.fn(),
}))

vi.mock('@/hooks/useChatSocket', () => ({
  useChatSocket: vi.fn((opts: { onNotification?: (notif: NotificationItem) => void }) => {
    mockOnNotification = opts.onNotification
    return {
      isConnected: true,
      isSupportOnline: false,
      supportLastActiveAt: null,
      setSupportOnline: vi.fn(),
      setSupportLastActiveAt: vi.fn(),
      sendPing: vi.fn(),
      reconnect: vi.fn(),
      disconnect: vi.fn(),
    }
  }),
}))

// Mock API modules
vi.mock('@/api/orders', () => ({
  ordersApi: {
    getOrder: vi.fn(),
    cancelOrder: vi.fn(),
    undoCancelOrder: vi.fn(),
    retryMomoPayment: vi.fn(),
    buyAgain: vi.fn(),
  },
}))

const baseMockOrder: Order = {
  id: 'ord-123456',
  userId: 'user-1',
  status: 'pending_confirmation',
  paymentMethod: 'cod',
  recipientName: 'Nguyễn Văn A',
  phone: '0912345678',
  provinceName: 'Thành phố Hà Nội',
  wardName: 'Phường Phúc Xá',
  detailAddress: '123 Đường Cầu Giấy',
  subtotalVnd: '60000000',
  shippingFeeVnd: '30000',
  totalVnd: '60030000',
  items: [
    {
      id: 'oi-1',
      variantId: 'v-1',
      productId: 'p-1',
      brandName: 'Apple',
      productName: 'iPhone 15 Pro Max',
      model: 'A3106',
      imageUrl: 'https://example.com/iphone.png',
      options: [{ groupLabel: 'Màu sắc', valueLabel: 'Titan Tự Nhiên' }],
      unitPriceVnd: '30000000',
      quantity: 2,
      lineTotalVnd: '60000000',
    },
  ],
  createdAt: '2026-08-19T10:00:00Z',
  updatedAt: '2026-08-19T10:00:00Z',
  cancellableUntil: new Date(Date.now() + 25 * 60 * 1000).toISOString(),
}

describe('OrderDetailPage', () => {
  const mockRefreshCart = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockOnNotification = undefined

    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'user-1', email: 'test@example.com' },
      accessToken: 'token-123',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })

    vi.mocked(useCart).mockReturnValue({
      cart: null,
      isLoading: false,
      badgeCount: 0,
      refreshCart: mockRefreshCart,
      addItem: vi.fn(),
      updateQuantity: vi.fn(),
      toggleSelect: vi.fn(),
      toggleSelectAll: vi.fn(),
      removeItem: vi.fn(),
    })

    vi.mocked(ordersApi.getOrder).mockResolvedValue(baseMockOrder)
  })

  it('redirects to login when unauthenticated', async () => {
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
        <MemoryRouter initialEntries={['/orders/ord-123456']}>
          <Routes>
            <Route path="/orders/:id" element={<OrderDetailPage />} />
            <Route path="/login" element={<div>Login Page Target</div>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Login Page Target')).toBeInTheDocument()
    })
  })

  it('renders full order projection for pending_confirmation with countdown timer and cancel button', async () => {
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/orders/ord-123456']}>
          <Routes>
            <Route path="/orders/:id" element={<OrderDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Chi tiết đơn hàng')).toBeInTheDocument()
      expect(screen.getByText('ord-123456')).toBeInTheDocument()
      expect(screen.getAllByText('Chờ xác nhận').length).toBeGreaterThanOrEqual(1)
    })

    // Countdown timer should be visible
    expect(screen.getByText(/Thời gian hủy tự động:/i)).toBeInTheDocument()

    // Recipient & shipping details
    expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument()
    expect(screen.getByText('(0912345678)')).toBeInTheDocument()
    expect(
      screen.getByText(/123 Đường Cầu Giấy, Phường Phúc Xá, Thành phố Hà Nội/i)
    ).toBeInTheDocument()

    // Product item details
    expect(screen.getByText('iPhone 15 Pro Max')).toBeInTheDocument()
    expect(screen.getByText('Apple')).toBeInTheDocument()
    expect(screen.getByText('(A3106)')).toBeInTheDocument()
    expect(screen.getByText(/Titan Tự Nhiên/i)).toBeInTheDocument()

    // Price summary
    expect(screen.getAllByText('60.000.000 ₫').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('30.000 ₫')).toBeInTheDocument()
    expect(screen.getByText('60.030.000 ₫')).toBeInTheDocument()

    // Payment method
    expect(screen.getByText('Thanh toán khi nhận hàng (COD)')).toBeInTheDocument()

    // Action button: Hủy đơn
    expect(screen.getByRole('button', { name: /Hủy đơn/i })).toBeInTheDocument()
  })

  it('executes cancel order for pending_confirmation order when confirmed in dialog', async () => {
    const cancelledOrder: Order = {
      ...baseMockOrder,
      status: 'cancelled',
      cancelledAt: '2026-08-19T10:15:00Z',
    }
    vi.mocked(ordersApi.cancelOrder).mockResolvedValue(cancelledOrder)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/orders/ord-123456']}>
          <Routes>
            <Route path="/orders/:id" element={<OrderDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Hủy đơn/i })).toBeInTheDocument()
    })

    // Click Hủy đơn
    fireEvent.click(screen.getByRole('button', { name: /Hủy đơn/i }))

    // Dialog opens
    expect(screen.getByText('Xác nhận hủy đơn hàng')).toBeInTheDocument()

    // Confirm cancel in dialog
    fireEvent.click(screen.getByRole('button', { name: /Xác nhận hủy/i }))

    await waitFor(() => {
      expect(ordersApi.cancelOrder).toHaveBeenCalledWith('ord-123456')
      expect(screen.getAllByText('Đã hủy').length).toBeGreaterThanOrEqual(1)
      expect(screen.queryByRole('button', { name: /Hủy đơn/i })).not.toBeInTheDocument()
    })
  })

  it('renders confirmed status with Hủy đơn button and no countdown timer', async () => {
    const confirmedOrder: Order = {
      ...baseMockOrder,
      status: 'confirmed',
      confirmedAt: '2026-08-19T10:30:00Z',
      cancellableUntil: null,
    }
    vi.mocked(ordersApi.getOrder).mockResolvedValue(confirmedOrder)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/orders/ord-123456']}>
          <Routes>
            <Route path="/orders/:id" element={<OrderDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getAllByText('Đã xác nhận').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByRole('button', { name: /Hủy đơn/i })).toBeInTheDocument()
    })

    // Countdown should not be present
    expect(screen.queryByText(/Thời gian hủy tự động:/i)).not.toBeInTheDocument()
  })

  it('renders preparing status with Yêu cầu hủy button and executes cancel request', async () => {
    const preparingOrder: Order = {
      ...baseMockOrder,
      status: 'preparing',
      cancellableUntil: null,
    }
    const cancelRequestedOrder: Order = {
      ...baseMockOrder,
      status: 'cancel_requested',
      cancellableUntil: null,
    }
    vi.mocked(ordersApi.getOrder).mockResolvedValue(preparingOrder)
    vi.mocked(ordersApi.cancelOrder).mockResolvedValue(cancelRequestedOrder)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/orders/ord-123456']}>
          <Routes>
            <Route path="/orders/:id" element={<OrderDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getAllByText('Đang chuẩn bị hàng').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByRole('button', { name: /Yêu cầu hủy/i })).toBeInTheDocument()
    })

    // Click Yêu cầu hủy
    fireEvent.click(screen.getByRole('button', { name: /Yêu cầu hủy/i }))

    // Dialog opens
    expect(screen.getByText('Gửi yêu cầu hủy đơn hàng')).toBeInTheDocument()

    // Confirm request in dialog
    fireEvent.click(screen.getByRole('button', { name: /Gửi yêu cầu hủy/i }))

    await waitFor(() => {
      expect(ordersApi.cancelOrder).toHaveBeenCalledWith('ord-123456')
      expect(screen.getAllByText('Chờ duyệt hủy').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('renders cancel_requested status with notice and Hoàn tác yêu cầu hủy button', async () => {
    const cancelRequestedOrder: Order = {
      ...baseMockOrder,
      status: 'cancel_requested',
      cancellableUntil: null,
    }
    const preparingOrder: Order = {
      ...baseMockOrder,
      status: 'preparing',
      cancellableUntil: null,
    }
    vi.mocked(ordersApi.getOrder).mockResolvedValue(cancelRequestedOrder)
    vi.mocked(ordersApi.undoCancelOrder).mockResolvedValue(preparingOrder)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/orders/ord-123456']}>
          <Routes>
            <Route path="/orders/:id" element={<OrderDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getAllByText('Chờ duyệt hủy').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('Đang chờ người bán xác nhận hủy').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByRole('button', { name: /Hoàn tác yêu cầu hủy/i })).toBeInTheDocument()
    })

    // Click Hoàn tác yêu cầu hủy
    fireEvent.click(screen.getByRole('button', { name: /Hoàn tác yêu cầu hủy/i }))

    // Dialog opens
    expect(screen.getByText('Hoàn tác yêu cầu hủy đơn')).toBeInTheDocument()

    // Confirm undo
    fireEvent.click(screen.getByRole('button', { name: /Xác nhận hoàn tác/i }))

    await waitFor(() => {
      expect(ordersApi.undoCancelOrder).toHaveBeenCalledWith('ord-123456')
      expect(screen.getAllByText('Đang chuẩn bị hàng').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('renders shipped status without cancel buttons', async () => {
    const shippedOrder: Order = {
      ...baseMockOrder,
      status: 'shipped',
      cancellableUntil: null,
    }
    vi.mocked(ordersApi.getOrder).mockResolvedValue(shippedOrder)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/orders/ord-123456']}>
          <Routes>
            <Route path="/orders/:id" element={<OrderDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getAllByText('Đang giao hàng').length).toBeGreaterThanOrEqual(1)
    })
    expect(screen.queryByRole('button', { name: /Hủy đơn/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Yêu cầu hủy/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Hoàn tác yêu cầu hủy/i })).not.toBeInTheDocument()
  })

  it('renders delivered status without cancel buttons', async () => {
    const deliveredOrder: Order = {
      ...baseMockOrder,
      status: 'delivered',
      cancellableUntil: null,
    }
    vi.mocked(ordersApi.getOrder).mockResolvedValue(deliveredOrder)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/orders/ord-123456']}>
          <Routes>
            <Route path="/orders/:id" element={<OrderDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getAllByText('Đã giao hàng').length).toBeGreaterThanOrEqual(1)
    })
    expect(screen.queryByRole('button', { name: /Hủy đơn/i })).not.toBeInTheDocument()
  })

  it('renders returned status without cancel buttons', async () => {
    const returnedOrder: Order = {
      ...baseMockOrder,
      status: 'returned',
      cancellableUntil: null,
    }
    vi.mocked(ordersApi.getOrder).mockResolvedValue(returnedOrder)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/orders/ord-123456']}>
          <Routes>
            <Route path="/orders/:id" element={<OrderDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getAllByText('Trả hàng').length).toBeGreaterThanOrEqual(1)
    })
    expect(screen.queryByRole('button', { name: /Hủy đơn/i })).not.toBeInTheDocument()
  })

  it('renders free shipping when shippingFeeVnd is 0', async () => {
    const freeShippingOrder: Order = {
      ...baseMockOrder,
      shippingFeeVnd: '0',
    }
    vi.mocked(ordersApi.getOrder).mockResolvedValue(freeShippingOrder)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/orders/ord-123456']}>
          <Routes>
            <Route path="/orders/:id" element={<OrderDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Miễn phí')).toBeInTheDocument()
    })
  })

  it('renders 404 not found state when order is not found or not owned', async () => {
    const err = new ApiError(404, { code: 'order_not_found', message: 'Không tìm thấy đơn hàng' })
    vi.mocked(ordersApi.getOrder).mockRejectedValue(err)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/orders/ord-not-found']}>
          <Routes>
            <Route path="/orders/:id" element={<OrderDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Không tìm thấy đơn hàng')).toBeInTheDocument()
      expect(
        screen.getByText(
          'Đơn hàng không tồn tại hoặc bạn không có quyền truy cập vào thông tin đơn hàng này.'
        )
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Xem danh sách đơn hàng/i })).toBeInTheDocument()
    })
  })

  it('renders generic error state and allows retry', async () => {
    const err = new ApiError(500, { code: 'internal', message: 'Lỗi máy chủ nội bộ' })
    vi.mocked(ordersApi.getOrder).mockRejectedValueOnce(err).mockResolvedValueOnce(baseMockOrder)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/orders/ord-123456']}>
          <Routes>
            <Route path="/orders/:id" element={<OrderDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Không thể tải đơn hàng')).toBeInTheDocument()
      expect(screen.getByText('Lỗi máy chủ nội bộ')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Thử lại/i })).toBeInTheDocument()
    })

    // Click retry
    fireEvent.click(screen.getByRole('button', { name: /Thử lại/i }))

    await waitFor(() => {
      expect(screen.getByText('Chi tiết đơn hàng')).toBeInTheDocument()
      expect(screen.getByText('ord-123456')).toBeInTheDocument()
    })
  })

  it('handles action errors gracefully with toast', async () => {
    const cancelErr = new ApiError(409, {
      code: 'order_not_cancellable',
      message: 'Đơn hàng không thể hủy được nữa',
    })
    vi.mocked(ordersApi.cancelOrder).mockRejectedValue(cancelErr)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/orders/ord-123456']}>
          <Routes>
            <Route path="/orders/:id" element={<OrderDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Hủy đơn/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Hủy đơn/i }))
    fireEvent.click(screen.getByRole('button', { name: /Xác nhận hủy/i }))

    await waitFor(() => {
      expect(ordersApi.cancelOrder).toHaveBeenCalledWith('ord-123456')
    })
  })

  it('renders review actions and badges on items based on reviewStatus', async () => {
    const orderWithReviews: Order = {
      ...baseMockOrder,
      status: 'delivered',
      items: [
        {
          ...baseMockOrder.items[0],
          id: 'item-el',
          productName: 'Delivered Eligible Item',
          reviewStatus: 'eligible',
        },
        {
          ...baseMockOrder.items[0],
          id: 'item-rev',
          productName: 'Delivered Reviewed Item',
          reviewStatus: 'reviewed',
          review: {
            id: 'rev-1',
            rating: 5,
            comment: 'Great phone',
            editCount: 0,
            media: [],
            createdAt: '2026-08-28T00:00:00Z',
            updatedAt: '2026-08-28T00:00:00Z',
            edited: false,
            canEdit: true,
          },
        },
        {
          ...baseMockOrder.items[0],
          id: 'item-ref',
          productName: 'Delivered Refunded Item',
          reviewStatus: 'refunded',
        },
      ],
    }

    vi.mocked(ordersApi.getOrder).mockResolvedValue(orderWithReviews)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/orders/ord-123456']}>
          <Routes>
            <Route path="/orders/:id" element={<OrderDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Delivered Eligible Item')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Đánh giá' })).toBeInTheDocument()
      expect(screen.getByText('Delivered Reviewed Item')).toBeInTheDocument()
      expect(screen.getByText(/Đã đánh giá \(5★\)/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Sửa đánh giá' })).toBeInTheDocument()
      expect(screen.getByText('Delivered Refunded Item')).toBeInTheDocument()
      expect(screen.getByText('Đã hoàn tiền')).toBeInTheDocument()
    })
  })

  it('renders "Hỏi đáp về đơn hàng" button and dispatches open-chat-with-order event on click', async () => {
    vi.mocked(ordersApi.getOrder).mockResolvedValue(baseMockOrder)

    const eventListener = vi.fn()
    window.addEventListener('open-chat-with-order', eventListener)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/orders/ord-123456']}>
          <Routes>
            <Route path="/orders/:id" element={<OrderDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('order-inquiry-header-btn')).toBeInTheDocument()
    })

    const inquiryBtn = screen.getByTestId('order-inquiry-header-btn')
    fireEvent.click(inquiryBtn)

    expect(eventListener).toHaveBeenCalled()
    const event = eventListener.mock.calls[0][0] as CustomEvent
    expect(event.detail.orderId).toBe('ord-123456')
    expect(event.detail.order.id).toBe('ord-123456')
    expect(event.detail.order.totalVnd).toBe(60030000)

    window.removeEventListener('open-chat-with-order', eventListener)
  })

  it('renders MoMo failed order details with countdown and retries MoMo payment', async () => {
    const now = Date.now()
    const failedMomoOrder: Order = {
      ...baseMockOrder,
      id: 'ord-momo-detail-1',
      status: 'pending_confirmation',
      paymentMethod: 'momo',
      paymentStatus: 'failed',
      createdAt: new Date(now - 3 * 60 * 1000).toISOString(),
      cancellableUntil: new Date(now + 12 * 60 * 1000).toISOString(),
    }
    vi.mocked(ordersApi.getOrder).mockResolvedValue(failedMomoOrder)
    vi.mocked(ordersApi.retryMomoPayment).mockResolvedValue({
      ...failedMomoOrder,
      paymentStatus: 'pending',
      payUrl: 'https://test-payment.momo.vn/v2/gateway/pay?t=detail-retry',
    })

    const originalLocation = window.location
    const assignMock = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, assign: assignMock },
      writable: true,
      configurable: true,
    })

    try {
      render(
        <ToastProvider>
          <MemoryRouter initialEntries={['/orders/ord-momo-detail-1']}>
            <Routes>
              <Route path="/orders/:id" element={<OrderDetailPage />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      )

      await waitFor(() => {
        expect(screen.getByText('Ví điện tử MoMo')).toBeInTheDocument()
      })

      expect(screen.getByText('Thanh toán thất bại')).toBeInTheDocument()
      expect(screen.getByText(/Hạn thanh toán MoMo:/i)).toBeInTheDocument()

      const retryBtn = screen.getByRole('button', { name: /Thanh toán lại qua MoMo/i })
      fireEvent.click(retryBtn)

      await waitFor(() => {
        expect(ordersApi.retryMomoPayment).toHaveBeenCalledWith('ord-momo-detail-1')
        expect(assignMock).toHaveBeenCalledWith(
          'https://test-payment.momo.vn/v2/gateway/pay?t=detail-retry'
        )
      })
    } finally {
      Object.defineProperty(window, 'location', {
        value: originalLocation,
        writable: true,
        configurable: true,
      })
    }
  })

  it('hides MoMo retry button when payment deadline has passed and shows paid transaction info', async () => {
    const expiredMomoOrder: Order = {
      ...baseMockOrder,
      id: 'ord-momo-expired',
      status: 'pending_confirmation',
      paymentMethod: 'momo',
      paymentStatus: 'pending',
      createdAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
      cancellableUntil: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    }
    vi.mocked(ordersApi.getOrder).mockResolvedValue(expiredMomoOrder)

    const { unmount } = render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/orders/ord-momo-expired']}>
          <Routes>
            <Route path="/orders/:id" element={<OrderDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Ví điện tử MoMo')).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /Thanh toán lại qua MoMo/i })).not.toBeInTheDocument()
    expect(screen.getByText(/Đã hết hạn thanh toán MoMo/i)).toBeInTheDocument()
    unmount()

    const paidMomoOrder: Order = {
      ...baseMockOrder,
      id: 'ord-momo-paid',
      status: 'confirmed',
      paymentMethod: 'momo',
      paymentStatus: 'paid',
      paymentTransactionId: '4088812345',
      paidAt: '2026-11-16T10:02:00Z',
      cancellableUntil: null,
    }
    vi.mocked(ordersApi.getOrder).mockResolvedValue(paidMomoOrder)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/orders/ord-momo-paid']}>
          <Routes>
            <Route path="/orders/:id" element={<OrderDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Đã thanh toán')).toBeInTheDocument()
    })
    expect(screen.getByText('4088812345')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Thanh toán lại qua MoMo/i })).not.toBeInTheDocument()
  })

  it('displays discount row, delivery method, carrier + tracking code with copy button, OrderStepper & OrderTimeline', async () => {
    const shippedOrder: Order = {
      ...baseMockOrder,
      status: 'shipped',
      deliveryMethod: 'express_2h',
      voucherCode: 'AURA10',
      voucherType: 'percent',
      discountVnd: '1000000',
      shippingFeeVnd: '60000',
      totalVnd: '59060000',
      carrier: 'Ahamove 2h',
      trackingCode: 'AHA-20261118',
      confirmedAt: '2026-11-18T10:15:00Z',
      preparingAt: '2026-11-18T10:30:00Z',
      shippedAt: '2026-11-18T11:00:00Z',
      cancellableUntil: null,
      timeline: [
        {
          id: 'evt-1',
          status: 'pending_confirmation',
          actorType: 'customer',
          note: 'Đơn hàng được tạo',
          createdAt: '2026-11-18T10:00:00Z',
        },
        {
          id: 'evt-2',
          status: 'preparing',
          actorType: 'admin',
          note: 'Đơn hàng đang được chuẩn bị',
          createdAt: '2026-11-18T10:30:00Z',
        },
        {
          id: 'evt-3',
          status: 'shipped',
          actorType: 'admin',
          note: 'Đã bàn giao vận chuyển (Ahamove 2h - AHA-20261118)',
          createdAt: '2026-11-18T11:00:00Z',
        },
      ],
    }

    vi.mocked(ordersApi.getOrder).mockResolvedValue(shippedOrder)
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
    })

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/orders/ord-123456']}>
          <Routes>
            <Route path="/orders/:id" element={<OrderDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    expect(await screen.findByText('Giao hỏa tốc 2 giờ')).toBeInTheDocument()
    expect(screen.getByText('Ahamove 2h')).toBeInTheDocument()
    expect(screen.getByText('AHA-20261118')).toBeInTheDocument()
    expect(screen.getByText(/-1\.000\.000 ₫/)).toBeInTheDocument()
    expect(screen.getByText(/AURA10/)).toBeInTheDocument()

    // OrderStepper and OrderTimeline
    expect(screen.getByRole('region', { name: /Tiến trình đơn hàng/i })).toBeInTheDocument()
    expect(screen.getByText('Đã bàn giao vận chuyển (Ahamove 2h - AHA-20261118)')).toBeInTheDocument()

    // Copy tracking code
    fireEvent.click(screen.getByRole('button', { name: /Sao chép mã vận đơn/i }))
    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith('AHA-20261118')
    })
  })

  it('silently refreshes order detail on matching WebSocket notification without reloading page', async () => {
    const preparingOrder: Order = {
      ...baseMockOrder,
      status: 'preparing',
      deliveryMethod: 'standard',
      timeline: [
        {
          id: 'evt-1',
          status: 'pending_confirmation',
          actorType: 'customer',
          note: 'Đơn hàng được tạo',
          createdAt: '2026-11-18T10:00:00Z',
        },
      ],
    }
    const shippedOrder: Order = {
      ...preparingOrder,
      status: 'shipped',
      carrier: 'Giao Hàng Nhanh',
      trackingCode: 'GHN-998877',
      shippedAt: '2026-11-18T11:00:00Z',
      timeline: [
        ...preparingOrder.timeline!,
        {
          id: 'evt-2',
          status: 'shipped',
          actorType: 'admin',
          note: 'Đã bàn giao vận chuyển (Giao Hàng Nhanh - GHN-998877)',
          createdAt: '2026-11-18T11:00:00Z',
        },
      ],
    }

    vi.mocked(ordersApi.getOrder)
      .mockResolvedValueOnce(preparingOrder)
      .mockResolvedValueOnce(shippedOrder)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/orders/ord-123456']}>
          <Routes>
            <Route path="/orders/:id" element={<OrderDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getAllByText('Đang chuẩn bị hàng').length).toBeGreaterThanOrEqual(1)
    })
    expect(ordersApi.getOrder).toHaveBeenCalledTimes(1)

    // Unrelated notification should NOT trigger re-fetch
    await act(async () => {
      mockOnNotification?.({
        id: 'notif-other',
        recipientId: 'user-1',
        actorId: null,
        actorName: null,
        actorRole: null,
        category: 'order',
        notificationType: 'order_shipped',
        postId: null,
        commentId: null,
        reactionType: null,
        excerpt: 'Other order',
        metadata: { orderId: 'other-order-id' },
        isRead: false,
        createdAt: '2026-11-18T11:00:00Z',
      })
    })
    expect(ordersApi.getOrder).toHaveBeenCalledTimes(1)

    // Matching notification triggers silent re-fetch and updates UI
    await act(async () => {
      mockOnNotification?.({
        id: 'notif-match',
        recipientId: 'user-1',
        actorId: null,
        actorName: null,
        actorRole: null,
        category: 'order',
        notificationType: 'order_shipped',
        postId: null,
        commentId: null,
        reactionType: null,
        excerpt: 'Đơn hàng đã giao vận chuyển',
        metadata: { orderId: 'ord-123456', trackingCode: 'GHN-998877' },
        isRead: false,
        createdAt: '2026-11-18T11:00:00Z',
      })
    })

    await waitFor(() => {
      expect(ordersApi.getOrder).toHaveBeenCalledTimes(2)
      expect(screen.getByText('GHN-998877')).toBeInTheDocument()
      expect(screen.getByText('Giao Hàng Nhanh')).toBeInTheDocument()
      expect(screen.getByText('Đã bàn giao vận chuyển (Giao Hàng Nhanh - GHN-998877)')).toBeInTheDocument()
    })
  })

  it('supports "Mua lại" on OrderDetailPage for delivered orders and navigates to /cart', async () => {
    vi.mocked(ordersApi.getOrder).mockResolvedValue({
      ...baseMockOrder,
      status: 'delivered',
      cancellableUntil: null,
    })
    vi.mocked(ordersApi.buyAgain).mockResolvedValue({
      cart: {
        items: [],
        totalUnits: 2,
        selectedLineCount: 1,
        selectedTotalVnd: '60000000',
        shippingFeeVnd: '0',
      },
      addedCount: 1,
      adjustedItems: [],
      skippedItems: [],
    })

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/orders/ord-123456']}>
          <Routes>
            <Route path="/orders/:id" element={<OrderDetailPage />} />
            <Route path="/cart" element={<div>Cart Page After Buy Again</div>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    const buyAgainBtn = await screen.findByRole('button', { name: /Mua lại/i })
    fireEvent.click(buyAgainBtn)

    await waitFor(() => {
      expect(ordersApi.buyAgain).toHaveBeenCalledWith('ord-123456')
      expect(mockRefreshCart).toHaveBeenCalled()
      expect(screen.getByText('Cart Page After Buy Again')).toBeInTheDocument()
    })
  })

  it('shows error toast and stays on OrderDetailPage when buyAgain returns 409 buy_again_all_unavailable, and hides Mua lại for non-eligible statuses', async () => {
    vi.mocked(ordersApi.getOrder).mockResolvedValueOnce({
      ...baseMockOrder,
      status: 'shipped',
      cancellableUntil: null,
    })

    const { unmount } = render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/orders/ord-123456']}>
          <Routes>
            <Route path="/orders/:id" element={<OrderDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getAllByText('Đang giao hàng').length).toBeGreaterThanOrEqual(1)
    })
    expect(screen.queryByRole('button', { name: /Mua lại/i })).not.toBeInTheDocument()
    unmount()

    vi.mocked(ordersApi.getOrder).mockResolvedValueOnce({
      ...baseMockOrder,
      status: 'cancelled',
      cancellableUntil: null,
    })
    vi.mocked(ordersApi.buyAgain).mockRejectedValueOnce(
      new ApiError(409, {
        code: 'buy_again_all_unavailable',
        message: 'Tất cả sản phẩm trong đơn hàng hiện đã hết hàng hoặc ngừng kinh doanh',
      })
    )

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/orders/ord-123456']}>
          <Routes>
            <Route path="/orders/:id" element={<OrderDetailPage />} />
            <Route path="/cart" element={<div>Cart Page After Buy Again</div>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    const buyAgainBtn = await screen.findByRole('button', { name: /Mua lại/i })
    fireEvent.click(buyAgainBtn)

    await waitFor(() => {
      expect(
        screen.getByText('Tất cả sản phẩm trong đơn hàng hiện đã hết hàng hoặc ngừng kinh doanh')
      ).toBeInTheDocument()
    })
    expect(screen.queryByText('Cart Page After Buy Again')).not.toBeInTheDocument()
  })
})
