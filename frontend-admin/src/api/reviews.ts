import { apiClientWithMeta } from './client'
import type { ApiResponseWithMeta } from './client'

export interface ReviewMedia {
  id: string
  type: 'image' | 'video'
  url: string
  mimeType: string
  position: number
  createdAt: string
}

export interface ReviewProduct {
  id: string
  name: string
  brandName: string
  model: string
  imageUrl: string
  options: any[]
}

export interface AdminReview {
  id: string
  orderItemId: string
  rating: number
  comment: string
  editCount: number
  media: ReviewMedia[]
  createdAt: string
  updatedAt: string
  adminReply?: string
  adminRepliedAt?: string
  reviewerEmail?: string
  product: ReviewProduct
}

export interface GetAdminReviewsParams {
  page?: number
  limit?: number
  rating?: number
  has_reply?: string
}

export const getAdminReviews = async (params?: GetAdminReviewsParams): Promise<ApiResponseWithMeta<AdminReview[]>> => {
  const query = new URLSearchParams()
  if (params?.page) query.append('page', String(params.page))
  if (params?.limit) query.append('limit', String(params.limit))
  if (params?.rating) query.append('rating', String(params.rating))
  if (params?.has_reply) query.append('has_reply', params.has_reply)
  const qs = query.toString()
  return apiClientWithMeta<AdminReview[]>(`/admin/reviews${qs ? '?' + qs : ''}`)
}

export const updateAdminReply = async (reviewId: string, reply: string): Promise<ApiResponseWithMeta<AdminReview>> => {
  return apiClientWithMeta<AdminReview>(`/admin/reviews/${reviewId}/reply`, { method: 'PUT', body: { reply } })
}

export const deleteAdminReply = async (reviewId: string): Promise<ApiResponseWithMeta<AdminReview>> => {
  return apiClientWithMeta<AdminReview>(`/admin/reviews/${reviewId}/reply`, { method: 'DELETE' })
}
