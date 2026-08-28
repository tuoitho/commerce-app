import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ReviewFormModal } from './ReviewFormModal'
import * as reviewsApi from '@/api/reviews'
import type { Review } from '@/api/types'

describe('ReviewFormModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  const mockItem = {
    id: 'item-1',
    variantId: 'var-1',
    productId: 'prod-1',
    brandName: 'Brand X',
    productName: 'Điện thoại cao cấp',
    model: 'Pro 2026',
    imageUrl: '/img.jpg',
    options: [{ groupLabel: 'Màu', valueLabel: 'Xanh' }],
    unitPriceVnd: '10000000',
    quantity: 1,
    lineTotalVnd: '10000000',
  }

  it('renders create mode with product info and star rating', () => {
    render(
      <ReviewFormModal
        open={true}
        onOpenChange={vi.fn()}
        mode="create"
        orderId="order-1"
        orderItem={mockItem}
        onSuccess={vi.fn()}
      />
    )

    expect(screen.getByText('Đánh giá sản phẩm')).toBeInTheDocument()
    expect(screen.getByText('Điện thoại cao cấp')).toBeInTheDocument()
    expect(screen.getByText('Chất lượng sản phẩm')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gửi đánh giá' })).toBeDisabled()
  })

  it('selects star rating via click and keyboard interaction', () => {
    render(
      <ReviewFormModal
        open={true}
        onOpenChange={vi.fn()}
        mode="create"
        orderId="order-1"
        orderItem={mockItem}
        onSuccess={vi.fn()}
      />
    )

    const star5 = screen.getByRole('radio', { name: '5 sao' })
    fireEvent.click(star5)
    expect(star5).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('Rất tuyệt vời')).toBeInTheDocument()

    // Test submit button enabled after rating chosen
    expect(screen.getByRole('button', { name: 'Gửi đánh giá' })).toBeEnabled()

    // Keyboard navigation: press ArrowLeft on 5 sao -> sets 4 sao
    fireEvent.keyDown(star5, { key: 'ArrowLeft' })
    const star4 = screen.getByRole('radio', { name: '4 sao' })
    expect(star4).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('Hài lòng')).toBeInTheDocument()
  })

  it('submits review successfully in create mode', async () => {
    const onSuccess = vi.fn()
    const onOpenChange = vi.fn()

    const mockCreatedReview: Review = {
      id: 'rev-1',
      productId: 'prod-1',
      variantId: 'var-1',
      purchasedOptions: [],
      rating: 5,
      comment: 'Sản phẩm rất tốt',
      media: [],
      authorLabel: 'Khách hàng đã mua hàng',
      verifiedPurchase: true,
      createdAt: '2026-08-28T00:00:00Z',
      updatedAt: '2026-08-28T00:00:00Z',
    }

    vi.spyOn(reviewsApi, 'createOrderItemReview').mockResolvedValueOnce(mockCreatedReview)

    render(
      <ReviewFormModal
        open={true}
        onOpenChange={onOpenChange}
        mode="create"
        orderId="order-1"
        orderItem={mockItem}
        onSuccess={onSuccess}
      />
    )

    fireEvent.click(screen.getByRole('radio', { name: '5 sao' }))
    fireEvent.change(screen.getByPlaceholderText(/Hãy chia sẻ cảm nhận/i), {
      target: { value: 'Sản phẩm rất tốt' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Gửi đánh giá' }))

    await waitFor(() => {
      expect(reviewsApi.createOrderItemReview).toHaveBeenCalledWith(
        'order-1',
        'item-1',
        { rating: 5, comment: 'Sản phẩm rất tốt' },
        []
      )
      expect(onSuccess).toHaveBeenCalledWith(mockCreatedReview)
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })

  it('renders edit mode with warning banner and prefilled data', () => {
    const existingReview: Review = {
      id: 'rev-1',
      productId: 'prod-1',
      variantId: 'var-1',
      purchasedOptions: [],
      rating: 4,
      comment: 'Đã dùng 1 tuần thấy ổn',
      media: [],
      verifiedPurchase: true,
      authorLabel: 'Khách hàng đã mua hàng',
      createdAt: '2026-08-28T00:00:00Z',
      updatedAt: '2026-08-28T00:00:00Z',
    }

    render(
      <ReviewFormModal
        open={true}
        onOpenChange={vi.fn()}
        mode="edit"
        orderId="order-1"
        orderItem={mockItem}
        existingReview={existingReview}
        onSuccess={vi.fn()}
      />
    )

    expect(screen.getByText('Chỉnh sửa đánh giá')).toBeInTheDocument()
    expect(screen.getByText(/Bạn chỉ có thể cập nhật đánh giá một lần duy nhất/i)).toBeInTheDocument()
    expect(screen.getByDisplayValue('Đã dùng 1 tuần thấy ổn')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lưu thay đổi' })).toBeInTheDocument()
  })
})
