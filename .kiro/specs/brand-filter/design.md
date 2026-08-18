# Design Document

## Overview

This design adds a brand filter to the customer-facing catalog (`/products`). It addresses requirements 1-7. The product `brand` remains a plain-text column on `products`; no schema migration or new entity is introduced. The change is additive: the product search endpoint accepts one or more `brand` query parameters, a new catalog endpoint returns the list of selectable brands, and the catalog page renders a "Thương hiệu" multi-select filter wired into the existing URL-driven filter flow.

## Architecture

- **Boundary:** Backend `delivery -> usecase -> domain -> repository(sqlc)` and the frontend `api -> page` layers, exactly following existing catalog conventions (`ListCategories` is the closest analogue).
- **Composition root (Wire):** The backend DI graph (Google Wire in `cmd/server`) requires no changes. Catalog handlers are constructed inside `delivery.NewRouter` rather than injected, and this feature only adds a method to the existing catalog handler, use case, and repository, so `wire.go`/`wire_gen.go` are left untouched.
- **Data flow:**
  1. On catalog page mount, the frontend fetches selectable brands from `GET /api/v1/brands` and renders the "Thương hiệu" filter section.
  2. Selecting/deselecting a brand updates the URL `brand` query parameter (one per selected brand) and triggers a re-fetch of `GET /api/v1/products` with the `brand` parameters.
  3. The backend passes `Brands` through `ProductFilter` into `ListProducts`, which filters with a case-insensitive match; pagination (in-memory slicing in `ListProducts` handler) then applies to the brand-filtered result set.
- **Non-goals:** Brand remains free text; no `brands` table, no brand entity, no brand badges become links, no HomePage brand navigation changes. The existing `q` text search (which already matches brand) is unchanged.

## Components And Interfaces

### Domain (`backend/internal/domain/catalog.go`)
- `ProductFilter` gains `Brands []string`. Absent/empty slice means "no brand restriction".
- `CatalogRepository` interface gains `ListBrands(ctx context.Context) ([]string, error)`.

### Use case (`backend/internal/usecase/catalog/catalog.go`)
- `validateFilter` trims each brand value and drops empty entries from `f.Brands` (requirement 6.2).
- New `ListBrands(ctx)` passthrough to the repository.

### Product search query (`backend/db/queries/catalog.sql`)
- `ListProducts` gains an additional `AND` clause using the existing `sqlc.narg` array pattern:
  ```sql
  AND (sqlc.narg('brands')::text[] IS NULL
       OR p.brand ILIKE ANY (sqlc.narg('brands')::text[]))
  ```
  `ILIKE ANY` matches case-insensitively (requirement 2.5). When `brands` is NULL the clause is a no-op, preserving existing behavior for callers that do not send the parameter.

### New brand listing query (`backend/db/queries/catalog.sql`)
```sql
-- name: ListBrands :many
SELECT DISTINCT p.brand
FROM products p
WHERE p.active
  AND p.brand <> ''
  AND EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.active)
ORDER BY p.brand ASC;
```
- Visible-brand semantics match `ListCategories` (active product with at least one active variant) (requirements 1.2, 5.2).
- Empty brand strings are excluded because they are not selectable options.
- `ORDER BY brand ASC` gives deterministic ordering (requirement 5.3).

### Repository (`backend/internal/repository/catalog_repository.go`)
- `ListProducts`: set `params.Brands = f.Brands` only when `len(f.Brands) > 0`; otherwise leave nil.
- `ListBrands(ctx) ([]string, error)`: map `SELECT DISTINCT brand` rows to `[]string`.

### HTTP delivery (`backend/internal/delivery/http/`)
- `catalogHandler.ListBrands`: returns `writeSuccess(c, http.StatusOK, "", brands)` where `brands` is `[]string` (empty slice, never null) in the standard Full Status Envelope `data` field (requirement 5.1).
- `catalogHandler.ListProducts`: read `c.QueryArray("brand")` into `filter.Brands`. No new validation error path; empty values are ignored in the use case.
- `router.go`: register `api.GET("/brands", catalogHandler.ListBrands)` alongside `/categories`.

### Frontend API (`frontend/src/api/`)
- `types.ts`: `ProductFilterParams` gains `brand?: string | string[]`.
- `catalog.ts`: `listProducts`/`listProductsWithMeta` append one `brand` parameter per value (mirroring `category_id`); new `listBrands(): Promise<string[]>` calling `apiClient<string[]>('/brands')`.

