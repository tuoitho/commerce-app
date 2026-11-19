import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  ordersApi,
  createOrder,
  listOrders,
  getOrderStats,
  getOrder,
  cancelOrder,
  undoCancelOrder,
  buyAgain,
} from './orders'
import type { Order, CreateOrderInput, OrderStats, BuyAgainResult } from './types'

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

  it('retryMomoPayment calls POST /orders/:id/momo/retry', async () => {
    const retriedOrder = {
      ...mockOrder,
      paymentMethod: 'momo',
      paymentStatus: 'pending' as const,
      payUrl: 'https://test-payment.momo.vn/v2/gateway/pay?t=retry',
    }
    const mockResponse = {
      success: true,
      message: 'Khởi tạo thanh toán MoMo thành công',
      data: retriedOrder,
      error: null,
      meta: { timestamp: '2026-11-16T10:00:00.000Z' },
    }

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await ordersApi.retryMomoPayment('ord-123')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/orders/ord-123/momo/retry'),
      expect.objectContaining({ method: 'POST' })
    )
    expect(result).toEqual(retriedOrder)
  })

  it('confirmMomoReturn calls POST /payments/momo/return with callback payload', async () => {
    const paidOrder = {
      ...mockOrder,
      status: 'confirmed' as const,
      paymentMethod: 'momo',
      paymentStatus: 'paid' as const,
      paymentTransactionId: '4088812345',
      paidAt: '2026-11-16T10:02:00.000Z',
    }
    const mockResponse = {
      success: true,
      message: 'Xác thực thanh toán MoMo thành công',
      data: paidOrder,
      error: null,
      meta: { timestamp: '2026-11-16T10:02:00.000Z' },
    }

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    })
    vi.stubGlobal('fetch', fetchMock)

    const payload = {
      partnerCode: 'MOMO',
      orderId: 'ord-123_1763281800000',
      requestId: 'ord-123_1763281800000',
      amount: '3190000',
      orderInfo: 'Thanh toan don hang',
      orderType: 'momo_wallet',
      transId: '4088812345',
      resultCode: 0,
      message: 'Thành công.',
      payType: 'qr',
      responseTime: '1763281800000',
      extraData: '',
      signature: 'abc123',
    }
    const result = await ordersApi.confirmMomoReturn(payload)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/payments/momo/return'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(payload),
      })
    )
    expect(result).toEqual(paidOrder)
  })

  it('createOrder forwards deliveryMethod and non-empty voucherCode and omits blank voucherCode', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        success: true,
        message: 'Tạo đơn hàng thành công',
        data: mockOrder,
        error: null,
        meta: { timestamp: '2026-11-18T10:00:00Z' },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await createOrder({
      addressId: 'addr-1',
      deliveryMethod: 'express_2h',
      voucherCode: '  AURA10  ',
      lines: [
        {
          variantId: 'var-1',
          quantity: 1,
          productName: 'Product A',
          unitPriceVnd: '100000',
        },
      ],
    })

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/orders'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          addressId: 'addr-1',
          deliveryMethod: 'express_2h',
          voucherCode: 'AURA10',
          lines: [
            {
              variantId: 'var-1',
              quantity: 1,
              productName: 'Product A',
              unitPriceVnd: '100000',
            },
          ],
        }),
      })
    )

    await createOrder({
      addressId: 'addr-1',
      voucherCode: '   ',
      lines: [
        {
          variantId: 'var-1',
          quantity: 1,
          productName: 'Product A',
          unitPriceVnd: '100000',
        },
      ],
    })

    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining('/orders'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          addressId: 'addr-1',
          lines: [
            {
              variantId: 'var-1',
              quantity: 1,
              productName: 'Product A',
              unitPriceVnd: '100000',
            },
          ],
        }),
      })
    )
  })

  it('buyAgain calls POST /orders/:id/buy-again and returns BuyAgainResult', async () => {
    const mockBuyAgain: BuyAgainResult = {
      cart: {
        items: [],
        totalUnits: 2,
        selectedLineCount: 1,
        selectedTotalVnd: '51980000',
        shippingFeeVnd: '0',
      },
      addedCount: 1,
      adjustedItems: [
        {
          variantId: 'var-1',
          productName: 'iPhone 16 Pro',
          requestedQuantity: 3,
          addedQuantity: 2,
        },
      ],
      skippedItems: [
        {
          variantId: 'var-2',
          productName: 'Samsung Galaxy S25',
          reason: 'out_of_stock',
        },
      ],
    }

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        message: 'Đã thêm sản phẩm vào giỏ hàng',
        data: mockBuyAgain,
        error: null,
        meta: { timestamp: '2026-11-18T10:00:00Z' },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await buyAgain('ord-123')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/orders/ord-123/buy-again'),
      expect.objectContaining({ method: 'POST' })
    )
    expect(result).toEqual(mockBuyAgain)

    const objResult = await ordersApi.buyAgain('ord-123')
    expect(objResult).toEqual(mockBuyAgain)
  })
})
