import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ProductReviewsSection } from './ProductReviewsSection'
import * as reviewsApi from '@/api/reviews'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { ApiError, type ProductReviewsResponse, type ApiResponseMeta } from '@/api/types'

type MockReviewsEnvelope = {
  data: ProductReviewsResponse
  meta: ApiResponseMeta
  message: string
}

const mockNavigate = vi.fn()
let mockLocation = { pathname: '/products/prod-1', search: '?ref=deal' }

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => mockLocation,
  }
})

vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/context/ToastContext', () => ({
  useToast: vi.fn(),
}))

describe('ProductReviewsSection', () => {
  const mockToastError = vi.fn()
  const mockToastSuccess = vi.fn()

  beforeEach(() => {
    vi.restoreAllMocks()
    mockNavigate.mockReset()
    mockToastError.mockReset()
    mockToastSuccess.mockReset()
    mockLocation = { pathname: '/products/prod-1', search: '?ref=deal' }

    vi.mocked(useToast).mockReturnValue({
      toast: vi.fn(),
      success: mockToastSuccess,
      error: mockToastError,
      info: vi.fn(),
    })

    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'user-1', email: 'customer@auraphone.vn', role: 'customer' },
      accessToken: 'token-123',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })
  })

  it('renders empty state when product has 0 reviews', async () => {
    const emptyResponse: MockReviewsEnvelope = {
      data: {
        summary: {
          totalReviews: 0,
          averageRating: '0.0',
          ratingCounts: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
        },
        reviews: [],
      },
      message: 'OK',
      meta: {
        timestamp: '2026-08-28T00:00:00Z',
        pagination: { page: 1, limit: 10, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
      },
    }

    vi.spyOn(reviewsApi, 'getProductReviews').mockResolvedValue(emptyResponse)

    render(<ProductReviewsSection productId="prod-1" />)

    await waitFor(() => {
      expect(screen.getByText('Chưa có đánh giá nào cho sản phẩm này')).toBeInTheDocument()
      expect(screen.getByText('0.0')).toBeInTheDocument()
      expect(screen.getByText(/Dựa trên/i)).toBeInTheDocument()
    })
  })

  it('renders reviews, rating breakdown, verified purchase badge, media, and helpfulness counts', async () => {
    const populatedResponse: MockReviewsEnvelope = {
      data: {
        summary: {
          totalReviews: 2,
          averageRating: '4.5',
          ratingCounts: { '1': 0, '2': 0, '3': 0, '4': 1, '5': 1 },
        },
        reviews: [
          {
            id: 'rev-1',
            rating: 5,
            comment: 'Điện thoại xài rất mượt, camera nét căng',
            reviewer: { maskedEmail: 'n***@gmail.com' },
            purchase: {
              model: 'Titan Tự Nhiên 256GB',
              options: [{ groupLabel: 'Màu sắc', valueLabel: 'Titan Tự Nhiên' }],
            },
            media: [
              {
                id: 'med-1',
                type: 'image',
                url: 'https://example.com/img1.jpg',
                mimeType: 'image/jpeg',
                position: 0,
              },
              {
                id: 'med-2',
                type: 'video',
                url: 'https://example.com/vid1.mp4',
                mimeType: 'video/mp4',
                position: 1,
              },
            ],
            createdAt: '2026-08-28T00:00:00Z',
            helpfulness: {
              helpfulCount: 12,
              unhelpfulCount: 2,
              viewerVote: 'helpful',
            },
          },
        ],
      },
      message: 'OK',
      meta: {
        timestamp: '2026-08-28T00:00:00Z',
        pagination: { page: 1, limit: 10, total: 2, totalPages: 1, hasNext: false, hasPrev: false },
      },
    }

    const onSummaryLoaded = vi.fn()
    vi.spyOn(reviewsApi, 'getProductReviews').mockResolvedValue(populatedResponse)

    render(<ProductReviewsSection productId="prod-1" onSummaryLoaded={onSummaryLoaded} />)

    await waitFor(() => {
      expect(screen.getByText('4.5')).toBeInTheDocument()
      expect(screen.getByText(/Dựa trên/i)).toBeInTheDocument()
      expect(screen.getByText('n***@gmail.com')).toBeInTheDocument()
      expect(screen.getByText('Đã mua tại AuraPhone')).toBeInTheDocument()
      expect(screen.getByText('Điện thoại xài rất mượt, camera nét căng')).toBeInTheDocument()
      expect(screen.getByText('Phân loại:')).toBeInTheDocument()
      expect(screen.getByText('Titan Tự Nhiên 256GB')).toBeInTheDocument()
    })

    expect(onSummaryLoaded).toHaveBeenCalledWith(populatedResponse.data.summary)

    // Verify image thumbnail and video player
    const imgThumbnail = screen.getByRole('button', { name: 'Ảnh đánh giá của khách hàng' })
    expect(imgThumbnail).toBeInTheDocument()

    // Click to expand image
    fireEvent.click(imgThumbnail)
    expect(screen.getByRole('dialog', { name: 'Xem ảnh phóng to' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Đóng ảnh' }))

    // Video tag verification
    const videoElem = document.querySelector('video')
    expect(videoElem).toBeInTheDocument()
    expect(videoElem).toHaveAttribute('controls')
    expect(videoElem).toHaveAttribute('preload', 'metadata')

    // Verify helpfulness buttons
    const helpfulBtn = screen.getByRole('button', { name: 'Hữu ích (12)' })
    const unhelpfulBtn = screen.getByRole('button', { name: 'Không hữu ích (2)' })
    expect(helpfulBtn).toHaveAttribute('aria-pressed', 'true')
    expect(unhelpfulBtn).toHaveAttribute('aria-pressed', 'false')
  })

  it('waits for AuthContext.isLoading === false before fetching reviews', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: true,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })

    const getReviewsSpy = vi.spyOn(reviewsApi, 'getProductReviews').mockResolvedValue({
      data: {
        summary: { totalReviews: 0, averageRating: '0.0', ratingCounts: {} },
        reviews: [],
      },
      message: 'OK',
      meta: { timestamp: '2026-08-28T00:00:00Z' },
    })

    const { rerender } = render(<ProductReviewsSection productId="prod-1" />)

    expect(getReviewsSpy).not.toHaveBeenCalled()

    // When auth settles
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })

    rerender(<ProductReviewsSection productId="prod-1" />)

    await waitFor(() => {
      expect(getReviewsSpy).toHaveBeenCalledWith('prod-1', { page: 1, limit: 10 })
    })
  })

  it('renders 0 count accurately for helpful and unhelpful controls', async () => {
    const responseWithZeros: MockReviewsEnvelope = {
      data: {
        summary: {
          totalReviews: 1,
          averageRating: '5.0',
          ratingCounts: { '5': 1 },
        },
        reviews: [
          {
            id: 'rev-zero',
            rating: 5,
            comment: 'Chưa có ai vote',
            reviewer: { maskedEmail: 'z***@gmail.com' },
            purchase: { model: 'Model Z', options: [] },
            media: [],
            createdAt: '2026-08-28T00:00:00Z',
            helpfulness: {
              helpfulCount: 0,
              unhelpfulCount: 0,
              viewerVote: null,
            },
          },
        ],
      },
      message: 'OK',
      meta: {
        timestamp: '2026-08-28T00:00:00Z',
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
      },
    }

    vi.spyOn(reviewsApi, 'getProductReviews').mockResolvedValue(responseWithZeros)

    render(<ProductReviewsSection productId="prod-1" />)

    await waitFor(() => {
      expect(screen.getByText('Chưa có ai vote')).toBeInTheDocument()
    })

    const helpfulBtn = screen.getByRole('button', { name: 'Hữu ích (0)' })
    const unhelpfulBtn = screen.getByRole('button', { name: 'Không hữu ích (0)' })

    expect(helpfulBtn).toHaveAttribute('aria-pressed', 'false')
    expect(unhelpfulBtn).toHaveAttribute('aria-pressed', 'false')
  })

  it('renders independent helpfulness controls for admin reply when present and omits them when absent', async () => {
    const response: MockReviewsEnvelope = {
      data: {
        summary: {
          totalReviews: 2,
          averageRating: '5.0',
          ratingCounts: { '5': 2 },
        },
        reviews: [
          {
            id: 'rev-with-reply',
            rating: 5,
            comment: 'Review có reply',
            reviewer: { maskedEmail: 'a***@gmail.com' },
            purchase: { model: 'Model X', options: [] },
            media: [],
            createdAt: '2026-08-28T00:00:00Z',
            helpfulness: {
              helpfulCount: 10,
              unhelpfulCount: 1,
              viewerVote: 'helpful',
            },
            adminReply: 'Cảm ơn quý khách',
            adminReplyId: 'reply-1',
            adminReplyHelpfulness: {
              helpfulCount: 3,
              unhelpfulCount: 0,
              viewerVote: 'unhelpful',
            },
            adminRepliedAt: '2026-08-28T01:00:00Z',
          },
          {
            id: 'rev-without-reply',
            rating: 5,
            comment: 'Review không có reply',
            reviewer: { maskedEmail: 'b***@gmail.com' },
            purchase: { model: 'Model Y', options: [] },
            media: [],
            createdAt: '2026-08-28T00:00:00Z',
            helpfulness: {
              helpfulCount: 2,
              unhelpfulCount: 5,
              viewerVote: null,
            },
          },
        ],
      },
      message: 'OK',
      meta: {
        timestamp: '2026-08-28T00:00:00Z',
        pagination: { page: 1, limit: 10, total: 2, totalPages: 1, hasNext: false, hasPrev: false },
      },
    }

    vi.spyOn(reviewsApi, 'getProductReviews').mockResolvedValue(response)

    render(<ProductReviewsSection productId="prod-1" />)

    await waitFor(() => {
      expect(screen.getByText('Review có reply')).toBeInTheDocument()
      expect(screen.getByText('Cảm ơn quý khách')).toBeInTheDocument()
      expect(screen.getByText('Review không có reply')).toBeInTheDocument()
    })

    // Review with reply controls
    const reviewHelpful = screen.getByRole('button', { name: 'Hữu ích (10)' })
    const replyHelpful = screen.getByRole('button', { name: 'Hữu ích (3)' })
    const replyUnhelpful = screen.getByRole('button', { name: 'Không hữu ích (0)' })

    expect(reviewHelpful).toHaveAttribute('aria-pressed', 'true')
    expect(replyHelpful).toHaveAttribute('aria-pressed', 'false')
    expect(replyUnhelpful).toHaveAttribute('aria-pressed', 'true')
  })

  it('redirects unauthenticated user to login with current pathname and search on vote click', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })

    const response: MockReviewsEnvelope = {
      data: {
        summary: { totalReviews: 1, averageRating: '5.0', ratingCounts: { '5': 1 } },
        reviews: [
          {
            id: 'rev-guest',
            rating: 5,
            comment: 'Guest review test',
            reviewer: { maskedEmail: 'g***@gmail.com' },
            purchase: { model: 'Model G', options: [] },
            media: [],
            createdAt: '2026-08-28T00:00:00Z',
            helpfulness: {
              helpfulCount: 5,
              unhelpfulCount: 0,
              viewerVote: null,
            },
          },
        ],
      },
      message: 'OK',
      meta: { timestamp: '2026-08-28T00:00:00Z' },
    }

    vi.spyOn(reviewsApi, 'getProductReviews').mockResolvedValue(response)
    const setReviewSpy = vi.spyOn(reviewsApi, 'setReviewHelpfulness')

    render(<ProductReviewsSection productId="prod-1" />)

    await waitFor(() => {
      expect(screen.getByText('Guest review test')).toBeInTheDocument()
    })

    const helpfulBtn = screen.getByRole('button', { name: 'Hữu ích (5)' })
    fireEvent.click(helpfulBtn)

    expect(mockNavigate).toHaveBeenCalledWith(
      `/login?redirect=${encodeURIComponent('/products/prod-1?ref=deal')}`
    )
    expect(setReviewSpy).not.toHaveBeenCalled()
  })

  it('executes authenticated vote: create vote, remove vote (clicking same), change vote (opposite)', async () => {
    const response: MockReviewsEnvelope = {
      data: {
        summary: { totalReviews: 1, averageRating: '5.0', ratingCounts: { '5': 1 } },
        reviews: [
          {
            id: 'rev-vote',
            rating: 5,
            comment: 'Interactive review test',
            reviewer: { maskedEmail: 'i***@gmail.com' },
            purchase: { model: 'Model I', options: [] },
            media: [],
            createdAt: '2026-08-28T00:00:00Z',
            helpfulness: {
              helpfulCount: 0,
              unhelpfulCount: 0,
              viewerVote: null,
            },
          },
        ],
      },
      message: 'OK',
      meta: { timestamp: '2026-08-28T00:00:00Z' },
    }

    vi.spyOn(reviewsApi, 'getProductReviews').mockResolvedValue(response)
    const setReviewSpy = vi.spyOn(reviewsApi, 'setReviewHelpfulness')

    render(<ProductReviewsSection productId="prod-1" />)

    await waitFor(() => {
      expect(screen.getByText('Interactive review test')).toBeInTheDocument()
    })

    // 1. Create vote: click "Hữu ích"
    setReviewSpy.mockResolvedValueOnce({
      helpfulCount: 1,
      unhelpfulCount: 0,
      viewerVote: 'helpful',
    })

    const helpfulBtn = screen.getByRole('button', { name: 'Hữu ích (0)' })
    fireEvent.click(helpfulBtn)

    expect(setReviewSpy).toHaveBeenCalledWith('rev-vote', 'helpful')

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Hữu ích (1)' })).toHaveAttribute('aria-pressed', 'true')
    })

    // 2. Remove vote: click "Hữu ích" again
    setReviewSpy.mockResolvedValueOnce({
      helpfulCount: 0,
      unhelpfulCount: 0,
      viewerVote: null,
    })

    const activeHelpfulBtn = screen.getByRole('button', { name: 'Hữu ích (1)' })
    fireEvent.click(activeHelpfulBtn)

    expect(setReviewSpy).toHaveBeenCalledWith('rev-vote', null)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Hữu ích (0)' })).toHaveAttribute('aria-pressed', 'false')
    })

    // 3. Change vote: click "Không hữu ích"
    setReviewSpy.mockResolvedValueOnce({
      helpfulCount: 0,
      unhelpfulCount: 1,
      viewerVote: 'unhelpful',
    })

    const unhelpfulBtn = screen.getByRole('button', { name: 'Không hữu ích (0)' })
    fireEvent.click(unhelpfulBtn)

    expect(setReviewSpy).toHaveBeenCalledWith('rev-vote', 'unhelpful')

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Không hữu ích (1)' })).toHaveAttribute('aria-pressed', 'true')
    })

    // 4. Switch to opposite: click "Hữu ích" while "Không hữu ích" is active
    setReviewSpy.mockResolvedValueOnce({
      helpfulCount: 1,
      unhelpfulCount: 0,
      viewerVote: 'helpful',
    })

    const newHelpfulBtn = screen.getByRole('button', { name: 'Hữu ích (0)' })
    fireEvent.click(newHelpfulBtn)

    expect(setReviewSpy).toHaveBeenCalledWith('rev-vote', 'helpful')

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Hữu ích (1)' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('button', { name: 'Không hữu ích (0)' })).toHaveAttribute('aria-pressed', 'false')
    })
  })

  it('handles authenticated voting on admin reply and maintains independent state from review', async () => {
    const response: MockReviewsEnvelope = {
      data: {
        summary: { totalReviews: 1, averageRating: '5.0', ratingCounts: { '5': 1 } },
        reviews: [
          {
            id: 'rev-1',
            rating: 5,
            comment: 'Review with reply test',
            reviewer: { maskedEmail: 'r***@gmail.com' },
            purchase: { model: 'Model R', options: [] },
            media: [],
            createdAt: '2026-08-28T00:00:00Z',
            helpfulness: {
              helpfulCount: 5,
              unhelpfulCount: 0,
              viewerVote: 'helpful',
            },
            adminReply: 'Cảm ơn phản hồi',
            adminReplyId: 'reply-1',
            adminReplyHelpfulness: {
              helpfulCount: 0,
              unhelpfulCount: 0,
              viewerVote: null,
            },
            adminRepliedAt: '2026-08-28T01:00:00Z',
          },
        ],
      },
      message: 'OK',
      meta: { timestamp: '2026-08-28T00:00:00Z' },
    }

    vi.spyOn(reviewsApi, 'getProductReviews').mockResolvedValue(response)
    const setReplySpy = vi.spyOn(reviewsApi, 'setReplyHelpfulness').mockResolvedValue({
      helpfulCount: 1,
      unhelpfulCount: 0,
      viewerVote: 'helpful',
    })

    render(<ProductReviewsSection productId="prod-1" />)

    await waitFor(() => {
      expect(screen.getByText('Cảm ơn phản hồi')).toBeInTheDocument()
    })

    // Reply has helpfulCount 0, while review has helpfulCount 5
    const replyHelpfulBtn = screen.getByRole('button', { name: 'Hữu ích (0)' })
    fireEvent.click(replyHelpfulBtn)

    expect(setReplySpy).toHaveBeenCalledWith('reply-1', 'helpful')

    await waitFor(() => {
      // Reply updated
      expect(screen.getByRole('button', { name: 'Hữu ích (1)' })).toHaveAttribute('aria-pressed', 'true')
      // Review state untouched
      expect(screen.getByRole('button', { name: 'Hữu ích (5)' })).toHaveAttribute('aria-pressed', 'true')
    })
  })

  it('disables only the pending target undergoing mutation and prevents duplicate in-flight requests', async () => {
    const response: MockReviewsEnvelope = {
      data: {
        summary: { totalReviews: 2, averageRating: '5.0', ratingCounts: { '5': 2 } },
        reviews: [
          {
            id: 'rev-1',
            rating: 5,
            comment: 'Review 1',
            reviewer: { maskedEmail: '1***@gmail.com' },
            purchase: { model: 'M1', options: [] },
            media: [],
            createdAt: '2026-08-28T00:00:00Z',
            helpfulness: { helpfulCount: 0, unhelpfulCount: 0, viewerVote: null },
          },
          {
            id: 'rev-2',
            rating: 5,
            comment: 'Review 2',
            reviewer: { maskedEmail: '2***@gmail.com' },
            purchase: { model: 'M2', options: [] },
            media: [],
            createdAt: '2026-08-28T00:00:00Z',
            helpfulness: { helpfulCount: 1, unhelpfulCount: 0, viewerVote: null },
          },
        ],
      },
      message: 'OK',
      meta: { timestamp: '2026-08-28T00:00:00Z' },
    }

    vi.spyOn(reviewsApi, 'getProductReviews').mockResolvedValue(response)

    let resolveMutation: (val: any) => void
    const mutationPromise = new Promise((resolve) => {
      resolveMutation = resolve
    })

    const setReviewSpy = vi.spyOn(reviewsApi, 'setReviewHelpfulness').mockReturnValue(mutationPromise as any)

    render(<ProductReviewsSection productId="prod-1" />)

    await waitFor(() => {
      expect(screen.getByText('Review 1')).toBeInTheDocument()
      expect(screen.getByText('Review 2')).toBeInTheDocument()
    })

    const rev1Helpful = screen.getByRole('button', { name: 'Hữu ích (0)' })
    const rev2Helpful = screen.getByRole('button', { name: 'Hữu ích (1)' })

    // Click rev 1
    fireEvent.click(rev1Helpful)

    expect(setReviewSpy).toHaveBeenCalledTimes(1)
    expect(rev1Helpful).toBeDisabled()

    // Rev 2 remains interactive
    expect(rev2Helpful).not.toBeDisabled()

    // Click rev 1 again while in flight -> does not trigger duplicate request
    fireEvent.click(rev1Helpful)
    expect(setReviewSpy).toHaveBeenCalledTimes(1)

    // Resolve mutation
    resolveMutation!({
      helpfulCount: 1,
      unhelpfulCount: 0,
      viewerVote: 'helpful',
    })

    await waitFor(() => {
      expect(rev1Helpful).not.toBeDisabled()
    })
  })

  it('retains last confirmed server state and shows Vietnamese toast error on mutation failure', async () => {
    const response: MockReviewsEnvelope = {
      data: {
        summary: { totalReviews: 1, averageRating: '5.0', ratingCounts: { '5': 1 } },
        reviews: [
          {
            id: 'rev-fail',
            rating: 5,
            comment: 'Failure test review',
            reviewer: { maskedEmail: 'f***@gmail.com' },
            purchase: { model: 'MF', options: [] },
            media: [],
            createdAt: '2026-08-28T00:00:00Z',
            helpfulness: { helpfulCount: 3, unhelpfulCount: 1, viewerVote: null },
          },
        ],
      },
      message: 'OK',
      meta: { timestamp: '2026-08-28T00:00:00Z' },
    }

    vi.spyOn(reviewsApi, 'getProductReviews').mockResolvedValue(response)
    vi.spyOn(reviewsApi, 'setReviewHelpfulness').mockRejectedValue(
      new ApiError(500, { code: 'internal', message: 'Lỗi máy chủ nội bộ' })
    )

    render(<ProductReviewsSection productId="prod-1" />)

    await waitFor(() => {
      expect(screen.getByText('Failure test review')).toBeInTheDocument()
    })

    const helpfulBtn = screen.getByRole('button', { name: 'Hữu ích (3)' })
    fireEvent.click(helpfulBtn)

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Lỗi máy chủ nội bộ')
    })

    // Retains confirmed state
    expect(screen.getByRole('button', { name: 'Hữu ích (3)' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Không hữu ích (1)' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('redirects to login when PUT mutation fails with 401 (session expired during operation)', async () => {
    const response: MockReviewsEnvelope = {
      data: {
        summary: { totalReviews: 1, averageRating: '5.0', ratingCounts: { '5': 1 } },
        reviews: [
          {
            id: 'rev-401',
            rating: 5,
            comment: 'Expired session test review',
            reviewer: { maskedEmail: 'e***@gmail.com' },
            purchase: { model: 'ME', options: [] },
            media: [],
            createdAt: '2026-08-28T00:00:00Z',
            helpfulness: { helpfulCount: 2, unhelpfulCount: 0, viewerVote: null },
          },
        ],
      },
      message: 'OK',
      meta: { timestamp: '2026-08-28T00:00:00Z' },
    }

    vi.spyOn(reviewsApi, 'getProductReviews').mockResolvedValue(response)
    vi.spyOn(reviewsApi, 'setReviewHelpfulness').mockRejectedValue(
      new ApiError(401, { code: 'invalid_token', message: 'Phiên đăng nhập đã hết hạn' })
    )

    render(<ProductReviewsSection productId="prod-1" />)

    await waitFor(() => {
      expect(screen.getByText('Expired session test review')).toBeInTheDocument()
    })

    const helpfulBtn = screen.getByRole('button', { name: 'Hữu ích (2)' })
    fireEvent.click(helpfulBtn)

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        `/login?redirect=${encodeURIComponent('/products/prod-1?ref=deal')}`
      )
    })
  })
})


