import { type Page, type Locator, expect } from '@playwright/test'
import { STOREFRONT_BASE_URL } from '../fixtures/auth'

export class ProductDetailReviewsPage {
  readonly page: Page
  readonly reviewsSection: Locator
  readonly sectionHeading: Locator

  constructor(page: Page) {
    this.page = page
    this.reviewsSection = page.locator('#product-reviews')
    this.sectionHeading = page.getByRole('heading', { name: /Đánh giá từ khách hàng đã mua/i })
  }

  async gotoProduct(productId: string): Promise<Record<string, unknown>> {
    const reviewsRespPromise = this.page.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/v1/products/${productId}/reviews`) &&
        resp.request().method() === 'GET'
    )
    await this.page.goto(`${STOREFRONT_BASE_URL}/products/${productId}`)
    const resp = await reviewsRespPromise
    expect(resp.status()).toBe(200)
    const body = await resp.json()
    await expect(this.reviewsSection).toBeVisible()
    await this.reviewsSection.scrollIntoViewIfNeeded()
    return body
  }

  async reloadAndWaitForReviews(productId: string): Promise<Record<string, unknown>> {
    const reviewsRespPromise = this.page.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/v1/products/${productId}/reviews`) &&
        resp.request().method() === 'GET'
    )
    await this.page.reload()
    const resp = await reviewsRespPromise
    expect(resp.status()).toBe(200)
    const body = await resp.json()
    await expect(this.reviewsSection).toBeVisible()
    await this.reviewsSection.scrollIntoViewIfNeeded()
    return body
  }

  reviewBlockByComment(comment: string): Locator {
    return this.reviewsSection.locator('div.pt-5').filter({ hasText: comment }).first()
  }
}
