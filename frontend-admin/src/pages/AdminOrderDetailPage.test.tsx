import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AdminOrderDetailPage } from './AdminOrderDetailPage'
import * as ordersApi from '@/api/orders'
import { ApiError, type AdminOrder } from '@/api/types'

vi.mock('@/api/orders', () => ({
  getAdminOrders: vi.fn(),
  getAdminOrder: vi.fn(),
  adminConfirmPreparing: vi.fn(),
  adminShip: vi.fn(),
  adminDeliver: vi.fn(),
  adminApproveCancel: vi.fn(),
  adminDeclineCancel: vi.fn(),
}))

const mockOrder: AdminOrder = {
  id: 'ord-999',
  userId: 'usr-1',
  buyerEmail: 'customer@auraphone.vn',
  status: 'confirmed',
  paymentMethod: 'cod',
  recipientName: 'Trần Văn Hoàng',
  phone: '0912345678',
  provinceName: 'TP. Hồ Chí Minh',
  wardName: 'Phường Bến Nghé',
  detailAddress: '45 Lê Duẩn, Quận 1',
  subtotalVnd: '32000000',
  shippingFeeVnd: '30000',
  totalVnd: '32030000',
  items: [
    {
      id: 'item-1',
      variantId: 'var-1',
      productId: 'prod-1',
      brandName: 'Apple',
      productName: 'iPhone 15 Pro',
      model: 'Titanium 256GB',
      imageUrl: 'https://example.com/ip15.jpg',
      options: [
        { groupLabel: 'Màu sắc', valueLabel: 'Titan Xanh' },
        { groupLabel: 'Dung lượng', valueLabel: '256GB' },
      ],
      unitPriceVnd: '32000000',
      quantity: 1,
      lineTotalVnd: '32000000',
    },
  ],
  createdAt: '2026-08-18T10:00:00Z',
  updatedAt: '2026-08-18T10:30:00Z',
  confirmedAt: '2026-08-18T10:15:00Z',
  cancelledAt: null,
}

