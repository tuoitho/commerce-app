import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { OrdersPage } from './OrdersPage'
import { AdminLayout } from '@/components/layout/AdminLayout'
import * as ordersApi from '@/api/orders'
import type { AdminOrder } from '@/api/types'

vi.mock('@/api/orders', () => ({
  getAdminOrders: vi.fn(),
  getAdminOrder: vi.fn(),
  adminConfirmPreparing: vi.fn(),
  adminShip: vi.fn(),
  adminDeliver: vi.fn(),
  adminApproveCancel: vi.fn(),
  adminDeclineCancel: vi.fn(),
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'admin@auraphone.vn' }, logout: vi.fn() }),
}))

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}{location.search}</output>
}

const mockOrders: AdminOrder[] = [
  {
    id: 'ord-101',
    userId: 'usr-1',
    buyerEmail: 'nguyenvana@gmail.com',
    status: 'pending_confirmation',
    paymentMethod: 'cod',
    recipientName: 'Nguyễn Văn A',
    phone: '0901234567',
    provinceName: 'Hà Nội',
    wardName: 'Dịch Vọng Hậu',
    detailAddress: 'Số 10 Phạm Văn Đồng',
    subtotalVnd: '29990000',
    shippingFeeVnd: '30000',
    totalVnd: '30020000',
    items: [
      {
        id: 'item-1',
        variantId: 'var-1',
        productId: 'prod-1',
        brandName: 'Apple',
        productName: 'iPhone 15 Pro Max',
        model: 'A3106',
        imageUrl: 'https://example.com/iphone.jpg',
        options: [{ groupLabel: 'Màu sắc', valueLabel: 'Titan Tự Nhiên' }],
        unitPriceVnd: '29990000',
        quantity: 1,
        lineTotalVnd: '29990000',
      },
      {
        id: 'item-2',
        variantId: 'var-2',
        productId: 'prod-2',
        brandName: 'Apple',
        productName: 'Ốp lưng MagSafe',
        model: 'Case15',
        imageUrl: 'https://example.com/case.jpg',
        options: [],
        unitPriceVnd: '500000',
        quantity: 1,
        lineTotalVnd: '500000',
      },
    ],
    createdAt: '2026-08-18T10:30:00Z',
    updatedAt: '2026-08-18T10:30:00Z',
  },
  {
    id: 'ord-102',
    userId: 'usr-2',
    buyerEmail: 'tranthib@gmail.com',
    status: 'shipped',
    paymentMethod: 'bank_transfer',
    recipientName: 'Trần Thị B',
    phone: '0987654321',
    provinceName: 'Hồ Chí Minh',
    wardName: 'Bến Nghé',
    detailAddress: '123 Lê Lợi',
    subtotalVnd: '15000000',
    shippingFeeVnd: '0',
    totalVnd: '15000000',
    items: [
      {
        id: 'item-3',
        variantId: 'var-3',
        productId: 'prod-3',
        brandName: 'Samsung',
        productName: 'Galaxy S24',
        model: 'SM-S921B',
        imageUrl: 'https://example.com/s24.jpg',
        options: [],
        unitPriceVnd: '15000000',
        quantity: 1,
        lineTotalVnd: '15000000',
      },
    ],
    createdAt: '2026-08-17T15:00:00Z',
    updatedAt: '2026-08-17T16:00:00Z',
  },
]

