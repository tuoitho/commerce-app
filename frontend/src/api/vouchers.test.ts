import { describe, it, expect, beforeEach, vi } from 'vitest'
import { vouchersApi, listAvailableVouchers, quoteCheckout } from './vouchers'
import type { AvailableVoucher, CheckoutQuote } from './types'

describe('vouchersApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  const mockAvailableVouchers: AvailableVoucher[] = [
    {
      id: 'vch-1',
      code: 'AURA10',
      title: 'Giảm 10% tối đa 1 triệu',
      description: 'Áp dụng toàn bộ điện thoại chính hãng',
      voucherType: 'percent',
      discountValue: '10',
      maxDiscountVnd: '1000000',
      minOrderVnd: '5000000',
      usageLimit: 100,
      usedCount: 0,
      perUserLimit: 2,
      userRemainingUses: 2,
      startsAt: '2026-11-01T00:00:00Z',
      endsAt: '2026-12-31T23:59:59Z',
    },
  ]

  const mockQuote: CheckoutQuote = {
    subtotalVnd: '28990000',
    deliveryMethod: 'express_2h',
    expressAvailable: true,
    standardShippingFeeVnd: '0',
    expressShippingFeeVnd: '60000',
    freeShippingThresholdVnd: '5000000',
    shippingFeeVnd: '60000',
    voucherCode: 'AURA10',
    voucherType: 'percent',
    discountVnd: '1000000',
    totalVnd: '28050000',
  }

  it('listAvailable calls GET /vouchers/available', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        message: 'Lấy danh sách mã giảm giá khả dụng thành công',
        data: mockAvailableVouchers,
        error: null,
        meta: { timestamp: '2026-11-18T10:00:00Z' },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await listAvailableVouchers()
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/vouchers/available'),
      expect.anything()
    )
    expect(result).toEqual(mockAvailableVouchers)

    const objResult = await vouchersApi.listAvailable()
    expect(objResult).toEqual(mockAvailableVouchers)
  })

  it('quoteCheckout calls POST /checkout/quote with trimmed voucherCode and omits blank voucherCode', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        message: 'Báo giá đơn hàng thành công',
        data: mockQuote,
        error: null,
        meta: { timestamp: '2026-11-18T10:00:00Z' },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await quoteCheckout({
      addressId: 'addr-1',
      deliveryMethod: 'express_2h',
      voucherCode: '  AURA10  ',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/checkout/quote'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          addressId: 'addr-1',
          deliveryMethod: 'express_2h',
          voucherCode: 'AURA10',
        }),
      })
    )
    expect(result).toEqual(mockQuote)

    await vouchersApi.quoteCheckout({
      addressId: 'addr-1',
      deliveryMethod: 'standard',
      voucherCode: '   ',
    })

    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining('/checkout/quote'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          addressId: 'addr-1',
          deliveryMethod: 'standard',
        }),
      })
    )
  })
})
