import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { OrderPickerModal } from './OrderPickerModal'
import * as chatApiModule from '@/api/chat'
import type { AttachedOrderCard } from '@/api/chat'

describe('OrderPickerModal', () => {
  const mockOrders: AttachedOrderCard[] = [
    {
      id: 'ord-1001',
      status: 'pending_confirmation',
      totalVnd: 500000,
      createdAt: '2026-09-04T08:00:00Z',
      itemsSummary: [
        {
          productName: 'Chuột Gaming Không Dây',
          quantity: 1,
          unitPriceVnd: 500000,
          imageUrl: 'https://example.com/mouse.jpg',
        },
      ],
      totalItemsCount: 1,
    },
    {
      id: 'ord-1002',
      status: 'delivered',
      totalVnd: 1200000,
      createdAt: '2026-09-03T09:00:00Z',
      itemsSummary: [
        {
          productName: 'Tai nghe Bluetooth',
          quantity: 2,
          unitPriceVnd: 600000,
          imageUrl: 'https://example.com/headphone.jpg',
        },
      ],
      totalItemsCount: 2,
    },
  ]

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <OrderPickerModal
        isOpen={false}
        onClose={vi.fn()}
        onSelectOrder={vi.fn()}
      />
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('fetches and displays order list when isOpen is true', async () => {
    vi.spyOn(chatApiModule, 'getCustomerOrders').mockResolvedValue(mockOrders)
    const onClose = vi.fn()
    const onSelectOrder = vi.fn()

    render(
      <OrderPickerModal
        isOpen={true}
        onClose={onClose}
        onSelectOrder={onSelectOrder}
      />
    )

    // Initial loading indicator or modal title
    expect(screen.getByRole('dialog', { name: /chọn đơn hàng/i })).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText(/ord-1001/i)).toBeInTheDocument()
      expect(screen.getByText(/ord-1002/i)).toBeInTheDocument()
    })

    expect(screen.getByText('Chờ xác nhận')).toBeInTheDocument()
    expect(screen.getByText('Đã giao hàng')).toBeInTheDocument()
    expect(screen.getByText('Chuột Gaming Không Dây')).toBeInTheDocument()
    expect(screen.getByText('Tai nghe Bluetooth')).toBeInTheDocument()
  })

  it('calls onSelectOrder and onClose when an order is clicked', async () => {
    vi.spyOn(chatApiModule, 'getCustomerOrders').mockResolvedValue(mockOrders)
    const onClose = vi.fn()
    const onSelectOrder = vi.fn()

    render(
      <OrderPickerModal
        isOpen={true}
        onClose={onClose}
        onSelectOrder={onSelectOrder}
      />
    )

    await waitFor(() => {
      expect(screen.getByText(/ord-1001/i)).toBeInTheDocument()
    })

    const orderButton = screen.getByTestId('order-item-ord-1001')
    fireEvent.click(orderButton)

    expect(onSelectOrder).toHaveBeenCalledWith(mockOrders[0])
    expect(onClose).toHaveBeenCalled()
  })

  it('displays empty state when customer has no orders', async () => {
    vi.spyOn(chatApiModule, 'getCustomerOrders').mockResolvedValue([])

    render(
      <OrderPickerModal
        isOpen={true}
        onClose={vi.fn()}
        onSelectOrder={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(
        screen.getByText(/Bạn chưa có đơn hàng nào/i)
      ).toBeInTheDocument()
    })
  })

  it('displays error state with retry button when API fails', async () => {
    vi.spyOn(chatApiModule, 'getCustomerOrders').mockRejectedValue(new Error('Network error'))

    render(
      <OrderPickerModal
        isOpen={true}
        onClose={vi.fn()}
        onSelectOrder={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(
        screen.getByText(/Không thể tải danh sách đơn hàng/i)
      ).toBeInTheDocument()
    })

    const retryBtn = screen.getByRole('button', { name: /thử lại/i })
    expect(retryBtn).toBeInTheDocument()
  })

  it('closes when clicking close button', async () => {
    const onClose = vi.fn()
    render(
      <OrderPickerModal
        isOpen={true}
        onClose={onClose}
        onSelectOrder={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('close-order-picker-modal')).toBeInTheDocument()
    })

    const closeBtn = screen.getByTestId('close-order-picker-modal')
    fireEvent.click(closeBtn)

    expect(onClose).toHaveBeenCalled()
  })
})
