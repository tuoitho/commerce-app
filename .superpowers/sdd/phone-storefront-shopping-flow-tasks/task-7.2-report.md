# Task 7.2 Review Evidence

## Status

Task 7.2 is implemented and checked in the canonical Kiro task list.

- `CartPage` exposes a text `role="status"` live region for successful row selection changes.
- `CartPage` exposes the same observable feedback for successful select-all and unselect-all changes.
- `CartProvider` mutation methods return an explicit `Promise<boolean>` result: `true` only after a confirmed response is applied, and `false` after failure or stale-session invalidation.
- `CartPage` gates selection success announcements on that explicit `true` result; failed row and select-all mutations retain the provider error alert and announce no success.
- Selection mutations remain backend-backed through `CartProvider`; the page does not optimistically alter selection state.
- The summary renders the backend-confirmed selected line count and valid-only VND total with the existing BigInt formatter.

## Persistence Evidence

`frontend/src/cart/CartProvider.test.tsx` contains a stateful fake `CartApi` test that:

- adds a line and verifies the backend response marks the new available line selected by default;
- applies a row selection change and verifies the fake backend state and returned summary;
- applies bulk selection and verifies valid lines become selected while the out-of-stock line remains unselected;
- unmounts the first provider, mounts a fresh provider/page against the same fake backend, and verifies the persisted valid selection and disabled, unselected invalid line.

`frontend/src/pages/CartPage.test.tsx` verifies the observable row and bulk success messages, selected line count, valid-only BigInt total, zero-selection CTA state, and checkout scope message.

Failure regressions cover both row and select-all mutations returning `false` and assert that the error alert remains while the summary has no success status. `frontend/src/cart/CartProvider.test.tsx` also verifies rejected row and bulk API operations resolve to `false`, preserving the mutation queue contract without swallowing success semantics.

## Files

- `.kiro/specs/phone-storefront-shopping-flow/tasks.md`
- `.superpowers/sdd/phone-storefront-shopping-flow-tasks/task-7.2-report.md`
- `frontend/src/pages/CartPage.tsx`
- `frontend/src/pages/CartPage.test.tsx`
- `frontend/src/cart/CartProvider.tsx`
- `frontend/src/cart/CartProvider.test.tsx`

Playwright and CSS were not changed.

## Verification

- Focused tests: 24 passed in `src/pages/CartPage.test.tsx` and `src/cart/CartProvider.test.tsx`
- Full frontend tests: 104 passed across 16 test files
- `npm run lint`: passed with 3 existing warnings
- `npm run build`: passed

## Concerns

- The existing lint warnings in `src/api/error.ts`, `src/auth/AuthProvider.tsx`, and `src/cart/CartProvider.tsx` are unrelated to this change.
- Checkout/order creation and payment remain outside task scope.

## Final Fix Evidence

- Regression test: `frontend/src/pages/CartPage.test.tsx` now covers a successful row selection mutation followed by a failed mutation; the prior success status is cleared and the provider error alert remains.
- Focused command: `npm test -- src/pages/CartPage.test.tsx`
- Focused result: 1 test file passed, 14 tests passed.
- Full command: `npm test`
- Full result: 16 test files passed, 105 tests passed.
- Lint command: `npm run lint`
- Lint result: passed with 3 existing warnings in `src/cart/CartProvider.tsx`, `src/api/error.ts`, and `src/auth/AuthProvider.tsx`.
- Build command: `npm run build`
- Build result: passed; Vite transformed 49 modules and emitted the production bundle.
