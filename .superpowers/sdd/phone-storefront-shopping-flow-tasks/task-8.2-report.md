# Task 8.2 Review Fix Evidence

## Status

All Important review findings for task 8.2 are fixed.

## Findings Fixed

- `frontend/playwright.config.ts` now uses `npm run build && npm run preview -- --host 127.0.0.1` on port `4173`, not the Vite development server.
- `forbidOnly` is unconditionally `true`.
- `fullyParallel` is disabled for deterministic viewport execution; the required verification command uses one worker.
- `@playwright/test` has one declaration at version `^1.62.1` in `frontend/package.json`, with one matching lockfile entry.
- `frontend/e2e/storefront.spec.ts` captures `pageerror` and error-level console messages for the complete test lifetime and asserts both collections in `afterEach`.
- Keyboard interactions use real `page.keyboard.press('Tab')`, `page.keyboard.press('Shift+Tab')`, `page.keyboard.press('Enter')`, and `page.keyboard.press('Space')` traversal/activation. The `tabTo` helper verifies the active element and visible focus indicator.
- The catalog typing flow uses delayed keyboard typing so URL-backed debounced updates cannot lose characters; the 600px project passes.
- `frontend/e2e/fixtures.ts` validates request methods and body shapes, rejects unauthenticated mutations, and records/aborts every unhandled API request instead of returning a permissive fallback response.
- Vitest excludes both `node_modules/**` and `e2e/**` so Playwright files cannot be collected by the unit-test runner.

## Exact Verification Evidence

Command:

```text
npm run test:e2e -- --workers=1
```

Result:

```text
Running 20 tests using 1 worker
20 passed (1.0m)
```

The 20 passing tests cover Chromium projects `chromium-320`, `chromium-600`, `chromium-900`, and `chromium-1180`. The `chromium-600` project passed all five flows.

Command:

```text
npm run lint
```

Result:

```text
Process exited with code 0
3 existing warnings:
src/auth/AuthProvider.tsx:114:17 react(only-export-components)
src/api/error.ts:7:18 typescript(no-unsafe-declaration-merging)
src/cart/CartProvider.tsx:120:17 react(only-export-components)
```

Command:

```text
npm test
```

Result:

```text
Test Files  16 passed (16)
Tests  105 passed (105)
```

Command:

```text
npm run build
```

Result:

```text
vite v8.2.1 building client environment for production
49 modules transformed
built successfully
Process exited with code 0
```

## Concerns

- Lint warnings are pre-existing and unrelated to task 8.2.
- E2E verification is intentionally run with one worker on this Windows environment to avoid local browser-process memory pressure; all four viewport projects still execute.
