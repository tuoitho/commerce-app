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

## E2E Execution Modes: Mode 2 (Default) vs. Mode 1 (Live Backend)

Playwright E2E suites in this repository support two execution modes. Both modes run in a real Chromium browser via Playwright (which auto-starts Vite via `webServer` in `playwright.config.ts`), verify responsive viewports (`1440x900` desktop and `375x812` mobile), capture step-by-step screenshots into `.dream/specs/<feature>/imgs/`, and generate `.dream/specs/<feature>/report.md`:

| Dimension | Mode 2 (Default): Contract-Verified Mock E2E (`page.route` 1:1) | Mode 1: Full-Stack Live Backend E2E |
|---|---|---|
| **Governance & Selection** | **Default mode** locked in `design.md` (`Testing Strategy`) and `tasks.md` unless the user explicitly requests Mode 1 at spec approval | Selected only when explicitly specified in the user-approved `design.md` / `tasks.md` or requested by the user |
| **Frontend Runtime** | Real Chromium + Vite (`:15173` / `:15174`) — no Go/PostgreSQL process required | Real Chromium + Vite (`:15173` / `:15174`) |
| **API Layer (`/api/v1`)** | Intercepted at browser network layer (`context.route` / `page.route`) with strict 1:1 Backend Contract verification | Proxied to real Go backend (`:18080`) + PostgreSQL |
| **Contract Fidelity** | Enforced by **4 Mandatory 1:1 Contract Parity Rules** + Backend `go test` cross-check | Enforced directly by live Go handlers |

> **Governance Rule:** The E2E execution mode is locked upfront in `design.md` and `tasks.md` when the user approves the specification, defaulting to **Mode 2 (Contract-Verified Mock E2E)**. During implementation, the agent MUST execute the exact mode approved in `tasks.md` and never switch modes autonomously.

### The 4 Mandatory Rules for Mode 2 (Contract-Verified Mock E2E — Level 2 Golden Snapshot Lock)

Ordinary `page.route()` mocks are brittle if the test author invents arbitrary JSON shapes or ignores request payloads. To make **Mode 2 (Contract-Verified Mock E2E)** 100% contractually identical to the backend without running a database or live backend server, every Mode 2 E2E suite MUST enforce all four rules (requiring zero pre-existing helper files in the repository):

1. **Rule 1 — Machine-Verified Golden Contract Snapshot Lock (`.dream/specs/<feature>/contract-snapshots.json`):**
   - **Backend Producer (Handler/Controller Unit Tests):** In the backend HTTP handler/controller tests (e.g., Go `httptest.NewRecorder()`, Node `supertest`, Python `TestClient`), execute the real router, middleware, handler, and JSON serializer in-memory (no live DB or server required) and write/assert the normalized HTTP status and JSON response envelopes (`200`, `201`, `400`, `401`, `403`, `404`, `409`) into `.dream/specs/<feature>/contract-snapshots.json`.
   - **Frontend Consumer (`npx playwright test`):** In Playwright Mode 2, load `.dream/specs/<feature>/contract-snapshots.json` directly. Never hand-write unverified status envelopes; fulfill routes from the snapshot entries and recursively assert 1:1 JSON key/type parity (`assertMatchesContractShape`) between any dynamic Playwright mock data and the backend-generated snapshot.
2. **Rule 2 — Inbound Request Contract Validation (Before Fulfilling):**
   - Never blindly return `200 OK`. Before fulfilling a route, inspect `route.request()` and assert:
     - **Auth Boundary:** On protected endpoints, verify `Authorization: Bearer <token>` header. If missing/invalid, fulfill using `snapshots['unauthenticated_401']`. If authenticated with an insufficient role, fulfill using `snapshots['forbidden_403']`.
     - **Method, Query & Payload Schema:** On `POST`/`PUT`/`PATCH`, parse `route.request().postDataJSON()` and enforce the exact validation rules of the backend handler (e.g., required fields, trimmed non-empty check, max length, numeric bounds). When invalid, fulfill using the backend's `400` validation snapshot (`snapshots['..._validation_400']`).
3. **Rule 3 — Outbound Full Status Envelope & Forbidden Key Verification:**
   - Fulfill all `/api/v1` JSON responses (except `204 No Content`) through an inline or local `fulfillFromContractSnapshot` helper that validates the Full Status Envelope structure (`{ success, message, data, error, meta: { timestamp, pagination? } }`), checks recursive key/type match against the backend snapshot, and asserts that forbidden internal/PII fields (e.g., `adminId`, `adminEmail` on public endpoints) are absent.
