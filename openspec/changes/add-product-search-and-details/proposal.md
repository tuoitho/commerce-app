## Why

The commerce application has authentication but no customer-facing catalog, so users cannot discover or inspect products. A public searchable catalog with practical filters and product details is the next vertical slice needed to make the application usable as a storefront.

## What Changes

- Add a public product catalog that supports case-insensitive name search and filters for category, price range, and stock availability.
- Add a public product detail view addressable by product identifier.
- Add backend persistence and read-only HTTP API contracts for catalog listing/search and product details.
- Add frontend catalog browsing, filter controls, result states, and product detail navigation.
- Add deterministic sample categories and products for local development and end-to-end verification.
- Keep product administration, cart, ordering, pagination, and advanced sorting outside this change.

## Capabilities

### New Capabilities

- `product-catalog`: Public product discovery through name search and category, price, and availability filters, plus viewing complete product details.

### Modified Capabilities

None.

## Impact

- Affected boundaries: PostgreSQL catalog persistence, the Go backend catalog bounded context and public REST API, and the React storefront routes and API client.
- New public API contracts under `/api/v1/products` for collection search/filtering and product detail retrieval.
- New database migrations, sqlc queries/generated models, catalog domain/use-case/repository/delivery code, and repeatable sample data.
- New frontend catalog list and detail routes, product API types, filter state, and loading/empty/error/not-found states.
- No authentication contract changes; catalog reads are intentionally available without an access token.
- Backward compatible: existing auth APIs and frontend auth flows remain unchanged, and all catalog contracts are additive.
