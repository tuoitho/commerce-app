# Product Favorites Workstream Tasks

Status: COMPLETED

## Contract baseline

| Contract | Revision | Status |
|---|---:|---|
| FAVORITES-API | 1 | FROZEN |
| CATALOG-VIEWER | 1 | FROZEN |
| FAVORITE-AUTH-REDIRECT | 1 | FROZEN |
| FAVORITE-SESSION-STATE | 1 | FROZEN |
| FAVORITE-UI | 1 | FROZEN |
| FAVORITE-PERSISTENCE | 1 | FROZEN |

## Execution DAG

```text
BE-01 ──┬── BE-02 ──┐
        └── BE-03 ──┼── INT-01
FE-01 ──── FE-02 ───┤
             └ FE-03┘
```

`backend-commerce` retains one implementation owner across BE-01 through BE-03. `frontend-customer` retains one implementation owner across FE-01 through FE-03. The workstreams may execute concurrently after this task plan is approved.

## Workstream: backend-commerce

Run backend commands from `backend/`; run root database or aggregate commands only when they are explicitly named as root commands.

### BE-01 — Persist unique customer favorites and provide contract-compliant reads

```yaml
id: BE-01
owner: backend-commerce
outcome: Persist unique customer-product favorites, enforce active-product eligibility, and provide scoped batch and inactive-capable paginated reads.
contracts:
  FAVORITE-PERSISTENCE: 1
depends_on: []
risk: high
verification:
  - migration-contract: apply the up migration and execute ../.dream/specs/product-favorites/contracts/persistence.assertions.sql
  - migration-reversal: apply the down migration and verify the prior schema, then reapply up
  - generation: run sqlc generate and inspect committed generated output
  - repository-contract: execute FAVORITE-PERSISTENCE revision 1 repository scenarios
  - focused-tests: go test ./internal/repository -run Favorite
  - integration-tests: go test -tags=integration ./internal/repository -count=1 -timeout=5m
status: completed
verified_against:
  FAVORITE-PERSISTENCE: 1
```

**Acceptance scenarios:** `FAVORITE-PERSISTENCE-001`, `FAVORITE-PERSISTENCE-002`, `FAVORITE-PERSISTENCE-003`, `FAVORITE-PERSISTENCE-004`, `FAVORITE-PERSISTENCE-005`, `FAVORITE-PERSISTENCE-006`, `FAVORITE-PERSISTENCE-007`, `FAVORITE-PERSISTENCE-008`, `FAVORITE-PERSISTENCE-009`, `FAVORITE-PERSISTENCE-010`

**Architectural constraints:** `product_favorites` owns only membership and first favorite timestamp; catalog tables remain the product source of truth. Every relationship query is customer-scoped. Database uniqueness, exact cascades, fixed ordering, active eligibility, and migration reversibility follow FAVORITE-PERSISTENCE revision 1. Generated sqlc output is regenerated, never edited manually.

### BE-02 — Provide the authenticated Favorites API

```yaml
id: BE-02
owner: backend-commerce
outcome: Provide authenticated list, idempotent add, and idempotent remove operations with fixed 12-item pagination and exact Full Status Envelopes.
contracts:
  FAVORITES-API: 1
  FAVORITE-PERSISTENCE: 1
depends_on: [BE-01]
risk: high
verification:
  - usecase-contract: execute add, remove, isolation, eligibility, pagination, and system-failure scenarios
  - provider-contract: execute FAVORITES-API-001 through FAVORITES-API-016 against the Gin router
  - focused-tests: go test ./internal/usecase/favorite ./internal/delivery/http -run Favorite
  - composition: run make wire, inspect wire_gen.go, and run go test ./cmd/server
  - regression: go test ./...
status: completed
verified_against:
  FAVORITES-API: 1
  FAVORITE-PERSISTENCE: 1
```

**Acceptance scenarios:** `FAVORITES-API-001`, `FAVORITES-API-002`, `FAVORITES-API-003`, `FAVORITES-API-004`, `FAVORITES-API-005`, `FAVORITES-API-006`, `FAVORITES-API-007`, `FAVORITES-API-008`, `FAVORITES-API-009`, `FAVORITES-API-010`, `FAVORITES-API-011`, `FAVORITES-API-012`, `FAVORITES-API-013`, `FAVORITES-API-014`, `FAVORITES-API-015`, `FAVORITES-API-016`

**Architectural constraints:** favorite state transitions are owned only by the favorite use case. Customer identity comes only from verified JWT context, customer role is required, errors and success payloads follow FAVORITES-API revision 1, and logs never include tokens, secrets, or complete database URLs. Delivery depends on use case and domain boundaries rather than repositories.

### BE-03 — Add personalized viewer state without changing intrinsic catalog behavior

