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

## Real Authentication & End-to-End Workflow Testing

### 1. Role Credentials & Bootstrap Strategy

- **Admin Role (`frontend-admin/` on `:15174`):**
  - The backend automatically bootstraps the admin user from `backend/.env` (`ADMIN_BOOTSTRAP_EMAIL` and `ADMIN_BOOTSTRAP_PASSWORD`, defaulting in `backend/.env.example` to `admin@example.com` / `Admin123456@`).
- **Customer Role (`frontend/` on `:15173`):**
  - `db/seed/catalog.sql` seeds catalog products/variants only. For customer E2E flows, authenticate via `POST /api/v1/auth/login` with deterministic test credentials (e.g., `e2e.customer@example.com` / `Customer123456@`) and fall back to `POST /api/v1/auth/register` if the user does not exist yet.

### 2. Fast API Auth Bootstrap (`localStorage` + `httpOnly` Cookie Injection)

When `POST /api/v1/auth/login` (or `/api/v1/auth/register`) succeeds, the backend (`internal/delivery/http/auth_handler.go`) returns two things:
1. **JSON payload (`body.data`):** `{ accessToken, user }` — stored by the SPA in `localStorage` (`accessToken` and `authUser`).
2. **`Set-Cookie` header:** `refresh_token=<token>; Path=/api/v1/auth; HttpOnly; SameSite=Lax` — stored in browser cookies for `/api/v1/auth/refresh`.

In Playwright, calling `page.request.post('/api/v1/auth/login')` (using `page.request`, which shares the cookie jar with `page.context()`) **automatically sets the `refresh_token` `httpOnly` cookie in the browser context**, or you can set it explicitly via `page.context().addCookies(...)` if obtained via `curl`:

```typescript
import { Page, expect } from '@playwright/test'

export async function loginViaApi(page: Page, role: 'admin' | 'customer') {
  const email =
    role === 'admin'
      ? process.env.ADMIN_BOOTSTRAP_EMAIL || 'admin@example.com'
      : process.env.E2E_CUSTOMER_EMAIL || 'e2e.customer@example.com'
  const password =
    role === 'admin'
      ? process.env.ADMIN_BOOTSTRAP_PASSWORD || 'Admin123456@'
      : process.env.E2E_CUSTOMER_PASSWORD || 'Customer123456@'

  // Using page.request shares the BrowserContext cookie jar, so the Set-Cookie
  // header (`refresh_token`, Path=/api/v1/auth, HttpOnly) is automatically stored!
  let resp = await page.request.post('/api/v1/auth/login', {
    data: { email, password },
  })

  // Auto-register customer if not yet seeded in DB
  if (resp.status() === 401 && role === 'customer') {
    resp = await page.request.post('/api/v1/auth/register', {
      data: { email, password },
    })
  }

  expect(resp.ok()).toBeTruthy()
  const body = await resp.json()
  const { accessToken, user } = body.data

  // If injecting a refresh_token obtained externally (e.g., via curl), you can
  // also set the HttpOnly cookie explicitly on the browser context:
  // await page.context().addCookies([{
  //   name: 'refresh_token',
  //   value: externalRefreshToken,
  //   domain: 'localhost',
  //   path: '/api/v1/auth',
  //   httpOnly: true,
  //   sameSite: 'Lax',
  // }])

  // Inject real accessToken and authUser into localStorage before navigating
  await page.addInitScript(
    ({ token, usr }) => {
      window.localStorage.setItem('accessToken', token)
      window.localStorage.setItem('authUser', JSON.stringify(usr))
    },
    { token: accessToken, usr: user }
  )
}
```

### 3. Complete E2E Flow Example (With Screenshot Evidence)

```typescript
// Contracts: API-ADMIN-INVENTORY@1 (verifier)
// _Requirements: 1.1, 2.1, 2.3_
import path from 'node:path'
import { test, expect } from '@playwright/test'
import { loginViaApi } from './fixtures/auth'

const FEATURE_SPEC_DIR = path.resolve(process.cwd(), '../.dream/specs/inventory-management')
const IMGS_DIR = path.join(FEATURE_SPEC_DIR, 'imgs')

test.describe('Admin Inventory Management E2E [Req 1.1, 2.1, 2.3]', () => {
  test('authenticates as admin, updates variant stock, and captures visual evidence', async ({ page }) => {
    // 1. Authenticate via real API: sets both refresh_token HttpOnly cookie and localStorage
    await loginViaApi(page, 'admin')

    // 2. Navigate directly to the protected screen and capture initial state
    await page.goto('/inventory')
    await expect(page.locator('[data-testid="inventory-table"]')).toBeVisible()
    await page.screenshot({ path: path.join(IMGS_DIR, '01-inventory-list-before.png'), fullPage: true })

    // 3. Perform the business mutation and assert the /api/v1 envelope
    const updateResp = page.waitForResponse(
      resp => resp.url().includes('/api/v1/admin/inventory') && resp.request().method() === 'PATCH'
    )
    await page.locator('[data-testid="stock-input-0"]').fill('50')
    await page.locator('[data-testid="save-stock-btn-0"]').click()
    expect((await updateResp).status()).toBe(200)

    // 4. Verify updated state and capture desktop + mobile evidence
    await expect(page.locator('[data-testid="stock-input-0"]')).toHaveValue('50')
    await page.screenshot({ path: path.join(IMGS_DIR, '02-inventory-updated-desktop.png'), fullPage: true })

    await page.setViewportSize({ width: 375, height: 812 })
    await page.screenshot({ path: path.join(IMGS_DIR, '03-inventory-updated-mobile.png'), fullPage: true })
  })
})
```

