import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AdminReturnDetailPage } from './AdminReturnDetailPage'
import { adminReturnsApi } from '@/api/returns'
import type { ReturnRequestDetail } from '@/api/types'

vi.mock('@/api/returns', () => ({
  adminReturnsApi: {
    listReturns: vi.fn(),
    getReturnDetail: vi.fn(),
    approveReturn: vi.fn(),
    rejectReturn: vi.fn(),
    receiveReturn: vi.fn(),
    refundReturn: vi.fn(),
    searchVariantOptions: vi.fn(),
  },
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'admin@auraphone.vn' }, logout: vi.fn() }),
}))

const mockReturnDetail: ReturnRequestDetail = {
  id: 'ret-101',
  orderId: 'ord-101',
  userId: 'usr-1',
  buyerEmail: 'nguyenvana@gmail.com',
  status: 'pending_approval',
  reasonCode: 'defective',
  description: 'Màn hình bị đốm sáng và sọc',
  rejectReason: '',
  expectedRefundVnd: '29990000',
  refundAmountVnd: null,
  items: [
    {
      orderItemId: 'item-1',
      variantId: 'var-1',
      productId: 'prod-1',
      brandName: 'Apple',
      productName: 'iPhone 15 Pro Max',
      model: 'A3106',
      imageUrl: 'https://example.com/iphone.jpg',
      options: [{ groupLabel: 'Màu sắc', valueLabel: 'Titan Tự Nhiên' }],
      quantity: 1,
      unitPriceVnd: '29990000',
      lineTotalVnd: '29990000',
    },
  ],
  createdAt: '2026-08-27T10:00:00Z',
  updatedAt: '2026-08-27T10:00:00Z',
  approvedAt: null,
  rejectedAt: null,
  receivedAt: null,
  refundedAt: null,
  cancelledAt: null,
}

describe('AdminReturnDetailPage', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
  })

  function renderPage(returnId = 'ret-101') {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/returns/${returnId}`]}>
          <Routes>
            <Route path="/returns/:id" element={<AdminReturnDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )
  }

  it('renders return details, customer reason, items and pending actions', async () => {
    vi.mocked(adminReturnsApi.getReturnDetail).mockResolvedValue(mockReturnDetail)

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Yêu cầu trả hàng #ret-101')).toBeInTheDocument()
      expect(screen.getByText('Màn hình bị đốm sáng và sọc')).toBeInTheDocument()
      expect(screen.getByText('iPhone 15 Pro Max')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /duyệt yêu cầu/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /từ chối/i })).toBeInTheDocument()
    })
  })

  it('approves return request when admin confirms approval', async () => {
    vi.mocked(adminReturnsApi.getReturnDetail).mockResolvedValue(mockReturnDetail)
    vi.mocked(adminReturnsApi.approveReturn).mockResolvedValue({
      ...mockReturnDetail,
      status: 'approved',
      approvedAt: '2026-08-27T12:00:00Z',
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /duyệt yêu cầu/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /duyệt yêu cầu/i }))

    await waitFor(() => {
      expect(screen.getByText('Duyệt yêu cầu trả hàng?')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /xác nhận duyệt/i }))

    await waitFor(() => {
      expect(adminReturnsApi.approveReturn).toHaveBeenCalledWith('ret-101')
    })
  })

  it('rejects return request with reject reason', async () => {
    vi.mocked(adminReturnsApi.getReturnDetail).mockResolvedValue(mockReturnDetail)
    vi.mocked(adminReturnsApi.rejectReturn).mockResolvedValue({
      ...mockReturnDetail,
      status: 'rejected',
      rejectReason: 'Hàng không còn nguyên tem niêm phong',
      rejectedAt: '2026-08-27T12:00:00Z',
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /từ chối/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /từ chối/i }))

    await waitFor(() => {
      expect(screen.getByText('Từ chối yêu cầu trả hàng')).toBeInTheDocument()
    })

    const textarea = screen.getByPlaceholderText(/nhập lý do từ chối/i)
    fireEvent.change(textarea, { target: { value: 'Hàng không còn nguyên tem niêm phong' } })

    fireEvent.click(screen.getByRole('button', { name: /từ chối yêu cầu/i }))

    await waitFor(() => {
      expect(adminReturnsApi.rejectReturn).toHaveBeenCalledWith(
        'ret-101',
        'Hàng không còn nguyên tem niêm phong'
      )
    })
  })

  it('receives returned items and maps restock variants when approved', async () => {
    const approvedReturn: ReturnRequestDetail = {
      ...mockReturnDetail,
      status: 'approved',
      approvedAt: '2026-08-27T12:00:00Z',
    }

    vi.mocked(adminReturnsApi.getReturnDetail).mockResolvedValue(approvedReturn)
    vi.mocked(adminReturnsApi.searchVariantOptions).mockResolvedValue({
      items: [
        {
          variantId: 'var-1',
          productId: 'prod-1',
          brandName: 'Apple',
          productName: 'iPhone 15 Pro Max',
          model: 'A3106',
          options: [{ groupLabel: 'Màu sắc', valueLabel: 'Titan Tự Nhiên' }],
          stockQuantity: 10,
          productActive: true,
          variantActive: true,
        },
      ],
      total: 1,
    })
    vi.mocked(adminReturnsApi.receiveReturn).mockResolvedValue({
      ...approvedReturn,
      status: 'received',
      receivedAt: '2026-08-27T14:00:00Z',
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /nhận hàng & nhập kho/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /nhận hàng & nhập kho/i }))

    await waitFor(() => {
      expect(screen.getByText('Nhận hàng & Nhập lại tồn kho')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /xác nhận nhận hàng & nhập kho/i }))

    await waitFor(() => {
      expect(adminReturnsApi.receiveReturn).toHaveBeenCalledWith('ret-101', [
        { orderItemId: 'item-1', receivedVariantId: 'var-1' },
      ])
    })
  })

  it('refunds return request when received', async () => {
    const receivedReturn: ReturnRequestDetail = {
      ...mockReturnDetail,
      status: 'received',
      approvedAt: '2026-08-27T12:00:00Z',
      receivedAt: '2026-08-27T14:00:00Z',
    }

    vi.mocked(adminReturnsApi.getReturnDetail).mockResolvedValue(receivedReturn)
    vi.mocked(adminReturnsApi.refundReturn).mockResolvedValue({
      ...receivedReturn,
      status: 'refunded',
      refundAmountVnd: '29990000',
      refundedAt: '2026-08-27T15:00:00Z',
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /hoàn tiền/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /hoàn tiền/i }))

    await waitFor(() => {
      expect(screen.getByText('Xác nhận hoàn tiền cho khách hàng?')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /xác nhận hoàn tiền/i }))

    await waitFor(() => {
      expect(adminReturnsApi.refundReturn).toHaveBeenCalledWith('ret-101')
    })
  })
})
