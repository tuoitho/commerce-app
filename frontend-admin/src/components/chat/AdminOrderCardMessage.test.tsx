import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AdminOrderCardMessage } from './AdminOrderCardMessage'
import type { AttachedOrderCard } from '@/api/chat'

describe('AdminOrderCardMessage', () => {
  const mockOrder: AttachedOrderCard = {
    id: 'ord-12345',
    status: 'confirmed',
    totalVnd: 24990000,
    createdAt: '2026-09-04T08:30:00Z',
    totalItemsCount: 3,
    itemsSummary: [
      {
        productName: 'iPhone 16 Pro Max 256GB',
        quantity: 1,
        unitPriceVnd: 24990000,
        imageUrl: 'https://example.com/ip16.jpg',
      },
    ],
  }

  it('renders order id, formatted status, items, and total amount', () => {
    render(
      <MemoryRouter>
        <AdminOrderCardMessage order={mockOrder} />
      </MemoryRouter>
    )

    expect(screen.getByText(/#ord-12345/)).toBeInTheDocument()
    expect(screen.getByText('Đã xác nhận')).toBeInTheDocument()
    expect(screen.getByText('iPhone 16 Pro Max 256GB')).toBeInTheDocument()
    expect(screen.getByText('x1')).toBeInTheDocument()
    expect(screen.getByText(/\+2 sản phẩm khác/)).toBeInTheDocument()
    expect(screen.getAllByText(/24\.990\.000/).length).toBeGreaterThanOrEqual(1)
  })

  it('renders direct navigation link to admin order detail page /orders/:id', () => {
    render(
      <MemoryRouter>
        <AdminOrderCardMessage order={mockOrder} />
      </MemoryRouter>
    )

    const link = screen.getByTestId('order-detail-link-ord-12345')
    expect(link).toHaveAttribute('href', '/orders/ord-12345')
  })
})
