import { expect, type Locator, type Page } from '@playwright/test'

export class AdminUsersPage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async gotoList(baseUrl: string) {
    await this.page.goto(`${baseUrl}/users`)
    await expect(this.userRows().first()).toBeVisible()
  }

  async gotoDetail(baseUrl: string, id: string) {
    await this.page.goto(`${baseUrl}/users/${id}`)
    await expect(this.page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(this.page.getByRole('region', { name: 'Đơn hàng gần nhất' })).toBeVisible()
  }

  userRows(): Locator {
    return this.page.getByRole('row').filter({ has: this.page.getByRole('link') })
  }

  async hasHorizontalScroll(): Promise<boolean> {
    return this.page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    )
  }
}
