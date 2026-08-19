import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  ordersApi,
  createOrder,
  listOrders,
  getOrderStats,
  getOrder,
  cancelOrder,
  undoCancelOrder,
} from './orders'
import type { Order, CreateOrderInput, OrderStats } from './types'

describe('ordersApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  const mockOrder: Order = {
    id: 'ord-123',
    userId: 'user-1',
    status: 'pending_confirmation',
    paymentMethod: 'cod',
    recipientName: 'Nguyen Van A',
    phone: '0901234567',
    provinceName: 'Thành phố Hà Nội',
    wardName: 'Phường Phúc Xá',
    detailAddress: '123 Hang Bong',
    subtotalVnd: '100000',
    shippingFeeVnd: '0',
    totalVnd: '100000',
    items: [
      {
        id: 'item-1',
        variantId: 'var-1',
        productId: 'prod-1',
        brandName: 'Brand A',
        productName: 'Product A',
        model: 'Model A',
        imageUrl: 'https://example.com/img.jpg',
        options: [{ groupLabel: 'Color', valueLabel: 'Black' }],
        unitPriceVnd: '100000',
        quantity: 1,
        lineTotalVnd: '100000',
      },
    ],
    createdAt: '2026-08-19T00:00:00.000Z',
    updatedAt: '2026-08-19T00:00:00.000Z',
    cancellableUntil: '2026-08-19T00:30:00.000Z',
  }

  const mockStats: OrderStats = {
    pendingConfirmation: 2,
    awaitingPickup: 1,
    awaitingDelivery: 0,
    awaitingReview: 5,
  }

  it('createOrder calls POST /orders with payload', async () => {
    const input: CreateOrderInput = {
      addressId: 'addr-1',
      lines: [
        {
          variantId: 'var-1',
          quantity: 1,
          productName: 'Product A',
          unitPriceVnd: '100000',
        },
      ],
    }

    const mockResponse = {
      success: true,
      message: 'Tạo đơn hàng thành công',
      data: mockOrder,
      error: null,
      meta: { timestamp: '2026-08-19T00:00:00.000Z' },
    }

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => mockResponse,
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await createOrder(input)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/orders'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(input),
      })
    )
    expect(result).toEqual(mockOrder)

    const objResult = await ordersApi.createOrder(input)
    expect(objResult).toEqual(mockOrder)
  })

  it('listOrders without bucket calls GET /orders', async () => {
    const mockResponse = {
      success: true,
      message: 'Lấy danh sách đơn hàng thành công',
      data: [mockOrder],
      error: null,
      meta: { timestamp: '2026-08-19T00:00:00.000Z' },
    }

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await listOrders()
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/orders'),
      expect.anything()
    )
    expect(result).toEqual([mockOrder])

    const objResult = await ordersApi.listOrders()
    expect(objResult).toEqual([mockOrder])
  })

  it('listOrders with status calls GET /orders?status=pending', async () => {
    const mockResponse = {
      success: true,
      message: 'Lấy danh sách đơn hàng thành công',
      data: [mockOrder],
      error: null,
      meta: { timestamp: '2026-08-19T00:00:00.000Z' },
    }

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await listOrders('pending')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/orders?status=pending'),
      expect.anything()
    )
    expect(result).toEqual([mockOrder])

    const objResult = await ordersApi.listOrders('pending')
    expect(objResult).toEqual([mockOrder])
  })

  it('getOrderStats calls GET /orders/stats', async () => {
    const mockResponse = {
      success: true,
      message: 'Lấy thống kê đơn hàng thành công',
      data: mockStats,
      error: null,
      meta: { timestamp: '2026-08-19T00:00:00.000Z' },
    }

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await getOrderStats()
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/orders/stats'),
      expect.anything()
    )
    expect(result).toEqual(mockStats)

    const objResult = await ordersApi.getOrderStats()
    expect(objResult).toEqual(mockStats)
  })

  it('getOrder calls GET /orders/:id', async () => {
    const mockResponse = {
      success: true,
      message: 'Lấy chi tiết đơn hàng thành công',
      data: mockOrder,
      error: null,
      meta: { timestamp: '2026-08-19T00:00:00.000Z' },
    }

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await getOrder('ord-123')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/orders/ord-123'),
      expect.anything()
    )
    expect(result).toEqual(mockOrder)

    const objResult = await ordersApi.getOrder('ord-123')
    expect(objResult).toEqual(mockOrder)
  })

  it('cancelOrder calls POST /orders/:id/cancel', async () => {
    const cancelledOrder = { ...mockOrder, status: 'cancelled' as const }
    const mockResponse = {
      success: true,
      message: 'Hủy đơn hàng thành công',
      data: cancelledOrder,
      error: null,
      meta: { timestamp: '2026-08-19T00:00:00.000Z' },
    }

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await cancelOrder('ord-123')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/orders/ord-123/cancel'),
      expect.objectContaining({ method: 'POST' })
    )
    expect(result).toEqual(cancelledOrder)

    const objResult = await ordersApi.cancelOrder('ord-123')
    expect(objResult).toEqual(cancelledOrder)
  })

  it('undoCancelOrder calls POST /orders/:id/cancel/undo', async () => {
    const preparingOrder = { ...mockOrder, status: 'preparing' as const }
    const mockResponse = {
      success: true,
      message: 'Hoàn tác yêu cầu hủy thành công',
      data: preparingOrder,
      error: null,
      meta: { timestamp: '2026-08-19T00:00:00.000Z' },
    }

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await undoCancelOrder('ord-123')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/orders/ord-123/cancel/undo'),
      expect.objectContaining({ method: 'POST' })
    )
    expect(result).toEqual(preparingOrder)

    const objResult = await ordersApi.undoCancelOrder('ord-123')
    expect(objResult).toEqual(preparingOrder)
  })
})
