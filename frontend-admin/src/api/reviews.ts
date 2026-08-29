import { apiClient, apiClientWithMeta, type ApiResponseWithMeta } from './client'

export interface PurchasedOption {
  groupLabel: string
  valueLabel: string
}

export interface ReviewMedia {
  id: string
  type: 'image' | 'video'
  url: string
  position: number
}

export interface StoreReviewResponse {
  content: string
  authorLabel: 'Phản hồi từ cửa hàng'
  createdAt: string
  updatedAt: string
}

export interface AdminReview {
  id: string
  productId: string
  variantId: string
  purchasedOptions: PurchasedOption[]
  rating: number
  comment: string
  media: ReviewMedia[]
  verifiedPurchase: true
  authorLabel: 'Khách hàng đã mua hàng'
  createdAt: string
  updatedAt: string
  viewer: null
  response: StoreReviewResponse | null
}

export interface AdminReviewItem {
  review: AdminReview
  product: {
    id: string
    name: string
    publicPath: string | null
  }
  responseVersion: number | null
}

export interface AdminStoreReviewResponse extends StoreReviewResponse {
  version: number
}

export interface StoreResponseInput {
  content: string
}

export interface UpdateStoreResponseInput extends StoreResponseInput {
  version: number
}

export function getAdminReviews(params: { page: number; limit: number }): Promise<ApiResponseWithMeta<AdminReviewItem[]>> {
  const searchParams = new URLSearchParams({ page: String(params.page), limit: String(params.limit) })
  return apiClientWithMeta<AdminReviewItem[]>(`/admin/reviews?${searchParams}`)
}

export function createStoreResponse(reviewId: string, input: StoreResponseInput): Promise<AdminStoreReviewResponse> {
  return apiClient<AdminStoreReviewResponse>(`/admin/reviews/${encodeURIComponent(reviewId)}/response`, {
    method: 'POST',
    body: input,
  })
}

export function updateStoreResponse(reviewId: string, input: UpdateStoreResponseInput): Promise<AdminStoreReviewResponse> {
  return apiClient<AdminStoreReviewResponse>(`/admin/reviews/${encodeURIComponent(reviewId)}/response`, {
    method: 'PUT',
    body: input,
  })
}
