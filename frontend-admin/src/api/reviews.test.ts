import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as client from './client'
import {
  createStoreResponse,
  getAdminReviews,
  updateStoreResponse,
  type AdminStoreReviewResponse,
} from './reviews'

vi.mock('./client', () => ({
  apiClient: vi.fn(),
  apiClientWithMeta: vi.fn(),
}))

describe('admin reviews API service', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists the paginated admin review collection', async () => {
    vi.mocked(client.apiClientWithMeta).mockResolvedValueOnce({
      data: [],
      meta: { timestamp: '2026-08-28T10:00:00Z' },
      message: '',
    })

    await getAdminReviews({ page: 2, limit: 10 })

    expect(client.apiClientWithMeta).toHaveBeenCalledWith('/admin/reviews?page=2&limit=10')
  })

  it('creates a response with POST and the untrimmed draft for server validation', async () => {
    const response = { content: 'Đã hỗ trợ', version: 1 } as AdminStoreReviewResponse
    vi.mocked(client.apiClient).mockResolvedValueOnce(response)

    await createStoreResponse('review/1', { content: '  Đã hỗ trợ  ' })

    expect(client.apiClient).toHaveBeenCalledWith('/admin/reviews/review%2F1/response', {
      method: 'POST',
      body: { content: '  Đã hỗ trợ  ' },
    })
  })

  it('updates the single response with PUT and its opaque version', async () => {
    const response = { content: 'Nội dung mới', version: 4 } as AdminStoreReviewResponse
    vi.mocked(client.apiClient).mockResolvedValueOnce(response)

    await updateStoreResponse('review-1', { content: 'Nội dung mới', version: 3 })

    expect(client.apiClient).toHaveBeenCalledWith('/admin/reviews/review-1/response', {
      method: 'PUT',
      body: { content: 'Nội dung mới', version: 3 },
    })
  })
})
