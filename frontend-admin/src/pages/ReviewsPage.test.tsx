import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/types'
import * as reviewsApi from '@/api/reviews'
import type { AdminReviewItem } from '@/api/reviews'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { ReviewsPage } from './ReviewsPage'

vi.mock('@/api/reviews', () => ({
  getAdminReviews: vi.fn(),
  createStoreResponse: vi.fn(),
  updateStoreResponse: vi.fn(),
}))

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'admin@auraphone.vn' }, logout: vi.fn() }),
}))

const unresponded: AdminReviewItem = {
  review: {
    id: 'review-1',
    productId: 'product-1',
    variantId: 'variant-1',
    purchasedOptions: [{ groupLabel: 'Màu', valueLabel: 'Đen' }],
    rating: 5,
    comment: '<b>Sản phẩm tốt</b>',
    media: [],
    verifiedPurchase: true,
    authorLabel: 'Khách hàng đã mua hàng',
    createdAt: '2026-08-20T08:00:00Z',
    updatedAt: '2026-08-21T08:00:00Z',
    viewer: null,
    response: null,
  },
  product: { id: 'product-1', name: 'Aura X', publicPath: '/products/product-1' },
  responseVersion: null,
}

const responded: AdminReviewItem = {
  ...unresponded,
  review: {
    ...unresponded.review,
    id: 'review-2',
    response: {
      content: 'Cảm ơn bạn đã đánh giá',
      authorLabel: 'Phản hồi từ cửa hàng',
      createdAt: '2026-08-22T08:00:00Z',
      updatedAt: '2026-08-22T08:00:00Z',
    },
  },
  responseVersion: 2,
}

function list(items: AdminReviewItem[], page = 1, totalPages = 1) {
  return {
    data: items,
    meta: {
      timestamp: '2026-08-28T10:00:00Z',
      pagination: { page, limit: 10, total: items.length, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
    },
    message: '',
  }
}

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}{location.search}</output>
}

