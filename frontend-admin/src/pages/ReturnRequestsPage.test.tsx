import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReturnRequestsPage } from './ReturnRequestsPage'
import { AdminLayout } from '@/components/layout/AdminLayout'
import * as returnRequestsApi from '@/api/returnRequests'
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

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'admin@auraphone.vn' }, logout: vi.fn() }),
}))

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}{location.search}</output>
}

const mockRequests: AdminReturnRequestView[] = [
  {
    id: 'rr-aaaa1111-0000-0000-0000-000000000001',
    orderId: 'ord-bbbb2222-0000-0000-0000-000000000002',
    status: 'pending_approval',
    reasonCode: 'defective',
    description: '',
    items: [
      {
        id: 'ri-1',
        orderItemId: 'oi-1',
        productName: 'iPhone 15 Pro Max',
        imageUrl: 'https://example.com/iphone.jpg',
        unitPriceVnd: '500000',
        quantity: 1,
      },
    ],
    createdAt: '2026-08-20T09:00:00Z',
    updatedAt: '2026-08-20T09:00:00Z',
    buyerEmail: 'nguyenvana@gmail.com',
    orderTotalVnd: '1300000',
    shippingFeeVnd: '20000',
    suggestedRefundVnd: '520000',
  },
  {
    id: 'rr-cccc3333-0000-0000-0000-000000000003',
    orderId: 'ord-dddd4444-0000-0000-0000-000000000004',
    status: 'refunded',
    reasonCode: 'changed_mind',
    description: 'Đổi ý không mua nữa',
    items: [
      {
        id: 'ri-2',
        orderItemId: 'oi-2',
        productName: 'Ốp lưng MagSafe',
        imageUrl: '',
        unitPriceVnd: '300000',
        quantity: 1,
      },
    ],
    refundAmountVnd: '300000',
    createdAt: '2026-08-19T08:00:00Z',
    updatedAt: '2026-08-19T10:00:00Z',
    buyerEmail: 'tranthib@gmail.com',
    orderTotalVnd: '320000',
    shippingFeeVnd: '20000',
    suggestedRefundVnd: '300000',
  },
]

function mockListResponse(data: AdminReturnRequestView[], pagination?: Partial<{
  page: number
  limit: number
  total: number
  totalPages: number
}>) {
  return {
    data,
    meta: {
      timestamp: '2026-08-22T09:00:00Z',
      pagination: {
        page: pagination?.page ?? 1,
        limit: pagination?.limit ?? 20,
        total: pagination?.total ?? data.length,
        totalPages: pagination?.totalPages ?? 1,
      },
    },
    message: '',
  }
}

