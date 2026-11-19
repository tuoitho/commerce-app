import { expect, type Page } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'

export const SCREENSHOT_DIR = path.resolve(
  process.cwd(),
  '..',
  '.dream',
  'specs',
  'commerce-platform-enhancements',
  'imgs'
)

export function ensureScreenshotDir(): void {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
}

export function screenshotPath(filename: string): string {
  ensureScreenshotDir()
  return path.join(SCREENSHOT_DIR, filename)
}

export async function assertLayoutInvariants(page: Page, contextLabel: string): Promise<void> {
  const metrics = await page.evaluate(() => {
    const scrollWidth = document.documentElement.scrollWidth
    const innerWidth = window.innerWidth
    const brokenImages: string[] = []
    for (const img of document.querySelectorAll('img')) {
      const style = window.getComputedStyle(img)
      if (style.display === 'none' || style.visibility === 'hidden') continue
      const rect = img.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      if (!img.complete || img.naturalWidth === 0) {
        brokenImages.push(img.getAttribute('src') || img.alt || 'unknown-img')
      }
    }
    return { scrollWidth, innerWidth, brokenImages }
  })

  expect(
    metrics.scrollWidth,
    `[${contextLabel}] Horizontal overflow detected: scrollWidth=${metrics.scrollWidth} > innerWidth=${metrics.innerWidth}`
  ).toBeLessThanOrEqual(metrics.innerWidth)

  expect(
    metrics.brokenImages,
    `[${contextLabel}] Broken images found: ${metrics.brokenImages.join(', ')}`
  ).toEqual([])
}

export async function assertBoxesDoNotOverlap(
  page: Page,
  firstSelector: string,
  secondSelector: string,
  contextLabel: string
): Promise<void> {
  const first = page.locator(firstSelector).first()
  const second = page.locator(secondSelector).first()
  await expect(first, `[${contextLabel}] Missing ${firstSelector}`).toBeVisible()
  await expect(second, `[${contextLabel}] Missing ${secondSelector}`).toBeVisible()

  const boxA = await first.boundingBox()
  const boxB = await second.boundingBox()
  expect(boxA, `[${contextLabel}] Missing bounding box for ${firstSelector}`).not.toBeNull()
  expect(boxB, `[${contextLabel}] Missing bounding box for ${secondSelector}`).not.toBeNull()

  const a = boxA!
  const b = boxB!
  const intersectsX = a.x < b.x + b.width && a.x + a.width > b.x
  const intersectsY = a.y < b.y + b.height && a.y + a.height > b.y

  expect(
    intersectsX && intersectsY,
    `[${contextLabel}] Elements overlap: ${firstSelector} (${JSON.stringify(a)}) vs ${secondSelector} (${JSON.stringify(b)})`
  ).toBe(false)
}

export async function dismissActiveToasts(page: Page): Promise<void> {
  const closeButtons = page.getByRole('button', { name: 'Đóng thông báo' })
  while ((await closeButtons.count()) > 0) {
    try {
      await closeButtons.first().click({ timeout: 500 })
    } catch {
      break
    }
  }
}

export async function scrollLocatorBelowHeader(
  page: Page,
  locator: ReturnType<Page['locator']>,
  headerOffset = 160
): Promise<void> {
  await locator.evaluate((el, offset) => {
    const rect = el.getBoundingClientRect()
    const targetY = Math.max(0, window.scrollY + rect.top - offset)
    window.scrollTo({ top: targetY, behavior: 'instant' as ScrollBehavior })
  }, headerOffset)
}

export class StorefrontEnhancementsPage {
  constructor(readonly page: Page) {}

  get headerSearchInput() {
    return this.page.getByPlaceholder('Tìm thiết bị, dòng máy, thương hiệu...')
  }

  get searchListbox() {
    return this.page.locator('#header-search-listbox')
  }

  get flashSaleSection() {
    return this.page.locator('section[aria-label="Flash Sale"]')
  }

  get compareTray() {
    return this.page.locator('section[aria-label="Thanh so sánh sản phẩm"]')
  }

  get compareNowLink() {
    return this.compareTray.locator('a[href^="/compare?ids="]')
  }

  get chatToggleButton() {
    return this.page.getByRole('button', { name: /trò chuyện hỗ trợ/i })
  }

  compareToggleFor(productName: string) {
    return this.page.getByRole('button', {
      name: new RegExp(`^(Thêm|Bỏ) ${productName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} .*so sánh$`, 'i'),
    })
  }

  async openHome() {
    await this.page.goto('/')
    await this.page.waitForLoadState('networkidle')
  }

  async openCatalog(queryString = '') {
    await this.page.goto(queryString ? `/products?${queryString}` : '/products')
    await this.page.waitForLoadState('networkidle')
  }

  async openProductDetail(productId: string) {
    await this.page.goto(`/products/${productId}`)
    await this.page.waitForLoadState('networkidle')
  }

  async openLogin() {
    await this.page.goto('/login')
    await this.page.waitForLoadState('networkidle')
  }

  async openCheckout() {
    await this.page.goto('/checkout')
    await this.page.waitForLoadState('networkidle')
  }

  async openOrderDetail(orderId: string) {
    await this.page.goto(`/orders/${orderId}`)
    await this.page.waitForLoadState('networkidle')
  }

  async assertChatAndCompareNoOverlap(contextLabel: string) {
    await assertBoxesDoNotOverlap(
      this.page,
      'section[aria-label="Thanh so sánh sản phẩm"] a[href^="/compare?ids="]',
      'button[aria-label*="trò chuyện hỗ trợ" i]',
      contextLabel
    )
  }
}

export class AdminEnhancementsPage {
  constructor(readonly page: Page) {}

  async openNewProduct() {
    await this.page.goto('http://localhost:15174/products/new')
    await this.page.waitForLoadState('networkidle')
  }

  async openVouchers() {
    await this.page.goto('http://localhost:15174/vouchers')
    await this.page.waitForLoadState('networkidle')
  }

  async openFlashSales() {
    await this.page.goto('http://localhost:15174/flash-sales')
    await this.page.waitForLoadState('networkidle')
  }

  async openOrderDetail(orderId: string) {
    await this.page.goto(`http://localhost:15174/orders/${orderId}`)
    await this.page.waitForLoadState('networkidle')
  }
}
