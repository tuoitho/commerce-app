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
