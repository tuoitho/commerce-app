import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AdminOrderDetailPage } from '../AdminOrderDetailPage'
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

const mockOrder: AdminOrder = {
  id: 'ord-8888',
  userId: 'usr-customer-1',
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
      imageUrl: '',
      options: [],
      unitPriceVnd: '32000000',
      quantity: 1,
      lineTotalVnd: '32000000',
    },
  ],
  createdAt: '2026-09-07T10:00:00Z',
  updatedAt: '2026-09-07T10:30:00Z',
  confirmedAt: '2026-09-07T10:15:00Z',
  cancelledAt: null,
}

function renderWithClient(ui: React.ReactElement, initialEntries = ['/admin/orders/ord-8888']) {
  const testQueryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={testQueryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/admin/orders/:id" element={ui} />
          <Route path="/messages" element={<div data-testid="target-messages-page">Trang tin nhắn hỗ trợ</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('AdminOrderDetailChatButton (ADM-04)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders "Nhắn tin cho khách hàng" button and navigates to /messages with orderId (AC-CHAT-04-02)', async () => {
    vi.mocked(ordersApi.getAdminOrder).mockResolvedValue(mockOrder)

    renderWithClient(<AdminOrderDetailPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Nhắn tin cho khách hàng/i })).toBeInTheDocument()
    })

    const chatButton = screen.getByRole('button', { name: /Nhắn tin cho khách hàng/i })
    fireEvent.click(chatButton)

    await waitFor(() => {
      expect(screen.getByTestId('target-messages-page')).toBeInTheDocument()
    })
  })
})
