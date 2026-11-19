import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AdminOrderDetailPage } from './AdminOrderDetailPage'
import * as ordersApi from '@/api/orders'
import { ApiError, type AdminOrder } from '@/api/types'
import type { UseAdminChatSocketOptions } from '@/hooks/useAdminChatSocket'

let capturedSocketOptions: UseAdminChatSocketOptions | undefined

vi.mock('@/hooks/useAdminChatSocket', () => ({
  useAdminChatSocket: (opts: UseAdminChatSocketOptions) => {
    capturedSocketOptions = opts
    return {
      isConnected: true,
      sendPing: vi.fn(),
      reconnect: vi.fn(),
      disconnect: vi.fn(),
    }
  },
}))

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
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('AdminOrderDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedSocketOptions = undefined
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

    // Status Badge (also appears in OrderStepper)
    expect(screen.getAllByText('Đã xác nhận').length).toBeGreaterThanOrEqual(1)

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

  it('opens ship modal on "preparing" status, supports quick-select carrier, validates trackingCode, and submits carrier + trackingCode', async () => {
    vi.mocked(ordersApi.getAdminOrder).mockResolvedValueOnce({
      ...mockOrder,
      status: 'preparing',
    })
    vi.mocked(ordersApi.adminShip).mockResolvedValueOnce({
      ...mockOrder,
      status: 'shipped',
      carrier: 'GHN',
      trackingCode: 'GHN-123456',
      shippedAt: '2026-08-18T11:00:00Z',
    })

    renderWithClient(<AdminOrderDetailPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Bàn giao vận chuyển/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Bàn giao vận chuyển/i }))

    const dialog = screen.getByRole('dialog', { name: /Xuất kho & Bàn giao vận chuyển/i })
    expect(dialog).toBeInTheDocument()
    expect(ordersApi.adminShip).not.toHaveBeenCalled()

    // Quick-select suggestions present
    expect(screen.getByRole('button', { name: 'GHN' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'GHTK' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Viettel Post' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ahamove 2h' })).toBeInTheDocument()

    // Submitting empty shows validation errors
    fireEvent.click(screen.getByRole('button', { name: /Xác nhận xuất kho/i }))
    expect(screen.getByText(/Vui lòng nhập đơn vị vận chuyển/i)).toBeInTheDocument()
    expect(screen.getByText(/Mã vận đơn phải từ 3 đến 64 ký tự/i)).toBeInTheDocument()
    expect(ordersApi.adminShip).not.toHaveBeenCalled()

    // Select quick carrier and type invalid tracking code
    fireEvent.click(screen.getByRole('button', { name: 'GHN' }))
    const trackingInput = screen.getByLabelText(/Mã vận đơn/i)
    fireEvent.change(trackingInput, { target: { value: 'AB!' } })
    fireEvent.click(screen.getByRole('button', { name: /Xác nhận xuất kho/i }))
    expect(screen.getByText(/Mã vận đơn phải từ 3 đến 64 ký tự/i)).toBeInTheDocument()
    expect(ordersApi.adminShip).not.toHaveBeenCalled()

    // Valid tracking code -> submits
    fireEvent.change(trackingInput, { target: { value: 'GHN-123456' } })
    fireEvent.click(screen.getByRole('button', { name: /Xác nhận xuất kho/i }))

    await waitFor(() => {
      expect(ordersApi.adminShip).toHaveBeenCalledWith('ord-999', {
        carrier: 'GHN',
        trackingCode: 'GHN-123456',
      })
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

  it('displays MoMo payment method, payment status badge, transactionId, and paidAt timestamp', async () => {
    vi.mocked(ordersApi.getAdminOrder).mockResolvedValueOnce({
      ...mockOrder,
      id: 'ord-momo-paid',
      status: 'confirmed',
      paymentMethod: 'momo',
      paymentStatus: 'paid',
      paymentTransactionId: '4088812345',
      paidAt: '2026-11-16T10:02:00Z',
    })

    renderWithClient(<AdminOrderDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('Ví điện tử MoMo')).toBeInTheDocument()
    })

    expect(screen.getByText('Đã thanh toán')).toBeInTheDocument()
    expect(screen.getByText('4088812345')).toBeInTheDocument()
    expect(screen.getByText('Thời điểm thanh toán')).toBeInTheDocument()
    expect(screen.getByText('Mã giao dịch MoMo')).toBeInTheDocument()
  })

  it('displays delivery method, voucher discount, carrier, copyable tracking code, OrderStepper and OrderTimeline', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText: writeTextMock } })

    vi.mocked(ordersApi.getAdminOrder).mockResolvedValueOnce({
      ...mockOrder,
      status: 'shipped',
      deliveryMethod: 'express_2h',
      voucherCode: 'AURA500K',
      voucherType: 'fixed_amount',
      discountVnd: '500000',
      shippingFeeVnd: '60000',
      totalVnd: '31560000',
      carrier: 'Ahamove 2h',
      trackingCode: 'AHA-998877',
      preparingAt: '2026-08-18T10:20:00Z',
      shippedAt: '2026-08-18T10:45:00Z',
      timeline: [
        {
          id: 'evt-1',
          status: 'pending_confirmation',
          actorType: 'customer',
          note: 'Đơn hàng được tạo',
          createdAt: '2026-08-18T10:00:00Z',
        },
        {
          id: 'evt-2',
          status: 'preparing',
          actorType: 'admin',
          note: 'Đơn hàng đang được chuẩn bị',
          createdAt: '2026-08-18T10:20:00Z',
        },
        {
          id: 'evt-3',
          status: 'shipped',
          actorType: 'admin',
          note: 'Đã bàn giao vận chuyển (Ahamove 2h - AHA-998877)',
          createdAt: '2026-08-18T10:45:00Z',
        },
      ],
    })

    renderWithClient(<AdminOrderDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('Giao hỏa tốc 2 giờ')).toBeInTheDocument()
    })

    expect(screen.getByText('Ahamove 2h')).toBeInTheDocument()
    expect(screen.getByText('AHA-998877')).toBeInTheDocument()
    expect(screen.getByText(/Giảm giá \(AURA500K\)/)).toBeInTheDocument()
    expect(screen.getByText('-500.000 ₫')).toBeInTheDocument()

    // OrderStepper and OrderTimeline
    expect(screen.getByRole('region', { name: 'Tiến trình đơn hàng' })).toBeInTheDocument()
    expect(screen.getByText('Hành trình đơn hàng')).toBeInTheDocument()
    expect(screen.getByText('Đã bàn giao vận chuyển (Ahamove 2h - AHA-998877)')).toBeInTheDocument()

    // Copy tracking code
    const copyBtn = screen.getByRole('button', { name: /Sao chép mã vận đơn/i })
    fireEvent.click(copyBtn)
    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith('AHA-998877')
    })
  })

  it('auto-refreshes order detail when WebSocket notification matches the open orderId', async () => {
    vi.mocked(ordersApi.getAdminOrder)
      .mockResolvedValueOnce({
        ...mockOrder,
        status: 'preparing',
      })
      .mockResolvedValueOnce({
        ...mockOrder,
        status: 'shipped',
        carrier: 'GHN',
        trackingCode: 'GHN-777',
      })

    renderWithClient(<AdminOrderDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('Đang chuẩn bị hàng')).toBeInTheDocument()
    })
    expect(ordersApi.getAdminOrder).toHaveBeenCalledTimes(1)

    // Unrelated orderId should NOT trigger refresh
    act(() => {
      capturedSocketOptions?.onNotification?.({
        id: 'notif-1',
        recipientId: 'admin-1',
        actorId: null,
        actorName: 'Hệ thống',
        actorRole: null,
        postId: null,
        commentId: null,
        reactionType: null,
        notificationType: 'admin_order_created',
        category: 'order',
        groupKey: 'order:other',
        actorCount: 1,
        excerpt: '',
        metadata: { orderId: 'other-order' },
        isRead: false,
        createdAt: '2026-08-18T11:00:00Z',
        updatedAt: '2026-08-18T11:00:00Z',
      })
    })
    expect(ordersApi.getAdminOrder).toHaveBeenCalledTimes(1)

    // Matching orderId SHOULD trigger refresh
    act(() => {
      capturedSocketOptions?.onNotification?.({
        id: 'notif-2',
        recipientId: 'admin-1',
        actorId: null,
        actorName: 'Khách hàng',
        actorRole: 'customer',
        postId: null,
        commentId: null,
        reactionType: null,
        notificationType: 'admin_order_cancel_requested',
        category: 'order',
        groupKey: 'order:ord-999',
        actorCount: 1,
        excerpt: '',
        metadata: { orderId: 'ord-999' },
        isRead: false,
        createdAt: '2026-08-18T11:01:00Z',
        updatedAt: '2026-08-18T11:01:00Z',
      })
    })

    await waitFor(() => {
      expect(ordersApi.getAdminOrder).toHaveBeenCalledTimes(2)
      expect(screen.getByText('GHN-777')).toBeInTheDocument()
    })
  })
})
