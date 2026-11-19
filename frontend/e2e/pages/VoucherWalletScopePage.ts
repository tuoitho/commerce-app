import * as fs from 'node:fs'
import * as path from 'node:path'
import { expect, type Page } from '@playwright/test'

export const FEATURE_SLUG = 'voucher-wallet-and-scope'
export const IMGS_DIR = path.resolve(process.cwd(), '..', '.dream', 'specs', FEATURE_SLUG, 'imgs')

export function voucherScreenshotPath(filename: string): string {
  fs.mkdirSync(IMGS_DIR, { recursive: true })
  return path.join(IMGS_DIR, filename)
}

export class AdminVoucherScopePage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async goto() {
    await this.page.goto('http://localhost:15174/vouchers')
    await expect(this.page.getByRole('heading', { name: 'Quản lý mã giảm giá' })).toBeVisible()
  }

  async openCreateDialog() {
    await this.page.getByRole('button', { name: /Tạo mã giảm giá/i }).click()
    await expect(this.page.getByRole('dialog')).toBeVisible()
  }

  async createCategoryVoucher(opts: {
    code: string
    title: string
    discountValue: string
    minOrderVnd: string
    startsAtLocal: string
    endsAtLocal: string
    categoryName: string
  }) {
    await this.page.getByPlaceholder('VD: AURA500K').fill(opts.code)
    await this.page.getByLabel(/^Tiêu đề/i).fill(opts.title)
    await this.page.getByLabel(/Giá trị giảm/i).fill(opts.discountValue)
    await this.page.getByLabel(/Đơn tối thiểu/i).fill(opts.minOrderVnd)
    await this.page.getByLabel(/Thời gian bắt đầu/i).fill(opts.startsAtLocal)
    await this.page.getByLabel(/Thời gian kết thúc/i).fill(opts.endsAtLocal)

    await this.page.getByLabel(/Phạm vi áp dụng/i).selectOption('categories')
    const checkbox = this.page.getByLabel(opts.categoryName)
    await expect(checkbox).toBeVisible()
    await checkbox.check()

    const createPromise = this.page.waitForResponse(
      (resp) => resp.url().includes('/api/v1/admin/vouchers') && resp.request().method() === 'POST'
    )
    await this.page.getByRole('button', { name: /Lưu mã giảm giá/i }).click()
    const resp = await createPromise
    expect(resp.status()).toBe(201)
  }
}

export class StorefrontVoucherWalletPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async gotoDiscover() {
    await this.page.goto('/vouchers')
    await expect(this.page.getByRole('heading', { name: 'Kho & Ví Voucher' })).toBeVisible()
  }

  async claimVoucherByCode(code: string) {
    const card = this.page.locator('div', { hasText: code }).filter({
      has: this.page.getByRole('button', { name: /Lưu vào ví/i }),
    }).last()
    const claimPromise = this.page.waitForResponse(
      (resp) => resp.url().includes('/claim') && resp.request().method() === 'POST'
    )
    await card.getByRole('button', { name: /Lưu vào ví/i }).click()
    const resp = await claimPromise
    expect(resp.status()).toBe(200)
  }

  async switchToWalletTab() {
    await this.page.getByRole('button', { name: /Ví của tôi/i }).click()
  }

  async filterWallet(label: string) {
    await this.page.getByRole('button', { name: label, exact: true }).click()
  }

  async gotoCheckout() {
    await this.page.goto('/checkout')
    await expect(this.page.getByRole('heading', { name: 'Mã giảm giá' })).toBeVisible()
  }

  async applyManualCode(code: string) {
    await this.page.locator('#voucher-code-input').fill(code)
    await this.page.getByRole('button', { name: 'Áp dụng', exact: true }).click()
  }

  async applyWalletVoucher(code: string) {
    const quotePromise = this.page.waitForResponse(
      (resp) => resp.url().includes('/api/v1/checkout/quote') && resp.request().method() === 'POST'
    )
    await this.page.getByTestId(`apply-voucher-${code}`).click()
    const resp = await quotePromise
    expect(resp.status()).toBe(200)
  }
}
