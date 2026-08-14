# Task 2.3 Report: Public Catalog HTTP API

## Status

Implemented task 2.3. No commit was created.

## Scope

The implementation follows the approved task, requirements, and design artifacts for the public catalog API. Catalog endpoints remain public and are registered without the authentication middleware.

Implemented endpoints:

- `GET /api/v1/categories`
- `GET /api/v1/products`
- `GET /api/v1/products/featured`
- `GET /api/v1/products/:id`

## HTTP Contract Changes

Product summaries now expose the phone storefront projection:

- `id`, `name`, `model`
- `brand` and existing `category` objects
- `minPriceVnd` and `maxPriceVnd` as JSON decimal strings
- `primaryImageUrl` and `inStock`

Existing legacy summary fields `price` and `currency` remain present so existing consumers and tests do not break unnecessarily.

Product details now additionally expose:

- `model`, `brand`, `minPriceVnd`, `maxPriceVnd`
- `featured`
- `optionGroups`, including option values and stable positions
- `variants`, including `id`, `optionValueIds`, `priceVnd`, and `stockQuantity`

Inactive variants are not emitted because the repository/domain projection supplies only active variants.

## Filter Behavior

`GET /api/v1/products` now reads all repeated `category_id` values through Gin's `QueryArray`. It passes `q`, repeated categories, `min_price`, `max_price`, and `in_stock` through the existing use-case validation and repository contract.

The existing `invalid_filter` error envelope is preserved. Invalid UUIDs, invalid canonical VND values, reversed ranges, and invalid boolean stock values return HTTP 400 with field-level errors. Canonical VND strings remain decimal strings, support up to 38 digits, and are not converted to floating point in the HTTP mapper.

The old decimal price path remains supported for legacy fixtures and existing tests. New catalog data uses canonical VND variant prices.

## Tests Added

Handler tests were added before the implementation changes for:

- repeated category parameters and 38-digit VND summary fields
- featured products without an access token
- detail model, featured flag, option groups, variants, option links, and VND variant price

The existing HTTP tests continue to cover categories, summaries, search, legacy filters, stock filters, validation envelopes, detail responses, malformed IDs, and not-found behavior.

## Verification

- Focused new handler tests: passed
- `go test ./internal/delivery/http`: passed
- `make test`: passed
- `make vet`: passed

## Changed Files For This Task

- `backend/internal/delivery/http/catalog_handler.go`
- `backend/internal/delivery/http/catalog_handler_test.go`
- `backend/internal/delivery/http/router.go`
- `backend/internal/usecase/catalog/fakerepos/fakerepos.go`

## Concerns

- The worktree already contained task 2.1/2.2 catalog, schema, seed, generated SQL, specification, and agent-instruction changes. Those changes were not reverted or modified except where the HTTP tests required the existing fake repository's legacy fixture behavior to remain compatible.
- Legacy `price`/`currency` fields remain in responses for compatibility, although the approved phone API contract is based on `minPriceVnd`, `maxPriceVnd`, and `priceVnd`.
- Frontend loading/error states and API client work are intentionally deferred to later tasks.

## Review Finding Fix Evidence

The follow-up review findings were addressed without changing the public route/auth scope:

1. Canonical price validation: the handler now passes `min_price` and `max_price` directly to `MinPriceVND`/`MaxPriceVND`; it no longer routes decimal-looking values through legacy decimal fields. Regression coverage in `TestCatalog_ListProductsInvalidPrice` verifies `1.0`, `+1`, `01`, `1,000`, and negative values return HTTP 400 with the stable `invalid_filter` envelope and `min_price` field.
2. Fake detail projection: `GetProductByID` now clones the public product graph, keeps active variants only, keeps option values referenced by active variants only, deep-copies variant option maps, and copies image slices. `TestTask23_GetProductByIDReturnsPublicActiveVariantGraphCopy` verifies inactive variant exclusion and that caller mutation does not affect subsequent reads.
3. Fake categories: `ListCategories` now derives categories/brands only from publicly eligible products, requiring an active product and at least one active variant, with stable name ordering. `TestTask23_ListCategoriesOnlyReturnsPublicCategories` verifies inactive and no-active-variant categories are excluded.

Follow-up verification:

- `go test ./internal/delivery/http ./internal/usecase/catalog/fakerepos`: passed
- `make test`: passed
- `make vet`: passed
