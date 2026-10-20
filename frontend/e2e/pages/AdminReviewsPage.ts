import { type Page, type Locator, expect } from '@playwright/test'
import { ADMIN_BASE_URL } from '../fixtures/auth'

export class AdminReviewsPage {
  readonly page: Page
  readonly heading: Locator
  readonly ratingSelect: Locator
  readonly replyStatusSelect: Locator
  readonly tableRows: Locator
  readonly dialog: Locator
  readonly replyTextarea: Locator
  readonly saveReplyButton: Locator
  readonly cancelDialogButton: Locator
  readonly prevPageButton: Locator
  readonly nextPageButton: Locator

  constructor(page: Page) {
    this.page = page
    this.heading = page.getByRole('heading', { name: 'Đánh giá sản phẩm' })
    this.ratingSelect = page.getByRole('combobox').nth(0)
    this.replyStatusSelect = page.getByRole('combobox').nth(1)
    this.tableRows = page.locator('tbody tr')
    this.dialog = page.getByRole('alertdialog')
    this.replyTextarea = page.getByPlaceholder('Nhập câu trả lời của cửa hàng...')
    this.saveReplyButton = page.getByRole('button', { name: 'Lưu phản hồi' })
    this.cancelDialogButton = page.getByRole('button', { name: 'Hủy' })
    this.prevPageButton = page.getByRole('button', { name: 'Trước' })
    this.nextPageButton = page.getByRole('button', { name: 'Sau' })
  }

  async goto(): Promise<void> {
    const listRespPromise = this.page.waitForResponse(
      (resp) => resp.url().includes('/api/v1/admin/reviews') && resp.request().method() === 'GET'
    )
    await this.page.goto(`${ADMIN_BASE_URL}/reviews`)
    const resp = await listRespPromise
    expect(resp.status()).toBe(200)
    await expect(this.heading).toBeVisible()
  }

  rowByComment(comment: string): Locator {
    return this.tableRows.filter({ hasText: comment }).first()
  }

  async filterByRating(rating: number): Promise<void> {
    const respPromise = this.page.waitForResponse(
      (resp) => resp.url().includes('/api/v1/admin/reviews') && resp.request().method() === 'GET'
    )
    await this.ratingSelect.selectOption(String(rating))
    const resp = await respPromise
    expect(resp.status()).toBe(200)
  }

  async filterByReplyStatus(hasReply: '' | 'yes' | 'no'): Promise<void> {
    const respPromise = this.page.waitForResponse(
      (resp) => resp.url().includes('/api/v1/admin/reviews') && resp.request().method() === 'GET'
    )
    await this.replyStatusSelect.selectOption(hasReply)
    const resp = await respPromise
    expect(resp.status()).toBe(200)
  }

  async openReplyDialogForRow(row: Locator): Promise<void> {
    await row.getByRole('button', { name: /Phản hồi|Sửa/ }).click()
    await expect(this.dialog).toBeVisible()
    await expect(this.replyTextarea).toBeVisible()
  }

  async openDeleteDialogForRow(row: Locator): Promise<void> {
    const deleteBtn = row.locator('button').nth(1)
    await deleteBtn.click()
    await expect(this.dialog).toBeVisible()
    await expect(this.dialog.getByRole('heading', { name: 'Xóa phản hồi' })).toBeVisible()
  }
}
