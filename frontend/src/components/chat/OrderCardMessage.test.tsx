import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { OrderCardMessage } from './OrderCardMessage'
import type { AttachedOrderCard } from '@/api/chat'

import { formatDateTime } from '@/lib/utils'

describe('OrderCardMessage', () => {
  const mockOrderCard: AttachedOrderCard = {
    id: 'ord-abc-12345678',
    status: 'delivered',
    totalVnd: 1550000,
    createdAt: '2026-09-04T10:00:00Z',
    itemsSummary: [
      {
        productName: 'Bàn phím cơ không dây RGB',
        quantity: 1,
        unitPriceVnd: 1200000,
        imageUrl: 'https://example.com/keyboard.jpg',
      },
      {
        productName: 'Kê tay công thái học',
        quantity: 2,
        unitPriceVnd: 175000,
        imageUrl: 'https://example.com/wrist-rest.jpg',
      },
    ],
    totalItemsCount: 3,
  }

  it('renders order code, created date, status badge, and total amount', () => {
    render(
      <MemoryRouter>
        <OrderCardMessage order={mockOrderCard} />
      </MemoryRouter>
    )

    expect(screen.getByText(/ord-abc-12345678/i)).toBeInTheDocument()
    expect(screen.getByText(formatDateTime(mockOrderCard.createdAt))).toBeInTheDocument()
    expect(screen.getByText('Đã giao hàng')).toBeInTheDocument()
    expect(screen.getByText(/1\.550\.000/)).toBeInTheDocument()
  })

  it('renders item list preview with product names, thumbnails, and quantities', () => {
    render(
      <MemoryRouter>
        <OrderCardMessage order={mockOrderCard} />
      </MemoryRouter>
    )

    expect(screen.getByText('Bàn phím cơ không dây RGB')).toBeInTheDocument()
    expect(screen.getByText('x1')).toBeInTheDocument()
    expect(screen.getByText('Kê tay công thái học')).toBeInTheDocument()
    expect(screen.getByText('x2')).toBeInTheDocument()

    const images = screen.getAllByRole('img')
    expect(images.length).toBeGreaterThanOrEqual(2)
    expect(images[0]).toHaveAttribute('src', 'https://example.com/keyboard.jpg')
  })

  it('renders link pointing to customer order detail page', () => {
    render(
      <MemoryRouter>
        <OrderCardMessage order={mockOrderCard} />
      </MemoryRouter>
    )

    const detailLink = screen.getByRole('link', { name: /xem chi tiết/i })
    expect(detailLink).toBeInTheDocument()
    expect(detailLink).toHaveAttribute('href', '/orders/ord-abc-12345678')
  })

  it('shows remaining items count when totalItemsCount exceeds summary length', () => {
    const orderWithManyItems: AttachedOrderCard = {
      ...mockOrderCard,
      itemsSummary: [
        {
          productName: 'Sản phẩm 1',
          quantity: 1,
          unitPriceVnd: 100000,
          imageUrl: '',
        },
      ],
      totalItemsCount: 5,
    }

    render(
      <MemoryRouter>
        <OrderCardMessage order={orderWithManyItems} />
      </MemoryRouter>
    )

    expect(screen.getByText(/\+4 sản phẩm khác/i)).toBeInTheDocument()
  })
})
