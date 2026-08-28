import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ProductReviewsSection } from './ProductReviewsSection'
import * as reviewsApi from '@/api/reviews'
import type { Review } from '@/api/types'

describe('ProductReviewsSection', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders empty state when product has no reviews', async () => {
    vi.spyOn(reviewsApi, 'listProductReviews').mockResolvedValueOnce({
      data: [],
      message: 'Danh sách đánh giá',
      meta: {
        timestamp: '2026-08-28T00:00:00Z',
        pagination: { page: 1, limit: 5, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
      },
    })

    render(
      <ProductReviewsSection
        productId="prod-1"
        reviewSummary={{ averageRating: null, reviewCount: 0 }}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Chưa có đánh giá nào')).toBeInTheDocument()
      expect(screen.getByText(/0 đánh giá/i)).toBeInTheDocument()
    })
  })

  it('renders reviews list with author label, verified purchase badge, options and comment', async () => {
    const mockReviews: Review[] = [
      {
        id: 'rev-1',
        productId: 'prod-1',
        variantId: 'var-1',
        purchasedOptions: [{ groupLabel: 'Màu sắc', valueLabel: 'Titan Tự Nhiên' }],
        rating: 5,
        comment: 'Máy dùng rất mượt và pin trâu!',
        media: [
          {
            id: 'med-1',
            type: 'image',
            mimeType: 'image/jpeg',
            sizeBytes: 1024,
            position: 0,
            url: '/media/reviews/med-1',
          },
        ],
        authorLabel: 'Khách hàng đã mua hàng',
        verifiedPurchase: true,
        createdAt: '2026-08-28T00:00:00Z',
        updatedAt: '2026-08-28T00:00:00Z',
        viewer: { isOwner: true, canEdit: true, remainingEdits: 1 },
      },
    ]

    vi.spyOn(reviewsApi, 'listProductReviews').mockResolvedValueOnce({
      data: mockReviews,
      message: 'Danh sách đánh giá',
      meta: {
        timestamp: '2026-08-28T00:00:00Z',
        pagination: { page: 1, limit: 5, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
      },
    })

    render(
      <ProductReviewsSection
        productId="prod-1"
        reviewSummary={{ averageRating: 5.0, reviewCount: 1 }}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Đánh giá từ khách hàng')).toBeInTheDocument()
      expect(screen.getByText('5.0')).toBeInTheDocument()
      expect(screen.getByText('Khách hàng đã mua hàng')).toBeInTheDocument()
      expect(screen.getByText('Đã mua hàng')).toBeInTheDocument()
      expect(screen.getByText(/Màu sắc: Titan Tự Nhiên/i)).toBeInTheDocument()
      expect(screen.getByText('Máy dùng rất mượt và pin trâu!')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Sửa đánh giá' })).toBeInTheDocument()
    })
  })

  it('opens media lightbox when clicking review media thumbnail', async () => {
    const mockReviews: Review[] = [
      {
        id: 'rev-1',
        productId: 'prod-1',
        variantId: 'var-1',
        purchasedOptions: [],
        rating: 5,
        comment: 'Ảnh đẹp',
        media: [
          {
            id: 'med-1',
            type: 'image',
            mimeType: 'image/jpeg',
            sizeBytes: 2048,
            position: 0,
            url: '/media/reviews/med-1',
          },
        ],
        authorLabel: 'Khách hàng đã mua hàng',
        verifiedPurchase: true,
        createdAt: '2026-08-28T00:00:00Z',
        updatedAt: '2026-08-28T00:00:00Z',
      },
    ]

    vi.spyOn(reviewsApi, 'listProductReviews').mockResolvedValueOnce({
      data: mockReviews,
      message: 'Danh sách đánh giá',
      meta: {
        timestamp: '2026-08-28T00:00:00Z',
        pagination: { page: 1, limit: 5, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
      },
    })

    render(
      <ProductReviewsSection
        productId="prod-1"
        reviewSummary={{ averageRating: 5.0, reviewCount: 1 }}
      />
    )

    await waitFor(() => {
      expect(screen.getByLabelText('Xem ảnh đánh giá')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText('Xem ảnh đánh giá'))

    await waitFor(() => {
      expect(screen.getByAltText('Full preview')).toBeInTheDocument()
    })
  })
})
