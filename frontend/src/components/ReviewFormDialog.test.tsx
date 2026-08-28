import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ReviewFormDialog } from './ReviewFormDialog'
import * as reviewApi from '@/api/reviews'
import { ToastProvider } from '@/context/ToastContext'
import { ApiError, type OrderItem, type Review } from '@/api/types'

const mockItem: OrderItem = {
  id: 'item-1',
  variantId: 'var-1',
  productId: 'prod-1',
  brandName: 'Apple',
  productName: 'iPhone 15 Pro',
  model: 'Natural Titanium 256GB',
  imageUrl: 'https://example.com/pic.jpg',
  options: [{ groupLabel: 'Màu sắc', valueLabel: 'Titan Tự Nhiên' }],
  unitPriceVnd: '28000000',
  quantity: 1,
  lineTotalVnd: '28000000',
  reviewStatus: 'eligible',
}

describe('ReviewFormDialog', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    window.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/fake-blob')
    window.URL.revokeObjectURL = vi.fn()
  })

  it('renders create mode with product info and 5 default stars', () => {
    render(
      <ToastProvider>
        <ReviewFormDialog
          isOpen={true}
          onClose={vi.fn()}
          orderId="order-1"
          item={mockItem}
          onSuccess={vi.fn()}
        />
      </ToastProvider>
    )

    expect(screen.getByText('Đánh giá sản phẩm')).toBeInTheDocument()
    expect(screen.getByText('iPhone 15 Pro')).toBeInTheDocument()
    expect(screen.getByText('Phân loại: Natural Titanium 256GB')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '5 sao' })).toHaveAttribute('aria-checked', 'true')
  })

  it('submits new review successfully', async () => {
    const onSuccess = vi.fn()
    const onClose = vi.fn()

    const createdReview: Review = {
      id: 'rev-1',
      orderItemId: 'item-1',
      rating: 4,
      comment: 'Sản phẩm dùng tốt',
      editCount: 0,
      media: [],
      createdAt: '2026-08-28T00:00:00Z',
      updatedAt: '2026-08-28T00:00:00Z',
      edited: false,
      canEdit: true,
    }

    const createSpy = vi
      .spyOn(reviewApi, 'createOrderItemReview')
      .mockResolvedValue(createdReview)

    render(
      <ToastProvider>
        <ReviewFormDialog
          isOpen={true}
          onClose={onClose}
          orderId="order-1"
          item={mockItem}
          onSuccess={onSuccess}
        />
      </ToastProvider>
    )

    // Select 4 stars
    const fourStarBtn = screen.getByRole('radio', { name: '4 sao' })
    fireEvent.click(fourStarBtn)
    expect(fourStarBtn).toHaveAttribute('aria-checked', 'true')

    // Type comment
    const textarea = screen.getByPlaceholderText(/Hãy chia sẻ trải nghiệm sử dụng/i)
    fireEvent.change(textarea, { target: { value: 'Sản phẩm dùng tốt' } })

    // Submit
    const submitBtn = screen.getByRole('button', { name: 'Gửi đánh giá' })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith('order-1', 'item-1', {
        rating: 4,
        comment: 'Sản phẩm dùng tốt',
        images: [],
        video: undefined,
      })
      expect(onSuccess).toHaveBeenCalledWith(createdReview)
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('renders edit mode with existing review data and one-time notice', async () => {
    const existingReview: Review = {
      id: 'rev-1',
      orderItemId: 'item-1',
      rating: 3,
      comment: 'Bình thường',
      editCount: 0,
      media: [
        {
          id: 'med-1',
          type: 'image',
          url: 'https://example.com/img1.jpg',
          mimeType: 'image/jpeg',
          position: 0,
        },
      ],
      createdAt: '2026-08-28T00:00:00Z',
      updatedAt: '2026-08-28T00:00:00Z',
      edited: false,
      canEdit: true,
    }

    const updatedReview: Review = {
      ...existingReview,
      rating: 5,
      comment: 'Cực kỳ ưng ý sau khi dùng thử thêm',
      editCount: 1,
      edited: true,
      canEdit: false,
    }

    const updateSpy = vi
      .spyOn(reviewApi, 'updateOrderItemReview')
      .mockResolvedValue(updatedReview)

    render(
      <ToastProvider>
        <ReviewFormDialog
          isOpen={true}
          onClose={vi.fn()}
          orderId="order-1"
          item={mockItem}
          existingReview={existingReview}
          onSuccess={vi.fn()}
        />
      </ToastProvider>
    )

    expect(screen.getByText('Chỉnh sửa đánh giá sản phẩm')).toBeInTheDocument()
    expect(screen.getByText(/Đánh giá chỉ được chỉnh sửa một lần duy nhất/i)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '3 sao' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByDisplayValue('Bình thường')).toBeInTheDocument()

    // Change rating to 5
    fireEvent.click(screen.getByRole('radio', { name: '5 sao' }))

    // Change comment
    const textarea = screen.getByPlaceholderText(/Hãy chia sẻ trải nghiệm sử dụng/i)
    fireEvent.change(textarea, { target: { value: 'Cực kỳ ưng ý sau khi dùng thử thêm' } })

    // Submit edit
    const submitBtn = screen.getByRole('button', { name: 'Hoàn tất chỉnh sửa' })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith('order-1', 'item-1', {
        rating: 5,
        comment: 'Cực kỳ ưng ý sau khi dùng thử thêm',
        retainedMediaIds: ['med-1'],
        images: [],
        video: undefined,
      })
    })
  })

  it('displays validation error when comment exceeds 1000 characters', async () => {
    render(
      <ToastProvider>
        <ReviewFormDialog
          isOpen={true}
          onClose={vi.fn()}
          orderId="order-1"
          item={mockItem}
          onSuccess={vi.fn()}
        />
      </ToastProvider>
    )

    const textarea = screen.getByPlaceholderText(/Hãy chia sẻ trải nghiệm sử dụng/i)
    const longComment = 'a'.repeat(1005)
    fireEvent.change(textarea, { target: { value: longComment } })

    const submitBtn = screen.getByRole('button', { name: 'Gửi đánh giá' })
    fireEvent.click(submitBtn)

    expect(screen.getByText(/Nhận xét tối đa 1000 ký tự/i)).toBeInTheDocument()
  })

  it('handles ApiError field errors and general errors from server', async () => {
    vi.spyOn(reviewApi, 'createOrderItemReview').mockRejectedValue(
      new ApiError(400, {
        code: 'validation_error',
        message: 'Lỗi xác thực',
        fields: { comment: 'Nội dung nhận xét không hợp lệ' },
      })
    )

    render(
      <ToastProvider>
        <ReviewFormDialog
          isOpen={true}
          onClose={vi.fn()}
          orderId="order-1"
          item={mockItem}
          onSuccess={vi.fn()}
        />
      </ToastProvider>
    )

    const submitBtn = screen.getByRole('button', { name: 'Gửi đánh giá' })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(screen.getByText('Nội dung nhận xét không hợp lệ')).toBeInTheDocument()
    })
  })
})
