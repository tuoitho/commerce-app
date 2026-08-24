import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReturnRequestDetailPage } from './ReturnRequestDetailPage'
import * as returnRequestsApi from '@/api/returnRequests'
import { ApiError } from '@/api/types'
import type { AdminReturnRequestView } from '@/api/returnRequests'

vi.mock('@/api/returnRequests', () => ({
  getAdminReturnRequests: vi.fn(),
  getAdminReturnRequest: vi.fn(),
  approveReturnRequest: vi.fn(),
  rejectReturnRequest: vi.fn(),
  receiveReturnRequest: vi.fn(),
  refundReturnRequest: vi.fn(),
  RETURN_STATUS_LABELS: {
    pending_approval: 'Chờ duyệt',
    approved: 'Đã duyệt',
    received: 'Đã nhận hàng',
    refunded: 'Đã hoàn tiền',
    rejected: 'Bị từ chối',
    cancelled: 'Khách đã rút',
  },
  RETURN_REASON_LABELS: {
    defective: 'Hàng bị lỗi hoặc hư hỏng',
    not_as_described: 'Hàng không giống mô tả',
    wrong_or_missing: 'Giao sai hoặc thiếu hàng',
    changed_mind: 'Khách thay đổi ý định mua',
  },
}))

const requestId = 'rr-10000000-0000-0000-0000-000000000001'
const orderId = 'ord-20000000-0000-0000-0000-000000000002'

const mockRequest: AdminReturnRequestView = {
  id: requestId,
  orderId,
  status: 'pending_approval',
  reasonCode: 'defective',
  description: 'Màn hình bị nứt khi nhận hàng',
  items: [
    {
      id: 'ri-1',
      orderItemId: 'oi-1',
      productName: 'iPhone 15 Pro Max',
      imageUrl: 'https://example.com/iphone.jpg',
      unitPriceVnd: '500000',
      quantity: 1,
    },
    {
      id: 'ri-2',
      orderItemId: 'oi-2',
      productName: 'Ốp lưng MagSafe',
      imageUrl: '',
      unitPriceVnd: '300000',
      quantity: 2,
    },
  ],
  createdAt: '2026-08-20T09:00:00Z',
  updatedAt: '2026-08-20T09:00:00Z',
  buyerEmail: 'nguyenvana@gmail.com',
  buyerUserId: 'usr-1',
  orderTotalVnd: '1300000',
  shippingFeeVnd: '20000',
  suggestedRefundVnd: '520000',
}

