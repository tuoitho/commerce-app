import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ReviewHistoryPage } from './ReviewHistoryPage'
import { useAuth } from '@/context/AuthContext'
import { ToastProvider } from '@/context/ToastContext'
import * as reviewsApi from '@/api/reviews'
import type { UserReview } from '@/api/types'

vi.mock('@/context/AuthContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/api/reviews', () => ({
  getUserReviews: vi.fn(),
  updateOrderItemReview: vi.fn(),
}))

const mockReviews: UserReview[] = [
  {
    id: 'rev-001',
    orderItemId: 'item-001',
    order: {
      id: 'ord-101',
      createdAt: '2026-08-20T10:00:00Z',
    },
    product: {
      id: 'prod-iphone',
      name: 'iPhone 15 Pro Max',
      brandName: 'Apple',
      model: 'Titan Tự Nhiên 256GB',
      imageUrl: 'https://example.com/iphone.png',
      options: [
        { groupLabel: 'Màu sắc', valueLabel: 'Titan Tự Nhiên' },
        { groupLabel: 'Dung lượng', valueLabel: '256GB' },
      ],
    },
    rating: 5,
    comment: 'Máy dùng rất mượt, pin trâu và camera chụp đêm đẹp.',
    editCount: 0,
    canEdit: true,
    edited: false,
    media: [
      {
        id: 'med-img-1',
        reviewId: 'rev-001',
        type: 'image',
        url: '/media/reviews/med-img-1',
        mimeType: 'image/jpeg',
        position: 0,
      },
      {
        id: 'med-vid-1',
        reviewId: 'rev-001',
        type: 'video',
        url: '/media/reviews/med-vid-1',
        mimeType: 'video/mp4',
        position: 1,
      },
    ],
    createdAt: '2026-08-22T14:30:00Z',
    updatedAt: '2026-08-22T14:30:00Z',
  },
  {
    id: 'rev-002',
    orderItemId: 'item-002',
    order: {
      id: 'ord-102',
      createdAt: '2026-08-15T09:00:00Z',
    },
    product: {
      id: 'prod-s24',
      name: 'Samsung Galaxy S24 Ultra',
      brandName: 'Samsung',
      model: 'Xám Titan 512GB',
      imageUrl: 'https://example.com/s24.png',
      options: [{ groupLabel: 'Màu sắc', valueLabel: 'Xám Titan' }],
    },
    rating: 4,
    comment: 'Sản phẩm tốt, giao hàng hơi chậm một chút.',
    editCount: 1,
    canEdit: false,
    edited: true,
    media: [],
    createdAt: '2026-08-18T11:00:00Z',
    updatedAt: '2026-08-19T08:00:00Z',
  },
]

