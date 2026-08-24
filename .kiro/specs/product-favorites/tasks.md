# Implementation Plan

- [x] 1. Backend favorites collection

- [x] 1.1 Implement persistent favorite collection and current-product projection
  - **Produces:** Migration `product_favorites`, sqlc queries/generated bindings, domain favorite model/repository contract, and a repository that atomically lists, adds, or removes a user's favorites while returning the canonical ordered collection.
  - **Scope:** Use TDD to add the next migration pair; enforce unique user–product ownership and cascade rules; project current category/image/active-variant price and stock data; distinguish `active`, active-but-out-of-stock, `unavailable`, and `deleted`; preserve relations through product soft-delete; keep duplicate add and absent remove idempotent; include focused repository and integration tests. Apply the migration and regenerate sqlc output without editing generated files manually.
  - **Consumes:** Existing `users`, `products`, `categories`, `product_images`, and `product_variants` tables; catalog's public-product predicate; `MoneyVND`; the persistence, ordering, nullability, and transaction invariants in `design.md`.
  - **Acceptance:** Each user sees only their relations ordered by `favorited_at DESC, product_id ASC`; duplicate add creates no row and does not change order; absent remove succeeds; current product fields are returned; out-of-stock products with an active variant remain `active`; soft-deleted products are `deleted`; active products without an active variant are `unavailable`; both non-public states have nullable price/stock fields; failed mutation/list transactions leave no partial commit.
  - **Verification:** Focused domain/repository tests and database integration tests covering uniqueness, isolation, order, lifecycle projections, cascades, idempotency, rollback, and empty `[]` semantics; successful migration application and inspected sqlc generated diff.
  - _Requirements: 2.2, 2.5, 2.9, 3.1, 3.2, 3.4, 3.5, 3.6, 3.7, 4.4, 4.5, 4.6, 4.7, 5.1, 5.2, 5.3, 5.4_

- [x] 1.2 Expose the authenticated Full Status favorite API
  - **Produces:** Protected `GET /api/v1/favorites`, `PUT /api/v1/favorites/:productId`, and `DELETE /api/v1/favorites/:productId` routes returning the complete `FavoriteProductResponse[]` contract; use case, handler, error mapping, router dependency, Wire providers, and committed generated Wire output.
  - **Scope:** Use TDD to validate UUIDs at the use-case boundary; take user identity only from `AuthRequired`/`callerUserID`; map domain data to exact active/unavailable/deleted nullability; return Vietnamese mutation and business-error messages; preserve idempotent 200 behavior; add focused use-case, handler, router, envelope, ownership, and composition tests; regenerate Wire output rather than editing it manually.
  - **Consumes:** Repository deliverable from 1.1; approved HTTP/wire contract in `design.md`; existing JWT guard, `writeSuccess`, `writeError`, `ErrProductNotFound`, `ResponseEnvelope`, and Wire composition conventions.
  - **Acceptance:** Unauthorized requests are rejected before data access; malformed `productId` returns HTTP 400 `validation_error` with `fields.productId`; adding a new non-public product returns HTTP 404 `product_not_found`; successful routes return HTTP 200 with direct array data, `[]` rather than null when empty, exact nullable fields, stable ordering, and no client-supplied user or favorite identifier.
  - **Verification:** Focused use-case and HTTP tests for every route, envelope, error, message, auth/ownership, idempotency, empty response, serialization, and two-user isolation; server composition test/build after Wire regeneration.
  - **Depends on:** 1.1, because the concrete repository and generated database bindings are runtime prerequisites.
  - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.8, 2.9, 3.1, 3.2, 3.4, 3.5, 3.6, 3.7, 4.4, 4.5, 4.7, 5.3, 5.4, 5.5, 5.6_

- [x] 2. Storefront favorite state and interactions

- [x] 2.1 Implement the favorites API client and authenticated shared state
  - **Produces:** Frontend `FavoriteProduct` types, `favoritesApi`, and `FavoritesProvider` contract with `items`, derived favorite IDs, loading/error state, per-product pending state, refresh, add, remove, and toggle operations.
  - **Scope:** Use TDD and `apiClient` for all three approved routes; load only after auth restoration; replace the full list after successful mutation; retain state on failure; clear all account-scoped state on logout; prevent stale responses from an earlier session or user from restoring data; add focused API/provider tests.
  - **Consumes:** Approved HTTP contract in `design.md`; existing `apiClient`, `ApiError`, token refresh behavior, and `AuthProvider` state. This task may use mocked API responses and does not depend on backend implementation to discover the contract.
  - **Acceptance:** A restored authenticated session loads once; unauthenticated state makes no favorite request; every successful mutation synchronizes collection and ID Set; concurrent operations are pending per product; list failure remains distinguishable from empty; logout/account changes clear state immediately; late stale responses are ignored.
  - **Verification:** API tests for paths/methods/unwrapping/nullability and provider tests for auth transitions, success/failure, pending behavior, retry, cross-component state, logout, and stale-response isolation.
  - _Requirements: 2.1, 2.3, 2.4, 2.6, 2.7, 3.7, 3.8, 3.9, 4.1, 4.2, 5.1, 5.2, 5.7_

