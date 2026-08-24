import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { ReturnRequestsSection } from './ReturnRequestsSection'
import { ToastProvider } from '@/context/ToastContext'
import { returnRequestsApi } from '@/api/returnRequests'
import { ApiError, type Order } from '@/api/types'
import type { ReturnRequestView } from '@/api/returnRequests'

vi.mock('@/api/returnRequests', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/returnRequests')>()
  return {
    ...actual,
    returnRequestsApi: {
      listReturnRequests: vi.fn(),
      createReturnRequest: vi.fn(),
      cancelReturnRequest: vi.fn(),
    },
  }
})

const DAY_MS = 24 * 60 * 60 * 1000

const baseOrder: Order = {
  id: 'ord-1',
  userId: 'user-1',
  status: 'delivered',
  paymentMethod: 'cod',
  recipientName: 'Nguyễn Văn A',
  phone: '0912345678',
  provinceName: 'Thành phố Hà Nội',
  wardName: 'Phường Phúc Xá',
  detailAddress: '123 Đường Cầu Giấy',
  subtotalVnd: '1000000',
  shippingFeeVnd: '20000',
  totalVnd: '1020000',
  items: [
    {
      id: 'oi-1',
      variantId: 'v-1',
      productId: 'p-1',
      brandName: 'Apple',
      productName: 'iPhone 15 Pro Max',
      model: 'A3106',
      imageUrl: 'https://example.com/iphone.png',
      options: [],
      unitPriceVnd: '500000',
      quantity: 2,
      lineTotalVnd: '1000000',
    },
    {
      id: 'oi-2',
      variantId: 'v-2',
      productId: 'p-2',
      brandName: 'Samsung',
      productName: 'Galaxy S24',
      model: 'S928',
      imageUrl: '',
      options: [],
      unitPriceVnd: '300000',
      quantity: 1,
      lineTotalVnd: '300000',
    },
  ],
  createdAt: '2026-08-19T10:00:00Z',
  updatedAt: '2026-08-20T09:00:00Z',
  deliveredAt: new Date(Date.now() - 1 * DAY_MS).toISOString(),
}

const pendingRequest: ReturnRequestView = {
  id: 'rr-1',
  orderId: 'ord-1',
  status: 'pending_approval',
  reasonCode: 'defective',
  description: 'Màn hình bị nứt',
  items: [
    {
      id: 'ri-1',
      orderItemId: 'oi-1',
      productName: 'iPhone 15 Pro Max',
      imageUrl: 'https://example.com/iphone.png',
      unitPriceVnd: '500000',
      quantity: 1,
    },
  ],
  createdAt: '2026-08-21T08:00:00Z',
  updatedAt: '2026-08-21T08:00:00Z',
}

function renderSection(order: Order) {
  return render(
    <ToastProvider>
      <ReturnRequestsSection order={order} />
    </ToastProvider>
  )
}