function renderWithClient(ui: React.ReactElement, initialEntries = ['/return-requests']) {
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
        {ui}
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('ReturnRequestsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders return request list with all columns', async () => {
    vi.mocked(returnRequestsApi.getAdminReturnRequests).mockResolvedValueOnce(
      mockListResponse(mockRequests)
    )

    renderWithClient(<ReturnRequestsPage />)

    expect(screen.getByText('Quản lý yêu cầu trả hàng')).toBeInTheDocument()
    expect(screen.getByLabelText('Lọc theo trạng thái')).toBeInTheDocument()

    expect(screen.getByText('Mã yêu cầu')).toBeInTheDocument()
    expect(screen.getByText('Mã đơn')).toBeInTheDocument()
    expect(screen.getByText('Email người mua')).toBeInTheDocument()
    expect(screen.getByText('Số tiền đề nghị')).toBeInTheDocument()
    expect(screen.getByText('Trạng thái')).toBeInTheDocument()
    expect(screen.getByText('Ngày tạo')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('#rr-aaaa1')).toBeInTheDocument()
    })

    expect(screen.getByText('#ord-bbbb')).toBeInTheDocument()
    expect(screen.getByText('nguyenvana@gmail.com')).toBeInTheDocument()
    expect(screen.getByText('520.000 ₫')).toBeInTheDocument()
    expect(screen.getAllByText('Chờ duyệt').length).toBeGreaterThanOrEqual(1)

    expect(screen.getByText('#rr-cccc3')).toBeInTheDocument()
    expect(screen.getByText('#ord-dddd')).toBeInTheDocument()
    expect(screen.getByText('tranthib@gmail.com')).toBeInTheDocument()
    expect(screen.getByText('300.000 ₫')).toBeInTheDocument()
    expect(screen.getAllByText('Đã hoàn tiền').length).toBeGreaterThanOrEqual(1)
  })

  it('filters requests by status and resets page to 1', async () => {
    vi.mocked(returnRequestsApi.getAdminReturnRequests).mockResolvedValue({
      ...mockListResponse([mockRequests[0]]),
    })

    renderWithClient(
      <>
        <ReturnRequestsPage />
        <LocationProbe />
      </>,
      ['/return-requests?page=3']
    )

    const select = screen.getByLabelText('Lọc theo trạng thái')
    fireEvent.change(select, { target: { value: 'pending_approval' } })

    await waitFor(() => {
      expect(returnRequestsApi.getAdminReturnRequests).toHaveBeenCalledWith({
        status: 'pending_approval',
        page: 1,
        limit: 20,
      })
    })

    expect(screen.getByTestId('location')).toHaveTextContent('/return-requests?status=pending_approval&page=1')
  })

  it('handles selecting "all" status filter by removing status param', async () => {
    vi.mocked(returnRequestsApi.getAdminReturnRequests).mockResolvedValue(
      mockListResponse(mockRequests)
    )

    renderWithClient(
      <>
        <ReturnRequestsPage />
        <LocationProbe />
      </>,
      ['/return-requests?status=approved&page=2']
    )

    const select = screen.getByLabelText('Lọc theo trạng thái')
    fireEvent.change(select, { target: { value: 'all' } })

    await waitFor(() => {
      expect(returnRequestsApi.getAdminReturnRequests).toHaveBeenCalledWith({
        status: undefined,
        page: 1,
        limit: 20,
      })
    })

    expect(screen.getByTestId('location')).toHaveTextContent('/return-requests?page=1')
  })

  it('paginates prev and next correctly from meta.pagination', async () => {
    vi.mocked(returnRequestsApi.getAdminReturnRequests).mockResolvedValue(
      mockListResponse(mockRequests, { page: 1, total: 45, totalPages: 3 })
    )

    renderWithClient(
      <>
        <ReturnRequestsPage />
        <LocationProbe />
      </>,
      ['/return-requests?page=1']
    )

    await waitFor(() => {
      expect(screen.getByText('Trang 1 / 3')).toBeInTheDocument()
    })

    const prevBtn = screen.getByRole('button', { name: /Trước/i })
    const nextBtn = screen.getByRole('button', { name: /Sau/i })

    expect(prevBtn).toBeDisabled()
    expect(nextBtn).not.toBeDisabled()

    fireEvent.click(nextBtn)

    expect(screen.getByTestId('location')).toHaveTextContent('/return-requests?page=2')
  })

  it('displays empty state when no requests returned', async () => {
    vi.mocked(returnRequestsApi.getAdminReturnRequests).mockResolvedValueOnce(
      mockListResponse([])
    )

    renderWithClient(<ReturnRequestsPage />)

    await waitFor(() => {
      expect(screen.getByText('Chưa có yêu cầu trả hàng nào')).toBeInTheDocument()
    })
    expect(screen.getByText(/Chưa có yêu cầu trả hàng nào được ghi nhận trên hệ thống/)).toBeInTheDocument()
  })

  it('displays loading state and handles error state with retry', async () => {
    vi.mocked(returnRequestsApi.getAdminReturnRequests)
      .mockRejectedValueOnce(new Error('Lỗi kết nối máy chủ'))
      .mockResolvedValueOnce(mockListResponse(mockRequests))

    renderWithClient(<ReturnRequestsPage />)

    await waitFor(() => {
      expect(screen.getByText('Không thể tải danh sách yêu cầu trả hàng')).toBeInTheDocument()
    })
    expect(screen.getByText('Lỗi kết nối máy chủ')).toBeInTheDocument()

    const retryBtn = screen.getByRole('button', { name: /Thử lại/i })
    fireEvent.click(retryBtn)

    await waitFor(() => {
      expect(screen.getByText('#rr-aaaa1')).toBeInTheDocument()
    })
  })

  it('navigates to request detail when clicking request row', async () => {
    vi.mocked(returnRequestsApi.getAdminReturnRequests).mockResolvedValueOnce(
      mockListResponse([mockRequests[0]])
    )

    renderWithClient(
      <Routes>
        <Route path="/return-requests" element={<ReturnRequestsPage />} />
        <Route
          path="/return-requests/:requestId"
          element={<output data-testid="detail-view">Chi tiết yêu cầu</output>}
        />
      </Routes>,
      ['/return-requests']
    )

    await waitFor(() => {
      expect(screen.getByText('#rr-aaaa1')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('#rr-aaaa1'))

    await waitFor(() => {
      expect(screen.getByTestId('detail-view')).toBeInTheDocument()
    })
  })

  it('navigates to return requests page from sidebar navigation link', async () => {
    vi.mocked(returnRequestsApi.getAdminReturnRequests).mockResolvedValue(
      mockListResponse(mockRequests)
    )

    const testQueryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={testQueryClient}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<AdminLayout />}>
              <Route index element={<div>Trang chủ</div>} />
              <Route path="return-requests" element={<ReturnRequestsPage />} />
            </Route>
          </Routes>
          <LocationProbe />
        </MemoryRouter>
      </QueryClientProvider>
    )

    const navLink = screen.getByRole('link', { name: 'Trả hàng' })
    expect(navLink).toBeInTheDocument()

    fireEvent.click(navLink)

    expect(screen.getByTestId('location')).toHaveTextContent('/return-requests')
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Quản lý yêu cầu trả hàng' })).toBeInTheDocument()
    })
  })
})
