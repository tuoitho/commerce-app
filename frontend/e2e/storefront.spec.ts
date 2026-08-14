import { expect, test, type Locator, type Page } from '@playwright/test'
import { appleId, installFixtures, productId } from './fixtures'

const browserErrors = new WeakMap<Page, string[]>()
const fixtureErrors = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  const interceptedErrors: string[] = []
  browserErrors.set(page, errors)
  fixtureErrors.set(page, interceptedErrors)
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`) })
  await installFixtures(page, interceptedErrors)
  await page.addInitScript(() => { localStorage.clear() })
  await page.goto('/')
  await page.waitForLoadState('networkidle')
})

test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page) ?? []).toEqual([])
  expect(fixtureErrors.get(page) ?? []).toEqual([])
})

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => document.documentElement.clientWidth))
  expect(await page.evaluate(() => document.body.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => document.body.clientWidth))
}

async function visibleInViewport(locator: Locator) {
  await expect(locator).toBeVisible()
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  const viewport = await locator.page().evaluate(() => ({ width: document.documentElement.clientWidth, height: document.documentElement.clientHeight }))
  expect(box).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.y).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width)
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height)
  await expect.poll(() => locator.evaluate((element) => {
    const box = element.getBoundingClientRect()
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
    return hit === element || (hit instanceof Element && element.contains(hit))
  })).toBe(true)
}

async function emulateBrowserZoom(page: Page) {
  const client = await page.context().newCDPSession(page)
  await client.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 })
  await expect.poll(() => page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(2)
}

async function assertNoSiblingOverlap(locator: Locator) {
  const boxes = await locator.evaluate((element) => Array.from(element.children).map((child) => {
    const box = child.getBoundingClientRect()
    return { left: box.left, top: box.top, right: box.right, bottom: box.bottom }
  }))
  for (let first = 0; first < boxes.length; first += 1) {
    for (let second = first + 1; second < boxes.length; second += 1) {
      const a = boxes[first]
      const b = boxes[second]
      expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top).toBe(true)
    }
  }
}

async function assertDetailLayout(page: Page) {
  const layout = page.locator('.detail-layout')
  const columns = await layout.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)
  expect(columns).toBe(2)
  const images = await page.locator('.detail-images').boundingBox()
  const panel = await page.locator('.detail-info').boundingBox()
  expect(images).not.toBeNull(); expect(panel).not.toBeNull()
  expect(images!.x + images!.width).toBeLessThanOrEqual(panel!.x)
  await assertNoSiblingOverlap(layout)
  await visibleInViewport(page.getByRole('heading', { name: 'Test Phone Pro' }))
  await visibleInViewport(page.getByRole('button', { name: '128 GB' }))
}

async function assertCartLayout(page: Page) {
  const row = page.locator('.cart-row')
  await expect(row).toBeVisible()
  await expect(row).toHaveCSS('grid-template-columns', /96px/)
  await assertNoSiblingOverlap(row)
  await visibleInViewport(page.getByLabel('Select all available items'))
  await visibleInViewport(page.getByRole('button', { name: /Increase quantity/ }))
  await visibleInViewport(page.getByRole('button', { name: /Remove item/ }))
  await visibleInViewport(page.getByRole('button', { name: 'Continue to checkout' }))
}

async function visibleFocus(locator: Locator) {
  await expect(locator).toBeFocused()
  await expect.poll(() => locator.evaluate((element) => {
    const style = getComputedStyle(element)
    return style.outlineStyle !== 'none' && style.outlineWidth !== '0px'
  })).toBe(true)
}

async function tabTo(page: Page, locator: Locator, reverse = false) {
  const directions = reverse ? ['Shift+Tab'] : ['Tab', 'Shift+Tab']
  for (const direction of directions) {
    for (let step = 0; step < 40; step += 1) {
      await page.keyboard.press(direction)
      if (await locator.evaluate((element) => document.activeElement === element)) {
        await visibleFocus(locator)
        return
      }
    }
  }
  throw new Error(`Could not reach ${await locator.getAttribute('aria-label') ?? await locator.textContent()} with keyboard traversal`)
}

async function login(page: Page) {
  const email = page.getByLabel('Email')
  const password = page.getByLabel('Password')
  const submit = page.getByRole('button', { name: 'Sign in' })
  await tabTo(page, email)
  await page.keyboard.type('buyer@example.com')
  await tabTo(page, password)
  await page.keyboard.type('correct-password')
  await tabTo(page, email, true)
  await tabTo(page, submit)
  await page.keyboard.press('Enter')
  await expect(page).not.toHaveURL(/\/login$/)
}

test('home and navigation are usable with keyboard', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Featured phones' })).toBeVisible()
  const cta = page.getByRole('link', { name: 'Explore phones' })
  await tabTo(page, cta); await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/products$/)
  await noOverflow(page)
})

test('catalog filters are URL-backed and keyboard actionable', async ({ page }) => {
  await page.goto('/products'); await page.waitForLoadState('networkidle')
  const search = page.getByPlaceholder('Search products...')
  await tabTo(page, search); await page.keyboard.type('phone', { delay: 150 }); await expect(page).toHaveURL(/q=phone/)
  await page.goto('/products?q=phone'); await page.waitForLoadState('networkidle')
  const apple = page.getByLabel('Apple'); await tabTo(page, apple); await page.keyboard.press('Space'); await expect(page).toHaveURL(/category_id=/)
  await page.goto(`/products?q=phone&category_id=${appleId}&in_stock=true`); await page.waitForLoadState('networkidle')
  const inStock = page.getByLabel('In stock'); await tabTo(page, inStock); await page.keyboard.press('Space'); await expect(page).toHaveURL(/in_stock=true/)
  const reset = page.getByRole('button', { name: 'Reset filters' }); await tabTo(page, reset); await page.keyboard.press('Enter'); await expect(page).toHaveURL(/\/products$/)
  await noOverflow(page)
})

test('detail selection, guest login return, and authenticated add work', async ({ page }) => {
  await page.goto(`/products/${productId}`); await page.waitForLoadState('networkidle')
  const storage = page.getByRole('button', { name: '128 GB' }); await expect(storage).toBeEnabled(); await tabTo(page, storage); await page.keyboard.press('Enter'); await expect(storage).toHaveAttribute('aria-pressed', 'true'); await expect(page).toHaveURL(/option=/)
  const colour = page.getByRole('button', { name: 'Black' }); await tabTo(page, colour); await page.keyboard.press('Enter'); await expect(colour).toHaveAttribute('aria-pressed', 'true'); await expect(page).toHaveURL(/option=.*%3A.*&option=/)
  const add = page.getByRole('button', { name: 'Add to cart' }); await tabTo(page, add); await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/login$/)
  await login(page)
  await expect(page.getByRole('button', { name: '128 GB', pressed: true })).toBeVisible()
  await tabTo(page, add); await page.keyboard.press('Enter')
  await expect(page.getByText('Added to cart')).toBeVisible()
  await noOverflow(page)
})

test('cart selection, quantity, remove and checkout controls are keyboard actionable', async ({ page }) => {
  await page.goto('/login'); await login(page); await page.goto('/cart'); await page.waitForLoadState('networkidle')
  const all = page.getByLabel('Select all available items'); await tabTo(page, all); await page.keyboard.press('Space')
  const checkout = page.getByRole('button', { name: 'Continue to checkout' }); await tabTo(page, checkout); await page.keyboard.press('Space'); await expect(page.getByText(/outside the current scope/)).toBeVisible()
  const select = page.getByLabel('Select Test Phone Pro'); await tabTo(page, select); await page.keyboard.press('Space')
  const increase = page.getByRole('button', { name: /Increase quantity/ }); await tabTo(page, increase); await page.keyboard.press('Enter'); await expect(page.getByLabel(/Quantity for item/)).toHaveText('2')
  const remove = page.getByRole('button', { name: /Remove item/ }); await tabTo(page, remove); await page.keyboard.press('Enter'); await expect(page.getByText('Your cart is empty')).toBeVisible()
  await noOverflow(page)
})

test('login, not-found and protected cart routes provide usable states', async ({ page }) => {
  await page.goto('/login'); const email = page.getByLabel('Email'); await tabTo(page, email); await tabTo(page, email, true); await expect(email).toBeFocused()
  await page.goto('/missing-page'); await expect(page.getByRole('heading', { name: /not found/i })).toBeVisible(); const home = page.getByRole('link', { name: /home/i }).last(); await tabTo(page, home); await page.keyboard.press('Enter'); await expect(page).toHaveURL('/')
  await page.goto('/cart'); await expect(page).toHaveURL(/\/login$/); await login(page); await expect(page).toHaveURL(/\/cart$/)
  await noOverflow(page)
})

test('shared header destinations and account controls expose visible keyboard focus', async ({ page }) => {
  const navigation = page.getByRole('navigation', { name: 'Main navigation' })
  const destinations = [
    navigation.getByRole('link', { name: 'Home', exact: true }),
    navigation.getByRole('link', { name: 'Phones', exact: true }),
    navigation.getByRole('link', { name: /Cart \(/ }),
    navigation.getByRole('link', { name: 'Sign in', exact: true }),
    navigation.getByRole('link', { name: 'Register', exact: true }),
  ]
  for (const destination of destinations) await tabTo(page, destination)

  await page.goto('/login')
  await login(page)
  await page.goto('/')
  const logout = page.getByRole('button', { name: 'Log out' })
  await tabTo(page, logout)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/login$/)
})

test('shopping journey preserves semantic status and route boundaries', async ({ page }) => {
  await page.getByRole('link', { name: 'Explore phones' }).click()
  await page.getByRole('link', { name: 'Test Phone Pro', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Test Phone Pro' })).toBeVisible()
  await expect(page.getByRole('status')).toContainText('Select Storage and Colour')

  await page.getByRole('button', { name: '128 GB' }).click()
  await page.getByRole('button', { name: 'Black' }).click()
  await page.getByRole('button', { name: 'Add to cart' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await login(page)
  await expect(page).toHaveURL(/\/products\//)
  await page.getByRole('button', { name: 'Add to cart' }).click()
  await expect(page.getByRole('status')).toContainText('Added to cart')

  await page.getByRole('link', { name: /Cart \(/ }).click()
  await expect(page).toHaveURL(/\/cart$/)
  await expect(page.getByLabel('Select all available items')).toBeChecked()
  await page.getByRole('button', { name: 'Continue to checkout' }).click()
  await expect(page.locator('[role="status"]').filter({ hasText: 'outside the current scope' })).toBeVisible()
})

test('detail and cart retain their narrow-tablet layouts at 601 to 767 pixels', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 601 || (page.viewportSize()?.width ?? 0) > 767, 'Narrow-tablet contract only')

  await page.goto(`/products/${productId}`); await page.waitForLoadState('networkidle')
  await assertDetailLayout(page)

  await page.goto('/login'); await login(page)
  await page.goto('/cart'); await page.waitForLoadState('networkidle')
  await assertCartLayout(page)
})

test('representative pages reflow at 200 percent browser zoom', async ({ page }) => {
  await emulateBrowserZoom(page)
  await noOverflow(page)
  await visibleInViewport(page.getByRole('heading', { name: 'Home' }))
  await visibleInViewport(page.getByRole('link', { name: 'Explore phones' }))

  await page.goto('/products'); await page.waitForLoadState('networkidle')
  await visibleInViewport(page.getByRole('heading', { name: 'Catalog' }))
  await visibleInViewport(page.getByPlaceholder('Search products...'))

  await page.goto(`/products/${productId}`); await page.waitForLoadState('networkidle')
  await visibleInViewport(page.getByRole('heading', { name: 'Test Phone Pro' }))
  await visibleInViewport(page.getByRole('button', { name: '128 GB' }))
  await assertNoSiblingOverlap(page.locator('.detail-layout'))

  await page.goto('/login'); await login(page)
  await page.goto('/cart'); await page.waitForLoadState('networkidle')
  await visibleInViewport(page.getByRole('button', { name: 'Continue to checkout' }))
  await visibleInViewport(page.getByRole('button', { name: /Remove item/ }))
  await assertNoSiblingOverlap(page.locator('.cart-row'))
  await noOverflow(page)
})
