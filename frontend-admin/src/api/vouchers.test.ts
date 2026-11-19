import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  listAdminVouchers,
  getAdminVoucher,
  createAdminVoucher,
  updateAdminVoucher,
  deleteAdminVoucher,
} from './vouchers'
import * as client from './client'
import type { AdminVoucher, SaveVoucherInput } from './types'

vi.mock('./client', () => ({
  apiClient: vi.fn(),
  apiClientWithMeta: vi.fn(),
}))

const mockVoucher: AdminVoucher = {
  id: 'dddddddd-dddd-dddd-dddd-ddddddddddd1',
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
  startsAt: '2026-11-01T00:00:00Z',
  endsAt: '2026-12-31T23:59:59Z',
  active: true,
  effectiveStatus: 'active',
  createdAt: '2026-11-18T10:00:00Z',
  updatedAt: '2026-11-18T10:00:00Z',
}

describe('admin vouchers API service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('listAdminVouchers', () => {
    it('calls /admin/vouchers without query params when none provided', async () => {
      const mockResult = {
        data: [mockVoucher],
        meta: {
          timestamp: '2026-11-18T10:00:00Z',
          pagination: { page: 1, limit: 20, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
        },
        message: 'OK',
      }
      vi.mocked(client.apiClientWithMeta).mockResolvedValueOnce(mockResult)

      const res = await listAdminVouchers()

      expect(client.apiClientWithMeta).toHaveBeenCalledWith('/admin/vouchers')
      expect(res).toEqual(mockResult)
    })

    it('serializes q, status, page, and limit params cleanly', async () => {
      vi.mocked(client.apiClientWithMeta).mockResolvedValueOnce({
        data: [],
        meta: { timestamp: '2026-11-18T10:00:00Z' },
        message: '',
      })

      await listAdminVouchers({ q: '  AURA ', status: 'active', page: 2, limit: 10 })

      expect(client.apiClientWithMeta).toHaveBeenCalledWith(
        '/admin/vouchers?q=AURA&status=active&page=2&limit=10'
      )
    })

    it('omits status when set to all or whitespace', async () => {
      vi.mocked(client.apiClientWithMeta).mockResolvedValueOnce({
        data: [],
        meta: { timestamp: '2026-11-18T10:00:00Z' },
        message: '',
      })

      await listAdminVouchers({ q: '   ', status: 'all', page: 1 })

      expect(client.apiClientWithMeta).toHaveBeenCalledWith('/admin/vouchers?page=1')
    })
  })

  describe('getAdminVoucher', () => {
    it('calls GET /admin/vouchers/:id with encoded id', async () => {
      vi.mocked(client.apiClient).mockResolvedValueOnce(mockVoucher)

      const res = await getAdminVoucher('voucher/1')

      expect(client.apiClient).toHaveBeenCalledWith('/admin/vouchers/voucher%2F1')
      expect(res).toEqual(mockVoucher)
    })
  })

  describe('createAdminVoucher', () => {
    it('sends POST /admin/vouchers with SaveVoucherInput body', async () => {
      const input: SaveVoucherInput = {
        code: 'AURA10',
        title: 'Giảm 10%',
        description: '',
        voucherType: 'percent',
        discountValue: '10',
        maxDiscountVnd: '1000000',
        minOrderVnd: '5000000',
        usageLimit: 100,
        perUserLimit: 2,
        startsAt: '2026-11-01T00:00:00Z',
        endsAt: '2026-12-31T23:59:59Z',
        active: true,
      }
      vi.mocked(client.apiClient).mockResolvedValueOnce(mockVoucher)

      const res = await createAdminVoucher(input)

      expect(client.apiClient).toHaveBeenCalledWith('/admin/vouchers', {
        method: 'POST',
        body: input,
      })
      expect(res).toEqual(mockVoucher)
    })
  })

  describe('updateAdminVoucher', () => {
    it('sends PUT /admin/vouchers/:id with SaveVoucherInput body', async () => {
      const input: SaveVoucherInput = {
        code: 'AURA10',
        title: 'Giảm 10% mới',
        description: '',
        voucherType: 'fixed_amount',
        discountValue: '500000',
        maxDiscountVnd: null,
        minOrderVnd: '0',
        usageLimit: null,
        perUserLimit: 1,
        startsAt: '2026-11-01T00:00:00Z',
        endsAt: '2026-12-31T23:59:59Z',
        active: false,
      }
      vi.mocked(client.apiClient).mockResolvedValueOnce(mockVoucher)

      const res = await updateAdminVoucher(mockVoucher.id, input)

      expect(client.apiClient).toHaveBeenCalledWith(`/admin/vouchers/${mockVoucher.id}`, {
        method: 'PUT',
        body: input,
      })
      expect(res).toEqual(mockVoucher)
    })
  })

  describe('deleteAdminVoucher', () => {
    it('sends DELETE /admin/vouchers/:id', async () => {
      vi.mocked(client.apiClient).mockResolvedValueOnce(undefined)

      await deleteAdminVoucher(mockVoucher.id)

      expect(client.apiClient).toHaveBeenCalledWith(`/admin/vouchers/${mockVoucher.id}`, {
        method: 'DELETE',
      })
    })
  })
})
