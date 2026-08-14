# Int64 Stock Fix Report

## Status

Implemented the approved stock and cart quantity contract change without committing.

- PostgreSQL stock and cart quantity use unconstrained `numeric` columns with explicit integer/range checks at the end of migration `000004`; SQLC column overrides expose them as Go `int64`.
- Accepted stock is `0..9223372036854775807`.
- Accepted cart quantity is `1..9223372036854775807`.
- Fractional and overflowing existing values are rejected before migration casts.
- MoneyVND remains a canonical decimal string and continues to use arbitrary precision.
- Backend JSON emits numeric `stockQuantity` and `quantity` fields.

## Changed Files

- `.kiro/specs/phone-storefront-shopping-flow/design.md`
- `.kiro/specs/phone-storefront-shopping-flow/tasks.md`
- `backend/db/migrations/000004_int64_stock_quantity.up.sql`
- `backend/db/migrations/000004_int64_stock_quantity.down.sql`
- `backend/db/queries/catalog.sql`
- `backend/db/queries/cart.sql`
- `backend/sqlc.yaml`
- `backend/internal/domain/catalog.go`
- `backend/internal/domain/cart.go`
- `backend/internal/domain/cart_repository.go`
- `backend/internal/repository/catalog_repository.go`
- `backend/internal/repository/cart_repository.go`
- `backend/internal/repository/sqlc/cart.sql.go`
- `backend/internal/repository/sqlc/catalog.sql.go`
- `backend/internal/repository/sqlc/models.go`
- `backend/internal/delivery/http/catalog_handler.go`
- `backend/internal/delivery/http/cart_handler.go`
- Focused backend repository, handler, use-case, and fixture tests under `backend/internal/`
- `frontend/src/api/catalog.ts`
- `frontend/src/api/cart.ts`
- `frontend/src/api/client.ts`
- `frontend/src/cart/CartProvider.tsx`
- `frontend/src/pages/ProductDetailPage.tsx`
- `frontend/src/pages/CartPage.tsx`
- Corresponding frontend tests for cart, detail, and variant selection
- `frontend/src/api/client.test.ts`

Generated SQL code was updated only by `make gen`.

## Contract Details

The migration validates fractional, negative, and out-of-range values and adds explicit `trunc`/int64-bound constraints to product stock, variant stock, and cart quantity. Numeric storage is intentional because PostgreSQL silently rounds fractional literals assigned to `bigint`; the numeric checks reject those literals instead. The down migration removes the new constraints and retains `products.stock_quantity` as `numeric` if converting a large value back to legacy PostgreSQL `integer` would lose data.

Domain, repository, use-case, SQLC, and HTTP quantity/stock values use `int64`. JSON decoding into `int64` rejects fractional and overflow request values with the stable `validation_error` envelope. Cart reconciliation compares native `int64` values and rejects cart total-unit accumulation overflow instead of wrapping.

Frontend API integer fields (`stockQuantity`, `quantity`, and `totalUnits`) are `bigint`. The shared client losslessly quotes targeted integer lexemes before parsing JSON, normalizes them to BigInt, and serializes BigInt request quantities as JSON numbers. BigInt remains used for VND formatting/totals as before; stock/quantity arithmetic is now also exact.

## Verification

- Backend `make gen`: passed.
- Backend `make test`: passed.
- Backend `make test-integration`: passed, including PostgreSQL migration/constraint coverage.
- Backend `make vet`: passed.
- Frontend `npm run lint`: passed with three existing warnings in `src/api/error.ts`, `src/auth/AuthProvider.tsx`, and `src/cart/CartProvider.tsx`.
- Frontend `npm test`: passed, 110 tests across 16 files.
- Frontend `npm run build`: passed.
- Frontend `npm run test:e2e -- --workers=1`: passed, 20 tests across 320/600/900/1180px Chromium projects.
- Root `make test`: passed.
- Root `make build`: passed.

## Concerns

- Backend JSON remains numeric on the wire, while the frontend parser preserves integer lexemes before JavaScript number coercion. Non-integer or out-of-range int64 values are rejected by the parser/normalizer.
- The pre-existing lint warnings are unrelated to this contract change.

## Review Findings Addressed

### 1. Add-at-MaxInt64 overflow

`InsertOrIncrementCart` now uses a `CASE` predicate that returns false before evaluating `quantity + 1` when the existing row is MaxInt64. The integration test inserts a MaxInt64 cart row, calls `AddVariant`, asserts stable `ErrStockLimit`, and verifies the stored quantity remains MaxInt64.

