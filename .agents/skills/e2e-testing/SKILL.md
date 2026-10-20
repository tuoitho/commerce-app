---
name: e2e-testing
description: Playwright E2E testing patterns, Page Object Model, configuration, .dream requirement/contract traceability, and flaky test strategies for frontend (:15173) and frontend-admin (:15174). Use when writing Playwright tests, structuring page objects, or verifying cross-boundary contracts.
---

# E2E Testing Patterns

Playwright patterns for building stable, fast, and maintainable E2E test suites across `frontend/` (storefront) and `frontend-admin/` (admin portal), integrated with `.dream` specification governance.

## `.dream` Governance & Traceability

When a `.dream/specs/<feature>/` specification governs the work, E2E tests act as cross-boundary verification (`verifier` role):

1. **Contract Role (`verifier`):** Leaf tasks in `tasks.md` that implement or update E2E suites declare the contracts they prove under `Contracts`, e.g.:
   ```markdown
   - **Contracts:** API-CART@1 (verifier); API-ORDERS@1 (verifier)
   - _Requirements: 2.1, 2.3, 4.2_
   ```
2. **Requirement Traceability:** Reference the covered requirement IDs (`_Requirements: X.Y_`) in the spec file header or `test.describe` / `test` titles so `verifying-feature-implementation` can map every acceptance criterion to deterministic test evidence.
3. **API Envelope Verification:** Verify `/api/v1` responses and UI reactions against the repository's Full Status Envelope:
   - **Success (`200`, `201`):** `{"success": true, "message": string, "data": <T>, "error": null, "meta": {"timestamp": string, "pagination"?: PaginationMeta}}`.
   - **No Content (`204`):** `POST /api/v1/auth/logout` returns HTTP 204 with no body.
   - **Validation Error (`400`):** `error.code` (e.g. `"validation_error"`, `"invalid_filter"`) and `error.fields` mapped to form field error messages.
   - **Business Logic Error (`401`, `404`, `409`):** `error.code` (e.g. `"out_of_stock"`, `"stock_limit"`, `"email_in_use"`, `"cart_item_unavailable"`) with user-facing Vietnamese messages rendered in alerts or `sonner` toasts.

## Repository Architecture & Ports

| Package | Directory | Dev Server Port | Preview Port | Backend Proxy Target |
|---|---|---|---|---|
| Storefront | `frontend/` | `http://localhost:15173` | `http://127.0.0.1:4173` | `http://localhost:${HTTP_PORT:-18080}` (`/api`, `/media`) |
| Admin Portal | `frontend-admin/` | `http://localhost:15174` | `http://127.0.0.1:4174` | `http://localhost:${HTTP_PORT:-18080}` (`/api`) |
| Backend API | `backend/` | `http://localhost:18080` | — | Base path `/api/v1` |

Run E2E commands from the respective package directory (`frontend/` or `frontend-admin/`). Notice that Vitest (`npm test`) excludes `e2e/**` in `vite.config.ts`, whereas Playwright (`npm run test:e2e` / `npx playwright test`) executes specs inside `./e2e`.

## Test File Organization

```text
frontend/ (or frontend-admin/)
├── e2e/
│   ├── auth/
│   │   ├── login.spec.ts
│   │   └── logout.spec.ts
│   ├── catalog/
│   │   ├── browse.spec.ts
│   │   └── product-detail.spec.ts
│   ├── cart/
│   │   └── cart-checkout.spec.ts
│   ├── fixtures/
│   │   ├── auth.ts
│   │   └── catalog-data.ts
│   └── pages/
│       ├── CatalogPage.ts
│       └── CartPage.ts
├── playwright.config.ts
└── vite.config.ts
```

## Page Object Model (POM)

```typescript
import { Page, Locator, expect } from '@playwright/test'

export class CatalogPage {
  readonly page: Page
  readonly searchInput: Locator
  readonly productCards: Locator
  readonly emptyState: Locator

  constructor(page: Page) {
    this.page = page
    this.searchInput = page.locator('[data-testid="search-input"]')
    this.productCards = page.locator('[data-testid="product-card"]')
    this.emptyState = page.locator('[data-testid="empty-catalog"]')
  }

  async goto() {
    await this.page.goto('/')
  }

  async search(query: string) {
    const responsePromise = this.page.waitForResponse(
      resp => resp.url().includes('/api/v1/products') && resp.request().method() === 'GET'
    )
    await this.searchInput.fill(query)
    await responsePromise
  }

  async getProductCount() {
    return await this.productCards.count()
  }

  async expectLoaded() {
    await expect(this.productCards.first()).toBeVisible()
  }
}
```

## Test Structure with Requirement & Contract Mapping