```yaml
id: BE-03
owner: backend-commerce
outcome: Add caller-specific viewer.isFavorite to public product list, featured, and detail responses through one scoped batch read while preserving catalog behavior.
contracts:
  CATALOG-VIEWER: 1
  FAVORITE-PERSISTENCE: 1
depends_on: [BE-01]
risk: high
verification:
  - provider-contract: execute CATALOG-VIEWER-001 through CATALOG-VIEWER-007 and CATALOG-VIEWER-009 through CATALOG-VIEWER-013
  - query-count: prove one batch favorite lookup for authenticated collections and none for anonymous collections
  - focused-tests: go test ./internal/delivery/http -run Catalog
  - backend-tests: make test
  - static-analysis: make vet
  - composition: run make wire, inspect wire_gen.go, and verify no manual generated-file edits
status: completed
verified_against:
  CATALOG-VIEWER: 1
  FAVORITE-PERSISTENCE: 1
```

**Acceptance scenarios:** `CATALOG-VIEWER-001`, `CATALOG-VIEWER-002`, `CATALOG-VIEWER-003`, `CATALOG-VIEWER-004`, `CATALOG-VIEWER-005`, `CATALOG-VIEWER-006`, `CATALOG-VIEWER-007`, `CATALOG-VIEWER-009`, `CATALOG-VIEWER-010`, `CATALOG-VIEWER-012`, `CATALOG-VIEWER-013`

**Architectural constraints:** catalog domain products remain intrinsic and caller-independent. Optional customer authentication distinguishes missing credentials from invalid supplied credentials. Delivery composes viewer state after catalog reads and performs no per-product favorite queries. Existing catalog membership, ordering, fields, filters, pagination, featured selection, and detail semantics remain unchanged.

## Workstream: frontend-customer

Run all commands in this workstream from `frontend/`.

### FE-01 — Provide favorite API access, safe auth return, and session state coordination

```yaml
id: FE-01
owner: frontend-customer
outcome: Provide typed favorite API access, safe local login return, and optimistic session state with rollback, coalescing, and customer-change reset.
contracts:
  FAVORITES-API: 1
  CATALOG-VIEWER: 1
  FAVORITE-AUTH-REDIRECT: 1
  FAVORITE-SESSION-STATE: 1
depends_on: []
risk: high
verification:
  - consumer-contract: compile contracts/frontend.contract.ts and frontend wire types
  - api-tests: validate favorite requests, fixed pagination, envelope unwrapping, and ApiError mapping
  - provider-tests: execute FAVORITE-SESSION-STATE-001, FAVORITE-SESSION-STATE-002, FAVORITE-SESSION-STATE-004, and FAVORITE-SESSION-STATE-005
  - provider-rollback: prove the provider-side optimistic rollback and pending cleanup from FAVORITE-SESSION-STATE-003
  - auth-tests: execute FAVORITE-AUTH-REDIRECT-001 through FAVORITE-AUTH-REDIRECT-004
  - focused-tests: npm test -- src/api/favorites.test.ts src/context/FavoritesContext.test.tsx src/pages/LoginPage.test.tsx
status: completed
verified_against:
  FAVORITES-API: 1
  CATALOG-VIEWER: 1
  FAVORITE-AUTH-REDIRECT: 1
  FAVORITE-SESSION-STATE: 1
```

**Acceptance scenarios:** `FAVORITE-AUTH-REDIRECT-001`, `FAVORITE-AUTH-REDIRECT-002`, `FAVORITE-AUTH-REDIRECT-003`, `FAVORITE-AUTH-REDIRECT-004`, `FAVORITE-SESSION-STATE-001`, `FAVORITE-SESSION-STATE-002`, `FAVORITE-SESSION-STATE-004`, `FAVORITE-SESSION-STATE-005`

**Architectural constraints:** all endpoint calls use `apiClient` or `apiClientWithMeta`. The provider does not preload all favorite IDs, treats server viewer state as initial authority, always clears customer-specific state when identity changes, and returns the frozen discriminated mutation outcome. Login accepts only the frozen local-path grammar and never replays a favorite mutation.

### FE-02 — Expose accessible favorite controls on existing product surfaces

```yaml
id: FE-02
owner: frontend-customer
outcome: Expose synchronized, accessible favorite controls on every ProductCard and Product Detail surface and add authenticated desktop/mobile navigation.
contracts:
  CATALOG-VIEWER: 1
  FAVORITE-SESSION-STATE: 1
  FAVORITE-UI: 1
depends_on: [FE-01]
risk: normal
verification:
  - component-contract: execute FAVORITE-UI-001 and FAVORITE-UI-004
  - failure-contract: execute FAVORITE-SESSION-STATE-003 through the favorite control with optimistic update, rollback, pending cleanup, and Vietnamese feedback
  - viewer-initialization: execute CATALOG-VIEWER-008
  - interaction-tests: verify pointer, Enter, Space, propagation prevention, pending disablement, exact accessible names, aria-pressed, and visible focus
  - focused-tests: npm test -- src/components/ProductCard.test.tsx src/pages/ProductDetailPage.test.tsx src/components/Header.test.tsx
status: completed
verified_against:
  CATALOG-VIEWER: 1
  FAVORITE-SESSION-STATE: 1
  FAVORITE-UI: 1
```

