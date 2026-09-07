import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { OrderMessageCard, formatOrderStatus } from './OrderMessageCard'
import type { OrderSummary } from '@/api/chat'

describe('OrderMessageCard Component (FE-03)', () => {
  const sampleOrderSummary: OrderSummary = {
    id: 'ord-12345678-abcd',
    status: 'confirmed',
    totalVnd: 750000,
    recipientName: 'Trần Văn B',
    createdAt: '2026-09-07T08:00:00Z',
    itemCount: 3,
    firstItemName: 'Bàn phím cơ không dây',
  }

  it('renders order summary details correctly (AC-CHAT-01-01)', () => {
    render(
      <MemoryRouter>
        <OrderMessageCard orderSummary={sampleOrderSummary} />
      </MemoryRouter>
    )

    expect(screen.getByText('Đơn hàng #ord-1234')).toBeInTheDocument()
    expect(screen.getByText('Đã xác nhận')).toBeInTheDocument()
    expect(screen.getByText(/750\.000/)).toBeInTheDocument()
    expect(screen.getByText('Bàn phím cơ không dây (+2 sản phẩm khác)')).toBeInTheDocument()
    expect(screen.getByText('Trần Văn B')).toBeInTheDocument()
  })

  it('links to order detail page /orders/:id by default', () => {
    render(
      <MemoryRouter>
        <OrderMessageCard orderSummary={sampleOrderSummary} />
      </MemoryRouter>
    )

    const link = screen.getByRole('link', { name: /Xem chi tiết/i })
    expect(link).toHaveAttribute('href', '/orders/ord-12345678-abcd')
  })

  it('supports custom linkPrefix for admin chat (/admin/orders/:id)', () => {
    render(
      <MemoryRouter>
        <OrderMessageCard orderSummary={sampleOrderSummary} linkPrefix="/admin/orders/" />
      </MemoryRouter>
    )

    const link = screen.getByRole('link', { name: /Xem chi tiết/i })
    expect(link).toHaveAttribute('href', '/admin/orders/ord-12345678-abcd')
  })

  it('translates order statuses into Vietnamese correctly', () => {
    expect(formatOrderStatus('pending_confirmation')).toBe('Chờ xác nhận')
    expect(formatOrderStatus('confirmed')).toBe('Đã xác nhận')
    expect(formatOrderStatus('preparing')).toBe('Đang chuẩn bị')
    expect(formatOrderStatus('shipped')).toBe('Đang giao')
    expect(formatOrderStatus('delivered')).toBe('Đã giao')
    expect(formatOrderStatus('cancelled')).toBe('Đã hủy')
    expect(formatOrderStatus('unknown_status')).toBe('unknown_status')
  })
})
