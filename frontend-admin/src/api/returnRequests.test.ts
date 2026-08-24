import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getAdminReturnRequests,
  getAdminReturnRequest,
  approveReturnRequest,
  rejectReturnRequest,
  receiveReturnRequest,
  refundReturnRequest,
} from './returnRequests'
import * as client from './client'
import type { AdminReturnRequestView } from './returnRequests'

vi.mock('./client', () => ({
  apiClient: vi.fn(),
  apiClientWithMeta: vi.fn(),
}))

describe('admin return requests API service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockReturnRequest: AdminReturnRequestView = {
    id: 'rr-10000001',
    orderId: 'ord-20000001',
    status: 'pending_approval',
    reasonCode: 'defective',
    description: 'Màn hình bị nứt khi nhận hàng',
    items: [
      {
        id: 'ri-1',
        orderItemId: 'oi-1',
        productName: 'iPhone 15 Pro Max',
        imageUrl: 'https://example.com/iphone.jpg',
        unitPriceVnd: '500000',
        quantity: 1,
      },
    ],
    createdAt: '2026-08-20T09:00:00Z',
    updatedAt: '2026-08-20T09:00:00Z',
    approvedAt: null,
    rejectedAt: null,
    receivedAt: null,
    refundedAt: null,
    cancelledAt: null,
    buyerEmail: 'nguyenvana@gmail.com',
    buyerUserId: 'usr-1',
    orderTotalVnd: '1300000',
    shippingFeeVnd: '20000',
    suggestedRefundVnd: '520000',
  }

  describe('getAdminReturnRequests', () => {
    it('calls /admin/return-requests without query when no params provided', async () => {
      const mockResult = {
        data: [] as AdminReturnRequestView[],
        meta: {
          timestamp: '2026-08-22T09:00:00Z',
          pagination: { page: 1, limit: 20, total: 0, totalPages: 1, hasNext: false, hasPrev: false },
        },
        message: '',
      }
      vi.mocked(client.apiClientWithMeta).mockResolvedValueOnce(mockResult)

      const res = await getAdminReturnRequests()

      expect(client.apiClientWithMeta).toHaveBeenCalledWith('/admin/return-requests')
      expect(res).toEqual(mockResult)
    })

    it('formats query parameters with status, page and limit', async () => {
      vi.mocked(client.apiClientWithMeta).mockResolvedValueOnce({
        data: [mockReturnRequest],
        meta: {
          timestamp: '2026-08-22T09:00:00Z',
          pagination: { page: 2, limit: 20, total: 25, totalPages: 2, hasNext: true, hasPrev: true },
        },
        message: '',
      })

      await getAdminReturnRequests({ status: 'pending_approval', page: 2, limit: 20 })

      expect(client.apiClientWithMeta).toHaveBeenCalledWith(
        '/admin/return-requests?status=pending_approval&page=2&limit=20'
      )
    })

    it('trims status and omits it when empty or only whitespace', async () => {
      vi.mocked(client.apiClientWithMeta).mockResolvedValueOnce({
        data: [],
        meta: { timestamp: '2026-08-22T09:00:00Z' },
        message: '',
      })

      await getAdminReturnRequests({ status: '   ', page: 1 })

      expect(client.apiClientWithMeta).toHaveBeenCalledWith('/admin/return-requests?page=1')
    })
  })

  describe('getAdminReturnRequest', () => {
    it('calls /admin/return-requests/:id and returns AdminReturnRequestView', async () => {
      vi.mocked(client.apiClient).mockResolvedValueOnce(mockReturnRequest)

      const res = await getAdminReturnRequest('rr-10000001')

      expect(client.apiClient).toHaveBeenCalledWith('/admin/return-requests/rr-10000001')
      expect(res).toEqual(mockReturnRequest)
    })

    it('encodes request ID properly in URL', async () => {
      vi.mocked(client.apiClient).mockResolvedValueOnce(mockReturnRequest)

      await getAdminReturnRequest('rr/special 123')

      expect(client.apiClient).toHaveBeenCalledWith('/admin/return-requests/rr%2Fspecial%20123')
    })
  })

  describe('approveReturnRequest', () => {
    it('sends POST /admin/return-requests/:id/approve', async () => {
      const approved = { ...mockReturnRequest, status: 'approved' as const }
      vi.mocked(client.apiClient).mockResolvedValueOnce(approved)

      const res = await approveReturnRequest('rr-10000001')

      expect(client.apiClient).toHaveBeenCalledWith(
        '/admin/return-requests/rr-10000001/approve',
        { method: 'POST' }
      )
      expect(res).toEqual(approved)
    })
  })

  describe('rejectReturnRequest', () => {
    it('sends POST /admin/return-requests/:id/reject with reason body', async () => {
      const rejected = {
        ...mockReturnRequest,
        status: 'rejected' as const,
        rejectReason: 'Hàng đã qua sử dụng',
      }
      vi.mocked(client.apiClient).mockResolvedValueOnce(rejected)

      const res = await rejectReturnRequest('rr-10000001', { reason: 'Hàng đã qua sử dụng' })

      expect(client.apiClient).toHaveBeenCalledWith(
        '/admin/return-requests/rr-10000001/reject',
        { method: 'POST', body: { reason: 'Hàng đã qua sử dụng' } }
      )
      expect(res).toEqual(rejected)
    })
  })

  describe('receiveReturnRequest', () => {
    it('sends POST /admin/return-requests/:id/receive', async () => {
      const received = { ...mockReturnRequest, status: 'received' as const }
      vi.mocked(client.apiClient).mockResolvedValueOnce(received)

      const res = await receiveReturnRequest('rr-10000001')

      expect(client.apiClient).toHaveBeenCalledWith(
        '/admin/return-requests/rr-10000001/receive',
        { method: 'POST' }
      )
      expect(res).toEqual(received)
    })
  })

  describe('refundReturnRequest', () => {
    it('sends POST /admin/return-requests/:id/refund with amount body', async () => {
      const refunded = {
        ...mockReturnRequest,
        status: 'refunded' as const,
        refundAmountVnd: '520000',
      }
      vi.mocked(client.apiClient).mockResolvedValueOnce(refunded)

      const res = await refundReturnRequest('rr-10000001', { amount: '520000' })

      expect(client.apiClient).toHaveBeenCalledWith(
        '/admin/return-requests/rr-10000001/refund',
        { method: 'POST', body: { amount: '520000' } }
      )
      expect(res).toEqual(refunded)
    })
  })
})
