# Verification Report - Runtime Integration (INT-01)

## Scope

- Feature: `product-favorites`
- Phase: `integration`
- Task: `INT-01`
- Contract baseline:
  - `FAVORITES-API@1`
  - `CATALOG-VIEWER@1`
  - `FAVORITE-AUTH-REDIRECT@1`
  - `FAVORITE-SESSION-STATE@1`
  - `FAVORITE-UI@1`
  - `FAVORITE-PERSISTENCE@1`

## Results

| Scenario/check | Expected | Actual | Result | Evidence |
|---|---|---|---|---|
| `FAVORITE-PERSISTENCE-010` (Schema & Integrity) | PostgreSQL schema assertions pass for primary key `(user_id, product_id)`, foreign key cascades, column constraints, and indexes | `persistence.assertions.sql` executed with 0 errors (`DO` succeeded) | PASS | `psql -f .dream/specs/product-favorites/contracts/persistence.assertions.sql` |
| `CATALOG-VIEWER-001` (Anonymous List) | Anonymous `GET /api/v1/products` returns `viewer.isFavorite: false` on every product item without favorite lookup | Status 200, 35 items retrieved, all items have `viewer.isFavorite: false` | PASS | Real HTTP request to running backend (`GET /api/v1/products`) |
| `CATALOG-VIEWER-002` (Anonymous Detail) | Anonymous `GET /api/v1/products/:id` returns product detail with `viewer.isFavorite: false` | Status 200, `viewer: {"isFavorite": false}` | PASS | Real HTTP request to running backend (`GET /api/v1/products/10000000-0000-0001-0000-000000000002`) |
| `FAVORITES-API-001` (Anonymous Auth Rejection) | Anonymous `GET /api/v1/favorites` returns 401 unauthorized with Vietnamese business message | Status 401, `error.code: "unauthorized"`, `error.message: "Vui lòng đăng nhập để sử dụng danh sách yêu thích"` | PASS | Real HTTP request without Authorization header |
| `FAVORITES-API-002` (Admin Role Rejection) | Admin bearer token on `GET /api/v1/favorites` returns 403 forbidden | Status 403, `error.code: "forbidden"`, `error.message: "Bạn không có quyền sử dụng danh sách yêu thích"` | PASS | Real HTTP request with admin JWT |
| `CATALOG-VIEWER-005` (Invalid Token on Products) | Invalid/expired bearer token on `GET /api/v1/products` returns 401 invalid_token | Status 401, `error.code: "invalid_token"`, `error.message: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn"` | PASS | Real HTTP request with `Bearer invalid-bearer-token` |
| `FAVORITES-API-017` (Invalid Token on Favorites) | Invalid/expired bearer token on `GET /api/v1/favorites` returns 401 invalid_token | Status 401, `error.code: "invalid_token"`, `error.message: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn"` | PASS | Real HTTP request with `Bearer invalid-bearer-token` |
| `FAVORITES-API-007` (Inactive Product Add) | Customer `PUT /api/v1/favorites/:inactiveProductId` returns 404 product_not_found | Status 404, `error.code: "product_not_found"`, `error.message: "Sản phẩm không tồn tại hoặc đã ngừng kinh doanh"` | PASS | Real HTTP request for inactive product `10000000-0000-0001-0000-000000000001` |
| `FAVORITES-API-005` (Add Favorite) | Customer `PUT /api/v1/favorites/:productId` adds relationship and returns 200 with Vietnamese message | Status 200, `data: {"productId": "10000000-0000-0001-0000-000000000002", "isFavorite": true}`, message: "Đã thêm sản phẩm vào yêu thích" | PASS | Real HTTP `PUT` request with customer JWT |
| `FAVORITES-API-006` (Repeat Add Idempotency) | Repeated `PUT /api/v1/favorites/:productId` maintains single relationship and returns 200 | Status 200, `data: {"productId": "10000000-0000-0001-0000-000000000002", "isFavorite": true}`, database row count unchanged | PASS | Repeated HTTP `PUT` request with customer JWT |
| `CATALOG-VIEWER-003` (Personalized Product List) | Authenticated customer `GET /api/v1/products` marks favorited product `viewer.isFavorite: true` and others `false` | Status 200, favorited item has `viewer.isFavorite: true`, non-favorited items have `false` | PASS | Real HTTP request with customer JWT |
| `CATALOG-VIEWER-004` (Personalized Product Detail) | Authenticated customer `GET /api/v1/products/:id` reflects `viewer.isFavorite: true` | Status 200, detail body has `viewer: {"isFavorite": true}` | PASS | Real HTTP request with customer JWT |
| `FAVORITES-API-003` (List Favorites & Pagination) | Customer `GET /api/v1/favorites` returns 12-item pagination and populated product summaries | Status 200, `meta.pagination: {page: 1, limit: 12, total: 1, totalPages: 1, hasNext: false, hasPrev: false}`, item contains all required product fields | PASS | Real HTTP request with customer JWT |
| `FAVORITES-API-011` (Customer Isolation) | Customer 2 cannot observe Customer 1's favorites; Customer 2's catalog list shows `viewer.isFavorite: false` | Status 200, Customer 2 favorites list is empty (count 0), product `10000000-0000-0001-0000-000000000002` shows `viewer.isFavorite: false` | PASS | Two distinct customer accounts tested sequentially |
| `FAVORITES-API-008` / `015` (UUID Validation) | Invalid UUID format in URL path returns 400 validation_error on PUT and DELETE | Status 400, `error.code: "validation_error"`, `error.fields.productId` populated | PASS | Real HTTP requests to `/favorites/not-a-uuid` |
| `FAVORITES-API-013` (Query Parameter Validation) | Out-of-spec query parameters (`page=0`, `limit=13`) return 400 validation_error | Status 400, `error.fields: {"limit": "must be 12", "page": "must be a positive integer"}` | PASS | Real HTTP request to `/favorites?page=0&limit=13` |
| `FAVORITES-API-009` (Delete Favorite) | Customer `DELETE /api/v1/favorites/:productId` removes relationship and returns 200 with Vietnamese message | Status 200, `data: {"productId": "10000000-0000-0001-0000-000000000002", "isFavorite": false}`, message: "Đã bỏ sản phẩm khỏi yêu thích" | PASS | Real HTTP `DELETE` request with customer JWT |
| `FAVORITES-API-010` (Repeat Delete Idempotency) | Repeated `DELETE /api/v1/favorites/:productId` succeeds idempotently | Status 200, `data: {"productId": "10000000-0000-0001-0000-000000000002", "isFavorite": false}`, product removed from catalog viewer & favorites | PASS | Repeated HTTP `DELETE` request with customer JWT |
| `PROCESS-RESTART-PERSISTENCE` | Database state survives server process restart; fresh backend instance serves persisted favorites | Backend server process terminated, recompiled (`server.exe`), started fresh. Customer logged in, fetched `/favorites` (count 1) and `/products/:id` (`viewer.isFavorite: true`) matching PostgreSQL state | PASS | Process lifecycle termination, restart, and post-restart query assertions |
| `ROOT-TEST-SUITE` | Full repository test suite (`make test`) across backend, frontend, and frontend-admin packages | All tests passed (Backend: 100%, Frontend: 28 test files / 167 tests, Frontend-Admin: 22 test files / 175 tests) | PASS | Root `make test` execution |
| `ROOT-BUILD-GATE` | Backend code generation and frontend production bundles (`make build`) compile cleanly | `sqlc generate`, `frontend` Vite build (dist/index.html, CSS, JS), `frontend-admin` Vite build clean | PASS | Root `make build` execution |

## Findings

None. All 21 runtime integration scenarios, database persistence assertions, process restart checks, and root build/test gates passed deterministically.
