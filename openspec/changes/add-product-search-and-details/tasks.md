## 1. Catalog Contract and Persistence

- [x] 1.1 Add failing backend tests for catalog filter validation, AND-combined criteria, stable ordering, category listing, detail retrieval, and missing-product behavior defined in `specs/product-catalog/spec.md`.
- [x] 1.2 Add reversible PostgreSQL migrations for `categories`, `products`, and `product_images`, including constraints and indexes for category, stock, deterministic ordering, and case-insensitive name search.
- [x] 1.3 Add an idempotent sample-data operation with multiple categories, price points, images, and both stock states; document and test that repeated execution does not create duplicates.
- [x] 1.4 Add sqlc catalog queries for category listing, optional AND-combined product filtering, stable product summaries, product detail, and ordered product images; regenerate and verify committed sqlc output.

## 2. Backend Catalog Capability

- [x] 2.1 Add catalog domain models, filter input types, repository interfaces, and catalog-specific errors without changing existing auth contracts.
- [x] 2.2 Implement catalog use cases for listing categories, validating collection criteria, searching/filtering products, and retrieving product details; make the focused use-case tests pass.
- [x] 2.3 Implement SQL-backed catalog repositories that map exact numeric prices, categories, stock state, and image ordering into domain models; add focused repository tests where database test infrastructure permits.
- [x] 2.4 Add public Gin handlers for `GET /api/v1/categories`, `GET /api/v1/products`, and `GET /api/v1/products/{id}` with the specified response shapes and no auth middleware.
- [x] 2.5 Extend centralized HTTP error mapping for `invalid_filter`, `invalid_product_id`, and `product_not_found`, and add handler tests for anonymous access, invalid queries, empty results, success payloads, and 400/404 envelopes.
- [x] 2.6 Wire catalog dependencies in server bootstrap and router registration, then run `go test ./...` and `go vet ./...` from `backend/`.

## 3. Frontend Catalog Experience

- [x] 3.1 Add failing frontend tests for catalog API query serialization, category loading, filter/reset behavior, stale-request handling, and catalog loading/empty/error states.
- [x] 3.2 Add typed product/category API functions using the existing client, preserving decimal price strings and mapping all supported query parameters exactly once.
- [x] 3.3 Build a public catalog route with responsive product summaries and controls for name, category, minimum price, maximum price, and stock availability; persist active criteria in the URL and provide reset and retry actions.
- [x] 3.4 Prevent outdated catalog responses from replacing results for newer criteria, and provide image fallback behavior without hiding product information.
- [x] 3.5 Add failing frontend tests for product-detail success, loading, API error, and `product_not_found` states plus navigation from catalog summaries.
- [x] 3.6 Build the public product-detail route with complete contract fields, stock state, image presentation, and navigation back to the catalog.
- [x] 3.7 Integrate catalog/detail routes with the existing app navigation without regressing protected auth routes, then run `npm test`, `npm run lint`, and `npm run build` from `frontend/`.

## 4. End-to-End Verification and Documentation

- [x] 4.1 Update repository startup documentation and Make targets with the exact migration and sample-data commands required for a usable local catalog.
- [x] 4.2 On a migrated database with sample data, verify anonymous category, unfiltered collection, combined-filter, empty-result, existing-detail, malformed-ID, and missing-product requests against the OpenSpec scenarios.
- [x] 4.3 Verify the storefront on desktop and mobile viewports for search/filter/reset, loading/empty/error states, detail navigation, out-of-stock display, image fallback, and absence of incoherent overlap or text overflow.
- [x] 4.4 Run root `make test` and `make build`, confirm sqlc generation produces no unintended diff, and record any environment-dependent verification that could not be completed.
