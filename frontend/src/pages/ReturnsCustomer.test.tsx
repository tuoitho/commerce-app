import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { OrderDetailPage } from './OrderDetailPage'
import { OrderHistoryPage } from './OrderHistoryPage'
import { useAuth } from '@/context/AuthContext'
import { ToastProvider } from '@/context/ToastContext'
import { ordersApi } from '@/api/orders'
import * as returnsApi from '@/api/returns'
import type { Order } from '@/api/types'

// Mock context hooks
vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

// Mock API modules
vi.mock('@/api/orders', () => ({
  ordersApi: {
    getOrder: vi.fn(),
    listOrders: vi.fn(),
    getOrderStats: vi.fn(),
    cancelOrder: vi.fn(),
    undoCancelOrder: vi.fn(),
  },
}))

vi.mock('@/api/returns', () => ({
  createReturn: vi.fn(),
  cancelReturn: vi.fn(),
}))

const deliveredOrderMock: Order = {
  id: 'ord-del-123',
  userId: 'user-1',
  status: 'delivered',
  paymentMethod: 'cod',
  recipientName: 'Trần Thị B',
  phone: '0987654321',
  provinceName: 'Thành phố Hồ Chí Minh',
  wardName: 'Phường Bến Nghé',
  detailAddress: '456 Lê Duẩn',
  subtotalVnd: '50000000',
  shippingFeeVnd: '30000',
  totalVnd: '50030000',
  deliveredAt: '2026-08-25T10:00:00Z',
  returnEligibility: {
    eligible: true,
    deadline: '2026-09-01T16:59:59.999Z',
  },
  items: [
    {
      id: 'item-1',
      variantId: 'var-1',
      productId: 'prod-1',
      brandName: 'Samsung',
      productName: 'Galaxy S24 Ultra',
      model: 'SM-S928B',
      imageUrl: 'https://example.com/s24.png',
      options: [{ groupLabel: 'Màu sắc', valueLabel: 'Xám Titan' }],
      unitPriceVnd: '30000000',
      quantity: 1,
      lineTotalVnd: '30000000',
    },
    {
      id: 'item-2',
      variantId: 'var-2',
      productId: 'prod-2',
      brandName: 'Apple',
      productName: 'iPad Air 5',
      model: 'A2588',
      imageUrl: 'https://example.com/ipad.png',
      options: [{ groupLabel: 'Màu sắc', valueLabel: 'Xanh' }],
      unitPriceVnd: '20000000',
      quantity: 1,
      lineTotalVnd: '20000000',
    },
  ],
  createdAt: '2026-08-20T10:00:00Z',
  updatedAt: '2026-08-25T10:00:00Z',
}

