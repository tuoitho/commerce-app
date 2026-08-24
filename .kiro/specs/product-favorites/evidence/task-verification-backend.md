# Verification Report: backend-commerce Workstream

## Scope

- Feature: `product-favorites`
- Phase: `workstream`
- Workstream: `backend-commerce`
- Tasks: `BE-01`, `BE-02`, `BE-03`
- Contract baseline:
  - `FAVORITES-API@1`
  - `CATALOG-VIEWER@1`
  - `FAVORITE-PERSISTENCE@1`

## Results

| Scenario/check | Expected | Actual | Result | Evidence |
|---|---|---|---|---|
| `FAVORITE-PERSISTENCE-001` | Concurrent inserts create exactly 1 row without duplicate-key errors | Exactly 1 row created with valid PostgreSQL created_at | PASS | `go test -v ./internal/repository -run TestFavoritePersistence_001_ConcurrentInsert` |
| `FAVORITE-PERSISTENCE-002` | Idempotent add preserves original created_at timestamp | Original created_at preserved across repeated adds | PASS | `go test -v ./internal/repository -run TestFavoritePersistence_002_IdempotentAddPreservesCreatedAt` |
| `FAVORITE-PERSISTENCE-003` | User physical deletion cascades to product_favorites | Referenced rows deleted on user deletion; other user rows intact | PASS | `go test -v ./internal/repository -run TestFavoritePersistence_003_UserCascade` |
| `FAVORITE-PERSISTENCE-004` | Product physical deletion cascades to product_favorites | Referenced rows deleted on product deletion; other product rows intact | PASS | `go test -v ./internal/repository -run TestFavoritePersistence_004_ProductCascade` |
| `FAVORITE-PERSISTENCE-005` | Soft-deleted product remains in favorite list with active=false, inStock=false | Projected favorite returned with active=false, inStock=false | PASS | `go test -v ./internal/repository -run TestFavoritePersistence_005_SoftDeletedProductProjected` |
| `FAVORITE-PERSISTENCE-006` | Pagination ordered by created_at DESC, product_id ASC without duplicates across pages | Correct ordering, no duplicates between page 1 and page 2, count scoped to user | PASS | `go test -v ./internal/repository -run TestFavoritePersistence_006_PaginationOrdering` |
| `FAVORITE-PERSISTENCE-007` | Scoped delete is idempotent and does not affect other customers | Relationship removed without error; other customer rows unaffected | PASS | `go test -v ./internal/repository -run TestFavoritePersistence_007_ScopedDeleteIdempotent` |
| `FAVORITE-PERSISTENCE-008` | Atomic add enforces active product and active variant eligibility | Inactive/no-active-variant fails with ErrProductNotFound; active succeeds | PASS | `go test -v ./internal/repository -run TestFavoritePersistence_008_EligibilityEnforced` |
| `FAVORITE-PERSISTENCE-009` | Batch lookup is scoped to customer and requested product IDs | Returns only requested customer favorite IDs; other users/products excluded | PASS | `go test -v ./internal/repository -run TestFavoritePersistence_009_BatchStatusScoped` |
| `FAVORITE-PERSISTENCE-010` | Migration up/down/up cycle passes schema assertions | Migration applied cleanly; persistence.assertions.sql passed | PASS | `psql -f .kiro/specs/product-favorites/contracts/persistence.assertions.sql` |
| `FAVORITES-API-001` | Missing Authorization header returns 401 unauthorized | Status 401, error.code `unauthorized`, Vietnamese message | PASS | `go test -v ./internal/delivery/http -run TestFavoritesAPI_001_MissingAuth` |
| `FAVORITES-API-002` | Admin token returns 403 forbidden | Status 403, error.code `forbidden`, Vietnamese message | PASS | `go test -v ./internal/delivery/http -run TestFavoritesAPI_002_AdminTokenForbidden` |
| `FAVORITES-API-003` | Default pagination returns 12 newest items with viewer.isFavorite=true | Status 200, 12 newest items, pagination metadata matched | PASS | `go test -v ./internal/delivery/http -run TestFavoritesAPI_003_ListDefaultPaginationAndOrdering` |
| `FAVORITES-API-004` | Out-of-range page returns empty array with valid pagination meta | Status 200, data=[], pagination total=15, totalPages=2, page=3 | PASS | `go test -v ./internal/delivery/http -run TestFavoritesAPI_004_OutOfRangePage` |
| `FAVORITES-API-005` | PUT /api/v1/favorites/:id adds favorite and returns 200 | Status 200, message "Đã thêm sản phẩm vào yêu thích", isFavorite=true | PASS | `go test -v ./internal/delivery/http -run TestFavoritesAPI_005_006_AddFavoriteIdempotent` |
| `FAVORITES-API-006` | Repeated PUT preserves first timestamp and returns 200 | Status 200, relationship preserved idempotently | PASS | `go test -v ./internal/delivery/http -run TestFavoritesAPI_005_006_AddFavoriteIdempotent` |
| `FAVORITES-API-007` | PUT on inactive product returns 404 product_not_found | Status 404, error.code `product_not_found`, Vietnamese message | PASS | `go test -v ./internal/delivery/http -run TestFavoritesAPI_007_AddInactiveProduct` |
| `FAVORITES-API-008` | PUT with invalid UUID returns 400 validation_error on productId | Status 400, error.code `validation_error`, fields.productId present | PASS | `go test -v ./internal/delivery/http -run TestFavoritesAPI_008_AddInvalidUUID` |
| `FAVORITES-API-009` | DELETE /api/v1/favorites/:id removes favorite and returns 200 | Status 200, message "Đã bỏ sản phẩm khỏi yêu thích", isFavorite=false | PASS | `go test -v ./internal/delivery/http -run TestFavoritesAPI_009_010_RemoveFavoriteIdempotent` |
| `FAVORITES-API-010` | DELETE non-existent favorite returns 200 idempotently | Status 200, message "Đã bỏ sản phẩm khỏi yêu thích", isFavorite=false | PASS | `go test -v ./internal/delivery/http -run TestFavoritesAPI_009_010_RemoveFavoriteIdempotent` |
| `FAVORITES-API-011` | Customer isolation on favorites | Customer 1 delete does not remove customer 2 favorite | PASS | `go test -v ./internal/delivery/http -run TestFavoritesAPI_011_CustomerIsolation` |
| `FAVORITES-API-012` | Inactive favorite list projection preserves metadata with active=false | Status 200, item active=false, inStock=false, viewer.isFavorite=true | PASS | `go test -v ./internal/delivery/http -run TestFavoritesAPI_012_InactiveFavoriteListProjection` |
| `FAVORITES-API-013` | GET /favorites?page=0&limit=13 returns 400 validation_error | Status 400, fields contains `page` and `limit` | PASS | `go test -v ./internal/delivery/http -run TestFavoritesAPI_013_014_PaginationValidation` |
| `FAVORITES-API-014` | GET /favorites with invalid page/limit formats returns 400 | Status 400, invalid fields highlighted individually | PASS | `go test -v ./internal/delivery/http -run TestFavoritesAPI_013_014_PaginationValidation` |
| `FAVORITES-API-015` | DELETE with invalid UUID returns 400 validation_error | Status 400, fields.productId present | PASS | `go test -v ./internal/delivery/http -run TestFavoritesAPI_015_DeleteInvalidUUID` |
| `FAVORITES-API-016` | Unexpected repository failure returns 500 without leaking secrets | Status 500, error.code `internal`, "Đã xảy ra lỗi hệ thống", no leaked details | PASS | `go test -v ./internal/delivery/http -run TestFavoritesAPI_016_InternalError` |
| `CATALOG-VIEWER-001` | Anonymous GET /products returns viewer.isFavorite=false without DB queries | Status 200, viewer.isFavorite=false on all items, 0 favorite queries | PASS | `go test -v ./internal/delivery/http -run TestCatalogViewer_001_AnonymousListProducts` |
| `CATALOG-VIEWER-002` | Customer GET /products uses batch lookup for viewer.isFavorite | Status 200, favorite items marked true, exactly 1 batch lookup call | PASS | `go test -v ./internal/delivery/http -run TestCatalogViewer_002_CustomerListProductsBatchLookup` |
| `CATALOG-VIEWER-003` | Customer GET /products/featured sets viewer.isFavorite | Status 200, featured product viewer.isFavorite=true | PASS | `go test -v ./internal/delivery/http -run TestCatalogViewer_003_CustomerFeaturedProducts` |
| `CATALOG-VIEWER-004` | Customer GET /products/:id sets viewer.isFavorite | Status 200, detail response viewer.isFavorite=true, intrinsic fields intact | PASS | `go test -v ./internal/delivery/http -run TestCatalogViewer_004_CustomerProductDetail` |
| `CATALOG-VIEWER-005` | Invalid/expired token on /products returns 401 invalid_token | Status 401, error.code `invalid_token`, Vietnamese message | PASS | `go test -v ./internal/delivery/http -run TestCatalogViewer_005_013_InvalidOrExpiredToken` |
| `CATALOG-VIEWER-006` | Admin token on /products returns viewer.isFavorite=false without lookup | Status 200, all items false, 0 favorite queries executed | PASS | `go test -v ./internal/delivery/http -run TestCatalogViewer_006_AdminTokenYieldsFalseWithoutLookup` |
| `CATALOG-VIEWER-007` | Anonymous /products preserves all intrinsic catalog behavior | Status 200, identical ordering, filters, prices, pagination | PASS | `go test -v ./internal/delivery/http -run TestCatalogViewer_007_009_010_AnonymousPreservesIntrinsic` |
| `CATALOG-VIEWER-009` | Anonymous /products/featured preserves intrinsic behavior | Status 200, identical featured products with additive viewer.isFavorite=false | PASS | `go test -v ./internal/delivery/http -run TestCatalogViewer_007_009_010_AnonymousPreservesIntrinsic` |
| `CATALOG-VIEWER-010` | Anonymous /products/:id preserves intrinsic detail behavior | Status 200, identical detail fields with additive viewer.isFavorite=false | PASS | `go test -v ./internal/delivery/http -run TestCatalogViewer_007_009_010_AnonymousPreservesIntrinsic` |
| `CATALOG-VIEWER-012` | Batch lookup failure returns 500 internal error | Status 500, error.code `internal`, "Đã xảy ra lỗi hệ thống" | PASS | `go test -v ./internal/delivery/http -run TestCatalogViewer_012_BatchLookupFailureReturns500` |
| `CATALOG-VIEWER-013` | Invalid token on all catalog endpoints returns 401 invalid_token | Status 401 on /products, /featured, /:id with consistent message | PASS | `go test -v ./internal/delivery/http -run TestCatalogViewer_005_013_InvalidOrExpiredToken` |
| `COMPILER / VET` | Static analysis `go vet ./...` | 0 errors / warnings | PASS | `go vet ./...` |
| `FULL SUITE` | All unit and integration test suites `go test ./...` | All packages pass | PASS | `go test ./...` |

## Findings

None. All 10 persistence scenarios, 16 API scenarios, and 12 catalog viewer scenarios passed their deterministic task gates.
