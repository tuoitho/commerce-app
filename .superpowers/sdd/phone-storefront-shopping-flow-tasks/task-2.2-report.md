# Task 2.2 Implementation Report

## Status

Implemented task 2.2 backend catalog query and repository work. HTTP, cart, and frontend work were not changed.

## Contract Reviewed

- `.kiro/specs/phone-storefront-shopping-flow/tasks.md`, task 2.2
- `.kiro/specs/phone-storefront-shopping-flow/requirements.md`, requirements 2.3, 2.4, 3.1, 3.2, 3.8-3.10, 3.13-3.14, 7.1, 8.1-8.3, 8.7-8.8, 10.5-10.6
- `.kiro/specs/phone-storefront-shopping-flow/design.md`, catalog repository and public catalog sections
- `task-2.1-report.md` and the task 2.1 domain contract
- `backend/AGENTS.md`

## Changes

### SQL

`backend/db/queries/catalog.sql` now:

- Lists only brands/categories having an active product and at least one active variant.
- Lists only active products with an active variant.
- Searches case-insensitively across brand/category name, product name, and model.
- Accepts repeated category IDs as a UUID array. Existing IDs are OR-ed; unknown IDs are ignored, and an all-unknown list imposes no category restriction.
- Applies min/max VND bounds to the same active variant, preserving numeric precision in PostgreSQL.
- Applies `in_stock` to active variants, where `true` means any positive stock and `false` means no positive-stock active variant.
- Supports featured filtering for the featured repository method.
- Loads option groups, values, active variants, and variant-to-value links through separate deterministic queries.
- Uses stable ordering by name/model/id, group position/id, value position/id, variant price/id, and link group.
- Excludes inactive products and products with no active variant from detail lookup.

### Repository and mapping

`backend/internal/repository/catalog_repository.go` now:

- Passes repeated categories and VND filter fields to generated sqlc parameters.
- Maps product brand/model/featured/active/timestamps/images.
- Maps dynamic option groups and values and active variant option graphs.
- Preserves `price_vnd` as `domain.MoneyVND` without conversion to `int64` or floating point.
- Maps numeric stock strings to the existing domain integer stock field.
- Uses the filtered featured query instead of unrestricted product listing.
- Converts an inactive or variant-ineligible detail into the existing `domain.ErrProductNotFound` via SQL no-row behavior.

### Tests

Added `backend/internal/repository/catalog_repository_test.go` covering mapper behavior for:

- 38-digit VND precision
- Dynamic group/value ordering
- Variant option link mapping

## Generated Diff

Ran `make gen`. The generated diff is limited to:

- `backend/internal/repository/sqlc/catalog.sql.go`
- `backend/internal/repository/sqlc/models.go`

No generated file was edited manually. The generated changes add the catalog query parameter/row types and query methods required by the SQL contract.

## Verification

- Focused: `go test ./internal/repository ./internal/usecase/catalog/...` PASS
- Full backend: `make test` PASS
- Static analysis: `make vet` PASS
- SQL generation: `make gen` PASS

## Concerns

- No PostgreSQL integration test was run because this task requested focused tests, `make test`, `make vet`, and `make gen`; the repository test is a pure mapper test and does not require a database.
- The existing domain stock field is `int`, while the database permits large numeric stock values. This task specifically requires VND precision and retains the task 2.1 domain contract; stock values outside the platform `int` range return a mapping error rather than being truncated.
- HTTP response contract updates remain task 2.3 and are intentionally not included.

## Review Fix Evidence

Addressed the task 2.2 review findings:

1. **Variant summary projection:** `domain.Product` now carries `MinPriceVND` and `MaxPriceVND`. The mapper derives both from active variant decimal strings using `math/big.Int`, keeps `Price` as the minimum VND string for the existing projection, sets `Currency` to `VND`, aggregates active stock into `StockQuantity`, and `Product.InStock()` evaluates active variants directly. No price conversion uses floating point or bounded integer types.
2. **Mapper and SQL semantic coverage:** repository tests now prove a 38-digit min/max range, active-variant in-stock behavior, zero-stock plus positive-stock behavior, option graph mapping, and SQL source clauses for active eligibility, brand/name/model search, category array filtering, VND bounds, stock filtering, featured filtering, and stable ordering. These are real assertions over mapper output and catalog SQL content; no empty or no-op tests were added.
3. **Safe stock contract:** stock is parsed with `math/big.Int`; negative, malformed, and values above the platform `int` maximum return an explicit mapping error. Values are never truncated or silently overflowed. The overflow regression test uses a value beyond `int` range and asserts the bounded-domain error.

### Fix Verification

- Focused after fixes: `go test ./internal/repository ./internal/usecase/catalog/...` PASS
- Full backend after fixes: `make test` PASS
- Static analysis after fixes: `make vet` PASS
- Regeneration after fixes: `make gen` PASS
- Generated diff inspection: only `backend/internal/repository/sqlc/catalog.sql.go` and `backend/internal/repository/sqlc/models.go` changed under generated SQL output.

## Executable SQL Review Fix

Replaced the previous raw SQL substring test with `backend/internal/repository/catalog_repository_integration_test.go`, an explicit `//go:build integration` PostgreSQL test. The test does not silently skip: it connects using `DB_URL` or the repository default and fails if PostgreSQL is unavailable.

The test creates deterministic temporary catalog tables inside a transaction, seeds active/inactive products, active/inactive variants, two brands, option groups, values, and variant links, then calls the real `CatalogRepository` methods. It asserts executable behavior for:

- active-brand/category listing
- case-insensitive brand and model search
- repeated category IDs, OR semantics, and unknown-category ignoring
- same-active-variant min/max filtering and 38-digit min/max projection
- active-variant `in_stock=true` and `in_stock=false` behavior
- featured-only listing
- full detail option/variant graph and inactive detail not-found behavior

The old non-executable SQL-content test was removed.

Exact verification commands:

- `go test ./internal/repository` PASS
- `go test -tags integration ./internal/repository -run '^TestCatalogRepositorySQLIntegration$' -count=1` PASS
- `make test` PASS
- `make vet` PASS
- `make gen` PASS

The integration test uses only the existing `pgx` dependency and temporary PostgreSQL tables; no new dependency or Docker harness was introduced. Generated output remained limited to `internal/repository/sqlc/catalog.sql.go` and `internal/repository/sqlc/models.go`.
