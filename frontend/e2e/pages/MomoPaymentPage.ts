import { expect, type Page } from '@playwright/test'

export async function assertLayoutInvariants(page: Page, contextLabel: string): Promise<void> {
  const noOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
  )
  expect(noOverflow, `Horizontal overflow detected at ${contextLabel}`).toBe(true)

  const brokenImages = await page.evaluate(() =>
    Array.from(document.querySelectorAll('img'))
      .filter((img) => {
        const style = window.getComputedStyle(img)
        return style.display !== 'none' && style.visibility !== 'hidden'
      })
      .filter((img) => !img.complete || img.naturalWidth === 0)
      .map((img) => img.src)
  )
  expect(brokenImages, `Broken images detected at ${contextLabel}`).toEqual([])
}

export class MomoCheckoutPom {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/checkout')
    await expect(this.page.getByRole('heading', { name: 'Thanh Toán Đơn Hàng' })).toBeVisible()
  }

  codRadio() {
    return this.page.locator('#payment-cod')
  }

  momoRadio() {
    return this.page.locator('#payment-momo')
  }

  submitButton() {
    return this.page.getByRole('button', { name: /Đặt hàng/i })
  }

  async selectMomoAndPlaceOrder(): Promise<void> {
    await expect(this.momoRadio()).toBeEnabled()
    await this.momoRadio().click()
    await expect(this.momoRadio()).toBeChecked()
    await this.submitButton().click()
  }
}

export class MomoReturnPom {
  constructor(private readonly page: Page) {}

  async gotoWithQuery(query: string): Promise<void> {
    await this.page.goto(`/momo-return${query}`)
  }

  retryButton() {
    return this.page.getByRole('button', { name: /Thanh toán lại qua MoMo/i })
  }
}

export class StorefrontOrdersPom {
  constructor(private readonly page: Page) {}

  async gotoList(): Promise<void> {
    await this.page.goto('/orders')
    await expect(this.page.getByRole('heading', { name: 'Lịch sử mua hàng' })).toBeVisible()
  }

  async gotoDetail(orderId: string): Promise<void> {
    await this.page.goto(`/orders/${orderId}`)
    await expect(this.page.getByRole('heading', { name: 'Chi tiết đơn hàng' })).toBeVisible()
  }

  retryButton() {
    return this.page.getByRole('button', { name: /Thanh toán lại qua MoMo/i })
  }
}

export class AdminOrdersPom {
  constructor(
    private readonly page: Page,
    private readonly adminBaseUrl: string
  ) {}

  async gotoList(): Promise<void> {
    await this.page.goto(`${this.adminBaseUrl}/orders`)
    await expect(this.page.getByRole('heading', { name: 'Quản lý đơn hàng' })).toBeVisible()
  }

  async gotoDetail(orderId: string): Promise<void> {
    await this.page.goto(`${this.adminBaseUrl}/orders/${orderId}`)
    await expect(this.page.getByRole('heading', { name: new RegExp(`Đơn hàng #${orderId}`) })).toBeVisible()
  }
}