describe('ReviewHistoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      user: { id: 'user-1', email: 'test@example.com', role: 'customer' },
      isAuthenticated: true,
      isLoading: false,
    })
  })

  it('redirects unauthenticated users to /login?redirect=/reviews', async () => {
    ;(useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    })

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/reviews']}>
          <Routes>
            <Route path="/reviews" element={<ReviewHistoryPage />} />
            <Route path="/login" element={<div>Trang Đăng Nhập</div>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Trang Đăng Nhập')).toBeInTheDocument()
    })
  })

  it('renders review list with product info, order info, rating, and media', async () => {
    vi.spyOn(reviewsApi, 'getUserReviews').mockResolvedValue({
      data: { reviews: mockReviews },
      message: 'Lấy lịch sử đánh giá thành công',
      meta: {
        timestamp: '2026-08-28T00:00:00Z',
        pagination: {
          page: 1,
          limit: 10,
          total: 2,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      },
    })

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/reviews']}>
          <ReviewHistoryPage />
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('iPhone 15 Pro Max')).toBeInTheDocument()
      expect(screen.getByText('Samsung Galaxy S24 Ultra')).toBeInTheDocument()
    })

    // Check order IDs
    expect(screen.getByText('Mã đơn: ord-101')).toBeInTheDocument()
    expect(screen.getByText('Mã đơn: ord-102')).toBeInTheDocument()

    // Check comments & ratings
    expect(screen.getByText(/Máy dùng rất mượt/)).toBeInTheDocument()
    expect(screen.getByText(/Sản phẩm tốt/)).toBeInTheDocument()
    expect(screen.getByText('5/5 sao')).toBeInTheDocument()
    expect(screen.getByText('4/5 sao')).toBeInTheDocument()

    // Check edited badge
    expect(screen.getByText('Đã chỉnh sửa')).toBeInTheDocument()

    // Check action buttons: canEdit item has button, edited item doesn't
    expect(screen.getByRole('button', { name: /Sửa đánh giá/i })).toBeInTheDocument()
  })

  it('filters reviews by star rating when clicking filter tab', async () => {
    const spy = vi.spyOn(reviewsApi, 'getUserReviews').mockResolvedValue({
      data: { reviews: [mockReviews[0]] },
      message: 'Lấy lịch sử đánh giá thành công',
      meta: {
        timestamp: '2026-08-28T00:00:00Z',
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      },
    })

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/reviews']}>
          <ReviewHistoryPage />
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('iPhone 15 Pro Max')).toBeInTheDocument()
    })

    // Click 5 sao tab
    const star5Tab = screen.getByRole('tab', { name: /5 sao/i })
    fireEvent.click(star5Tab)

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          rating: 5,
        })
      )
    })
  })

  it('opens lightbox when clicking an image thumbnail', async () => {
    vi.spyOn(reviewsApi, 'getUserReviews').mockResolvedValue({
      data: { reviews: [mockReviews[0]] },
      message: 'Lấy lịch sử đánh giá thành công',
      meta: {
        timestamp: '2026-08-28T00:00:00Z',
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      },
    })

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/reviews']}>
          <ReviewHistoryPage />
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByTitle('Nhấn để xem ảnh kích thước lớn')).toBeInTheDocument()
    })

    const thumbnailBtn = screen.getByTitle('Nhấn để xem ảnh kích thước lớn')
    fireEvent.click(thumbnailBtn)

    await waitFor(() => {
      expect(screen.getByAltText('Ảnh đánh giá kích thước lớn')).toBeInTheDocument()
    })
  })

  it('renders empty state when there are no reviews', async () => {
    vi.spyOn(reviewsApi, 'getUserReviews').mockResolvedValue({
      data: { reviews: [] },
      message: 'Lấy lịch sử đánh giá thành công',
      meta: {
        timestamp: '2026-08-28T00:00:00Z',
        pagination: {
          page: 1,
          limit: 10,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        },
      },
    })

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/reviews']}>
          <ReviewHistoryPage />
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Chưa có đánh giá nào')).toBeInTheDocument()
    })
  })

  it('renders error state and retries on failure', async () => {
    const spy = vi.spyOn(reviewsApi, 'getUserReviews')
    spy.mockReset()
    spy.mockRejectedValueOnce(new Error('Network error')).mockResolvedValueOnce({
      data: { reviews: mockReviews },
      message: 'Lấy lịch sử đánh giá thành công',
      meta: {
        timestamp: '2026-08-28T00:00:00Z',
        pagination: {
          page: 1,
          limit: 10,
          total: 2,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      },
    })

    render(
      <ToastProvider>
        <MemoryRouter initialEntries={['/reviews']}>
          <ReviewHistoryPage />
        </MemoryRouter>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Lỗi tải dữ liệu')).toBeInTheDocument()
    })

    const retryBtn = screen.getByRole('button', { name: /Thử lại/i })
    fireEvent.click(retryBtn)

    await waitFor(() => {
      expect(screen.getByText('iPhone 15 Pro Max')).toBeInTheDocument()
    })
  })
})
