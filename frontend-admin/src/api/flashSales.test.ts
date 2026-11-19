import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  listAdminFlashSales,
  getAdminFlashSale,
  createAdminFlashSale,
  updateAdminFlashSale,
  deleteAdminFlashSale,
} from './flashSales'
import * as client from './client'
import type { AdminFlashSaleDetail, AdminFlashSaleSummary, SaveFlashSaleInput } from './types'

vi.mock('./client', () => ({
  apiClient: vi.fn(),
  apiClientWithMeta: vi.fn(),
}))

const mockSummary: AdminFlashSaleSummary = {
  id: 'cccccccc-cccc-cccc-cccc-ccccccccccc1',
  name: 'Deal Chớp Nhoáng 12H',
  startsAt: '2026-11-18T05:00:00Z',
  endsAt: '2026-11-18T08:00:00Z',
  active: true,
  status: 'running',
  variantCount: 1,
  totalQuota: 20,
  totalSold: 12,
  createdAt: '2026-11-18T01:00:00Z',
  updatedAt: '2026-11-18T01:00:00Z',
}

const mockDetail: AdminFlashSaleDetail = {
  id: 'cccccccc-cccc-cccc-cccc-ccccccccccc1',
  name: 'Deal Chớp Nhoáng 12H',
  startsAt: '2026-11-18T05:00:00Z',
  endsAt: '2026-11-18T08:00:00Z',
  active: true,
  status: 'running',
  createdAt: '2026-11-18T01:00:00Z',
  updatedAt: '2026-11-18T01:00:00Z',
  items: [
    {
      productId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
      variantId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
      productName: 'iPhone 16 Pro',
      brand: 'Apple',
      model: 'A3294',
      imageUrl: '/media/products/test.webp',
      optionLabel: '256GB / Titan Tự Nhiên',
      variantActive: true,
      regularPriceVnd: '28990000',
      flashPriceVnd: '25990000',
      quota: 20,
      soldQuantity: 12,
      position: 0,
    },
  ],
}

describe('admin flashSales API service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('listAdminFlashSales', () => {
    it('calls /admin/flash-sales with no params when none provided', async () => {
      const mockResult = {
        data: [mockSummary],
        meta: {
          timestamp: '2026-11-18T10:00:00Z',
          pagination: { page: 1, limit: 20, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
        },
        message: 'OK',
      }
      vi.mocked(client.apiClientWithMeta).mockResolvedValueOnce(mockResult)

      const res = await listAdminFlashSales()

      expect(client.apiClientWithMeta).toHaveBeenCalledWith('/admin/flash-sales')
      expect(res).toEqual(mockResult)
    })

    it('serializes status, page, and limit params', async () => {
      vi.mocked(client.apiClientWithMeta).mockResolvedValueOnce({
        data: [],
        meta: { timestamp: '2026-11-18T10:00:00Z' },
        message: '',
      })

      await listAdminFlashSales({ status: 'scheduled', page: 2, limit: 15 })

      expect(client.apiClientWithMeta).toHaveBeenCalledWith(
        '/admin/flash-sales?status=scheduled&page=2&limit=15'
      )
    })

    it('omits status when set to all or whitespace', async () => {
      vi.mocked(client.apiClientWithMeta).mockResolvedValueOnce({
        data: [],
        meta: { timestamp: '2026-11-18T10:00:00Z' },
        message: '',
      })

      await listAdminFlashSales({ status: 'all', page: 1 })

      expect(client.apiClientWithMeta).toHaveBeenCalledWith('/admin/flash-sales?page=1')
    })
  })

  describe('getAdminFlashSale', () => {
    it('calls GET /admin/flash-sales/:id', async () => {
      vi.mocked(client.apiClient).mockResolvedValueOnce(mockDetail)

      const res = await getAdminFlashSale('fs/1')

      expect(client.apiClient).toHaveBeenCalledWith('/admin/flash-sales/fs%2F1')
      expect(res).toEqual(mockDetail)
    })
  })

  describe('createAdminFlashSale', () => {
    it('sends POST /admin/flash-sales with SaveFlashSaleInput', async () => {
      const input: SaveFlashSaleInput = {
        name: 'Deal Chớp Nhoáng 12H',
        startsAt: '2026-11-18T05:00:00Z',
        endsAt: '2026-11-18T08:00:00Z',
        active: true,
        items: [{ variantId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', flashPriceVnd: '25990000', quota: 20 }],
      }
      vi.mocked(client.apiClient).mockResolvedValueOnce(mockDetail)

      const res = await createAdminFlashSale(input)

      expect(client.apiClient).toHaveBeenCalledWith('/admin/flash-sales', {
        method: 'POST',
        body: input,
      })
      expect(res).toEqual(mockDetail)
    })
  })

  describe('updateAdminFlashSale', () => {
    it('sends PUT /admin/flash-sales/:id with SaveFlashSaleInput', async () => {
      const input: SaveFlashSaleInput = {
        name: 'Deal Chớp Nhoáng 12H (Mở rộng)',
        startsAt: '2026-11-18T05:00:00Z',
        endsAt: '2026-11-18T09:00:00Z',
        active: true,
        items: [{ variantId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', flashPriceVnd: '25490000', quota: 30 }],
      }
      vi.mocked(client.apiClient).mockResolvedValueOnce(mockDetail)

      const res = await updateAdminFlashSale(mockDetail.id, input)

      expect(client.apiClient).toHaveBeenCalledWith(`/admin/flash-sales/${mockDetail.id}`, {
        method: 'PUT',
        body: input,
      })
      expect(res).toEqual(mockDetail)
    })
  })

  describe('deleteAdminFlashSale', () => {
    it('sends DELETE /admin/flash-sales/:id', async () => {
      vi.mocked(client.apiClient).mockResolvedValueOnce(undefined)

      await deleteAdminFlashSale(mockDetail.id)

      expect(client.apiClient).toHaveBeenCalledWith(`/admin/flash-sales/${mockDetail.id}`, {
        method: 'DELETE',
      })
    })
  })
})
