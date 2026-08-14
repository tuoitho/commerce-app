# Task 2.1 Review Report

## Scope and Verification

Reviewed:

- `.kiro/specs/phone-storefront-shopping-flow/tasks.md`, task 2.1
- `.kiro/specs/phone-storefront-shopping-flow/requirements.md`
- `.kiro/specs/phone-storefront-shopping-flow/design.md`
- `backend/internal/domain/catalog.go`
- `backend/internal/usecase/catalog/catalog.go`
- `backend/internal/usecase/catalog/fakerepos/fakerepos.go`
- `backend/internal/usecase/catalog/catalog_task21_test.go`
- Related changed repository/sqlc files and the catalog SQL contract

Verification run:

- `go test ./internal/usecase/catalog/...` PASS
- `go test ./...` PASS
- `go vet ./internal/usecase/catalog/...` PASS

## Verdict

- **Spec compliance: FAIL**
- **Task quality: FAIL**

The domain has the requested brand/model/options/variants fields and timestamps, and the use case validates canonical non-negative VND bounds with arbitrary-precision range comparison. However, active catalog semantics and repository projection/filter behavior are not implemented consistently, and the change includes repository/sqlc work that belongs to task 2.2 rather than task 2.1.

## Findings

### Critical

No critical findings.

### Important

1. **Fake repository can return the wrong result for combined price and in-stock filters** — `backend/internal/usecase/catalog/fakerepos/fakerepos.go:70-87`

   The variant loop sets `inStock`, but breaks immediately after the first active variant matching the VND range. If that matching variant is in stock while a later active variant is not, the result is fine; if the matching variant is out of stock and a later active variant is in stock, `inStock` remains false and `in_stock=true` incorrectly excludes the product. The loop must evaluate all active variants, independently accumulating range and stock predicates. This violates requirement 3.14 and makes the fake unsuitable for the specified filter tests.

2. **Fake featured and detail paths do not enforce public active-catalog semantics** — `backend/internal/usecase/catalog/fakerepos/fakerepos.go:159-180`

   `ListFeaturedProducts` returns every `Featured` product, including inactive products and products with no active variants. `GetProductByID` returns any matching product with no active/product eligibility check. The design requires public list, featured, and detail projections to expose only active products having at least one active variant, with inactive detail treated as `product_not_found` (design.md:142, 176). The task test only checks that a featured flag and fields are copied; it does not test these exclusions.

3. **The changed SQL repository still implements the legacy catalog contract and drops the new projection** — `backend/internal/repository/catalog_repository.go:34-103`

   The repository maps only legacy category/price/stock/image fields, never maps `Brand`, `Model`, `Featured`, `Active`, option groups, or variants, and sends `MinPrice`/`MaxPrice` instead of `MinPriceVND`/`MaxPriceVND`. Its `ListFeaturedProducts` simply calls unrestricted `ListProducts`, so it is not a featured query. The underlying `backend/db/queries/catalog.sql` also searches only product name, uses one category ID, legacy product price/stock, and does not require active variants. This means the implemented domain/usecase contract cannot be delivered by the changed repository and conflicts with requirements 3.2, 3.9, 3.10, 3.14, 8.1, 8.7, 8.8, and 10.5-10.6. Query/repository implementation is explicitly task 2.2, not task 2.1.

4. **Nonexistent category semantics are not implemented or actually asserted by the new test** — `backend/internal/usecase/catalog/fakerepos/fakerepos.go:53-68`; `backend/internal/usecase/catalog/catalog_task21_test.go:56-67`

   Requirement 10.6 says a valid UUID for a nonexistent brand is ignored, and if no valid brand remains the other criteria still apply. The fake treats any supplied ID as a restrictive match and returns no products for an unknown ID. The test only verifies that one UUID is passed to the repository; it does not verify the required result semantics. Either repository filtering must own and test this behavior in task 2.2, or the fake/use-case contract must make the behavior explicit and test it end to end.

### Minor

1. **Repository error propagation coverage is incomplete** — `backend/internal/usecase/catalog/catalog_task21_test.go:88-112`

   Detail propagation is tested only for `ErrProductNotFound`; featured errors and arbitrary repository errors are not tested. The use case currently forwards them, but task 2.1 explicitly calls for featured/detail and error propagation coverage.

2. **The canonical `MoneyVND` type does not enforce its invariant** — `backend/internal/domain/catalog.go:13`; `backend/internal/usecase/catalog/catalog.go:101-103`

   `MoneyVND` is an unconstrained string alias, with validation performed only when validating a filter. That is acceptable for the requested filter boundary but does not match the design statement that `MoneyVND` is the canonical representation throughout the domain contract. The new tests also do not cover the valid zero bound, exact 38-digit upper bound, maximum-length max bound, or all invalid forms for both min and max.

3. **An unused category sentinel was added without a behavior contract** — `backend/internal/domain/errors.go:14`

   `ErrInvalidCategoryID` is not used; invalid category IDs are returned inside `FilterValidationError`. This is minor if intentional, but it leaves the domain error surface ambiguous and adds an orphaned sentinel.

## Scope Assessment

- Domain/usecase/fake-repository/test changes are relevant to task 2.1.
- No HTTP/delivery changes were found, which is appropriate because HTTP is task 2.3.
- Repository, SQL contract, generated SQL models, and seed changes are inappropriate for task 2.1 and should be reviewed as task 2.2/1.2 work rather than accepted as evidence that task 2.1 is complete.

## Positive Evidence

- `Product` includes brand/model/options/variants plus `CreatedAt`/`UpdatedAt`.
- Query trimming and case-insensitive matching are present in the fake repository.
- Canonical VND syntax rejects signs, leading zeroes, decimals, and values longer than 38 digits; range comparison uses `math/big.Int`.
- Malformed product UUIDs return `ErrInvalidProductID`, nonexistent detail IDs return repository `ErrProductNotFound`, and the focused/full backend tests pass.

## Task 2.1 Important Finding Fix

### Finding Addressed

`fakerepos.Catalog.AddProduct` used the zero value `Active:false` as the signal that a fixture was a legacy product. It then changed the product to active and synthesized an active variant. That made an explicitly inactive product represented only by legacy fields (`Price`, `Currency`, and `StockQuantity`) publicly eligible.

### Fix

- Preserved `AddProduct(domain.Product)` as the legacy fixture entry point, including its existing zero-value compatibility behavior for callers and fixtures.
- Added `AddProductWithActiveState(domain.Product, bool)` to the fake fixture API so tests can express an explicit active state without changing the production `Product.Active bool` domain semantics.
- The explicit-state path preserves `Active:false` and synthesizes a variant with the same active state, so legacy-shaped inactive fixtures remain excluded by `publicEligible`.
- Added `TestTask21_PublicFakePathsExcludeExplicitlyInactiveLegacyProduct`, covering list, featured, and detail paths.
- Existing legacy fixture tests remain unchanged and continue to exercise the compatibility path.

### Scope Confirmation

Only the task 2.1 fake fixture API/implementation and its regression test were changed for this fix. No SQL, generated sqlc, or production repository work was added; task 2.2 remains out of scope.

### Verification

- `go test ./internal/usecase/catalog/...` PASS
- `go test ./...` PASS
- `go vet ./...` PASS
