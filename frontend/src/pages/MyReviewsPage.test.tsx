import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { MyReviewsPage } from './MyReviewsPage'
import * as reviewsApi from '@/api/reviews'
import * as authContext from '@/context/AuthContext'
import * as toastContext from '@/context/ToastContext'
import type { OwnedReviewHistoryItem } from '@/api/types'

vi.mock('@/api/reviews', () => ({
  listOwnedReviews: vi.fn(),
  editOwnedReview: vi.fn(),
}))

const mockSuccess = vi.fn()
const mockError = vi.fn()
const mockToast = vi.fn()

describe('MyReviewsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(toastContext, 'useToast').mockReturnValue({
      toast: mockToast,
      success: mockSuccess,
      error: mockError,
      info: vi.fn(),
    })
  })

  it('redirects unauthenticated users to login with redirect parameter (AC-REVIEW-09-06)', async () => {
    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })

    render(
      <MemoryRouter initialEntries={['/reviews']}>
        <Routes>
          <Route path="/reviews" element={<MyReviewsPage />} />
          <Route path="/login" element={<div>Trang Đăng Nhập</div>} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Trang Đăng Nhập')).toBeInTheDocument()
    })
  })

  it('renders empty state with link to order history when customer has no reviews (AC-REVIEW-09-04)', async () => {
    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      user: { id: 'u1', email: 'user@example.com', role: 'customer' },
      accessToken: 'test-token',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })

    vi.mocked(reviewsApi.listOwnedReviews).mockResolvedValueOnce({
      message: 'Danh sách đánh giá của tôi',
      data: [],
      meta: {
        timestamp: '2026-08-28T00:00:00Z',
        pagination: { page: 1, limit: 10, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
      },
    })

    render(
      <MemoryRouter initialEntries={['/reviews']}>
        <MyReviewsPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Chưa có đánh giá nào')).toBeInTheDocument()
      expect(screen.getByText('Xem lịch sử đơn hàng')).toBeInTheDocument()
    })
  })

  it('renders reviews list with product names, options, star ratings and edit buttons (AC-REVIEW-09-01, AC-REVIEW-09-02)', async () => {
    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      user: { id: 'u1', email: 'user@example.com', role: 'customer' },
      accessToken: 'test-token',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })

    const mockItems: OwnedReviewHistoryItem[] = [
      {
        review: {
          id: 'rev-1',
          productId: 'prod-1',
          variantId: 'var-1',
          rating: 5,
          comment: 'Điện thoại rất mượt mà',
          purchasedOptions: [{ groupLabel: 'Màu sắc', valueLabel: 'Titan Tự Nhiên' }],
          media: [],
          verifiedPurchase: true,
          authorLabel: 'Khách hàng đã mua hàng',
          createdAt: '2026-08-28T10:00:00Z',
          updatedAt: '2026-08-28T10:00:00Z',
          response: null,
          viewer: { isOwner: true, canEdit: true, remainingEdits: 1 },
        },
        product: {
          id: 'prod-1',
          name: 'iPhone 16 Pro Max',
          publicPath: '/products/prod-1',
        },
      },
      {
        review: {
          id: 'rev-2',
          productId: 'prod-2',
          variantId: 'var-2',
          rating: 4,
          comment: 'Dùng ổn định',
          purchasedOptions: [],
          media: [],
          verifiedPurchase: true,
          authorLabel: 'Khách hàng đã mua hàng',
          createdAt: '2026-08-28T09:00:00Z',
          updatedAt: '2026-08-28T09:30:00Z',
          response: null,
          viewer: { isOwner: true, canEdit: false, remainingEdits: 0 },
        },
        product: {
          id: 'prod-2',
          name: 'iPhone 11 Cũ',
          publicPath: null,
        },
      },
    ]

    vi.mocked(reviewsApi.listOwnedReviews).mockResolvedValueOnce({
      message: 'Danh sách đánh giá của tôi',
      data: mockItems,
      meta: {
        timestamp: '2026-08-28T00:00:00Z',
        pagination: { page: 1, limit: 10, total: 2, totalPages: 1, hasNext: false, hasPrev: false },
      },
    })

    render(
      <MemoryRouter initialEntries={['/reviews']}>
        <MyReviewsPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('iPhone 16 Pro Max')).toBeInTheDocument()
      expect(screen.getByText('iPhone 11 Cũ')).toBeInTheDocument()
    })

    // Active product has link
    const link = screen.getByRole('link', { name: /iPhone 16 Pro Max/i })
    expect(link).toHaveAttribute('href', '/products/prod-1')

    // Inactive product has "Ngừng kinh doanh" and no link
    expect(screen.getByText('Ngừng kinh doanh')).toBeInTheDocument()

    // Options snapshot
    expect(screen.getByText(/Titan Tự Nhiên/i)).toBeInTheDocument()

    // Editable review has "Chỉnh sửa" button
    expect(screen.getByRole('button', { name: /Chỉnh sửa/i })).toBeInTheDocument()

    // Read-only review has "Đã chỉnh sửa (Chỉ đọc)"
    expect(screen.getByText('Đã chỉnh sửa (Chỉ đọc)')).toBeInTheDocument()
  })

  it('renders error state and allows retry (AC-REVIEW-09-07)', async () => {
    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      user: { id: 'u1', email: 'user@example.com', role: 'customer' },
      accessToken: 'test-token',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })

    vi.mocked(reviewsApi.listOwnedReviews).mockRejectedValueOnce(new Error('Network error'))

    render(
      <MemoryRouter initialEntries={['/reviews']}>
        <MyReviewsPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Không thể tải dữ liệu')).toBeInTheDocument()
    })

    // Click retry
    vi.mocked(reviewsApi.listOwnedReviews).mockResolvedValueOnce({
      message: 'Danh sách đánh giá của tôi',
      data: [],
      meta: {
        timestamp: '2026-08-28T00:00:00Z',
        pagination: { page: 1, limit: 10, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
      },
    })

    fireEvent.click(screen.getByRole('button', { name: /Thử lại/i }))

    await waitFor(() => {
      expect(screen.getByText('Chưa có đánh giá nào')).toBeInTheDocument()
    })
  })

  it('retains and safely renders a response for the current review without linking a hidden product', async () => {
    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      user: { id: 'u1', email: 'user@example.com', role: 'customer' },
      accessToken: 'test-token',
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    })

    const literalContent = '<script>window.__responseXss=true</script> Nội dung sau chỉnh sửa'
    vi.mocked(reviewsApi.listOwnedReviews).mockResolvedValueOnce({
      message: 'Danh sách đánh giá của tôi',
      data: [{
        review: {
          id: 'rev-responded',
          productId: 'prod-hidden',
          variantId: 'var-1',
          rating: 5,
          comment: 'Nội dung đánh giá hiện tại',
          purchasedOptions: [],
          media: [],
          verifiedPurchase: true,
          authorLabel: 'Khách hàng đã mua hàng',
          createdAt: '2026-08-28T10:00:00Z',
          updatedAt: '2026-08-28T11:00:00Z',
          viewer: { isOwner: true, canEdit: false, remainingEdits: 0 },
          response: {
            content: literalContent,
            authorLabel: 'Phản hồi từ cửa hàng',
            createdAt: '2026-08-28T10:30:00Z',
            updatedAt: '2026-08-28T10:45:00Z',
          },
        },
        product: { id: 'prod-hidden', name: 'Sản phẩm đã ẩn', publicPath: null },
      }],
      meta: {
        timestamp: '2026-08-28T12:00:00Z',
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
      },
    })

    const { container } = render(
      <MemoryRouter initialEntries={['/reviews']}>
        <MyReviewsPage />
      </MemoryRouter>
    )

    expect(await screen.findByText('Phản hồi từ cửa hàng')).toBeInTheDocument()
    expect(screen.getByText(literalContent)).toBeInTheDocument()
    expect(screen.getByText('Nội dung đánh giá hiện tại')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Sản phẩm đã ẩn/i })).not.toBeInTheDocument()
    expect(container.querySelector('script')).not.toBeInTheDocument()
    expect(screen.queryByText(/version|admin/i)).not.toBeInTheDocument()
  })
})