4. **Rule 4 — Stateful In-Memory Transitions Across Multi-Step Flows:**
   - Seed the mutable in-memory state store per test from `snapshots['..._200'].body.data`. When the UI triggers a `POST`/`PUT`/`PATCH`/`DELETE` mutation, update the in-memory state (including `omitempty` deletions like `delete target.adminReply`) so that subsequent `GET` requests, React Query invalidations, filter changes, or `page.reload()` calls return the updated state identically to the database.

### Self-Contained Contract-Verified Mock E2E Pattern (Level 2 Code Template)

Complete, ready-to-use reference files are bundled inside this skill's `examples/` directory (so copying `.agents/skills/` to any repository carries them automatically):
- `examples/contract-snapshot-helper.go` — Backend HTTP handler test helper (`AssertOrRecordContractSnapshot`) that records/verifies `.dream/specs/<feature>/contract-snapshots.json`.
- `examples/contract-snapshot-fixture.ts` — Playwright Mode 2 helper (`loadContractSnapshots`, `assertMatchesContractShape`, `fulfillFromContractSnapshot`).
- `examples/mode2-contract-mock.spec.ts` — Complete Mode 2 E2E spec mounting stateful, contract-verified routes and capturing `.dream/specs/<feature>/imgs/*.png`.

#### 1. Backend Handler Test Snapshot Helper (Example: Go `httptest`)