## Visual Evidence & `.dream/specs/<feature>/report.md`

For every UI-affecting feature under `.dream/specs/<feature>/`, the final E2E verification leaf task MUST produce two durable evidence outputs inside the feature specification directory:

1. **Screenshots Directory (`.dream/specs/<feature>/imgs/`):**
   - Store numbered, descriptive PNG screenshots captured during the real Playwright E2E run (e.g., `01-login-success.png`, `02-before-action.png`, `03-after-action-desktop.png`, `04-after-action-mobile.png`, `05-error-validation-state.png`).
2. **Feature E2E Report (`.dream/specs/<feature>/report.md`):**
   - Summarize the executed E2E scenarios, commands, verified contracts, requirement IDs, and embed/link every screenshot using relative paths (`./imgs/<filename>.png`).

### Template for `.dream/specs/<feature>/report.md`

```markdown
# E2E Verification Report — <feature>

- **Status:** PASS
- **Command:** `npx playwright test e2e/<feature>.spec.ts`
- **Contracts Verified:** `API-ADMIN-INVENTORY@1 (verifier)`
- **Requirements Covered:** `1.1, 2.1, 2.3`

## Scenario Walkthrough & Visual Evidence

### 1. Đăng nhập hệ thống (`Req 1.1`)
- Thực hiện đăng nhập thật qua `/login` (`POST /api/v1/auth/login` -> `200 OK`).
- Ảnh bằng chứng:
  ![Admin Login Success](./imgs/01-admin-login-success.png)

### 2. Danh sách tồn kho trước khi cập nhật (`Req 2.1`)
- Điều hướng tới `/inventory`, dữ liệu hiển thị đầy đủ từ `/api/v1/admin/inventory`.
- Ảnh bằng chứng:
  ![Inventory Before Update](./imgs/02-inventory-list-before.png)

### 3. Cập nhật tồn kho & Kiểm tra Responsive (`Req 2.3`)
- Cập nhật số lượng tồn kho lên `50` (`PATCH /api/v1/admin/inventory` -> `200 OK`).
- Ảnh bằng chứng Desktop (`1440x900`) và Mobile (`375x812`):
  ![Inventory Updated Desktop](./imgs/03-inventory-updated-desktop.png)
  ![Inventory Updated Mobile](./imgs/04-inventory-updated-mobile.png)
```

## Handling Failures in the Final E2E Leaf Task

Because the E2E verification task is the final leaf task (`verifier` role), a failing E2E run is handled based on root cause (`systematic-debugging`):

1. **Integration / Implementation Defect (Within Approved Spec):**
   - If the real browser run exposes a bug in earlier backend or frontend code (e.g., mismatched field binding, proxy/CORS issue, missing query invalidation, broken responsive layout, or unhandled API state) that violates the already-approved `requirements.md` / `design.md`:
   - The implementer fixes the root cause across the affected backend/frontend files directly within this task, re-runs the affected unit/integration tests, re-runs the Playwright E2E suite until green, and regenerates `.dream/specs/<feature>/imgs/*.png` and `.dream/specs/<feature>/report.md`.
2. **Reviewer / Verifier Rejection (Task Fix Loop or Verification Repair Wave):**
   - If the task reviewer or `verifying-feature-implementation` flags missing E2E coverage, a visual defect visible in `imgs/`, or an unverified requirement, the implementer repairs the code/test, re-runs Playwright to refresh `imgs/` and `report.md`, and submits the updated evidence to the scoped re-review.
3. **Contract or Specification Defect (Requires CCR):**
   - If the real E2E run reveals that an approved contract (`#### Contract <ID> (rev <N>)`) or requirement is itself wrong or incomplete, **STOP** immediately. Do not silently patch around the contract. Invoke `managing-contract-changes` to record `CCR-<NNN>`, reopen the affected `provider`/`consumer`/`verifier` tasks, and resume in dependency order.

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

