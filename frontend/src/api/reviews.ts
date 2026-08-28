import { apiClient, apiClientWithMeta, type ApiResponseWithMeta } from './client'
import type {
  Review,
  CreateReviewPayload,
  CreateReviewMediaItem,
  EditReviewPayload,
  EditReviewMediaItem,
} from './types'

export async function computeFileSHA256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function createOrderItemReview(
  orderId: string,
  orderItemId: string,
  data: { rating: number; comment?: string },
  files: File[] = []
): Promise<Review> {
  const formData = new FormData()
  const mediaManifest: CreateReviewMediaItem[] = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const sha256 = await computeFileSHA256(file)
    formData.append('files', file)
    mediaManifest.push({
      source: 'upload',
      uploadIndex: i,
      sha256,
      sizeBytes: file.size,
    })
  }

  const payload: CreateReviewPayload = {
    rating: data.rating,
    comment: data.comment,
    media: mediaManifest,
  }
  formData.append('payload', JSON.stringify(payload))

  return apiClient<Review>(`/orders/${orderId}/items/${orderItemId}/review`, {
    method: 'POST',
    body: formData,
  })
}

export async function getOwnedReview(reviewId: string): Promise<Review> {
  return apiClient<Review>(`/reviews/${reviewId}`, {
    method: 'GET',
  })
}

export async function editOwnedReview(
  reviewId: string,
  data: {
    rating: number
    comment?: string
    existingMediaIds: string[]
  },
  newFiles: File[] = []
): Promise<Review> {
  const formData = new FormData()
  const mediaManifest: EditReviewMediaItem[] = []

  for (const mediaId of data.existingMediaIds) {
    mediaManifest.push({
      source: 'existing',
      mediaId,
    })
  }

  for (let i = 0; i < newFiles.length; i++) {
    const file = newFiles[i]
    const sha256 = await computeFileSHA256(file)
    formData.append('files', file)
    mediaManifest.push({
      source: 'upload',
      uploadIndex: i,
      sha256,
      sizeBytes: file.size,
    })
  }

  const payload: EditReviewPayload = {
    rating: data.rating,
    comment: data.comment,
    media: mediaManifest,
  }
  formData.append('payload', JSON.stringify(payload))

  return apiClient<Review>(`/reviews/${reviewId}`, {
    method: 'PUT',
    body: formData,
  })
}

export async function listProductReviews(
  productId: string,
  page: number = 1,
  limit: number = 10
): Promise<ApiResponseWithMeta<Review[]>> {
  return apiClientWithMeta<Review[]>(`/products/${productId}/reviews?page=${page}&limit=${limit}`, {
    method: 'GET',
  })
}