describe('Customer Order Returns Workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAuth as any).mockReturnValue({
      user: { id: 'user-1', email: 'customer@example.com', role: 'customer' },
      isAuthenticated: true,
      isLoading: false,
    })
  })

  it('renders return request button when order is delivered and eligible', async () => {
    ;(ordersApi.getOrder as any).mockResolvedValue(deliveredOrderMock)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/orders/ord-del-123']}>
          <Routes>
            <Route path="/orders/:id" element={<OrderDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Chi tiết đơn hàng')).toBeInTheDocument()
    })

    const returnBtn = screen.getByRole('button', { name: /yêu cầu trả hàng/i })
    expect(returnBtn).toBeInTheDocument()
  })

  it('opens dialog, selects items, shows correct refund preview, and submits return request', async () => {
    ;(ordersApi.getOrder as any).mockResolvedValue(deliveredOrderMock)
    ;(returnsApi.createReturn as any).mockResolvedValue({
      id: 'ret-123',
      orderId: 'ord-del-123',
      status: 'pending_approval',
    })

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/orders/ord-del-123']}>
          <Routes>
            <Route path="/orders/:id" element={<OrderDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /yêu cầu trả hàng/i })).toBeInTheDocument()
    })

    // Click to open return dialog
    fireEvent.click(screen.getByRole('button', { name: /yêu cầu trả hàng/i }))

    // Dialog title
    await waitFor(() => {
      expect(screen.getByText('Yêu cầu trả hàng & hoàn tiền')).toBeInTheDocument()
    })

    // Select the first item inside dialog
    const itemElements = screen.getAllByText('Galaxy S24 Ultra')
    const item1InDialog = itemElements[itemElements.length - 1]
    fireEvent.click(item1InDialog)

    // Verify refund amount for partial return: 30.000.000 ₫ (no shipping fee)
    expect(screen.getAllByText(/30\.000\.000/).length).toBeGreaterThan(0)

    // Now click select all to test full return with shipping fee
    const selectAllBtn = screen.getByRole('button', { name: /chọn tất cả/i })
    fireEvent.click(selectAllBtn)

    // Verify total refund preview is 50.030.000 ₫ (including 30.000 shipping fee)
    expect(screen.getAllByText(/50\.030\.000/).length).toBeGreaterThan(0)

    // Submit form
    const submitBtn = screen.getByRole('button', { name: /gửi yêu cầu trả hàng/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(returnsApi.createReturn).toHaveBeenCalledWith('ord-del-123', {
        orderItemIds: ['item-1', 'item-2'],
        reasonCode: 'defective',
      })
    })
  })

  it('renders return banner for pending_approval and allows customer to cancel return request', async () => {
    const orderWithPendingReturn: Order = {
      ...deliveredOrderMock,
      returnEligibility: {
        eligible: false,
        deadline: '2026-09-01T16:59:59.999Z',
      },
      latestReturnRequest: {
        id: 'ret-pending-1',
        orderId: 'ord-del-123',
        userId: 'user-1',
        status: 'pending_approval',
        reasonCode: 'defective',
        description: 'Màn hình bị sọc',
        expectedRefundVnd: '30000000',
        items: [
          {
            orderItemId: 'item-1',
            variantId: 'var-1',
            productName: 'Galaxy S24 Ultra',
            quantity: 1,
            unitPriceVnd: '30000000',
            lineTotalVnd: '30000000',
          },
        ],
        createdAt: '2026-08-26T10:00:00Z',
        updatedAt: '2026-08-26T10:00:00Z',
      },
    }

    ;(ordersApi.getOrder as any).mockResolvedValue(orderWithPendingReturn)
    ;(returnsApi.cancelReturn as any).mockResolvedValue({
      id: 'ret-pending-1',
      status: 'cancelled',
    })

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/orders/ord-del-123']}>
          <Routes>
            <Route path="/orders/:id" element={<OrderDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Thông tin trả hàng & hoàn tiền')).toBeInTheDocument()
      expect(screen.getByText('Chờ xét duyệt')).toBeInTheDocument()
      expect(screen.getByText('Màn hình bị sọc')).toBeInTheDocument()
      expect(screen.getByText('Đã yêu cầu trả')).toBeInTheDocument()
    })

    // Click Cancel Return button
    const cancelReturnBtn = screen.getByRole('button', { name: /hủy yêu cầu trả hàng/i })
    fireEvent.click(cancelReturnBtn)

    // Confirmation dialog
    await waitFor(() => {
      expect(screen.getByText('Bạn có chắc chắn muốn rút lại yêu cầu trả hàng này không? Sau khi hủy, bạn vẫn có thể gửi lại yêu cầu nếu còn trong thời hạn 7 ngày.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /xác nhận hủy yêu cầu/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /xác nhận hủy yêu cầu/i }))

    await waitFor(() => {
      expect(returnsApi.cancelReturn).toHaveBeenCalledWith('ord-del-123', 'ret-pending-1')
    })
  })

  it('renders shop rejection reason when return request is rejected', async () => {
    const orderWithRejectedReturn: Order = {
      ...deliveredOrderMock,
      returnEligibility: {
        eligible: true, // within 7 days, allowed to retry
        deadline: '2026-09-01T16:59:59.999Z',
      },
      latestReturnRequest: {
        id: 'ret-rej-1',
        orderId: 'ord-del-123',
        userId: 'user-1',
        status: 'rejected',
        reasonCode: 'defective',
        rejectReason: 'Sản phẩm đã bị rách tem niêm phong',
        expectedRefundVnd: '30000000',
        items: [],
        createdAt: '2026-08-26T10:00:00Z',
        updatedAt: '2026-08-26T14:00:00Z',
        rejectedAt: '2026-08-26T14:00:00Z',
      },
    }

    ;(ordersApi.getOrder as any).mockResolvedValue(orderWithRejectedReturn)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/orders/ord-del-123']}>
          <Routes>
            <Route path="/orders/:id" element={<OrderDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Từ chối trả hàng')).toBeInTheDocument()
      expect(screen.getByText('Sản phẩm đã bị rách tem niêm phong')).toBeInTheDocument()
      // Allowed to retry return request
      expect(screen.getByRole('button', { name: /yêu cầu trả hàng/i })).toBeInTheDocument()
    })
  })

  it('renders expired notice when delivered order has passed return deadline', async () => {
    const expiredOrder: Order = {
      ...deliveredOrderMock,
      returnEligibility: {
        eligible: false,
        deadline: '2026-08-20T16:59:59.999Z',
      },
      latestReturnRequest: undefined,
    }

    ;(ordersApi.getOrder as any).mockResolvedValue(expiredOrder)

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/orders/ord-del-123']}>
          <Routes>
            <Route path="/orders/:id" element={<OrderDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(
        screen.getByText('Đã hết thời hạn 7 ngày để yêu cầu trả hàng')
      ).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /yêu cầu trả hàng/i })).not.toBeInTheDocument()
    })
  })

  it('renders return status badge in OrderHistoryPage for returned/partially returned orders', async () => {
    ;(ordersApi.getOrderStats as any).mockResolvedValue({
      all: 1,
      pending: 0,
      pickup: 0,
      delivery: 0,
      delivered: 0,
      returns: 1,
      cancelled: 0,
    })
    ;(ordersApi.listOrders as any).mockResolvedValue([
      {
        ...deliveredOrderMock,
        status: 'partially_returned',
        latestReturnRequest: {
          id: 'ret-1',
          status: 'refunded',
        },
      },
    ])

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
      expect(screen.getByText('Trả một phần')).toBeInTheDocument()
      expect(screen.getByText('Trả hàng: Đã hoàn tiền')).toBeInTheDocument()
    })
  })
})
