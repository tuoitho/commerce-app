# Task 3.3 Report

## Status

Implemented the protected cart HTTP API. Frontend was not changed.

## Files

- `backend/cmd/server/app.go`: wired `CartRepository` and cart use case.
- `backend/internal/delivery/http/router.go`: registered protected `/api/v1/cart` routes after `AuthRequired`.
- `backend/internal/delivery/http/cart_handler.go`: implemented GET, POST, PUT, PATCH, and DELETE handlers, request validation, and full cart response mapping.
- `backend/internal/delivery/http/error.go`: added stable cart 404/409 error codes while preserving the existing envelope.
- `backend/internal/delivery/http/cart_handler_test.go`: added focused HTTP coverage.

## Tests

- `go test ./internal/delivery/http -run '^TestCartHTTP'`: passed.
- `make gen`: passed; no SQL source changes were required by task 3.3.
- `make test`: passed.
- `make vet`: passed.

Coverage includes successful six-operation responses, caller ID propagation from JWT, malformed JSON, invalid UUID and quantity, missing/invalid bearer token, decimal money strings, nullable price-capable response mapping, and stable business error status/code mapping.

## Concerns

- HTTP tests use a fake cart repository; PostgreSQL reconciliation and persistence behavior remain covered by the existing repository/integration suites rather than the focused HTTP suite.
- The worktree contained unrelated pre-existing changes and generated/spec artifacts; they were not reverted or modified.

## Review Follow-Up Evidence

- Fixed `SetQuantity`: inactive product/variant and out-of-stock lines now return `cart_item_unavailable` before quantity validation; insufficient-stock lines remain editable and can recover with a quantity within current stock.
- Added repository regression coverage for unavailable, out-of-stock, insufficient-stock recovery, and stock-limit behavior.
- Added route-level coverage for `cart_item_not_found`, `variant_not_found`, `out_of_stock`, `stock_limit`, and `cart_item_unavailable`, all with stable HTTP status and error codes.
- Added distinct-user JWT ownership coverage, missing/invalid token coverage, malformed JSON on all mutation body routes, invalid UUID coverage across item routes, and quantity validation.
- Added full success wire assertions for snapshots, options, unit/line money, all summary fields, and all availability values; unavailable/out-of-stock responses assert `null` money fields.
- Re-ran `go test ./internal/delivery/http ./internal/repository -run 'TestCartHTTP|TestQuantityMutation'`, `make gen`, `make test`, `make vet`, and `git diff --check`: all passed.
