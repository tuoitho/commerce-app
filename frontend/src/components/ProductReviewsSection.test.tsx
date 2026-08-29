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
        response: null,
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
        response: null,
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

  it('renders the nullable store response as literal plain text without admin details', async () => {
    const literalContent = '<img src=x onerror="window.__responseXss=true"> Cảm ơn bạn'
    const mockReviews = [
      {
        id: 'rev-with-response',
        productId: 'prod-1',
        variantId: 'var-1',
        purchasedOptions: [],
        rating: 5,
        comment: 'Đánh giá đã chỉnh sửa',
        media: [],
        authorLabel: 'Khách hàng đã mua hàng',
        verifiedPurchase: true,
        createdAt: '2026-08-28T00:00:00Z',
        updatedAt: '2026-08-28T01:00:00Z',
        response: {
          content: literalContent,
          authorLabel: 'Phản hồi từ cửa hàng',
          createdAt: '2026-08-28T00:30:00Z',
          updatedAt: '2026-08-28T00:45:00Z',
        },
      },
      {
        id: 'rev-without-response',
        productId: 'prod-1',
        variantId: 'var-2',
        purchasedOptions: [],
        rating: 4,
        comment: 'Không có phản hồi',
        media: [],
        authorLabel: 'Khách hàng đã mua hàng',
        verifiedPurchase: true,
        createdAt: '2026-08-27T00:00:00Z',
        updatedAt: '2026-08-27T00:00:00Z',
        response: null,
      },
    ] satisfies Review[]

    vi.spyOn(reviewsApi, 'listProductReviews').mockResolvedValueOnce({
      data: mockReviews,
      message: 'Danh sách đánh giá',
      meta: {
        timestamp: '2026-08-28T02:00:00Z',
        pagination: { page: 1, limit: 5, total: 2, totalPages: 1, hasNext: false, hasPrev: false },
      },
    })

    const { container } = render(
      <ProductReviewsSection
        productId="prod-1"
        reviewSummary={{ averageRating: 4.5, reviewCount: 2 }}
      />
    )

    expect(await screen.findByText('Phản hồi từ cửa hàng')).toBeInTheDocument()
    expect(screen.getByText(literalContent)).toBeInTheDocument()
    expect(container.querySelector('img[src="x"]')).not.toBeInTheDocument()
    expect(screen.queryByText(/version|admin/i)).not.toBeInTheDocument()
  })
})
