import { type Locator, type Page } from '@playwright/test'

export class ReviewHistoryPage {
  readonly page: Page
  readonly pageContainer: Locator
  readonly heading: Locator
  readonly filterBar: Locator
  readonly reviewCards: Locator
  readonly emptyStateHeading: Locator
  readonly filterEmptyResetButton: Locator
  readonly lightbox: Locator
  readonly lightboxImage: Locator
  readonly lightboxCloseButton: Locator
  readonly editModal: Locator
  readonly editCommentInput: Locator
  readonly editSaveButton: Locator
  readonly editCancelButton: Locator
  readonly pagination: Locator
  readonly prevPageButton: Locator
  readonly nextPageButton: Locator
  readonly headerReviewsLink: Locator
  readonly mobileMenuToggle: Locator
  readonly mobileReviewsLink: Locator

  constructor(page: Page) {
    this.page = page
    this.pageContainer = page.getByTestId('review-history-page')
    this.heading = page.getByRole('heading', { name: 'Lịch sử đánh giá', level: 1 })
    this.filterBar = page.getByRole('tablist', { name: 'Bộ lọc số sao đánh giá' })
    this.reviewCards = page.getByTestId('review-history-card')
    this.emptyStateHeading = page.getByRole('heading', { name: 'Chưa có đánh giá nào' })
    this.filterEmptyResetButton = page.getByRole('button', { name: 'Xem tất cả đánh giá' })
    this.lightbox = page.getByTestId('review-lightbox-dialog')
    this.lightboxImage = page.getByTestId('review-lightbox-image')
    this.lightboxCloseButton = page.getByRole('button', { name: 'Đóng xem ảnh' })
    this.editModal = page.getByRole('dialog')
    this.editCommentInput = page.getByLabel('Nhận xét chi tiết')
    this.editSaveButton = page.getByRole('button', { name: /Hoàn tất chỉnh sửa|Đang gửi/i })
    this.editCancelButton = page.getByRole('button', { name: 'Hủy bỏ' })
    this.pagination = page.getByTestId('review-pagination')
    this.prevPageButton = page.getByTestId('pagination-prev')
    this.nextPageButton = page.getByTestId('pagination-next')
    this.headerReviewsLink = page.getByTestId('header-reviews-link')
    this.mobileMenuToggle = page.getByTestId('mobile-menu-toggle')
    this.mobileReviewsLink = page.getByTestId('mobile-reviews-link')
  }

  async goto(): Promise<void> {
    await this.page.goto('/reviews')
  }

  filterButton(rating: number): Locator {
    return this.page.getByTestId(`rating-filter-tab-${rating}`)
  }

  reviewCardById(reviewId: string): Locator {
    return this.page.locator(`[data-testid="review-history-card"][data-review-id="${reviewId}"]`)
  }

  editButton(card: Locator): Locator {
    return card.getByTestId('review-edit-btn')
  }

  editedBadge(card: Locator): Locator {
    return card.getByTestId('review-edited-badge')
  }

  updatedAtLabel(card: Locator): Locator {
    return card.getByTestId('review-updated-at')
  }

  adminReplyBlock(card: Locator): Locator {
    return card.getByTestId('review-admin-reply')
  }

  productImageLink(card: Locator): Locator {
    return card.getByTestId('review-product-image-link')
  }

  productNameLink(card: Locator): Locator {
    return card.getByTestId('review-product-name-link')
  }

  orderLink(card: Locator): Locator {
    return card.getByTestId('review-order-link')
  }

  imageThumbnails(card: Locator): Locator {
    return card.getByTestId('review-image-thumb')
  }

  videoPlayer(card: Locator): Locator {
    return card.getByTestId('review-video-player')
  }

  mediaFallbacks(card: Locator): Locator {
    return card.getByTestId('review-media-fallback')
  }

  editStarButton(star: number): Locator {
    return this.page.getByRole('radio', { name: `${star} sao` })
  }

  async selectRatingFilter(rating: number): Promise<void> {
    await this.filterButton(rating).click()
  }

  async openEditModalForReview(reviewId: string): Promise<void> {
    const card = this.reviewCardById(reviewId)
    await this.editButton(card).click()
  }

  async submitEditReview(rating: number, comment: string): Promise<void> {
    await this.editStarButton(rating).click()
    await this.editCommentInput.fill(comment)
    await this.editSaveButton.click()
  }
}