Include this small helper in the backend handler test package (or equivalent in the repository's backend stack) so running the backend unit test suite generates and verifies `.dream/specs/<feature>/contract-snapshots.json`:

```go
func assertOrRecordContractSnapshot(t *testing.T, feature, key, contractID, endpoint string, status int, rawBody []byte) {
	t.Helper()
	var parsed map[string]any
	require.NoError(t, json.Unmarshal(rawBody, &parsed))
	if meta, ok := parsed["meta"].(map[string]any); ok {
		if _, hasTS := meta["timestamp"]; hasTS {
			meta["timestamp"] = "2026-01-01T00:00:00Z"
		}
	}
	snapshotPath := filepath.Clean(filepath.Join("..", "..", "..", "..", ".dream", "specs", feature, "contract-snapshots.json"))
	snapshots := map[string]map[string]any{}
	if b, err := os.ReadFile(snapshotPath); err == nil && len(b) > 0 {
		require.NoError(t, json.Unmarshal(b, &snapshots))
	}
	entry := map[string]any{"contractId": contractID, "endpoint": endpoint, "status": status, "body": parsed}
	if _, exists := snapshots[key]; !exists || os.Getenv("UPDATE_CONTRACT_SNAPSHOTS") == "1" {
		snapshots[key] = entry
		require.NoError(t, os.MkdirAll(filepath.Dir(snapshotPath), 0o755))
		out, _ := json.MarshalIndent(snapshots, "", "  ")
		require.NoError(t, os.WriteFile(snapshotPath, append(out, '\n'), 0o644))
		return
	}
	expJSON, _ := json.Marshal(snapshots[key])
	actJSON, _ := json.Marshal(entry)
	assert.JSONEq(t, string(expJSON), string(actJSON))
}
```

#### 2. Playwright Snapshot Loader & 1:1 Shape Validator (`e2e/`)

```typescript
// Contracts: API-ADMIN-REVIEWS@1 (verifier); API-PUBLIC-REVIEWS@1 (verifier)
// Golden Snapshot Source: .dream/specs/<feature>/contract-snapshots.json
import fs from 'node:fs'
import path from 'node:path'
import { BrowserContext, Route, expect } from '@playwright/test'

export function loadContractSnapshots(feature: string) {
  const file = path.resolve(process.cwd(), `../.dream/specs/${feature}/contract-snapshots.json`)
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, {
    contractId: string
    endpoint: string
    status: number
    body: { success: boolean; message: string; data: any; error: any; meta: Record<string, any> }
  }>
}

export function assertMatchesContractShape(actual: any, golden: any, optionalKeys: string[] = [], p = '$') {
  if (golden === null || actual === null) return
  if (Array.isArray(golden)) {
    expect(Array.isArray(actual), `Expected array at ${p}`).toBe(true)
    if (golden.length > 0 && actual.length > 0) {
      actual.forEach((item: any, i: number) => assertMatchesContractShape(item, golden[0], optionalKeys, `${p}[${i}]`))
    }
    return
  }
  if (typeof golden === 'object') {
    expect(typeof actual === 'object' && !Array.isArray(actual), `Expected object at ${p}`).toBe(true)
    for (const k of Object.keys(golden)) {
      if (!optionalKeys.includes(k)) expect(k in actual, `Missing Backend Contract key "${k}" at ${p}`).toBe(true)
    }
    for (const k of Object.keys(actual)) {
      expect(k in golden || optionalKeys.includes(k), `Invented key "${k}" at ${p} not in Backend snapshot`).toBe(true)
      if (k in golden && actual[k] !== undefined) assertMatchesContractShape(actual[k], golden[k], optionalKeys, `${p}.${k}`)
    }
    return
  }
  expect(typeof actual, `Type mismatch at ${p}`).toBe(typeof golden)
}

export async function fulfillFromContractSnapshot(
  route: Route,
  snapshot: ReturnType<typeof loadContractSnapshots>[string],
  overrides?: { data?: any; pagination?: Record<string, any>; optionalKeys?: string[]; forbiddenKeys?: string[] }
) {
  const data = overrides && 'data' in overrides ? overrides.data : snapshot.body.data
  if (snapshot.body.data !== null && data !== null) {
    assertMatchesContractShape(data, snapshot.body.data, overrides?.optionalKeys ?? [])
  }
  const pagination = overrides?.pagination ?? snapshot.body.meta?.pagination
  const envelope = {
    ...snapshot.body,
    data,
    meta: { timestamp: new Date().toISOString(), ...(pagination ? { pagination } : {}) },
  }
  const serialized = JSON.stringify(envelope)
  for (const forbidden of overrides?.forbiddenKeys ?? []) {
    expect(serialized).not.toContain(`"${forbidden}":`)
  }
  await route.fulfill({ status: snapshot.status, contentType: 'application/json; charset=utf-8', body: serialized })
}
```

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

## Page Object Model (POM) & UI Refactoring Resilience

To ensure E2E suites do not break when the frontend undergoes visual redesigns (changing Tailwind styles, replacing icons, switching `<table>` layouts to card grids, or swapping modal libraries):

1. **Add Stable `data-testid` Attributes to Structural & Interactive Elements:** When building or updating React components in `frontend/` or `frontend-admin/`, attach semantic `data-testid` attributes to key containers, list items/rows, filters, form inputs, and action buttons (e.g. `data-testid="review-item"`, `data-testid="reply-submit-btn"`, `data-testid="seller-reply-block"`), and always add `aria-label` to icon-only buttons.
2. **Never Select by Styling or Fragile DOM Hierarchy:** Never use Tailwind utility classes (`.bg-slate-900`, `.rounded-2xl`), SVG paths, or deep tag chains (`div > div > span`) in E2E tests. Prefer `[data-testid="..."]` and accessible roles (`getByRole('dialog')`, `getByRole('alert')`).
3. **Isolate All Selectors Inside Page Objects (`e2e/pages/*Page.ts`):** Test files (`*.spec.ts`) must call high-level behavioral methods on Page Objects rather than inline locators so any future DOM restructuring requires updating only the Page Object.

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
- **Execution Mode:** `Mode 1: Full-Stack Live Backend E2E` | `Mode 2: Contract-Verified Mock E2E (1:1 Backend Contract Lock)`
- **Command:** `npx playwright test e2e/<feature>.spec.ts`
- **Contracts Verified:** `API-ADMIN-INVENTORY@1 (verifier)`
- **Requirements Covered:** `1.1, 2.1, 2.3`

## 1:1 Backend Contract Verification Matrix (Required for Mode 2, Recommended for Mode 1)

| Contract ID | Endpoint | Go Handler & Test Source | Inbound Request Assertions | Outbound Envelope & State Assertions |
|---|---|---|---|---|
| `API-ADMIN-INVENTORY@1` | `PATCH /api/v1/admin/inventory/:id` | `backend/internal/delivery/http/admin_inventory_handler.go` (`admin_inventory_handler_test.go`) | `Authorization: Bearer <admin_jwt>`, numeric `stockQuantity >= 0` (`400 validation_error` on negative) | `200 OK` Full Status Envelope + in-memory store updated for subsequent `GET /api/v1/admin/inventory` |

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