**Acceptance scenarios:** `CATALOG-VIEWER-008`, `FAVORITE-SESSION-STATE-003`, `FAVORITE-UI-001`, `FAVORITE-UI-004`

**Architectural constraints:** reuse the shared favorite control and existing product surfaces. The active/non-active accessible-name and `aria-pressed` mappings are exact. Favorite activation inside ProductCard never activates its detail link. Visual treatment follows the existing customer application language and communicates state with more than color alone.

### FE-03 — Provide the protected Favorites page and every observable page state

```yaml
id: FE-03
owner: frontend-customer
outcome: Provide /favorites with fixed 12-item pagination, protected rendering, loading/empty/error/retry/populated states, inactive restrictions, reactivation, and out-of-range recovery.
contracts:
  FAVORITES-API: 1
  FAVORITE-UI: 1
  FAVORITE-SESSION-STATE: 1
depends_on: [FE-02]
risk: normal
verification:
  - component-contract: execute FAVORITE-UI-002 through FAVORITE-UI-003 and FAVORITE-UI-005 through FAVORITE-UI-007
  - page-tests: verify fixed page size, server metadata, replace-navigation, retry, removal, inactive controls, and reactivation
  - focused-tests: npm test -- src/pages/FavoritesPage.test.tsx src/test/App.test.tsx
  - frontend-lint: npm run lint
  - frontend-tests: npm test
  - frontend-build: npm run build
  - responsive-accessibility: verify desktop and mobile layouts, keyboard flow, focus, loading, empty, error, disabled, pending, active, and discontinued states
status: completed
verified_against:
  FAVORITES-API: 1
  FAVORITE-UI: 1
  FAVORITE-SESSION-STATE: 1
```

**Acceptance scenarios:** `FAVORITE-UI-002`, `FAVORITE-UI-003`, `FAVORITE-UI-005`, `FAVORITE-UI-006`, `FAVORITE-UI-007`

**Architectural constraints:** the route waits for AuthProvider restoration. Pagination always requests 12. Out-of-range responses replace the route with `max(totalPages, 1)` before reloading. Inactive products preserve presentation and removal but disable detail and purchase. Scope remains within the customer frontend and does not alter frontend-admin.

## Workstream: integration-verifier

Run package commands from their package directories and aggregate `make test` or `make build` from the repository root.

### INT-01 — Verify the assembled feature against real persistence, HTTP, and browser boundaries

```yaml
id: INT-01
owner: integration-verifier
outcome: Prove persistence, caller isolation, catalog personalization, compatibility, and customer browser behavior in the real assembled system.
contracts:
  FAVORITES-API: 1
  CATALOG-VIEWER: 1
  FAVORITE-AUTH-REDIRECT: 1
  FAVORITE-SESSION-STATE: 1
  FAVORITE-UI: 1
  FAVORITE-PERSISTENCE: 1
depends_on: [BE-02, BE-03, FE-03]
risk: high
verification:
  - database: apply migrations and run persistence assertions against PostgreSQL
  - http: exercise anonymous, customer, admin, invalid-token, add, repeat-add, remove, repeat-remove, inactive, pagination, and two-customer requests
  - process-restart: prove a favorite persists across fresh backend and browser sessions
  - browser: exercise card/detail toggles, injected mutation failure with rollback and Vietnamese feedback, login return without replay, favorites states, inactive restrictions, reactivation, and out-of-range recovery
  - compatibility: run cart, checkout, admin, catalog, and full repository regression suites
  - root-gates: run make test and make build
status: completed
verified_against:
  FAVORITES-API: 1
  CATALOG-VIEWER: 1
  FAVORITE-AUTH-REDIRECT: 1
  FAVORITE-SESSION-STATE: 1
  FAVORITE-UI: 1
  FAVORITE-PERSISTENCE: 1
```

**Acceptance scenarios:** `FAVORITES-API-003`, `FAVORITES-API-004`, `FAVORITES-API-005`, `FAVORITES-API-006`, `FAVORITES-API-009`, `FAVORITES-API-011`, `FAVORITES-API-012`, `FAVORITES-API-017`, `CATALOG-VIEWER-001`, `CATALOG-VIEWER-002`, `CATALOG-VIEWER-005`, `CATALOG-VIEWER-011`, `FAVORITE-AUTH-REDIRECT-001`, `FAVORITE-AUTH-REDIRECT-002`, `FAVORITE-SESSION-STATE-003`, `FAVORITE-UI-002`, `FAVORITE-UI-003`, `FAVORITE-UI-005`, `FAVORITE-UI-006`, `FAVORITE-UI-007`, `FAVORITE-PERSISTENCE-010`

**Architectural constraints:** use fresh verifier context and real processes. Start servers only through bounded background/session mechanisms, verify readiness, capture reproducible evidence, and stop all started processes. Owner reports are inputs rather than proof. Runtime failures route to the responsible persistent workstream; contract defects use the contract revision workflow.

> Private class and file decomposition remains with each persistent workstream owner unless a frozen contract or approved design fixes the shared boundary.
