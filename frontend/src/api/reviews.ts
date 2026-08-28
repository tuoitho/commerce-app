import { apiClient, apiClientWithMeta, type ApiResponseWithMeta } from './client'
import type {
  CreateReviewInput,
  UpdateReviewInput,
  Review,
  ProductReviewsResponse,
} from './types'

export async function createOrderItemReview(
  orderId: string,
  itemId: string,
  input: CreateReviewInput
): Promise<Review> {
  const formData = new FormData()
  formData.append('rating', String(input.rating))

  if (input.comment !== undefined) {
    formData.append('comment', input.comment)
  }

  if (input.images && input.images.length > 0) {
    for (const image of input.images) {
      formData.append('images', image)
    }
  }

  if (input.video) {
    formData.append('video', input.video)
  }

  return apiClient<Review>(`/orders/${orderId}/items/${itemId}/review`, {
    method: 'POST',
    body: formData,
  })
}

export async function updateOrderItemReview(
  orderId: string,
  itemId: string,
  input: UpdateReviewInput
): Promise<Review> {
  const formData = new FormData()
  formData.append('rating', String(input.rating))

  if (input.comment !== undefined) {
    formData.append('comment', input.comment)
  }

  if (input.retainedMediaIds && input.retainedMediaIds.length > 0) {
    for (const mediaId of input.retainedMediaIds) {
      formData.append('retainedMediaIds', mediaId)
    }
  }

  if (input.images && input.images.length > 0) {
    for (const image of input.images) {
      formData.append('images', image)
    }
  }

  if (input.video) {
    formData.append('video', input.video)
  }

  return apiClient<Review>(`/orders/${orderId}/items/${itemId}/review`, {
    method: 'PUT',
    body: formData,
  })
}

export async function getProductReviews(
  productId: string,
  params: { page?: number; limit?: number } = {}
): Promise<ApiResponseWithMeta<ProductReviewsResponse>> {
  const searchParams = new URLSearchParams()
  if (params.page !== undefined) {
    searchParams.set('page', String(params.page))
  }
  if (params.limit !== undefined) {
    searchParams.set('limit', String(params.limit))
  }

  const queryString = searchParams.toString()
  const path = `/products/${productId}/reviews${queryString ? `?${queryString}` : ''}`

  return apiClientWithMeta<ProductReviewsResponse>(path)
}