function renderWithClient(
  ui: React.ReactElement,
  initialEntries = ['/orders/ord-999']
) {
  const testQueryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
  return render(
    <QueryClientProvider client={testQueryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/orders/:id" element={ui} />
          <Route path="/orders" element={<div>Danh sách đơn hàng</div>} />
          <Route path="/messages" element={<div>Tin nhắn trang đích</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('AdminOrderDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders loading state initially', () => {
    vi.mocked(ordersApi.getAdminOrder).mockReturnValue(new Promise(() => {}))

    renderWithClient(<AdminOrderDetailPage />)

    expect(screen.getByText('Đang tải chi tiết đơn hàng...')).toBeInTheDocument()
  })

  it('renders all order details accurately', async () => {
    vi.mocked(ordersApi.getAdminOrder).mockResolvedValueOnce(mockOrder)

    renderWithClient(<AdminOrderDetailPage />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Đơn hàng #ord-999/i })).toBeInTheDocument()
    })

    // Status Badge
    expect(screen.getByText('Đã xác nhận')).toBeInTheDocument()

    // Customer & Payment
    expect(screen.getByText('customer@auraphone.vn')).toBeInTheDocument()
    expect(screen.getByText('Thanh toán khi nhận hàng (COD)')).toBeInTheDocument()

    // Recipient & Delivery
    expect(screen.getByText('Trần Văn Hoàng')).toBeInTheDocument()
    expect(screen.getByText('0912345678')).toBeInTheDocument()
    expect(screen.getByText(/45 Lê Duẩn, Quận 1/)).toBeInTheDocument()
    expect(screen.getByText(/Phường Bến Nghé/)).toBeInTheDocument()
    expect(screen.getByText(/TP. Hồ Chí Minh/)).toBeInTheDocument()

    // Timestamps
    expect(screen.getByText('Ngày tạo')).toBeInTheDocument()
    expect(screen.getByText('Ngày cập nhật')).toBeInTheDocument()
    expect(screen.getByText('Ngày xác nhận')).toBeInTheDocument()

    // Items table
    expect(screen.getByText('iPhone 15 Pro')).toBeInTheDocument()
    expect(screen.getByText(/Apple/)).toBeInTheDocument()
    expect(screen.getByText(/Titanium 256GB/)).toBeInTheDocument()
    expect(screen.getByText(/Màu sắc: Titan Xanh, Dung lượng: 256GB/)).toBeInTheDocument()
    expect(screen.getAllByText('32.000.000 ₫').length).toBe(3)
    expect(screen.getByText('1')).toBeInTheDocument()

    // Summary financials
    expect(screen.getByText('Tạm tính')).toBeInTheDocument()
    expect(screen.getByText('Phí vận chuyển')).toBeInTheDocument()
    expect(screen.getByText('30.000 ₫')).toBeInTheDocument()
    expect(screen.getByText('Tổng thanh toán')).toBeInTheDocument()
    expect(screen.getByText('32.030.000 ₫')).toBeInTheDocument()
  })

  it('renders cancelledAt timestamp when order is cancelled', async () => {
    const cancelledOrder: AdminOrder = {
      ...mockOrder,
      status: 'cancelled',
      cancelledAt: '2026-08-18T11:00:00Z',
    }
    vi.mocked(ordersApi.getAdminOrder).mockResolvedValueOnce(cancelledOrder)

    renderWithClient(<AdminOrderDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('Ngày hủy')).toBeInTheDocument()
    })
  })

  it('renders correct action button for "confirmed" status and handles mutation', async () => {
    vi.mocked(ordersApi.getAdminOrder).mockResolvedValueOnce({
      ...mockOrder,
      status: 'confirmed',
    })
    vi.mocked(ordersApi.adminConfirmPreparing).mockResolvedValueOnce({
      ...mockOrder,
      status: 'preparing',
    })

    renderWithClient(<AdminOrderDetailPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Xác nhận chuẩn bị hàng/i })).toBeInTheDocument()
    })

    expect(screen.queryByRole('button', { name: /Bàn giao vận chuyển/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Đánh dấu đã giao/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Duyệt hủy/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Xác nhận chuẩn bị hàng/i }))

    await waitFor(() => {
      expect(ordersApi.adminConfirmPreparing).toHaveBeenCalledWith('ord-999')
    })
    expect(await screen.findByText('Đã xác nhận chuẩn bị hàng thành công.')).toBeInTheDocument()
  })

  it('renders correct action button for "preparing" status and handles mutation', async () => {
    vi.mocked(ordersApi.getAdminOrder).mockResolvedValueOnce({
      ...mockOrder,
      status: 'preparing',
    })
    vi.mocked(ordersApi.adminShip).mockResolvedValueOnce({
      ...mockOrder,
      status: 'shipped',
    })

    renderWithClient(<AdminOrderDetailPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Bàn giao vận chuyển/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Bàn giao vận chuyển/i }))

    await waitFor(() => {
      expect(ordersApi.adminShip).toHaveBeenCalledWith('ord-999')
    })
    expect(await screen.findByText('Đã bàn giao đơn hàng cho đơn vị vận chuyển thành công.')).toBeInTheDocument()
  })

  it('renders correct action button for "shipped" status and handles mutation', async () => {
    vi.mocked(ordersApi.getAdminOrder).mockResolvedValueOnce({
      ...mockOrder,
      status: 'shipped',
    })
    vi.mocked(ordersApi.adminDeliver).mockResolvedValueOnce({
      ...mockOrder,
      status: 'delivered',
    })

    renderWithClient(<AdminOrderDetailPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Đánh dấu đã giao/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Đánh dấu đã giao/i }))

    await waitFor(() => {
      expect(ordersApi.adminDeliver).toHaveBeenCalledWith('ord-999')
    })
    expect(await screen.findByText('Đã đánh dấu đơn hàng là đã giao thành công.')).toBeInTheDocument()
  })

  it('renders "Duyệt hủy" and "Từ chối hủy" for "cancel_requested" status and handles decline mutation', async () => {
    vi.mocked(ordersApi.getAdminOrder).mockResolvedValueOnce({
      ...mockOrder,
      status: 'cancel_requested',
    })
    vi.mocked(ordersApi.adminDeclineCancel).mockResolvedValueOnce({
      ...mockOrder,
      status: 'preparing',
    })

    renderWithClient(<AdminOrderDetailPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Từ chối hủy/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Duyệt hủy/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Từ chối hủy/i }))

    await waitFor(() => {
      expect(ordersApi.adminDeclineCancel).toHaveBeenCalledWith('ord-999')
    })
    expect(await screen.findByText('Đã từ chối yêu cầu hủy đơn hàng thành công.')).toBeInTheDocument()
  })

  it('opens AlertDialog on "Duyệt hủy" stating restock warning, allows cancellation or approval', async () => {
    vi.mocked(ordersApi.getAdminOrder).mockResolvedValueOnce({
      ...mockOrder,
      status: 'cancel_requested',
    })
    vi.mocked(ordersApi.adminApproveCancel).mockResolvedValueOnce({
      ...mockOrder,
      status: 'cancelled',
      cancelledAt: '2026-08-18T12:00:00Z',
    })

    renderWithClient(<AdminOrderDetailPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Duyệt hủy/i })).toBeInTheDocument()
    })

    // Click "Duyệt hủy" button
    fireEvent.click(screen.getByRole('button', { name: /Duyệt hủy/i }))

    // AlertDialog should open with warning
    expect(screen.getByRole('heading', { name: 'Xác nhận duyệt hủy đơn hàng' })).toBeInTheDocument()
    expect(
      screen.getByText(/Hành động này sẽ hủy đơn hàng.*và khôi phục tồn kho cho từng sản phẩm trong đơn/)
    ).toBeInTheDocument()

    // Test dismiss / cancel dialog
    const cancelBtn = screen.getByRole('button', { name: 'Hủy bỏ' })
    fireEvent.click(cancelBtn)

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Xác nhận duyệt hủy đơn hàng' })).not.toBeInTheDocument()
    })
    expect(ordersApi.adminApproveCancel).not.toHaveBeenCalled()

    // Open dialog again and confirm
    fireEvent.click(screen.getByRole('button', { name: /Duyệt hủy/i }))
    const confirmApproveBtn = screen.getByRole('button', { name: 'Xác nhận duyệt hủy' })
    fireEvent.click(confirmApproveBtn)

    await waitFor(() => {
      expect(ordersApi.adminApproveCancel).toHaveBeenCalledWith('ord-999')
    })
    expect(
      await screen.findByText('Đã duyệt yêu cầu hủy đơn hàng và khôi phục tồn kho thành công.')
    ).toBeInTheDocument()
  })

  it('does not display action buttons for terminal or unhandled statuses', async () => {
    const statuses: AdminOrder['status'][] = [
      'pending_confirmation',
      'delivered',
      'cancelled',
      'returned',
    ]

    for (const status of statuses) {
      vi.mocked(ordersApi.getAdminOrder).mockResolvedValueOnce({
        ...mockOrder,
        status,
      })

      const { unmount } = renderWithClient(<AdminOrderDetailPage />)

      await waitFor(() => {
        expect(screen.getByText(mockOrder.recipientName)).toBeInTheDocument()
      })

      expect(screen.queryByRole('button', { name: /Xác nhận chuẩn bị hàng/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Bàn giao vận chuyển/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Đánh dấu đã giao/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Duyệt hủy/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Từ chối hủy/i })).not.toBeInTheDocument()

      unmount()
    }
  })

  it('handles business error on mutation (e.g. 409 order_action_not_allowed)', async () => {
    vi.mocked(ordersApi.getAdminOrder).mockResolvedValueOnce({
      ...mockOrder,
      status: 'confirmed',
    })
    vi.mocked(ordersApi.adminConfirmPreparing).mockRejectedValueOnce(
      new ApiError(409, {
        code: 'order_action_not_allowed',
        message: 'Đơn hàng không ở trạng thái cho phép xác nhận chuẩn bị hàng.',
      })
    )

    renderWithClient(<AdminOrderDetailPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Xác nhận chuẩn bị hàng/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Xác nhận chuẩn bị hàng/i }))

    await waitFor(() => {
      expect(
        screen.getByText('Đơn hàng không ở trạng thái cho phép xác nhận chuẩn bị hàng.')
      ).toBeInTheDocument()
    })
  })

  it('renders error state on 404 order not found and allows navigating back', async () => {
    vi.mocked(ordersApi.getAdminOrder).mockRejectedValueOnce(
      new ApiError(404, {
        code: 'order_not_found',
        message: 'Không tìm thấy đơn hàng.',
      })
    )

    renderWithClient(<AdminOrderDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('Không thể tải chi tiết đơn hàng')).toBeInTheDocument()
    })
    expect(screen.getByText('Không tìm thấy đơn hàng.')).toBeInTheDocument()

    const backBtn = screen.getByRole('button', { name: /Về danh sách đơn hàng/i })
    fireEvent.click(backBtn)

    expect(screen.getByText('Danh sách đơn hàng')).toBeInTheDocument()
  })

  it('renders "Nhắn tin cho khách hàng" button and navigates to /messages with orderId (AC-CHAT-04-02)', async () => {
    vi.mocked(ordersApi.getAdminOrder).mockResolvedValue(mockOrder)

    renderWithClient(<AdminOrderDetailPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Nhắn tin cho khách hàng/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Nhắn tin cho khách hàng/i }))

    await waitFor(() => {
      expect(screen.getByText('Tin nhắn trang đích')).toBeInTheDocument()
    })
  })
})
