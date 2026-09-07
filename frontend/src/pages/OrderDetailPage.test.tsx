import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { OrderDetailPage } from './OrderDetailPage'
import { useAuth } from '@/context/AuthContext'
import { useChat } from '@/context/ChatContext'
import { ToastProvider } from '@/context/ToastContext'
import { ordersApi } from '@/api/orders'
import { ApiError, type Order } from '@/api/types'

// Mock context hooks
vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/context/ChatContext', () => ({
  useChat: vi.fn(),
}))

// Mock API modules
vi.mock('@/api/orders', () => ({
  ordersApi: {
    getOrder: vi.fn(),
    cancelOrder: vi.fn(),
    undoCancelOrder: vi.fn(),
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
  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'user-1', email: 'test@example.com' },
      accessToken: 'token-123',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })

    vi.mocked(useChat).mockReturnValue({
      isOpen: false,
      setIsOpen: vi.fn(),
      activeConversation: null,
      conversations: [],
      messages: [],
      hasMore: false,
      isLoadingOlder: false,
      totalUnread: 0,
      isLoading: false,
      isSending: false,
      openChat: vi.fn(),
      selectConversation: vi.fn(),
      closeChat: vi.fn(),
      sendChatMessage: vi.fn(),
      loadOlderMessages: vi.fn(),
      refreshConversations: vi.fn(),
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

  it('renders review button for eligible item in delivered order', async () => {
    const deliveredOrder: Order = {
      ...baseMockOrder,
      status: 'delivered',
      items: [
        {
          ...baseMockOrder.items[0],
          reviewState: {
            status: 'eligible',
            reviewId: null,
            canEdit: false,
            remainingEdits: 0,
          },
        },
      ],
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
      expect(screen.getByRole('button', { name: /Đánh giá/i })).toBeInTheDocument()
    })
  })

  it('renders edit review button for reviewed item with remaining edits in delivered order', async () => {
    const deliveredOrder: Order = {
      ...baseMockOrder,
      status: 'delivered',
      items: [
        {
          ...baseMockOrder.items[0],
          reviewState: {
            status: 'reviewed',
            reviewId: 'rev-1',
            canEdit: true,
            remainingEdits: 1,
          },
        },
      ],
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
      expect(screen.getByRole('button', { name: /Sửa đánh giá/i })).toBeInTheDocument()
    })
  })

  it('renders "Hỏi về đơn hàng này" button and clicking opens chat with order id', async () => {
    const mockOpenChat = vi.fn()
    vi.mocked(useChat).mockReturnValue({
      isOpen: false,
      setIsOpen: vi.fn(),
      activeConversation: null,
      conversations: [],
      messages: [],
      hasMore: false,
      isLoadingOlder: false,
      totalUnread: 0,
      isLoading: false,
      isSending: false,
      openChat: mockOpenChat,
      selectConversation: vi.fn(),
      closeChat: vi.fn(),
      sendChatMessage: vi.fn(),
      loadOlderMessages: vi.fn(),
      refreshConversations: vi.fn(),
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

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /Hỏi về đơn hàng này/i })).toHaveLength(2)
    })

    fireEvent.click(screen.getAllByRole('button', { name: /Hỏi về đơn hàng này/i })[0])
    expect(mockOpenChat).toHaveBeenCalledWith('ord-123456')
  })
})
