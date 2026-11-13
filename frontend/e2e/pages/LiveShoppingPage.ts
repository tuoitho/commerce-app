import { expect, type Locator, type Page } from '@playwright/test'

export class LiveShoppingPage {
  readonly page: Page
  readonly stage: Locator
  readonly viewers: Locator
  readonly hearts: Locator
  readonly heartButton: Locator
  readonly cartButton: Locator
  readonly cartSheet: Locator

  constructor(page: Page) {
    this.page = page
    this.stage = page.getByTestId('live-stage')
    this.viewers = page.getByTestId('live-viewers')
    this.hearts = page.getByTestId('live-hearts')
    this.heartButton = page.getByRole('button', { name: 'Thả tim' })
    this.cartButton = page.getByRole('button', { name: 'Giỏ hàng live' })
    this.cartSheet = page.getByRole('dialog', { name: 'Giỏ hàng live' })
  }

  async goto(sessionId: string) {
    await this.page.goto(`/live/${sessionId}`)
  }

  async expectLoaded() {
    await expect(this.stage).toBeVisible()
  }

  /** The visible comment composer (overlay on phones, side panel from md up). */
  commentInput(): Locator {
    return this.page.locator('input[aria-label="Bình luận"]:visible')
  }

  async sendComment(text: string) {
    await this.commentInput().fill(text)
    await this.page.locator('button[aria-label="Gửi bình luận"]:visible').click()
  }

  async openCart() {
    await this.cartButton.click()
    await expect(this.cartSheet).toBeVisible()
  }

  async chooseProduct(productId: string) {
    await this.cartSheet.getByTestId(`live-cart-item-${productId}`).getByRole('button', { name: 'Chọn' }).click()
  }

  async addToCart() {
    await this.cartSheet.getByRole('button', { name: 'Thêm vào giỏ' }).click()
  }
}