```typescript
// Contracts: API-CATALOG@1 (verifier)
// _Requirements: 1.1, 1.2_
import { test, expect } from '@playwright/test'
import { CatalogPage } from '../pages/CatalogPage'

test.describe('Catalog Search [Req 1.1, 1.2]', () => {
  let catalogPage: CatalogPage

  test.beforeEach(async ({ page }) => {
    catalogPage = new CatalogPage(page)
    await catalogPage.goto()
  })

  test('1.1: filters products by keyword via /api/v1/products', async () => {
    await catalogPage.search('áo')

    const count = await catalogPage.getProductCount()
    expect(count).toBeGreaterThan(0)
    await expect(catalogPage.productCards.first()).toContainText(/áo/i)
  })

  test('1.2: renders empty state when no products match filter', async () => {
    await catalogPage.search('xyznonexistent123')

    await expect(catalogPage.emptyState).toBeVisible()
    expect(await catalogPage.getProductCount()).toBe(0)
  })
})
```

## Playwright Configuration

### Storefront (`frontend/playwright.config.ts`)

For deterministic UI/layout verification against the production bundle (`vite preview` on `:4173`) or full-stack integration against the Vite dev server (`:15173`):

```typescript
import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.BASE_URL || 'http://localhost:15173'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'dot' : 'list',
  use: {
    baseURL,
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  webServer: {
    command: 'npm run dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'chromium-320', use: { ...devices['Desktop Chrome'], viewport: { width: 320, height: 720 } } },
    { name: 'chromium-767', use: { ...devices['Desktop Chrome'], viewport: { width: 767, height: 900 } } },
    { name: 'chromium-1440', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
})
```

> For `frontend-admin/`, set `baseURL` and `webServer.url` to `http://localhost:15174`. Never leave dev servers running unbounded in the foreground outside Playwright's managed `webServer` lifecycle.

## Verifying `/api/v1` Status Envelope & Business Errors

When testing cart, checkout, or admin mutations, assert both the HTTP `/api/v1` status envelope and the Vietnamese business error feedback:

```typescript
// Contracts: API-CART@1 (verifier)
// _Requirements: 3.2, 3.4_
import { test, expect } from '@playwright/test'

test.describe('Cart Stock Limit [Req 3.2, 3.4]', () => {
  test('3.4: displays Vietnamese business error when adding beyond available stock', async ({ page }) => {
    await page.goto('/products/sample-slug')

    const addResponsePromise = page.waitForResponse(
      resp => resp.url().includes('/api/v1/cart/items') && resp.request().method() === 'POST'
    )

    await page.locator('[data-testid="quantity-input"]').fill('999')
    await page.locator('[data-testid="add-to-cart-btn"]').click()

    const response = await addResponsePromise
    expect(response.status()).toBe(409)

    const body = await response.json()
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('stock_limit')

    // User-facing Vietnamese business message must be shown via toast/alert
    await expect(page.getByText(body.error.message)).toBeVisible()
  })

  test('validation error (400) binds error.fields to form inputs', async ({ page }) => {
    await page.goto('/login')
    await page.locator('[data-testid="login-submit"]').click()

    await expect(page.locator('[data-testid="email-error"]')).toBeVisible()
  })
})
```

## Flaky Test Patterns

### Identify Flakiness

```bash
npx playwright test e2e/catalog/browse.spec.ts --repeat-each=5
```

### Common Causes & Fixes

**Race conditions:**
```typescript
// Bad: assumes element is ready immediately
await page.click('[data-testid="add-to-cart-btn"]')

// Good: auto-wait locator
await page.locator('[data-testid="add-to-cart-btn"]').click()
```

**Network timing:**
```typescript
// Bad: arbitrary timeout
await page.waitForTimeout(5000)

// Good: wait for the specific /api/v1 endpoint response
await page.waitForResponse(resp => resp.url().includes('/api/v1/cart'))
```

**Animation / transition timing:**
```typescript
// Good: wait for visibility before interacting
const drawer = page.locator('[data-testid="cart-drawer"]')
await expect(drawer).toBeVisible()
await drawer.locator('[data-testid="checkout-btn"]').click()
```

## Artifact & Evidence Reporting

When reporting E2E execution for `.dream` tasks or `verifying-feature-implementation`, include exact commands, requirement coverage, and outcomes:

```markdown
### E2E Verification Evidence
- **Command:** `npx playwright test e2e/cart/cart-checkout.spec.ts` (from `frontend/`)
- **Contracts Verified:** `API-CART@1 (verifier)`
- **Requirements Covered:** `3.2`, `3.4` — Pass (6/6 tests across viewports)
```

