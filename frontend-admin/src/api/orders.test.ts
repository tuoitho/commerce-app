import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getAdminOrders,
  getAdminOrder,
  adminConfirmPreparing,
  adminShip,
  adminDeliver,
  adminApproveCancel,
  adminDeclineCancel,
} from './orders'
import * as client from './client'
import type { AdminOrder } from './types'

vi.mock('./client', () => ({
  apiClient: vi.fn(),
  apiClientWithMeta: vi.fn(),
}))

describe('admin orders API service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockAdminOrder: AdminOrder = {
    id: 'ord-123',
    userId: 'user-456',
    buyerEmail: 'buyer@example.com',
    status: 'confirmed',
    paymentMethod: 'cod',
    recipientName: 'Nguyễn Văn A',
    phone: '0901234567',
    provinceName: 'Hà Nội',
    wardName: 'Phường Hàng Bạc',
    detailAddress: '123 Phố Huế',
    subtotalVnd: '500000',
    shippingFeeVnd: '30000',
    totalVnd: '530000',
    items: [
      {
        id: 'item-1',
        variantId: 'var-1',
        productId: 'prod-1',
        brandName: 'BrandX',
        productName: 'Sản phẩm X',
        model: 'X1',
        imageUrl: 'https://example.com/x.jpg',
        options: [{ groupLabel: 'Màu', valueLabel: 'Đen' }],
        unitPriceVnd: '500000',
        quantity: 1,
        lineTotalVnd: '500000',
      },
    ],
    createdAt: '2026-08-19T08:00:00Z',
    updatedAt: '2026-08-19T08:00:00Z',
    confirmedAt: '2026-08-19T08:05:00Z',
    cancelledAt: null,
  }

  describe('getAdminOrders', () => {
    it('calls /admin/orders with default parameters when none provided', async () => {
      const mockResult = {
        data: [] as AdminOrder[],
        meta: {
          timestamp: '2026-08-19T08:00:00Z',
          pagination: {
            page: 1,
            limit: 20,
            total: 0,
            totalPages: 0,
            hasNext: false,
            hasPrev: false,
          },
        },
        message: '',
      }

      vi.mocked(client.apiClientWithMeta).mockResolvedValueOnce(mockResult)

      const res = await getAdminOrders()

      expect(client.apiClientWithMeta).toHaveBeenCalledWith('/admin/orders')
      expect(res).toEqual(mockResult)
    })

    it('formats query parameters properly when status, page, and limit are passed', async () => {
      const mockResult = {
        data: [mockAdminOrder],
        meta: {
          timestamp: '2026-08-19T08:00:00Z',
          pagination: {
            page: 2,
            limit: 10,
            total: 25,
            totalPages: 3,
            hasNext: true,
            hasPrev: true,
          },
        },
        message: '',
      }

      vi.mocked(client.apiClientWithMeta).mockResolvedValueOnce(mockResult)

      const res = await getAdminOrders({ status: 'confirmed', page: 2, limit: 10 })

      expect(client.apiClientWithMeta).toHaveBeenCalledWith(
        '/admin/orders?status=confirmed&page=2&limit=10'
      )
      expect(res).toEqual(mockResult)
    })

    it('trims status and omits it when empty or only whitespace', async () => {
      vi.mocked(client.apiClientWithMeta).mockResolvedValueOnce({
        data: [],
        meta: { timestamp: '2026-08-19T08:00:00Z' },
        message: '',
      })

      await getAdminOrders({ status: '   ', page: 1 })

      expect(client.apiClientWithMeta).toHaveBeenCalledWith('/admin/orders?page=1')
    })

    it('formats query parameter with status only', async () => {
      vi.mocked(client.apiClientWithMeta).mockResolvedValueOnce({
        data: [mockAdminOrder],
        meta: { timestamp: '2026-08-19T08:00:00Z' },
        message: '',
      })

      await getAdminOrders({ status: 'preparing' })

      expect(client.apiClientWithMeta).toHaveBeenCalledWith('/admin/orders?status=preparing')
    })
  })

  describe('getAdminOrder', () => {
    it('calls /admin/orders/:id and returns AdminOrder', async () => {
      vi.mocked(client.apiClient).mockResolvedValueOnce(mockAdminOrder)

      const res = await getAdminOrder('ord-123')

      expect(client.apiClient).toHaveBeenCalledWith('/admin/orders/ord-123')
      expect(res).toEqual(mockAdminOrder)
    })

    it('encodes order ID properly in URL', async () => {
      vi.mocked(client.apiClient).mockResolvedValueOnce(mockAdminOrder)

      await getAdminOrder('ord/special 123')

      expect(client.apiClient).toHaveBeenCalledWith('/admin/orders/ord%2Fspecial%20123')
    })
  })

  describe('adminConfirmPreparing', () => {
    it('sends POST /admin/orders/:id/confirm-preparing', async () => {
      const updatedOrder = { ...mockAdminOrder, status: 'preparing' as const }
      vi.mocked(client.apiClient).mockResolvedValueOnce(updatedOrder)

      const res = await adminConfirmPreparing('ord-123')

      expect(client.apiClient).toHaveBeenCalledWith('/admin/orders/ord-123/confirm-preparing', {
        method: 'POST',
      })
      expect(res).toEqual(updatedOrder)
    })
  })

  describe('adminShip', () => {
    it('sends POST /admin/orders/:id/ship', async () => {
      const updatedOrder = { ...mockAdminOrder, status: 'shipped' as const }
      vi.mocked(client.apiClient).mockResolvedValueOnce(updatedOrder)

      const res = await adminShip('ord-123')

      expect(client.apiClient).toHaveBeenCalledWith('/admin/orders/ord-123/ship', {
        method: 'POST',
      })
      expect(res).toEqual(updatedOrder)
    })
  })

  describe('adminDeliver', () => {
    it('sends POST /admin/orders/:id/deliver', async () => {
      const updatedOrder = { ...mockAdminOrder, status: 'delivered' as const }
      vi.mocked(client.apiClient).mockResolvedValueOnce(updatedOrder)

      const res = await adminDeliver('ord-123')

      expect(client.apiClient).toHaveBeenCalledWith('/admin/orders/ord-123/deliver', {
        method: 'POST',
      })
      expect(res).toEqual(updatedOrder)
    })
  })

  describe('adminApproveCancel', () => {
    it('sends POST /admin/orders/:id/cancel/approve', async () => {
      const updatedOrder = { ...mockAdminOrder, status: 'cancelled' as const }
      vi.mocked(client.apiClient).mockResolvedValueOnce(updatedOrder)

      const res = await adminApproveCancel('ord-123')

      expect(client.apiClient).toHaveBeenCalledWith('/admin/orders/ord-123/cancel/approve', {
        method: 'POST',
      })
      expect(res).toEqual(updatedOrder)
    })
  })

  describe('adminDeclineCancel', () => {
    it('sends POST /admin/orders/:id/cancel/decline', async () => {
      const updatedOrder = { ...mockAdminOrder, status: 'preparing' as const }
      vi.mocked(client.apiClient).mockResolvedValueOnce(updatedOrder)

      const res = await adminDeclineCancel('ord-123')

      expect(client.apiClient).toHaveBeenCalledWith('/admin/orders/ord-123/cancel/decline', {
        method: 'POST',
      })
      expect(res).toEqual(updatedOrder)
    })
  })
})