function renderWithClient(ui: React.ReactElement, initialEntries = ['/orders']) {
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

describe('OrdersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders order list with all columns', async () => {
    vi.mocked(ordersApi.getAdminOrders).mockResolvedValueOnce({
      data: mockOrders,
      meta: {
        timestamp: '2026-08-18T12:00:00Z',
        pagination: {
          page: 1,
          limit: 20,
          total: 2,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      },
      message: '',
    })

    renderWithClient(<OrdersPage />)

    // Check Header & Filter
    expect(screen.getByText('Quản lý đơn hàng')).toBeInTheDocument()
    expect(screen.getByLabelText('Lọc theo trạng thái')).toBeInTheDocument()

    // Check Table Headers
    expect(screen.getByText('Mã đơn')).toBeInTheDocument()
    expect(screen.getByText('Trạng thái')).toBeInTheDocument()
    expect(screen.getByText('Email người mua')).toBeInTheDocument()
    expect(screen.getByText('Người nhận')).toBeInTheDocument()
    expect(screen.getByText('Số điện thoại')).toBeInTheDocument()
    expect(screen.getByText('Địa chỉ giao hàng')).toBeInTheDocument()
    expect(screen.getByText('Tổng thanh toán')).toBeInTheDocument()
    expect(screen.getByText('Số dòng SP')).toBeInTheDocument()
    expect(screen.getByText('Ngày tạo')).toBeInTheDocument()

    // Wait for first order data to render
    await waitFor(() => {
      expect(screen.getByText('#ord-101')).toBeInTheDocument()
    })

    // Check first order row content
    expect(screen.getAllByText('Chờ xác nhận').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('nguyenvana@gmail.com')).toBeInTheDocument()
    expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument()
    expect(screen.getByText('0901234567')).toBeInTheDocument()
    expect(screen.getByText(/Số 10 Phạm Văn Đồng/)).toBeInTheDocument()
    expect(screen.getByText('30.020.000 ₫')).toBeInTheDocument()
    expect(screen.getByText('2 sản phẩm')).toBeInTheDocument()

    // Check second order row content
    expect(screen.getByText('#ord-102')).toBeInTheDocument()
    expect(screen.getAllByText('Đã giao cho ĐVVC').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('tranthib@gmail.com')).toBeInTheDocument()
    expect(screen.getByText('Trần Thị B')).toBeInTheDocument()
    expect(screen.getByText('0987654321')).toBeInTheDocument()
    expect(screen.getByText(/123 Lê Lợi/)).toBeInTheDocument()
    expect(screen.getByText('15.000.000 ₫')).toBeInTheDocument()
    expect(screen.getByText('1 sản phẩm')).toBeInTheDocument()
  })

  it('filters orders by status and resets page to 1', async () => {
    vi.mocked(ordersApi.getAdminOrders).mockResolvedValue({
      data: [mockOrders[0]],
      meta: {
        timestamp: '2026-08-18T12:00:00Z',
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      },
      message: '',
    })

    renderWithClient(
      <>
        <OrdersPage />
        <LocationProbe />
      </>,
      ['/orders?page=2']
    )

    const select = screen.getByLabelText('Lọc theo trạng thái')
    fireEvent.change(select, { target: { value: 'pending_confirmation' } })

    await waitFor(() => {
      expect(ordersApi.getAdminOrders).toHaveBeenCalledWith({
        status: 'pending_confirmation',
        page: 1,
        limit: 20,
      })
    })

    expect(screen.getByTestId('location')).toHaveTextContent('/orders?status=pending_confirmation&page=1')
  })

  it('handles selecting "all" status filter by removing status param', async () => {
    vi.mocked(ordersApi.getAdminOrders).mockResolvedValue({
      data: mockOrders,
      meta: {
        timestamp: '2026-08-18T12:00:00Z',
        pagination: {
          page: 1,
          limit: 20,
          total: 2,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      },
      message: '',
    })

    renderWithClient(
      <>
        <OrdersPage />
        <LocationProbe />
      </>,
      ['/orders?status=pending_confirmation&page=2']
    )

    const select = screen.getByLabelText('Lọc theo trạng thái')
    fireEvent.change(select, { target: { value: 'all' } })

    await waitFor(() => {
      expect(ordersApi.getAdminOrders).toHaveBeenCalledWith({
        status: undefined,
        page: 1,
        limit: 20,
      })
    })

    expect(screen.getByTestId('location')).toHaveTextContent('/orders?page=1')
  })

  it('paginates prev and next correctly', async () => {
    vi.mocked(ordersApi.getAdminOrders).mockResolvedValue({
      data: mockOrders,
      meta: {
        timestamp: '2026-08-18T12:00:00Z',
        pagination: {
          page: 1,
          limit: 20,
          total: 45,
          totalPages: 3,
          hasNext: true,
          hasPrev: false,
        },
      },
      message: '',
    })

    renderWithClient(
      <>
        <OrdersPage />
        <LocationProbe />
      </>,
      ['/orders?page=1']
    )

    await waitFor(() => {
      expect(screen.getByText('Trang 1 / 3')).toBeInTheDocument()
    })

    const prevBtn = screen.getByRole('button', { name: /Trước/i })
    const nextBtn = screen.getByRole('button', { name: /Sau/i })

    expect(prevBtn).toBeDisabled()
    expect(nextBtn).not.toBeDisabled()

    fireEvent.click(nextBtn)

    expect(screen.getByTestId('location')).toHaveTextContent('/orders?page=2')
  })

  it('displays empty state when no orders returned', async () => {
    vi.mocked(ordersApi.getAdminOrders).mockResolvedValueOnce({
      data: [],
      meta: {
        timestamp: '2026-08-18T12:00:00Z',
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      },
      message: '',
    })

    renderWithClient(<OrdersPage />)

    await waitFor(() => {
      expect(screen.getByText('Chưa có đơn hàng nào')).toBeInTheDocument()
    })
    expect(screen.getByText(/Chưa có đơn hàng nào được ghi nhận trên hệ thống/)).toBeInTheDocument()
  })

  it('displays loading state and handles error state with retry', async () => {
    vi.mocked(ordersApi.getAdminOrders)
      .mockRejectedValueOnce(new Error('Lỗi kết nối máy chủ'))
      .mockResolvedValueOnce({
        data: mockOrders,
        meta: {
          timestamp: '2026-08-18T12:00:00Z',
          pagination: {
            page: 1,
            limit: 20,
            total: 2,
            totalPages: 1,
            hasNext: false,
            hasPrev: false,
          },
        },
        message: '',
      })

    renderWithClient(<OrdersPage />)

    // Error state
    await waitFor(() => {
      expect(screen.getByText('Không thể tải danh sách đơn hàng')).toBeInTheDocument()
    })
    expect(screen.getByText('Lỗi kết nối máy chủ')).toBeInTheDocument()

    // Retry
    const retryBtn = screen.getByRole('button', { name: /Thử lại/i })
    fireEvent.click(retryBtn)

    // Success after retry
    await waitFor(() => {
      expect(screen.getByText('#ord-101')).toBeInTheDocument()
    })
  })

  it('navigates to order detail when clicking order row', async () => {
    vi.mocked(ordersApi.getAdminOrders).mockResolvedValueOnce({
      data: [mockOrders[0]],
      meta: {
        timestamp: '2026-08-18T12:00:00Z',
        pagination: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      },
      message: '',
    })

    renderWithClient(
      <Routes>
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/orders/:id" element={<output data-testid="detail-view">Chi tiết đơn</output>} />
      </Routes>,
      ['/orders']
    )

    await waitFor(() => {
      expect(screen.getByText('#ord-101')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('#ord-101'))

    await waitFor(() => {
      expect(screen.getByTestId('detail-view')).toBeInTheDocument()
    })
  })

  it('navigates to orders page from sidebar navigation link', async () => {
    vi.mocked(ordersApi.getAdminOrders).mockResolvedValue({
      data: mockOrders,
      meta: {
        timestamp: '2026-08-18T12:00:00Z',
        pagination: {
          page: 1,
          limit: 20,
          total: 2,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      },
      message: '',
    })

    const testQueryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={testQueryClient}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<AdminLayout />}>
              <Route index element={<div>Trang chủ</div>} />
              <Route path="orders" element={<OrdersPage />} />
            </Route>
          </Routes>
          <LocationProbe />
        </MemoryRouter>
      </QueryClientProvider>
    )

    const ordersNav = screen.getByRole('link', { name: 'Đơn hàng' })
    expect(ordersNav).toBeInTheDocument()

    fireEvent.click(ordersNav)

    expect(screen.getByTestId('location')).toHaveTextContent('/orders')
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Quản lý đơn hàng' })).toBeInTheDocument()
    })
  })
})