describe('ReturnRequestsSection', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(returnRequestsApi.listReturnRequests).mockResolvedValue([])
  })

  it('renders nothing when order status is not delivered or returned', () => {
    const { container } = renderSection({ ...baseOrder, status: 'shipped', deliveredAt: null })
    expect(container.querySelector('h2')).toBeNull()
    expect(
      screen.queryByRole('button', { name: /Yêu cầu trả hàng/i })
    ).not.toBeInTheDocument()
    expect(returnRequestsApi.listReturnRequests).not.toHaveBeenCalled()
  })

  it('shows create button for delivered order within the 7-day window', async () => {
    renderSection(baseOrder)

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Yêu cầu trả hàng/i })
      ).toBeInTheDocument()
    })
  })

  it('shows create button for returned order within the window', async () => {
    renderSection({ ...baseOrder, status: 'returned' })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Yêu cầu trả hàng/i })).toBeInTheDocument()
    })
  })

  it('hides create button when deliveredAt is null', async () => {
    renderSection({ ...baseOrder, deliveredAt: null })

    await waitFor(() => {
      expect(screen.getByText('Chưa có yêu cầu trả hàng nào cho đơn này.')).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /Yêu cầu trả hàng/i })).not.toBeInTheDocument()
  })

  it('hides create button and shows expiry note after the 7-day window', async () => {
    renderSection({
      ...baseOrder,
      deliveredAt: new Date(Date.now() - 8 * DAY_MS).toISOString(),
    })

    await waitFor(() => {
      expect(screen.getByText(/Đã quá 7 ngày kể từ khi nhận hàng/)).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /Yêu cầu trả hàng/i })).not.toBeInTheDocument()
  })

  it('renders requests list with status badge, reason label, item name and formatted price x qty', async () => {
    vi.mocked(returnRequestsApi.listReturnRequests).mockResolvedValue([pendingRequest])
    renderSection(baseOrder)

    await waitFor(() => {
      expect(screen.getByText('Chờ duyệt')).toBeInTheDocument()
    })
    expect(screen.getByText('Hàng bị lỗi hoặc hư hỏng')).toBeInTheDocument()
    expect(screen.getByText('Màn hình bị nứt')).toBeInTheDocument()
    expect(screen.getByText('iPhone 15 Pro Max')).toBeInTheDocument()
    expect(screen.getByText(/500\.000 ₫\s*×\s*1/)).toBeInTheDocument()
    expect(returnRequestsApi.listReturnRequests).toHaveBeenCalledWith('ord-1')
  })

  it('shows reject reason for a rejected request', async () => {
    vi.mocked(returnRequestsApi.listReturnRequests).mockResolvedValue([
      {
        ...pendingRequest,
        id: 'rr-2',
        status: 'rejected',
        rejectReason: 'Hàng đã qua sử dụng',
        rejectedAt: '2026-08-21T10:00:00Z',
      },
    ])
    renderSection(baseOrder)

    await waitFor(() => {
      expect(screen.getByText('Bị từ chối')).toBeInTheDocument()
    })
    expect(screen.getByText('Lý do từ chối:')).toBeInTheDocument()
    expect(screen.getByText('Hàng đã qua sử dụng')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rút yêu cầu' })).not.toBeInTheDocument()
  })

  it('shows refund amount for a refunded request', async () => {
    vi.mocked(returnRequestsApi.listReturnRequests).mockResolvedValue([
      {
        ...pendingRequest,
        id: 'rr-3',
        status: 'refunded',
        refundAmountVnd: '520000',
        refundedAt: '2026-08-21T12:00:00Z',
      },
    ])
    renderSection(baseOrder)

    await waitFor(() => {
      expect(screen.getByText('Đã hoàn tiền')).toBeInTheDocument()
    })
    expect(screen.getByText('520.000 ₫')).toBeInTheDocument()
  })

  it('caps quantity options by purchased minus consumed quantities across consuming statuses (SR4)', async () => {
    vi.mocked(returnRequestsApi.listReturnRequests).mockResolvedValue([pendingRequest])
    renderSection(baseOrder)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Yêu cầu trả hàng/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Yêu cầu trả hàng/i }))

    // oi-1: purchased 2, consumed 1 by pending_approval -> options 0..1
    const selectOi1 = screen.getByLabelText('Số lượng trả cho iPhone 15 Pro Max')
    const oi1Options = within(selectOi1).getAllByRole('option')
    expect(oi1Options.map((o) => o.textContent)).toEqual(['0', '1'])

    // oi-2: purchased 1, nothing consumed -> options 0..1
    const selectOi2 = screen.getByLabelText('Số lượng trả cho Galaxy S24')
    const oi2Options = within(selectOi2).getAllByRole('option')
    expect(oi2Options.map((o) => o.textContent)).toEqual(['0', '1'])
  })

  it('submits create request with payload, refetches list and shows success toast', async () => {
    vi.mocked(returnRequestsApi.createReturnRequest).mockResolvedValue({
      ...pendingRequest,
      id: 'rr-new',
      cancelledAt: null,
    })
    renderSection(baseOrder)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Yêu cầu trả hàng/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Yêu cầu trả hàng/i }))
    expect(screen.getByText(/Chọn số lượng cần trả/)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Số lượng trả cho iPhone 15 Pro Max'), {
      target: { value: '1' },
    })
    fireEvent.change(screen.getByLabelText('Lý do trả hàng'), {
      target: { value: 'defective' },
    })
    fireEvent.change(screen.getByPlaceholderText(/Mô tả chi tiết tình trạng hàng hóa/), {
      target: { value: 'Máy bị lỗi cảm ứng' },
    })

    fireEvent.click(screen.getByRole('button', { name: /Gửi yêu cầu/i }))

    await waitFor(() => {
      expect(returnRequestsApi.createReturnRequest).toHaveBeenCalledWith('ord-1', {
        items: [{ orderItemId: 'oi-1', quantity: 1 }],
        reasonCode: 'defective',
        description: 'Máy bị lỗi cảm ứng',
      })
    })
    expect(await screen.findByText('Đã gửi yêu cầu trả hàng')).toBeInTheDocument()
    await waitFor(() => {
      expect(returnRequestsApi.listReturnRequests).toHaveBeenCalledTimes(2)
    })
  })

  it('requires at least one selected item and a reason before submitting', async () => {
    renderSection(baseOrder)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Yêu cầu trả hàng/i })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /Yêu cầu trả hàng/i }))
    fireEvent.click(screen.getByRole('button', { name: /Gửi yêu cầu/i }))

    expect(
      await screen.findByText('Vui lòng chọn số lượng cần trả cho ít nhất một sản phẩm.')
    ).toBeInTheDocument()
    expect(screen.getByText('Vui lòng chọn lý do trả hàng.')).toBeInTheDocument()
    expect(returnRequestsApi.createReturnRequest).not.toHaveBeenCalled()
  })

  it('binds server validation error fields to the form (HTTP 400)', async () => {
    vi.mocked(returnRequestsApi.createReturnRequest).mockRejectedValue(
      new ApiError(400, {
        code: 'validation_error',
        message: 'Dữ liệu không hợp lệ',
        fields: { reasonCode: 'Lý do không hợp lệ' },
      })
    )
    renderSection(baseOrder)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Yêu cầu trả hàng/i })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /Yêu cầu trả hàng/i }))
    fireEvent.change(screen.getByLabelText('Số lượng trả cho iPhone 15 Pro Max'), {
      target: { value: '1' },
    })
    fireEvent.change(screen.getByLabelText('Lý do trả hàng'), {
      target: { value: 'changed_mind' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Gửi yêu cầu/i }))

    expect(await screen.findByText('Lý do không hợp lệ')).toBeInTheDocument()
  })

  it('displays Vietnamese business error message via toast on HTTP 409', async () => {
    vi.mocked(returnRequestsApi.createReturnRequest).mockRejectedValue(
      new ApiError(409, {
        code: 'return_window_expired',
        message: 'Đã quá thời hạn cho phép tạo yêu cầu trả hàng.',
      })
    )
    renderSection(baseOrder)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Yêu cầu trả hàng/i })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /Yêu cầu trả hàng/i }))
    fireEvent.change(screen.getByLabelText('Số lượng trả cho iPhone 15 Pro Max'), {
      target: { value: '1' },
    })
    fireEvent.change(screen.getByLabelText('Lý do trả hàng'), {
      target: { value: 'defective' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Gửi yêu cầu/i }))

    expect(
      await screen.findByText('Đã quá thời hạn cho phép tạo yêu cầu trả hàng.')
    ).toBeInTheDocument()
    expect(screen.getByText('Gửi yêu cầu thất bại')).toBeInTheDocument()
  })

  it('cancels a pending_approval request after confirmation and refetches', async () => {
    vi.mocked(returnRequestsApi.listReturnRequests)
      .mockResolvedValueOnce([pendingRequest])
      .mockResolvedValueOnce([{ ...pendingRequest, status: 'cancelled', cancelledAt: '2026-08-21T11:00:00Z' }])
    vi.mocked(returnRequestsApi.cancelReturnRequest).mockResolvedValue({
      ...pendingRequest,
      status: 'cancelled',
      cancelledAt: '2026-08-21T11:00:00Z',
    })
    renderSection(baseOrder)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Rút yêu cầu' })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Rút yêu cầu' }))
    expect(
      screen.getByText(/Bạn có chắc muốn rút yêu cầu trả hàng này không?/)
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Xác nhận rút yêu cầu/i }))

    await waitFor(() => {
      expect(returnRequestsApi.cancelReturnRequest).toHaveBeenCalledWith('ord-1', 'rr-1')
    })
    expect(await screen.findByText('Đã rút yêu cầu')).toBeInTheDocument()
    await waitFor(() => {
      expect(returnRequestsApi.listReturnRequests).toHaveBeenCalledTimes(2)
    })
    expect(await screen.findByText('Đã hủy')).toBeInTheDocument()
  })

  it('displays business error message when cancelling fails with HTTP 409', async () => {
    vi.mocked(returnRequestsApi.listReturnRequests).mockResolvedValue([pendingRequest])
    vi.mocked(returnRequestsApi.cancelReturnRequest).mockRejectedValue(
      new ApiError(409, {
        code: 'return_action_not_allowed',
        message: 'Yêu cầu không còn ở trạng thái chờ duyệt nên không thể rút.',
      })
    )
    renderSection(baseOrder)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Rút yêu cầu' })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Rút yêu cầu' }))
    fireEvent.click(screen.getByRole('button', { name: /Xác nhận rút yêu cầu/i }))

    expect(
      await screen.findByText('Yêu cầu không còn ở trạng thái chờ duyệt nên không thể rút.')
    ).toBeInTheDocument()
  })

  it('shows load error state with retry button when listing fails', async () => {
    vi.mocked(returnRequestsApi.listReturnRequests).mockRejectedValue(
      new ApiError(404, { code: 'order_not_found', message: 'Không tìm thấy đơn hàng.' })
    )
    renderSection(baseOrder)

    expect(await screen.findByText('Không tìm thấy đơn hàng.')).toBeInTheDocument()

    vi.mocked(returnRequestsApi.listReturnRequests).mockResolvedValue([])
    fireEvent.click(screen.getByRole('button', { name: /Thử lại/i }))

    await waitFor(() => {
      expect(screen.getByText('Chưa có yêu cầu trả hàng nào cho đơn này.')).toBeInTheDocument()
    })
  })
})
