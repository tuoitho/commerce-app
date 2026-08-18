# Implementation Plan

- [x] 1. Backend Variant Persistence and Administrative APIs

- [x] 1.1 Implement Atomic Option Groups and Variant Persistence in Repository
  - **Produces:** `CatalogRepository` method supporting atomic save/update of product option groups, option values, and product variants.
  - **Scope:** `backend/internal/repository/catalog_repository.go`, sqlc queries (`backend/db/queries/catalog.sql`), and repository integration tests.
  - **Consumes:** Option group and variant wire contracts from `design.md`.
  - **Acceptance:** When saving a product with variants, option groups, values, variants, and variant links are persisted in a single transaction; min/max prices and total stock are calculated from active variants; when saving without variants, existing variant structures are cleanly removed.
  - **Verification:** Focused repository integration tests in `backend/internal/repository/catalog_repository_test.go` and `catalog_repository_integration_test.go`.
  - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3, 2.5, 4.1, 4.2_

- [x] 1.2 Implement Administrative Variant Validation and HTTP Handlers
  - **Produces:** `POST /api/v1/admin/products` and `PUT /api/v1/admin/products/:id` endpoints accepting option groups and variant matrices.
  - **Scope:** `backend/internal/delivery/http/admin_catalog_handler.go`, DTOs, usecase validation, error formatting in Vietnamese, and HTTP handler tests.
  - **Consumes:** Shared `SaveProductRequest` contract and validation error semantics.
  - **Acceptance:** Valid requests with variant matrices persist and return 200/201 `ProductDetail` in Full Status Envelope; invalid option groups (empty label, duplicate values) or variant prices/stock return HTTP 400 with Vietnamese validation fields; unauthorized/non-admin requests return 401/403.
  - **Verification:** Focused unit and HTTP handler tests in `backend/internal/delivery/http/admin_catalog_handler_test.go`.
  - _Requirements: 1.4, 2.4, 4.1, 4.2, 4.3_

- [x] 2. Frontend Admin Variant Management UI

- [x] 2.1 Implement Option Group Builder and Variant Matrix Components
  - **Produces:** Reusable `OptionGroupBuilder.tsx`, `VariantMatrixTable.tsx`, Cartesian product matrix generator, and updated Admin API DTO wire types.
  - **Scope:** `frontend-admin/src/components/products/OptionGroupBuilder.tsx`, `frontend-admin/src/components/products/VariantMatrixTable.tsx`, `frontend-admin/src/lib/cartesian.ts`, `frontend-admin/src/api/types.ts`, `frontend-admin/src/api/products.ts`, and component test suites.
  - **Consumes:** UI specifications and wire types from `design.md`.
  - **Acceptance:** Admin can add up to 3 option groups with tag-style value chips; Cartesian product matrix updates automatically; each variant row allows setting price in VND, stock quantity, and active status; bulk apply utility quickly fills price/stock across all variants; API client methods accept and return updated option groups and variant matrices.
  - **Verification:** Vitest component tests in `frontend-admin/src/components/products/OptionGroupBuilder.test.tsx` and `VariantMatrixTable.test.tsx`.
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4_

- [x] 2.2 Integrate Variant Matrix Management into Product Form Page
  - **Produces:** Updated `ProductFormPage.tsx` supporting seamless switching between simple single-price/stock and multi-variant matrix modes.
  - **Scope:** `frontend-admin/src/pages/ProductFormPage.tsx`, Zod schema in `frontend-admin/src/lib/validations/product.ts`, and form integration tests.
  - **Consumes:** `OptionGroupBuilder`, `VariantMatrixTable`, and `api/products.ts` admin API client.
  - **Acceptance:** Admin can toggle between simple and variant mode; form validates required fields and variant matrix entries; editing existing products loads option groups, values, and variant matrix; submission sends structured payload and handles backend 400 validation error mapping.
  - **Verification:** Form integration tests in `frontend-admin/src/pages/ProductFormPage.test.tsx`.
  - _Requirements: 2.4, 2.5, 3.1, 3.2, 3.3, 3.4_

- [x] 3. End-to-End Compatibility and Storefront Verification

- [x] 3.1 Verify Storefront and Cart Compatibility with Admin Managed Variants
  - **Produces:** Verified end-to-end compatibility between admin-configured variants and customer-facing storefront/cart.
  - **Scope:** `frontend/src/pages/ProductDetailPage.test.tsx`, `frontend/src/pages/CatalogPage.test.tsx`, and cross-package regression checks.
  - **Consumes:** Products with admin-configured variants.
  - **Acceptance:** Customer storefront renders option selectors and updates price/in-stock status based on selected variant; products with active variants and stock > 0 display "Còn hàng"; products where all variants have 0 stock display "Hết hàng"; adding variant to cart verifies stock limits cleanly.
  - **Verification:** Vitest test suite in `frontend/` and `frontend-admin/`, and `go test ./...` in `backend/`.
  - _Requirements: 5.1, 5.2, 5.3, 5.4_
