import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getAdminReviews, updateAdminReply, deleteAdminReply } from './reviews'
import * as client from './client'
import type { AdminReview } from './reviews'

vi.mock('./client', () => ({
  apiClientWithMeta: vi.fn(),
}))

describe('admin reviews API service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getAdminReviews', () => {
    it('calls /admin/reviews without query params when no params are given', async () => {
      const mockResult = {
        data: [] as AdminReview[],
        meta: {
          timestamp: '2026-08-28T00:00:00Z',
          pagination: { page: 1, limit: 10, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
        },
        message: 'OK',
      }
      vi.mocked(client.apiClientWithMeta).mockResolvedValueOnce(mockResult)

      const res = await getAdminReviews()
      expect(client.apiClientWithMeta).toHaveBeenCalledWith('/admin/reviews')
      expect(res).toEqual(mockResult)
    })

    it('formats query params properly with page, limit, rating, and has_reply', async () => {
      const mockResult = {
        data: [] as AdminReview[],
        meta: {
          timestamp: '2026-08-28T00:00:00Z',
          pagination: { page: 2, limit: 5, total: 10, totalPages: 2, hasNext: false, hasPrev: true },
        },
        message: 'OK',
      }
      vi.mocked(client.apiClientWithMeta).mockResolvedValueOnce(mockResult)

      const res = await getAdminReviews({ page: 2, limit: 5, rating: 5, has_reply: 'yes' })
      expect(client.apiClientWithMeta).toHaveBeenCalledWith('/admin/reviews?page=2&limit=5&rating=5&has_reply=yes')
      expect(res).toEqual(mockResult)
    })
  })

  describe('updateAdminReply', () => {
    it('sends PUT /admin/reviews/:id/reply with reply payload', async () => {
      const mockResult = {
        data: { id: 'rev-1', adminReply: 'Cảm ơn bạn!' } as AdminReview,
        meta: { timestamp: '2026-08-28T00:00:00Z' },
        message: 'OK',
      }
      vi.mocked(client.apiClientWithMeta).mockResolvedValueOnce(mockResult)

      const res = await updateAdminReply('rev-1', 'Cảm ơn bạn!')
      expect(client.apiClientWithMeta).toHaveBeenCalledWith('/admin/reviews/rev-1/reply', {
        method: 'PUT',
        body: { reply: 'Cảm ơn bạn!' },
      })
      expect(res).toEqual(mockResult)
    })
  })

  describe('deleteAdminReply', () => {
    it('sends DELETE /admin/reviews/:id/reply', async () => {
      const mockResult = {
        data: { id: 'rev-1', adminReply: undefined } as AdminReview,
        meta: { timestamp: '2026-08-28T00:00:00Z' },
        message: 'OK',
      }
      vi.mocked(client.apiClientWithMeta).mockResolvedValueOnce(mockResult)

      const res = await deleteAdminReply('rev-1')
      expect(client.apiClientWithMeta).toHaveBeenCalledWith('/admin/reviews/rev-1/reply', {
        method: 'DELETE',
      })
      expect(res).toEqual(mockResult)
    })
  })
})
