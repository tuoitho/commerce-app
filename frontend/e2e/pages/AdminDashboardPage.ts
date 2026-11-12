import { expect, type Locator, type Page } from '@playwright/test'

export type PendingWorkId =
  | 'pending-confirmation'
  | 'cancel-requested'
  | 'pending-approval-returns'
  | 'received-returns'
  | 'unreplied-reviews'
  | 'unread-conversations'

export class AdminDashboardPage {
  constructor(private readonly page: Page) {}

  async goto(adminBaseUrl: string, query = ''): Promise<void> {
    await this.page.goto(`${adminBaseUrl}/${query}`)
    await expect(this.revenueChart()).toBeVisible()
  }

  pendingWorkItem(id: PendingWorkId): Locator {
    return this.page.getByTestId(`pending-work-${id}`)
  }

  orderStatusItem(status: string): Locator {
    return this.page.getByTestId(`order-status-${status}`)
  }

  revenueChart(): Locator {
    return this.page.getByTestId('revenue-chart-slot')
  }

  chartDay(index: number): Locator {
    return this.page.getByTestId(`chart-day-group-${index}`)
  }

  chartDays(): Locator {
    return this.page.locator('[data-testid^="chart-day-group-"]')
  }

  chartTooltip(): Locator {
    return this.page.getByTestId('revenue-chart-tooltip')
  }

  rangeButton(label: 'Hôm nay' | '7 ngày' | '30 ngày'): Locator {
    return this.page.getByRole('group', { name: 'Chọn kỳ báo cáo' }).getByRole('button', { name: label })
  }

  menuButton(): Locator {
    return this.page.getByRole('button', { name: 'Mở menu điều hướng' })
  }

  navigationDrawer(): Locator {
    return this.page.getByRole('dialog', { name: 'Menu điều hướng' })
  }

  drawerLinkNames(): Promise<string[]> {
    return this.navigationDrawer().getByRole('link').allInnerTexts()
  }

  async openNavigationDrawer(): Promise<void> {
    await this.menuButton().click()
    await expect(this.navigationDrawer()).toBeVisible()
  }

  async hasHorizontalScroll(): Promise<boolean> {
    return this.page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    )
  }

  // Returns how many pixels the element extends past the viewport on either side.
  async overflowPastViewport(locator: Locator): Promise<number> {
    const box = await locator.boundingBox()
    expect(box, 'element must be rendered').not.toBeNull()
    const viewport = this.page.viewportSize()
    expect(viewport, 'viewport must be set').not.toBeNull()
    const left = Math.max(0, -box!.x)
    const right = Math.max(0, box!.x + box!.width - viewport!.width)
    return left + right
  }
}

export class AdminDestinationPages {
  constructor(private readonly page: Page) {}

  ordersStatusSelect(): Locator {
    return this.page.getByLabel('Lọc theo trạng thái')
  }

  returnsStatusSelect(): Locator {
    return this.page.locator('select:has(option[value="pending_approval"])')
  }

  reviewsReplySelect(): Locator {
    return this.page.locator('select:has(option[value="no"])')
  }

  chatUnreadTab(): Locator {
    return this.page.getByTestId('filter-tab-unread')
  }

  chatAllTab(): Locator {
    return this.page.getByTestId('filter-tab-all')
  }

  // Position of the chat page relative to the scrollable content area; negative values are clipped off-screen.
  chatPageOffsetFromContentArea(): Promise<{ left: number; top: number }> {
    return this.page.getByTestId('chat-support-page').evaluate((el) => {
      const content = el.closest('main')!.getBoundingClientRect()
      const box = el.getBoundingClientRect()
      return { left: box.left - content.left, top: box.top - content.top }
    })
  }
}
