import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReturnsPage } from './ReturnsPage'
import { adminReturnsApi } from '@/api/returns'
import type { ReturnRequestSummary } from '@/api/types'

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

const mockReturnSummaries: ReturnRequestSummary[] = [
  {
    id: 'ret-101',
    orderId: 'ord-101',
    userId: 'usr-1',
    buyerEmail: 'nguyenvana@gmail.com',
    status: 'pending_approval',
    reasonCode: 'defective',
    expectedRefundVnd: '29990000',
    createdAt: '2026-08-27T10:00:00Z',
  },
  {
    id: 'ret-102',
    orderId: 'ord-102',
    userId: 'usr-2',
    buyerEmail: 'tranthib@gmail.com',
    status: 'approved',
    reasonCode: 'not_as_described',
    expectedRefundVnd: '15000000',
    createdAt: '2026-08-27T11:00:00Z',
  },
]

describe('ReturnsPage (Admin)', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
  })

  function renderPage(initialEntries = ['/returns']) {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={initialEntries}>
          <Routes>
            <Route path="/returns" element={<ReturnsPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )
  }

  it('renders return requests list with status badges and expected refunds', async () => {
    vi.mocked(adminReturnsApi.listReturns).mockResolvedValue({
      items: mockReturnSummaries,
      total: 2,
      page: 1,
      limit: 20,
      totalPages: 1,
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Quản lý yêu cầu trả hàng')).toBeInTheDocument()
      expect(screen.getByText('ret-101')).toBeInTheDocument()
      expect(screen.getByText('ord-101')).toBeInTheDocument()
      expect(screen.getByText('nguyenvana@gmail.com')).toBeInTheDocument()
      expect(screen.getByText('Sản phẩm lỗi/hư hỏng')).toBeInTheDocument()
      expect(screen.getAllByText('Chờ duyệt').length).toBeGreaterThan(0)
      expect(screen.getByText('ret-102')).toBeInTheDocument()
      expect(screen.getAllByText('Đã duyệt').length).toBeGreaterThan(0)
    })
  })

  it('filters return requests when status filter changes', async () => {
    vi.mocked(adminReturnsApi.listReturns).mockResolvedValue({
      items: [mockReturnSummaries[0]],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Quản lý yêu cầu trả hàng')).toBeInTheDocument()
    })

    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'pending_approval' } })

    await waitFor(() => {
      expect(adminReturnsApi.listReturns).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'pending_approval',
          page: 1,
        })
      )
    })
  })

  it('renders empty state when no return requests exist', async () => {
    vi.mocked(adminReturnsApi.listReturns).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 1,
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Không tìm thấy yêu cầu trả hàng nào')).toBeInTheDocument()
    })
  })
})