- [x] 2.2 Add the accessible favorite toggle to product discovery and detail flows
  - **Produces:** A reusable `FavoriteToggleButton` integrated into `ProductCard` and `ProductDetailPage`, covering home, catalog, and detail entry points with account-only redirect behavior.
  - **Scope:** Use TDD to read/toggle state through `FavoritesProvider`; redirect guests to login with the current path and search; never queue or replay the mutation after login; disable only the affected control while pending; show Vietnamese success/error feedback; preserve existing product links, price/stock rendering, cart behavior, keyboard interaction, and focus treatment; add component/page regression tests.
  - **Consumes:** Provider deliverable from 2.1; existing `AuthProvider`, login `?redirect=` flow, router hooks, toast conventions, `ProductCard`, and `ProductDetailPage`.
  - **Acceptance:** Every supported product card and detail page exposes the correct pressed/unpressed state; changes synchronize across mounted consumers; guest activation returns to the originating URL without changing favorites until a second user action; rapid repeated activation cannot duplicate requests; failure preserves the prior state; public product browsing and add-to-cart behavior remain intact.
  - **Verification:** Focused button, ProductCard, home/catalog reuse, and detail tests for authenticated/guest flows, current-path redirect, no replay, success/failure, rapid clicks, semantic button, accessible name/pressed state, keyboard activation, focus visibility, and existing interaction regressions.
  - **Depends on:** 2.1, because the shared provider is the implemented state interface consumed by the UI.
  - _Requirements: 1.1, 1.2, 1.4, 1.5, 2.1, 2.3, 2.6, 2.7, 4.1, 4.2, 4.3, 6.1, 6.2, 6.3, 6.4_

- [x] 2.3 Build the favorites page and authenticated navigation
  - **Produces:** `/favorites` route, responsive `FavoritesPage`, active/unavailable/deleted favorite presentations, and desktop/mobile Header navigation for authenticated customers.
  - **Scope:** Use TDD to handle auth restoration and guest redirect; render loading, empty, error/retry, and ordered list states; reuse active product presentation without weakening existing links/actions; render deleted items with the exact note “Sản phẩm đã bị xóa” and unavailable items with “Sản phẩm hiện không khả dụng”; omit public detail links and purchasable price/stock for both states while keeping remove available; update Header and router tests; preserve existing navigation behavior.
  - **Consumes:** Provider deliverable from 2.1, toggle/product-card integration from 2.2, approved `FavoriteProduct` nullability contract, existing `Header`, `EmptyState`, routing and responsive visual conventions.
  - **Acceptance:** The route is protected by client behavior and returns guests through the existing redirect flow; authenticated desktop/mobile navigation reaches the page; active items link to detail and expose current price/stock; out-of-stock active items say “Hết hàng”; deleted and unavailable items show their exact distinct notes and remain recognizable/removable without a detail link or misleading purchase data; loading is never shown as empty; failures expose retry; empty state links to catalog; layout and actions remain usable without unintended horizontal scrolling.
  - **Verification:** Focused page, Header, router and accessibility tests for all data/auth states, exact deleted/unavailable notes, null-field rendering, removal, retry, active navigation and mobile/desktop navigation; representative responsive and keyboard verification for the affected UI.
  - **Depends on:** 2.1 and 2.2, because the page consumes the provider and reuses the implemented active-card toggle behavior.
  - _Requirements: 1.3, 1.4, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 4.4, 4.5, 4.7, 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 3. Cross-boundary favorite workflow

- [x] 3.1 Verify the storefront against the implemented favorite API contract
  - **Produces:** Bounded integration/E2E evidence for the account-only favorite lifecycle and focused regression coverage for directly affected catalog, auth, Header and product-detail flows.
  - **Scope:** Add cross-boundary tests first, then exercise login redirect, explicit post-login add, persistence across a new authenticated session, list display, cross-surface state, remove, empty state and account isolation against the real API contract; verify active/out-of-stock/unavailable/deleted response handling at the boundary; correct only contract integration defects within the feature scope.
  - **Consumes:** Completed backend API from 1.2, completed storefront workflow from 2.3, database migration, existing test harness and approved shared contract from `design.md`.
  - **Acceptance:** The supported workflow succeeds without client/server payload adaptation or hidden identifiers; data survives session restoration and remains isolated by account; soft-deleted favorites render as deleted, active products without active variants render as unavailable, and public catalog/detail behavior remains unchanged; failed requests do not leave contradictory UI state.
  - **Verification:** Focused cross-boundary integration or Playwright scenarios plus targeted regression tests for the existing public catalog/detail, login redirect, Header, and admin product soft-delete compatibility anchors.
  - **Depends on:** 1.2 and 2.3, because this task verifies the implemented producer and consumer together.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.3, 2.4, 2.7, 3.1, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.1, 5.2, 5.3, 5.4, 5.5, 5.7_
