# Task 3.1 Report

## Status

Implemented task 3.1. No SQL, repository implementation, or HTTP changes were made.

## Contract Reviewed

- `.kiro/specs/phone-storefront-shopping-flow/tasks.md`, task 3.1
- `.kiro/specs/phone-storefront-shopping-flow/requirements.md`, requirements 4.9, 4.10, 5.3, 9.1, 9.2, 9.6, 9.7, 9.15, 9.16
- `.kiro/specs/phone-storefront-shopping-flow/design.md`, cart domain/repository contract and stable error table
- `backend/AGENTS.md`

## Changed Files

- `backend/internal/domain/cart.go`
- `backend/internal/domain/cart_repository.go`
- `backend/internal/domain/errors.go`
- `backend/internal/domain/cart_test.go`
- `backend/internal/usecase/cart/cart.go`
- `backend/internal/usecase/cart/cart_test.go`

## Implemented

- Added `Cart`, `CartItem`, `CartOption`, `CartAvailability`, and `CartRepository` contracts.
- Added stable availability values: `available`, `unavailable`, `out_of_stock`, and `insufficient_stock`.
- Added canonical `MoneyVND` validation for non-negative base-10 integer strings without signs, leading zeros, separators, or decimals.
- Added arbitrary-precision `AddMoneyVND` using `math/big.Int`; no monetary value is narrowed to `int64` or floating point.
- Added stable cart/variant sentinel errors.
- Added use-case validation for caller user ID, variant/item UUIDs, and quantity >= 1.
- Added all six use-case operations: get, add, set quantity, set item selection, select-all, and remove.
- Repository calls receive only the caller-supplied user ID. `ErrNotFound`, including wrapped forms, maps to ownership-neutral `ErrCartItemNotFound` for cart operations.

## Test-First Coverage

Tests were added before the implementation for:

- canonical MoneyVND forms and arbitrary-precision addition
- stable availability values and sentinel errors
- UUID and quantity validation without repository calls
- caller user ID propagation
- ownership-neutral not-found mapping, including wrapped repository errors
- delegation of all cart operations

## Verification

- Focused: `go test ./internal/domain ./internal/usecase/cart` passed.
- Backend full suite: `make test` passed.
- Static analysis: `make vet` passed.

## Remaining Important Finding Fix Evidence

`CatalogRepository.ListProducts` no longer falls back to legacy `ProductFilter.MinPrice`/`MaxPrice` strings. It now validates the canonical pointer fields at the repository boundary and returns `FilterValidationError` for legacy bounds or malformed/overlong canonical values, preventing invalid input from being converted to an empty PostgreSQL numeric and silently removing the filter. Valid canonical `MoneyVND` bounds continue to be passed as PostgreSQL numeric values with arbitrary precision.

Added `backend/internal/repository/catalog_price_filter_test.go` covering rejected legacy bounds, rejected leading-zero/decimal/overlong canonical bounds, and accepted zero/38-digit canonical bounds.

Verification:

- Focused catalog/cart/repository tests: `go test ./internal/usecase/catalog ./internal/usecase/cart ./internal/repository` passed.
- Backend full suite: `make test` passed.
- Static analysis: `make vet` passed.

## Concerns

- `MoneyVND.IsCanonical` validates representation but does not impose a 38-digit maximum. This matches the domain design's canonical type description; catalog filter validation continues to enforce its existing 38-digit input boundary.
- Cart availability reconciliation, monetary line/summary calculation from live catalog data, persistence transactions, and commit-before-business-error behavior remain task 3.2.
- Stable HTTP error envelope mapping remains task 3.3; this task returns domain sentinels only.
- The existing `domain.ValidationError` does not implement `Unwrap`, so tests use `errors.As` rather than `errors.Is(ErrValidation)`.

## Review Fix Evidence

Addressed the task 3.1 review findings:

1. `domain.CartItem` now includes nullable `LineTotalVND *MoneyVND`. The pointer is nil for unavailable/out-of-stock semantics and supports a canonical decimal string for valid lines without changing the existing cart/domain shape.
2. `ProductFilter.MinPriceVND` and `MaxPriceVND` are now `*domain.MoneyVND`, matching the approved design's optional bounds. Catalog validation, repository parameter conversion, fake repository filtering, HTTP query construction, and task-2.x fixtures were updated minimally; no new SQL or HTTP behavior was added.
3. Cart usecase boundaries validate caller user ID, variant ID, item ID, and quantity >= 1 before repository calls. The boolean `selected` input is already a typed Go `bool`; malformed JSON remains an HTTP concern deferred to task 3.3.
4. Item mutations `SetQuantity`, `SetSelected`, `SetAllSelected`, and `Remove` map wrapped or direct repository `ErrNotFound` to `ErrCartItemNotFound`. `Get` now preserves cart-level `ErrNotFound` instead of mislabeling it as an item error.
5. Tests assert propagation of `ErrVariantUnavailable`, `ErrOutOfStock`, `ErrStockLimit`, and `ErrCartItemUnavailable` across cart operations.
6. The fake repository records and tests user ID, variant ID, item ID, quantity, and selection arguments for all delegated operations.

Fix verification:

- Focused: `go test ./internal/domain ./internal/usecase/cart ./internal/usecase/catalog ./internal/repository ./internal/delivery/http` passed.
- Backend full suite: `make test` passed.
- Static analysis: `make vet` passed.
