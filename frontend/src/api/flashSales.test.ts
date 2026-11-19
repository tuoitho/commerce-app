import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flashSalesApi } from './flashSales'

describe('flashSalesApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('getCurrentFlashSale fetches /flash-sales/current and returns active campaign', async () => {
    const campaign = {
      id: 'fs-1',
      name: 'Deal Chớp Nhoáng 12H',
      startsAt: '2026-11-18T05:00:00Z',
      endsAt: '2026-11-18T08:00:00Z',
      items: [
        {
          productId: 'prod-1',
          variantId: 'var-1',
          productName: 'iPhone 16 Pro',
          brand: 'Apple',
          model: 'A3294',
          imageUrl: '/media/products/1.jpg',
          optionLabel: '256GB / Titan Tự Nhiên',
          regularPriceVnd: '28990000',
          flashPriceVnd: '25990000',
          discountPercent: 10,
          quota: 20,
          soldQuantity: 12,
          inStock: true,
        },
      ],
    }

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        message: '',
        data: campaign,
        error: null,
        meta: { timestamp: '2026-11-18T06:00:00Z' },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await flashSalesApi.getCurrentFlashSale()
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/flash-sales/current'),
      expect.anything()
    )
    expect(result).toEqual(campaign)
  })

  it('getCurrentFlashSale returns null when no campaign is active', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        message: '',
        data: null,
        error: null,
        meta: { timestamp: '2026-11-18T06:00:00Z' },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await flashSalesApi.getCurrentFlashSale()
    expect(result).toBeNull()
  })
})