function renderPage(initialEntry = '/reviews') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <ReviewsPage />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ReviewsPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders loading, empty, error retry and paginated collection states', async () => {
    let resolveList!: (value: ReturnType<typeof list>) => void
    vi.mocked(reviewsApi.getAdminReviews)
      .mockReturnValueOnce(new Promise((resolve) => { resolveList = resolve }))

    renderPage('/reviews?page=2')
    expect(screen.getByText('Đang tải danh sách đánh giá...')).toBeInTheDocument()
    resolveList(list([unresponded], 2, 3))

    expect(await screen.findByText('Aura X')).toBeInTheDocument()
    expect(screen.getByText('<b>Sản phẩm tốt</b>')).toBeInTheDocument()
    expect(screen.queryByText('Sản phẩm tốt', { selector: 'b' })).not.toBeInTheDocument()
    expect(screen.getByText('Trang 2 / 3')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Sau' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/reviews?page=3')
  })

  it('renders empty and recoverable collection error states', async () => {
    vi.mocked(reviewsApi.getAdminReviews)
      .mockRejectedValueOnce(new Error('Mất kết nối'))
      .mockResolvedValueOnce(list([]))

    renderPage()
    expect(await screen.findByText('Không thể tải danh sách đánh giá')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(await screen.findByText('Chưa có đánh giá nào')).toBeInTheDocument()
  })

  it('creates a trimmed response and updates an existing response with responseVersion', async () => {
    vi.mocked(reviewsApi.getAdminReviews).mockResolvedValue(list([unresponded, responded]))
    vi.mocked(reviewsApi.createStoreResponse).mockResolvedValue({
      content: 'Đã ghi nhận', authorLabel: 'Phản hồi từ cửa hàng', version: 1,
      createdAt: '2026-08-28T10:00:00Z', updatedAt: '2026-08-28T10:00:00Z',
    })
    vi.mocked(reviewsApi.updateStoreResponse).mockResolvedValue({
      content: 'Nội dung mới', authorLabel: 'Phản hồi từ cửa hàng', version: 3,
      createdAt: '2026-08-22T08:00:00Z', updatedAt: '2026-08-28T10:00:00Z',
    })
    const user = userEvent.setup()
    renderPage()

    const createInput = await screen.findByLabelText('Nội dung phản hồi cho Aura X', { selector: '#response-review-1' })
    await user.type(createInput, '  Đã ghi nhận  ')
    await user.click(screen.getByRole('button', { name: 'Gửi phản hồi' }))
    await waitFor(() => expect(reviewsApi.createStoreResponse).toHaveBeenCalledWith('review-1', { content: 'Đã ghi nhận' }))

    const editInput = screen.getByLabelText('Nội dung phản hồi cho Aura X', { selector: '#response-review-2' })
    await user.clear(editInput)
    await user.type(editInput, 'Nội dung mới')
    await user.click(within(editInput.closest('section')!).getByRole('button', { name: 'Lưu thay đổi' }))
    await waitFor(() => expect(reviewsApi.updateStoreResponse).toHaveBeenCalledWith('review-2', { content: 'Nội dung mới', version: 2 }))
  })

  it('shows exact client/server validation and retains the draft', async () => {
    vi.mocked(reviewsApi.getAdminReviews).mockResolvedValue(list([unresponded]))
    vi.mocked(reviewsApi.createStoreResponse).mockRejectedValueOnce(
      new ApiError(400, { code: 'validation_error', message: 'Dữ liệu không hợp lệ', fields: { content: 'Nội dung phản hồi không hợp lệ' } }),
    )
    const user = userEvent.setup()
    renderPage()
    const input = await screen.findByLabelText('Nội dung phản hồi cho Aura X')

    await user.type(input, '   ')
    await user.click(screen.getByRole('button', { name: 'Gửi phản hồi' }))
    expect(screen.getByText('Nội dung phản hồi không được để trống')).toBeInTheDocument()
    expect(reviewsApi.createStoreResponse).not.toHaveBeenCalled()

    await user.clear(input)
    await user.type(input, 'Bản nháp cần giữ')
    await user.click(screen.getByRole('button', { name: 'Gửi phản hồi' }))
    expect(await screen.findByText('Nội dung phản hồi không hợp lệ')).toBeInTheDocument()
    expect(input).toHaveValue('Bản nháp cần giữ')
  })

  it('retains draft on system error and allows retry', async () => {
    vi.mocked(reviewsApi.getAdminReviews).mockResolvedValue(list([unresponded]))
    vi.mocked(reviewsApi.createStoreResponse)
      .mockRejectedValueOnce(new ApiError(500, { code: 'internal', message: 'Lỗi hệ thống' }))
      .mockResolvedValueOnce({ content: 'Thử lại', authorLabel: 'Phản hồi từ cửa hàng', version: 1, createdAt: '', updatedAt: '' })
    const user = userEvent.setup()
    renderPage()
    const input = await screen.findByLabelText('Nội dung phản hồi cho Aura X')
    await user.type(input, 'Thử lại')
    await user.click(screen.getByRole('button', { name: 'Gửi phản hồi' }))

    expect(await screen.findByText('Không thể lưu phản hồi. Vui lòng thử lại.')).toBeInTheDocument()
    expect(input).toHaveValue('Thử lại')
    await user.click(screen.getByRole('button', { name: 'Gửi phản hồi' }))
    await waitFor(() => expect(reviewsApi.createStoreResponse).toHaveBeenCalledTimes(2))
  })

  it('reloads authoritative state after conflict, retains draft and retries with the new version', async () => {
    vi.mocked(reviewsApi.getAdminReviews)
      .mockResolvedValueOnce(list([responded]))
      .mockResolvedValueOnce(list([{ ...responded, review: { ...responded.review, response: { ...responded.review.response!, content: 'Admin khác đã sửa' } }, responseVersion: 3 }]))
    vi.mocked(reviewsApi.updateStoreResponse)
      .mockRejectedValueOnce(new ApiError(409, { code: 'review_response_conflict', message: 'Phản hồi đã thay đổi, vui lòng tải lại và thử lại' }))
      .mockResolvedValueOnce({ content: 'Bản nháp của tôi', authorLabel: 'Phản hồi từ cửa hàng', version: 4, createdAt: '', updatedAt: '' })
    const user = userEvent.setup()
    renderPage()
    const input = await screen.findByLabelText('Nội dung phản hồi cho Aura X')
    await user.clear(input)
    await user.type(input, 'Bản nháp của tôi')
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))

    expect(await screen.findByText('Phản hồi đã thay đổi, vui lòng tải lại và thử lại')).toBeInTheDocument()
    expect(input).toHaveValue('Bản nháp của tôi')
    expect(screen.getByRole('button', { name: 'Lưu thay đổi' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Tải trạng thái mới' }))
    await waitFor(() => expect(reviewsApi.getAdminReviews).toHaveBeenCalledTimes(2))
    expect(input).toHaveValue('Bản nháp của tôi')
    expect(screen.getByText('Admin khác đã sửa')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))
    await waitFor(() => expect(reviewsApi.updateStoreResponse).toHaveBeenLastCalledWith('review-2', { content: 'Bản nháp của tôi', version: 3 }))
  })

  it('keeps stale saves blocked when conflict reload fails', async () => {
    vi.mocked(reviewsApi.getAdminReviews)
      .mockResolvedValueOnce(list([responded]))
      .mockRejectedValueOnce(new Error('Mất kết nối'))
    vi.mocked(reviewsApi.updateStoreResponse).mockRejectedValueOnce(
      new ApiError(409, { code: 'review_response_conflict', message: 'Phản hồi đã thay đổi, vui lòng tải lại và thử lại' }),
    )
    const user = userEvent.setup()
    renderPage()
    const input = await screen.findByLabelText('Nội dung phản hồi cho Aura X')
    await user.clear(input)
    await user.type(input, 'Bản nháp chưa đồng bộ')
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))
    await user.click(await screen.findByRole('button', { name: 'Tải trạng thái mới' }))

    expect(await screen.findByText('Không thể tải trạng thái mới. Vui lòng thử lại.')).toBeInTheDocument()
    expect(input).toHaveValue('Bản nháp chưa đồng bộ')
    expect(screen.getByRole('button', { name: 'Lưu thay đổi' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Tải trạng thái mới' })).toBeEnabled()
  })
})

describe('reviews route and navigation', () => {
  it('exposes the reviews link and route inside the protected admin layout', async () => {
    vi.mocked(reviewsApi.getAdminReviews).mockResolvedValue(list([]))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<AdminLayout />}>
              <Route index element={<div>Trang chủ</div>} />
              <Route path="reviews" element={<ReviewsPage />} />
            </Route>
          </Routes>
          <LocationProbe />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('link', { name: 'Đánh giá' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/reviews')
    expect(await screen.findByRole('heading', { name: 'Đánh giá khách hàng' })).toBeInTheDocument()
  })
})