### 2. Lossless frontend int64 handling

`frontend/src/api/client.ts` now contains `parseApiJson` and `serializeApiJson`. The parser recognizes `stockQuantity`, `quantity`, and `totalUnits` integer lexemes before `JSON.parse`, then normalizes them to BigInt. The serializer emits BigInt values as unquoted JSON numbers and rejects unsafe ordinary numeric values. Tests cover MaxInt64 and `9007199254740993`, and CartPage tests exercise exact decrement behavior above `Number.MAX_SAFE_INTEGER`.

### 3. Migration lifecycle and constraints

The integration suite now applies `000004` during initial setup, checks negative/fractional/overflow stock and cart quantity rejection on the new schema, verifies MaxInt64 preservation after `000004` down, verifies legacy numeric types/data, reapplies `000004`, and verifies schema restoration before the remaining down/up cycle.

## Follow-up Verification Evidence

- Backend sequential `make gen; make test; make test-integration; make vet`: passed.
- Frontend sequential `npm test; npm run lint; npm run build; npm run test:e2e -- --workers=1`: passed, 110 unit tests and 20 E2E tests. Lint has three pre-existing warnings.
- Root sequential `make test; make build`: passed.
- An earlier parallel verification attempt exhausted host memory and produced Go/Node worker OOMs; all required commands were rerun sequentially and passed.

## Broad-Review Fix Evidence

- Migration `000004_int64_stock_quantity.up.sql` now converts product stock, variant stock, and cart quantity to unconstrained `numeric` before the validation block. The validation rejects fractional values, negatives, and values above `9223372036854775807`; the existing constraints enforce the same rules after migration.
- Added `TestInt64MigrationRejectsFractionalStructurallyValidVariant`, which creates a complete product, option group, option value, variant, and variant-option link, preserves `1.5` in an unconstrained fixture column, and verifies applying `000004` fails.
- `parseResponse` now propagates JSON parse and int64 validation exceptions. It still returns `null` for HTTP `204` and genuinely empty response bodies. `frontend/src/api/client.test.ts` covers fractional and overflowing successful integer responses and verifies rejection.
- Catalog `ListProducts` now uses `GetQuery` for `min_price` and `max_price`; present-but-empty values return `invalid_filter`, while absent values remain unset. `TestCatalog_ListProductsEmptyPrice` covers both fields and the combined case.

## Broad-Review Verification

- Backend focused tests: passed (`go test ./internal/delivery/http`; migration regression with `go test -tags=integration ./internal/repository -run '^TestInt64MigrationRejectsFractionalStructurallyValidVariant$' -count=1 -timeout=5m`).
- Backend full checks: passed (`make gen`, `make test`, `make test-integration`, `make vet`). Integration suite passed all tests.
- Frontend checks: passed (`npm test`, 112 tests across 16 files; `npm run build`; `npm run test:e2e -- --workers=1`, 20 tests across four Chromium viewport projects). `npm run lint` passed with the three existing warnings listed above.
- Root checks: passed (`make test`, `make build`).
- `git diff --check` reported no whitespace errors; no commit was created.

## Broad-Review Concerns

- Integration and E2E checks depend on Docker/Testcontainers and the committed Playwright browser installation; both were available in this environment.
- The three lint warnings remain unrelated to these fixes.

## Remaining P2 Fix Evidence

- Updated `backend/db/migrations/000004_int64_stock_quantity.down.sql` to preserve MaxInt64 product stock during rollback, convert products to legacy `integer` only when the data fits, and restore explicit integer/range constraints for products, product variants, and cart quantities.
- Rollback keeps variant and cart columns as unconstrained `numeric` before applying checks, preventing PostgreSQL from silently rounding fractional values during writes. The restored checks reject fractional, negative, and out-of-range values.
- Extended `backend/internal/repository/cart_repository_integration_test.go` to verify rollback rejection for fractional, negative, and overflow product stock, variant stock, and cart quantity, plus the complete up/down/up lifecycle and post-reapply constraints.
- Backend verification passed: `make gen`, `make test`, `make test-integration`, `make vet`.
- `git diff --check` passed. SQLC generated files had no additional diff from this fix.

## Remaining P2 Concerns

- When a product contains stock above legacy PostgreSQL `integer` range, rollback intentionally retains that column as `numeric` with the safe int64 constraint rather than losing data through a narrowing cast.