### Catalog page (`frontend/src/pages/CatalogPage.tsx`)
- On mount, fetch brands together with categories; keep a `brands: string[]` state and a `brandLoading`/`brandError` flag. The brand list is global: it is fetched once and is never re-derived from the currently active filters (consistent with how the category filter behaves).
- Derive `selectedBrands = searchParams.getAll('brand')`, excluding empty values so a hand-edited URL like `?brand=` is never treated as a selection; include `selectedBrands.length > 0` in `hasActiveFilters`.
- Add a "Thương hiệu" sidebar section mirroring the existing "Danh mục" block: a checkbox row per brand, a "Bỏ chọn" reset action, and `handleBrandToggle` updating URL params (resetting `page`).
- Pass `brand: selectedBrands` to `listProductsWithMeta` (requirements 2, 3, 4).
- Brand section states (requirements 7.3, 7.4): a loading indicator while fetching; on failure, an inline retry action; product list fetch remains independent of brand-list fetch so the catalog still renders.

## Shared Contracts

- **`GET /api/v1/brands`** → `200` with `data: string[]` (distinct visible brands, alphabetical, empty array when none). Full Status Envelope, `error: null`.
- **`GET /api/v1/products`** — accepts repeated `brand` query parameters. Semantics: a product matches when its brand case-insensitively equals any provided value (OR within brand, AND across filter groups). No `brand` parameter means no brand restriction. Empty values are ignored. All existing parameters (`q`, `category_id`, `min_price`, `max_price`, `in_stock`, `page`, `limit`) are unchanged and compose with `brand`.
- Brand option values are compared against the canonical stored spelling via `ILIKE`; the URL uses standard percent-encoding for special characters (e.g., `A&B` becomes `A%26B`), decoded by the backend before matching.

## Data Models

No database schema, seed, or migration changes. `products.brand` (text) is the only persisted source of truth. The new response shape is `data: string[]`; the frontend `Brand` type is `string`.

## Error Handling

- No new error codes. A `brand` value that matches no product flows through the normal empty-results state (requirement 3.4).
- Brand-list request failures are contained to the brand section (inline retry); they never fail the product request (requirement 7.4).
- Invalid or non-matching brand parameters are not rejected at the API boundary; empty strings are dropped during filter validation (requirement 6.2).

## Testing Strategy

Backend (Go; unit + existing fake-repository and integration patterns):
- Use case: `validateFilter` trims brands and drops empty values; `ListBrands` passthrough.
- Repository integration: `ListProducts` with `Brands` returns only matching products, case-insensitively, and composes with category/price/in-stock; `ListBrands` returns distinct visible brands, excludes products with no active variant, excludes empty brand, ordered alphabetically.
- Handler: `/products` with repeated `brand` params passes them into the filter and returns brand-filtered pagination; `/brands` returns the envelope with `string[]`; empty `brand` is ignored.
- Extend catalog fake repositories (`fakerepos`) with `ListBrands` for handler/use-case tests.

Frontend (Vitest + RTL, API mocked):
- `catalog.ts`: `listBrands` requests `/brands`; `listProducts` appends `brand` params.
- `CatalogPage.test.tsx`: brand section renders options; toggling updates the URL and re-fetches with `brand`; deselection removes the param; brand composes with other filters; brand section loading/error states render without breaking the product list; brand-driven empty result renders the empty state.

## Requirement Traceability

| Requirement | Design Elements | Verification |
|---|---|---|
| 1.1, 1.2, 1.3, 1.4 | `ListBrands` query + `/brands` endpoint; CatalogPage "Thương hiệu" section | Handler/use-case tests for `/brands`; CatalogPage render test for options; repository test for visible-brand semantics |
| 2.1, 2.2, 2.3, 2.4, 2.5 | `ProductFilter.Brands`, `brand` params in `/products`, `ILIKE ANY` clause | Repository integration + handler tests; CatalogPage filter test |
| 3.1, 3.2, 3.3, 3.4 | URL `brand` params; `handleBrandToggle`; empty state | CatalogPage URL/re-fetch tests; empty-state test |
| 4.1, 4.2 | Reset `page` on brand change; brand filter applied before in-memory pagination | CatalogPage test asserting page reset; handler pagination test |
| 5.1, 5.2, 5.3 | `/brands` endpoint; `ListBrands` visibility + ordering | Handler + repository tests |
| 6.1, 6.2, 6.3 | `brand` query param parsing; empty dropped in `validateFilter`; filter-before-pagination | Handler + use-case tests |
| 7.1, 7.2, 7.3, 7.4 | Checkbox rows with accessible labels; state not color-only; loading indicator; inline retry | CatalogPage accessibility/state tests |