function renderWithClient(
  ui: React.ReactElement,
  initialEntries = [`/return-requests/${requestId}`]
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
          <Route path="/return-requests/:requestId" element={ui} />
          <Route path="/return-requests" element={<div>Danh sách yêu cầu trả hàng</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('ReturnRequestDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders loading state initially', () => {
    vi.mocked(returnRequestsApi.getAdminReturnRequest).mockReturnValue(new Promise(() => {}))

    renderWithClient(<ReturnRequestDetailPage />)

    expect(screen.getByText('Đang tải chi tiết yêu cầu trả hàng...')).toBeInTheDocument()
  })

  it('renders all request details accurately per AdminReturnRequestView contract', async () => {
    // RETURN-ADMIN-API-005: suggestedRefundVnd theo SR6, buyerEmail, shippingFeeVnd
    vi.mocked(returnRequestsApi.getAdminReturnRequest).mockResolvedValue(mockRequest)

    renderWithClient(<ReturnRequestDetailPage />)

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Yêu cầu trả hàng #rr-10000/i })
      ).toBeInTheDocument()
    })

    expect(screen.getByText('Chờ duyệt')).toBeInTheDocument()
    expect(screen.getByText('nguyenvana@gmail.com')).toBeInTheDocument()
    expect(screen.getByText('#ord-2000')).toBeInTheDocument()

    // Money formatting
    expect(screen.getByText('1.300.000 ₫')).toBeInTheDocument() // orderTotalVnd
    expect(screen.getByText('20.000 ₫')).toBeInTheDocument() // shippingFeeVnd
    expect(screen.getByText('520.000 ₫')).toBeInTheDocument() // suggestedRefundVnd

    // Reason label mapped CLIENT-SIDE
    expect(screen.getByText('Hàng bị lỗi hoặc hư hỏng')).toBeInTheDocument()
    expect(screen.getByText('Màn hình bị nứt khi nhận hàng')).toBeInTheDocument()

    // Items table
    expect(screen.getByText('iPhone 15 Pro Max')).toBeInTheDocument()
    expect(screen.getByText('Ốp lưng MagSafe')).toBeInTheDocument()
    expect(screen.getAllByText('500.000 ₫').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('600.000 ₫')).toBeInTheDocument() // 300000 x 2
    expect(screen.getByText('2')).toBeInTheDocument()

    // Timeline
    expect(screen.getByText('Ngày tạo')).toBeInTheDocument()
    expect(screen.queryByText('Ngày duyệt')).not.toBeInTheDocument()
    expect(screen.queryByText('Ngày hoàn tiền')).not.toBeInTheDocument()
  })

  it('renders Duyệt and Từ chối actions only for pending_approval and handles approve mutation', async () => {
    // RETURN-ADMIN-API-007: approve từ pending_approval
    const approved = {
      ...mockRequest,
      status: 'approved' as const,
      approvedAt: '2026-08-21T08:00:00Z',
    }
    vi.mocked(returnRequestsApi.getAdminReturnRequest)
      .mockResolvedValueOnce(mockRequest)
      .mockResolvedValue(approved)
    vi.mocked(returnRequestsApi.approveReturnRequest).mockResolvedValue(approved)

    renderWithClient(<ReturnRequestDetailPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Duyệt/i })).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /Từ chối/i })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Xác nhận đã nhận hàng/i })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Ghi nhận hoàn tiền/i })
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Duyệt/i }))

    await waitFor(() => {
      expect(returnRequestsApi.approveReturnRequest).toHaveBeenCalledWith(requestId)
    })
    expect(await screen.findByText('Đã duyệt yêu cầu trả hàng thành công.')).toBeInTheDocument()
    expect(await screen.findByText('Đã duyệt')).toBeInTheDocument()
    expect(screen.getByText('Ngày duyệt')).toBeInTheDocument()
  })

  it('rejects with required reason through dialog and disables empty submit', async () => {
    // RETURN-ADMIN-API-008/-009: reject bắt buộc lý do
    const rejected = {
      ...mockRequest,
      status: 'rejected' as const,
      rejectReason: 'Hàng đã qua sử dụng',
      rejectedAt: '2026-08-21T09:00:00Z',
    }
    vi.mocked(returnRequestsApi.getAdminReturnRequest)
      .mockResolvedValueOnce(mockRequest)
      .mockResolvedValue(rejected)
    vi.mocked(returnRequestsApi.rejectReturnRequest).mockResolvedValue(rejected)

    renderWithClient(<ReturnRequestDetailPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Từ chối/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Từ chối/i }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Từ chối yêu cầu trả hàng' })).toBeInTheDocument()

    const submitBtn = within(dialog).getByRole('button', { name: /Xác nhận từ chối/i })
    expect(submitBtn).toBeDisabled()

    fireEvent.change(within(dialog).getByLabelText(/Lý do từ chối/), {
      target: { value: 'Hàng đã qua sử dụng' },
    })
    expect(submitBtn).not.toBeDisabled()

    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(returnRequestsApi.rejectReturnRequest).toHaveBeenCalledWith(requestId, {
        reason: 'Hàng đã qua sử dụng',
      })
    })
    expect(await screen.findByText('Đã từ chối yêu cầu trả hàng thành công.')).toBeInTheDocument()
    expect(screen.getByText('Bị từ chối')).toBeInTheDocument()
    expect(screen.getByText('Hàng đã qua sử dụng')).toBeInTheDocument()
    expect(screen.getByText('Ngày từ chối')).toBeInTheDocument()
  })

  it('surfaces validation error.fields.reason inside reject dialog without closing it', async () => {
    vi.mocked(returnRequestsApi.getAdminReturnRequest).mockResolvedValue(mockRequest)
    vi.mocked(returnRequestsApi.rejectReturnRequest).mockRejectedValueOnce(
      new ApiError(400, {
        code: 'validation_error',
        message: 'Dữ liệu không hợp lệ',
        fields: { reason: 'Lý do từ chối không được để trống.' },
      })
    )

    renderWithClient(<ReturnRequestDetailPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Từ chối/i })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /Từ chối/i }))

    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(/Lý do từ chối/), {
      target: { value: 'Không đạt' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: /Xác nhận từ chối/i }))

    await waitFor(() => {
      expect(returnRequestsApi.rejectReturnRequest).toHaveBeenCalled()
    })
    expect(await screen.findByText('Lý do từ chối không được để trống.')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('confirms receive via AlertDialog restock warning before calling API', async () => {
    // RETURN-ADMIN-API-011 + SR8: xác nhận nhận hàng hoàn kho
    const received = {
      ...mockRequest,
      status: 'received' as const,
      receivedAt: '2026-08-21T10:00:00Z',
    }
    vi.mocked(returnRequestsApi.getAdminReturnRequest)
      .mockResolvedValueOnce({ ...mockRequest, status: 'approved' as const })
      .mockResolvedValue(received)
    vi.mocked(returnRequestsApi.receiveReturnRequest).mockResolvedValue(received)

    renderWithClient(<ReturnRequestDetailPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Xác nhận đã nhận hàng/i })).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /Từ chối/i })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Ghi nhận hoàn tiền/i })
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Xác nhận đã nhận hàng/i }))

    const alertdialog = screen.getByRole('alertdialog')
    expect(
      within(alertdialog).getByRole('heading', { name: 'Xác nhận đã nhận lại hàng' })
    ).toBeInTheDocument()
    expect(within(alertdialog).getByText(/khôi phục tồn kho \(hoàn kho\)/)).toBeInTheDocument()

    // Cancel first — no API call
    fireEvent.click(within(alertdialog).getByRole('button', { name: 'Hủy bỏ' }))
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
    expect(returnRequestsApi.receiveReturnRequest).not.toHaveBeenCalled()

    // Reopen and confirm
    fireEvent.click(screen.getByRole('button', { name: /Xác nhận đã nhận hàng/i }))
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Xác nhận đã nhận hàng',
      })
    )

    await waitFor(() => {
      expect(returnRequestsApi.receiveReturnRequest).toHaveBeenCalledWith(requestId)
    })
    expect(
      await screen.findByText('Đã xác nhận nhận hàng và hoàn kho thành công.')
    ).toBeInTheDocument()
    expect(screen.getByText('Đã nhận hàng')).toBeInTheDocument()
  })

  it('opens refund dialog prefilled with suggestedRefundVnd and blocks non-positive digit input', async () => {
    // RETURN-ADMIN-API-013: amount "0"/"abc"/"-100" phải bị chặn
    vi.mocked(returnRequestsApi.getAdminReturnRequest).mockResolvedValue({
      ...mockRequest,
      status: 'received' as const,
      receivedAt: '2026-08-21T10:00:00Z',
    })

    renderWithClient(<ReturnRequestDetailPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Ghi nhận hoàn tiền/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Ghi nhận hoàn tiền/i }))

    const dialog = screen.getByRole('dialog')
    const amountInput = within(dialog).getByLabelText(/Số tiền hoàn/) as HTMLInputElement
    expect(amountInput.value).toBe('520000')

    const submitBtn = within(dialog).getByRole('button', { name: /Xác nhận hoàn tiền/i })

    fireEvent.change(amountInput, { target: { value: '0' } })
    expect(submitBtn).toBeDisabled()

    fireEvent.change(amountInput, { target: { value: 'abc' } })
    expect(submitBtn).toBeDisabled()

    fireEvent.change(amountInput, { target: { value: '-100' } })
    expect(submitBtn).toBeDisabled()
    expect(returnRequestsApi.refundReturnRequest).not.toHaveBeenCalled()
  })

  it('records refund with valid digit-string amount and shows refunded state', async () => {
    // RETURN-ADMIN-API-014: refund "520000" → refunded, refundAmountVnd, đơn returned (SR7 phía server)
    const refunded = {
      ...mockRequest,
      status: 'refunded' as const,
      receivedAt: '2026-08-21T10:00:00Z',
      refundedAt: '2026-08-21T11:00:00Z',
      refundAmountVnd: '520000',
    }
    vi.mocked(returnRequestsApi.getAdminReturnRequest)
      .mockResolvedValueOnce({
        ...mockRequest,
        status: 'received' as const,
        receivedAt: '2026-08-21T10:00:00Z',
      })
      .mockResolvedValue(refunded)
    vi.mocked(returnRequestsApi.refundReturnRequest).mockResolvedValue(refunded)

    renderWithClient(<ReturnRequestDetailPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Ghi nhận hoàn tiền/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Ghi nhận hoàn tiền/i }))

    const dialog = screen.getByRole('dialog')
    const amountInput = within(dialog).getByLabelText(/Số tiền hoàn/)
    fireEvent.change(amountInput, { target: { value: '520000' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /Xác nhận hoàn tiền/i }))

    await waitFor(() => {
      expect(returnRequestsApi.refundReturnRequest).toHaveBeenCalledWith(requestId, {
        amount: '520000',
      })
    })
    expect(await screen.findByText('Đã ghi nhận hoàn tiền thành công.')).toBeInTheDocument()
    expect(screen.getByText('Đã hoàn tiền')).toBeInTheDocument()
    expect(screen.getByText('Số tiền đã hoàn')).toBeInTheDocument()
    expect(screen.getByText('Ngày hoàn tiền')).toBeInTheDocument()
  })

  it('surfaces validation error.fields.amount inside refund dialog', async () => {
    vi.mocked(returnRequestsApi.getAdminReturnRequest).mockResolvedValue({
      ...mockRequest,
      status: 'received' as const,
      receivedAt: '2026-08-21T10:00:00Z',
    })
    vi.mocked(returnRequestsApi.refundReturnRequest).mockRejectedValueOnce(
      new ApiError(400, {
        code: 'validation_error',
        message: 'Dữ liệu không hợp lệ',
        fields: { amount: 'Số tiền phải là số nguyên dương.' },
      })
    )

    renderWithClient(<ReturnRequestDetailPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Ghi nhận hoàn tiền/i })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /Ghi nhận hoàn tiền/i }))

    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /Xác nhận hoàn tiền/i }))

    await waitFor(() => {
      expect(returnRequestsApi.refundReturnRequest).toHaveBeenCalledWith(requestId, {
        amount: '520000',
      })
    })
    expect(await screen.findByText('Số tiền phải là số nguyên dương.')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('shows envelope error.message on business error (409 return_action_not_allowed)', async () => {
    vi.mocked(returnRequestsApi.getAdminReturnRequest).mockResolvedValue(mockRequest)
    vi.mocked(returnRequestsApi.approveReturnRequest).mockRejectedValueOnce(
      new ApiError(409, {
        code: 'return_action_not_allowed',
        message: 'Yêu cầu không còn ở trạng thái chờ duyệt.',
      })
    )

    renderWithClient(<ReturnRequestDetailPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Duyệt/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Duyệt/i }))

    await waitFor(() => {
      expect(screen.getByText('Yêu cầu không còn ở trạng thái chờ duyệt.')).toBeInTheDocument()
    })
  })

  it('renders no action buttons for terminal statuses', async () => {
    const statuses: AdminReturnRequestView['status'][] = ['refunded', 'rejected', 'cancelled']

    for (const status of statuses) {
      vi.mocked(returnRequestsApi.getAdminReturnRequest).mockResolvedValueOnce({
        ...mockRequest,
        status,
      })

      const { unmount } = renderWithClient(<ReturnRequestDetailPage />)

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /Yêu cầu trả hàng #rr-10000/i })
        ).toBeInTheDocument()
      })

      expect(screen.queryByRole('button', { name: /Duyệt/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Từ chối/i })).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /Xác nhận đã nhận hàng/i })
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /Ghi nhận hoàn tiền/i })
      ).not.toBeInTheDocument()

      unmount()
    }
  })

  it('renders rejected details with rejectReason and refunded details with refundAmountVnd', async () => {
    vi.mocked(returnRequestsApi.getAdminReturnRequest).mockResolvedValueOnce({
      ...mockRequest,
      status: 'rejected' as const,
      rejectReason: 'Hàng đã qua sử dụng',
      rejectedAt: '2026-08-21T09:00:00Z',
    })

    const { unmount } = renderWithClient(<ReturnRequestDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('Bị từ chối')).toBeInTheDocument()
    })
    expect(screen.getByText('Lý do từ chối')).toBeInTheDocument()
    expect(screen.getByText('Hàng đã qua sử dụng')).toBeInTheDocument()

    unmount()

    vi.mocked(returnRequestsApi.getAdminReturnRequest).mockResolvedValueOnce({
      ...mockRequest,
      status: 'refunded' as const,
      refundedAt: '2026-08-21T11:00:00Z',
      refundAmountVnd: '520000',
    })

    renderWithClient(<ReturnRequestDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('Đã hoàn tiền')).toBeInTheDocument()
    })
    expect(screen.getByText('Số tiền đã hoàn')).toBeInTheDocument()
    expect(screen.getByText('Ngày hoàn tiền')).toBeInTheDocument()
  })

  it('renders error state on 404 request not found and allows navigating back', async () => {
    vi.mocked(returnRequestsApi.getAdminReturnRequest).mockRejectedValueOnce(
      new ApiError(404, {
        code: 'return_request_not_found',
        message: 'Không tìm thấy yêu cầu trả hàng.',
      })
    )

    renderWithClient(<ReturnRequestDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('Không thể tải chi tiết yêu cầu trả hàng')).toBeInTheDocument()
    })
    expect(screen.getByText('Không tìm thấy yêu cầu trả hàng.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Về danh sách yêu cầu trả hàng/i }))

    expect(screen.getByText('Danh sách yêu cầu trả hàng')).toBeInTheDocument()
  })
})
