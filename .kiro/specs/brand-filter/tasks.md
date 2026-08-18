# Implementation Plan

- [x] 1. Backend brand filtering and listing

- [x] 1.1 Implement brand filter on product search and brand listing endpoint
  - **Produces:** `GET /api/v1/products` accepting repeated `brand` query parameters (case-insensitive match, OR within brand, AND with other filters, empty values ignored), and `GET /api/v1/brands` returning the distinct visible brands as `string[]` in the Full Status Envelope.
  - **Scope:** `backend/internal/domain/catalog.go` (`ProductFilter.Brands`, `CatalogRepository.ListBrands`), `backend/db/queries/catalog.sql` (`ListProducts` brand clause + new `ListBrands` query), sqlc generation, `backend/internal/repository/catalog_repository.go`, `backend/internal/usecase/catalog/catalog.go`, `backend/internal/delivery/http/catalog_handler.go` and `router.go`, catalog fake repositories, and focused tests.
  - **Consumes:** The shared contracts in `design.md` (`/products` brand param semantics and `/brands` `string[]` envelope, visible-brand semantics matching `ListCategories`).
  - **Acceptance:** Products are filtered case-insensitively by any selected brand and compose with category/price/in-stock filters; an absent `brand` parameter preserves existing behavior; empty brand values are dropped during validation; brand counts are filtered before in-memory pagination; `/brands` returns distinct alphabetical brands of active products with an active variant (empty string excluded, empty array when none).
  - **Verification:** Go unit tests for `validateFilter` (trim/drop empties) and `ListBrands` passthrough; repository integration tests for brand filtering and brand visibility/ordering; handler tests for repeated `brand` params and the `/brands` envelope; updated fake repositories compile against the new interface.
  - _Requirements: 1.2, 1.4, 2.2, 2.5, 4.2, 5.1, 5.2, 5.3, 6.1, 6.2, 6.3_

- [x] 2. Frontend catalog brand filter

- [x] 2.1 Extend catalog API client for brands
  - **Produces:** `listBrands(): Promise<string[]>` hitting `GET /api/v1/brands`, and `brand` support in `ProductFilterParams` / `listProducts` / `listProductsWithMeta` (one `brand` query parameter per value, mirroring `category_id`).
  - **Scope:** `frontend/src/api/types.ts` and `frontend/src/api/catalog.ts` with focused API tests.
  - **Consumes:** The `/brands` and `/products` contracts fixed in `design.md`.
  - **Acceptance:** `listBrands` requests `/brands` and returns the `string[]` data payload; `listProducts` appends `brand` params for string and array inputs and omits them when absent.
  - **Verification:** Vitest tests for `catalog.ts` asserting request URLs/params and response unwrapping.
  - _Requirements: 5.1, 6.1_

- [x] 2.2 Implement brand filter section in the catalog page
  - **Produces:** A "Thương hiệu" sidebar section in `CatalogPage` with one checkbox row per brand, "Bỏ chọn" reset, URL `brand` parameters (deep-linkable, resetting `page`), brand passed into `listProductsWithMeta`, `hasActiveFilters` integration, and loading/error/empty handling for the brand list independent of the product list.
  - **Scope:** `frontend/src/pages/CatalogPage.tsx` and `frontend/src/pages/CatalogPage.test.tsx`.
  - **Consumes:** `catalog.ts` API additions from Task 2.1 and the URL-driven filter pattern already in `CatalogPage`.
  - **Acceptance:** Brand options render from the API; toggling a brand updates the URL and re-fetches with `brand`; deselection removes the parameter; brand composes with other filters; changing brand resets to page 1; opening a URL with `brand` params applies them; a brand matching nothing shows the empty state; brand section loading/error states (inline retry) render without breaking the product list; options are keyboard-accessible with labels and selection is not color-only.
  - **Verification:** Vitest + RTL tests in `CatalogPage.test.tsx` covering rendering, URL updates, combined filters, page reset, deep link application, empty state, and brand section loading/error states.
  - _Requirements: 1.1, 1.3, 2.1, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 4.1, 7.1, 7.2, 7.3, 7.4_