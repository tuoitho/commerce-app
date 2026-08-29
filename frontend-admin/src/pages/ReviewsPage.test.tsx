import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ReviewsPage } from './ReviewsPage'
import * as reviewsApi from '../api/reviews'
import type { AdminReview } from '../api/reviews'

vi.mock('../api/reviews', () => ({
  getAdminReviews: vi.fn(),
  updateAdminReply: vi.fn(),
  deleteAdminReply: vi.fn(),
}))

const mockReviewsList: AdminReview[] = [
  {
    id: 'rev-1',
    orderItemId: 'item-1',
    rating: 5,
    comment: 'Sản phẩm rất tốt',
    editCount: 0,
    media: [],
    createdAt: '2026-08-28T00:00:00Z',
    updatedAt: '2026-08-28T00:00:00Z',
    reviewerEmail: 'customer1@gmail.com',
    adminReply: 'Cảm ơn bạn đã ủng hộ!',
    adminRepliedAt: '2026-08-28T01:00:00Z',
    product: {
      id: 'prod-1',
      name: 'iPhone 15 Pro Max',
      brandName: 'Apple',
      model: 'A3106',
      imageUrl: 'https://example.com/iphone.jpg',
      options: [],
    },
  },
  {
    id: 'rev-2',
    orderItemId: 'item-2',
    rating: 3,
    comment: 'Pin hơi nhanh hết',
    editCount: 0,
    media: [],
    createdAt: '2026-08-27T00:00:00Z',
    updatedAt: '2026-08-27T00:00:00Z',
    reviewerEmail: 'customer2@gmail.com',
    product: {
      id: 'prod-2',
      name: 'Samsung Galaxy S24',
      brandName: 'Samsung',
      model: 'SM-S921B',
      imageUrl: 'https://example.com/s24.jpg',
      options: [],
    },
  },
]

describe('ReviewsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    window.alert = vi.fn()
  })

  it('renders reviews table with filters, status badges, and details', async () => {
    vi.spyOn(reviewsApi, 'getAdminReviews').mockResolvedValue({
      data: mockReviewsList,
      meta: {
        timestamp: '2026-08-28T00:00:00Z',
        pagination: { page: 1, limit: 10, total: 2, totalPages: 1, hasNext: false, hasPrev: false },
      },
      message: 'OK',
    })

    render(<ReviewsPage />)

    await waitFor(() => {
      expect(screen.getByText('iPhone 15 Pro Max')).toBeInTheDocument()
      expect(screen.getByText('Samsung Galaxy S24')).toBeInTheDocument()
      expect(screen.getByText('customer1@gmail.com')).toBeInTheDocument()
      expect(screen.getByText('customer2@gmail.com')).toBeInTheDocument()
      expect(screen.getByText('Sản phẩm rất tốt')).toBeInTheDocument()
      expect(screen.getByText('Pin hơi nhanh hết')).toBeInTheDocument()
      expect(screen.getAllByText('Đã phản hồi').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Chưa phản hồi').length).toBeGreaterThan(0)
    })
  })

  it('filters reviews by rating and reply status', async () => {
    const apiSpy = vi.spyOn(reviewsApi, 'getAdminReviews').mockResolvedValue({
      data: mockReviewsList,
      meta: {
        timestamp: '2026-08-28T00:00:00Z',
        pagination: { page: 1, limit: 10, total: 2, totalPages: 1, hasNext: false, hasPrev: false },
      },
      message: 'OK',
    })

    render(<ReviewsPage />)

    await waitFor(() => {
      expect(screen.getByText('iPhone 15 Pro Max')).toBeInTheDocument()
    })

    // Change rating filter
    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[0], { target: { value: '5' } })

    await waitFor(() => {
      expect(apiSpy).toHaveBeenCalledWith(expect.objectContaining({ rating: 5, page: 1 }))
    })

    // Change has_reply filter
    fireEvent.change(selects[1], { target: { value: 'yes' } })

    await waitFor(() => {
      expect(apiSpy).toHaveBeenCalledWith(expect.objectContaining({ rating: 5, has_reply: 'yes', page: 1 }))
    })
  })

  it('opens reply dialog, submits a reply, and refreshes list', async () => {
    vi.spyOn(reviewsApi, 'getAdminReviews').mockResolvedValue({
      data: [mockReviewsList[1]], // Unreplied review
      meta: {
        timestamp: '2026-08-28T00:00:00Z',
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
      },
      message: 'OK',
    })
    const updateSpy = vi.spyOn(reviewsApi, 'updateAdminReply').mockResolvedValue({
      data: { ...mockReviewsList[1], adminReply: 'Shop xin lỗi vì trải nghiệm chưa tốt ạ' },
      meta: { timestamp: '2026-08-28T00:00:00Z' },
      message: 'OK',
    })

    render(<ReviewsPage />)

    await waitFor(() => {
      expect(screen.getByText('Phản hồi')).toBeInTheDocument()
    })

    // Click "Phản hồi" button
    fireEvent.click(screen.getByText('Phản hồi'))

    // Dialog opens
    expect(screen.getByText('Viết phản hồi')).toBeInTheDocument()
    const textarea = screen.getByPlaceholderText('Nhập câu trả lời của cửa hàng...')
    fireEvent.change(textarea, { target: { value: 'Shop xin lỗi vì trải nghiệm chưa tốt ạ' } })

    // Click Save
    fireEvent.click(screen.getByRole('button', { name: 'Lưu phản hồi' }))

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith('rev-2', 'Shop xin lỗi vì trải nghiệm chưa tốt ạ')
      expect(window.alert).toHaveBeenCalledWith('Cập nhật phản hồi thành công')
    })
  })

  it('opens delete dialog and deletes reply', async () => {
    vi.spyOn(reviewsApi, 'getAdminReviews').mockResolvedValue({
      data: [mockReviewsList[0]], // Replied review
      meta: {
        timestamp: '2026-08-28T00:00:00Z',
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
      },
      message: 'OK',
    })
    const deleteSpy = vi.spyOn(reviewsApi, 'deleteAdminReply').mockResolvedValue({
      data: { ...mockReviewsList[0], adminReply: undefined },
      meta: { timestamp: '2026-08-28T00:00:00Z' },
      message: 'OK',
    })

    render(<ReviewsPage />)

    await waitFor(() => {
      expect(screen.getByText('Sửa')).toBeInTheDocument()
    })

    // Click Delete icon button (destructive)
    const deleteBtns = screen.getAllByRole('button').filter(b => b.className.includes('destructive') || b.querySelector('svg.lucide-trash-2'))
    expect(deleteBtns.length).toBeGreaterThan(0)
    fireEvent.click(deleteBtns[0])

    // Delete dialog opens
    expect(screen.getByRole('heading', { name: 'Xóa phản hồi' })).toBeInTheDocument()
    expect(screen.getByText('Bạn có chắc chắn muốn xóa phản hồi này? Đánh giá sẽ trở về trạng thái chưa phản hồi.')).toBeInTheDocument()

    // Confirm delete
    const confirmBtn = screen.getByRole('button', { name: 'Xóa phản hồi' })
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith('rev-1')
      expect(window.alert).toHaveBeenCalledWith('Xóa phản hồi thành công')
    })
  })
})
