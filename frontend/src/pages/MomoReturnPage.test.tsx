import { StrictMode } from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { MomoReturnPage } from './MomoReturnPage'
import { ordersApi } from '@/api/orders'
import { useAuth } from '@/context/AuthContext'
import { useCart } from '@/context/CartContext'
import { ToastProvider } from '@/context/ToastContext'
import { ApiError, type Order } from '@/api/types'

vi.mock('@/api/orders', () => ({
  ordersApi: {
    confirmMomoReturn: vi.fn(),
    retryMomoPayment: vi.fn(),
  },
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/context/CartContext', () => ({
  useCart: vi.fn(),
}))

const paidQuery =
  '?partnerCode=MOMO&orderId=ord-1_1763281800000&requestId=ord-1_1763281800000&amount=3190000&orderInfo=Thanh+toan+don+hang&orderType=momo_wallet&transId=4088812345&resultCode=0&message=Th%C3%A0nh+c%C3%B4ng.&payType=qr&responseTime=1763281800000&extraData=&signature=valid-sig'

const failedQuery =
  '?partnerCode=MOMO&orderId=ord-1_1763281800000&requestId=ord-1_1763281800000&amount=3190000&orderInfo=Thanh+toan+don+hang&orderType=momo_wallet&transId=0&resultCode=1006&message=Giao+d%E1%BB%8Bch+b%E1%BB%8B+t%E1%BB%AB+ch%E1%BB%91i.&payType=qr&responseTime=1763281800000&extraData=&signature=fail-sig'

const baseOrder: Order = {
  id: '44444444-4444-4444-4444-444444444444',
  userId: 'user-1',
  status: 'confirmed',
  paymentMethod: 'momo',
  paymentStatus: 'paid',
  paymentTransactionId: '4088812345',
  paidAt: '2026-11-16T10:02:00Z',
  recipientName: 'Nguyen Van A',
  phone: '0987654321',
  provinceName: 'Hà Nội',
  wardName: 'Phúc Xá',
  detailAddress: '123 Cầu Giấy',
  subtotalVnd: '3190000',
  shippingFeeVnd: '0',
  totalVnd: '3190000',
  items: [],
  createdAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
  updatedAt: new Date().toISOString(),
  cancellableUntil: new Date(Date.now() + 13 * 60 * 1000).toISOString(),
}

describe('MomoReturnPage', () => {
  const mockRefreshCart = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'user-1', email: 'buyer@example.com', role: 'customer' } as any,
      accessToken: 'token-123',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })
    vi.mocked(useCart).mockReturnValue({
      cart: null,
      isLoading: false,
      badgeCount: 0,
      refreshCart: mockRefreshCart,
      addItem: vi.fn(),
      updateQuantity: vi.fn(),
      toggleSelect: vi.fn(),
      toggleSelectAll: vi.fn(),
      removeItem: vi.fn(),
    })
  })

  it('waits until auth is ready then verifies payment once even under StrictMode, refreshes cart, and renders success summary', async () => {
    vi.mocked(ordersApi.confirmMomoReturn).mockResolvedValue(baseOrder)

    render(
      <StrictMode>
        <ToastProvider>
          <MemoryRouter initialEntries={[`/momo-return${paidQuery}`]}>
            <Routes>
              <Route path="/momo-return" element={<MomoReturnPage />} />
              <Route path="/orders/:id" element={<div>Order Detail View</div>} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </StrictMode>
    )

    await waitFor(() => {
      expect(screen.getByText('Thanh toán MoMo thành công')).toBeInTheDocument()
    })

    expect(ordersApi.confirmMomoReturn).toHaveBeenCalledTimes(1)
    expect(ordersApi.confirmMomoReturn).toHaveBeenCalledWith(
      expect.objectContaining({
        partnerCode: 'MOMO',
        orderId: 'ord-1_1763281800000',
        amount: '3190000',
        transId: '4088812345',
        resultCode: 0,
        signature: 'valid-sig',
      })
    )
    expect(mockRefreshCart).toHaveBeenCalledTimes(1)
    expect(screen.getByText('4088812345')).toBeInTheDocument()
    expect(screen.getByText('3.190.000 ₫')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Xem chi tiết đơn hàng/i })).toHaveAttribute(
      'href',
      `/orders/${baseOrder.id}`
    )
  })

  it('redirects to login preserving return URL when unauthenticated after auth finishes loading', async () => {
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
        <MemoryRouter initialEntries={[`/momo-return${paidQuery}`]}>
          <Routes>
            <Route path="/momo-return" element={<MomoReturnPage />} />
            <Route path="/login" element={<div>Login Page Redirected</div>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Login Page Redirected')).toBeInTheDocument()
    })
    expect(ordersApi.confirmMomoReturn).not.toHaveBeenCalled()
  })

  it('renders failed payment state with gateway reason and supports retry', async () => {
    const failedOrder: Order = {
      ...baseOrder,
      status: 'pending_confirmation',
      paymentStatus: 'failed',
      paymentTransactionId: null,
      paidAt: null,
    }
    vi.mocked(ordersApi.confirmMomoReturn).mockResolvedValue(failedOrder)
    vi.mocked(ordersApi.retryMomoPayment).mockResolvedValue({
      ...failedOrder,
      payUrl: 'https://test-payment.momo.vn/v2/gateway/pay?t=retry',
    })

    const originalLocation = window.location
    const assignMock = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, assign: assignMock },
      writable: true,
      configurable: true,
    })

    try {
      render(
        <ToastProvider>
          <MemoryRouter initialEntries={[`/momo-return${failedQuery}`]}>
            <Routes>
              <Route path="/momo-return" element={<MomoReturnPage />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      )

      await waitFor(() => {
        expect(screen.getByText('Thanh toán MoMo chưa hoàn tất')).toBeInTheDocument()
      })

      expect(screen.getByText(/Giao dịch bị từ chối/i)).toBeInTheDocument()
      const retryBtn = screen.getByRole('button', { name: /Thanh toán lại qua MoMo/i })
      fireEvent.click(retryBtn)

      await waitFor(() => {
        expect(ordersApi.retryMomoPayment).toHaveBeenCalledWith(failedOrder.id)
        expect(assignMock).toHaveBeenCalledWith('https://test-payment.momo.vn/v2/gateway/pay?t=retry')
      })
    } finally {
      Object.defineProperty(window, 'location', {
        value: originalLocation,
        writable: true,
        configurable: true,
      })
    }
  })

  it('renders error alert when callback signature verification returns ApiError', async () => {
    vi.mocked(ordersApi.confirmMomoReturn).mockRejectedValue(
      new ApiError(400, {
        code: 'invalid_momo_callback',
        message: 'Dữ liệu xác thực thanh toán MoMo không hợp lệ',
      })
    )

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={[`/momo-return${paidQuery}`]}>
          <Routes>
            <Route path="/momo-return" element={<MomoReturnPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Không thể xác thực thanh toán MoMo')).toBeInTheDocument()
      expect(
        screen.getByText('Dữ liệu xác thực thanh toán MoMo không hợp lệ')
      ).toBeInTheDocument()
    })
  })
})
