# Verification Report

## Scope

- Feature: `purchased-product-reviews`
- Phase: `integration`
- Contract baseline: `PURCHASED-REVIEW-API@5` (inherits `@4` and `@3`)

## Results

| Scenario/check | Expected | Actual | Result | Evidence |
|---|---|---|---|---|
| `PURCHASED-REVIEW-API-R4-006` | Invalid response content returns validation error and preserves state | Provider HTTP and repository tests pass, including trim/length validation | PASS | `backend/internal/delivery/http/review_handler_test.go`, `make test-integration` |
| `PURCHASED-REVIEW-API-R4-005` | Concurrent create leaves one response and one conflict | PostgreSQL integration tests pass | PASS | `make test-integration` (`15.052s`) |
| `PURCHASED-REVIEW-API-R4-004` | Stale response version returns conflict without overwrite | PostgreSQL/provider tests pass | PASS | `make test-integration`, backend review tests |
| Admin unauthenticated HTTP smoke | Missing admin auth returns Vietnamese 401 envelope | Built current backend binary on `:18080` returned `401`, `unauthorized`, Vietnamese message | PASS | bounded `Start-Process runtime-int03-server.exe`; cleanup confirmed port released |
| Package regression gates | All package tests/builds pass | Root `make test` and `make build` pass; backend `make vet` pass | PASS | command output |
| Full admin-to-customer browser flow | Create/update response, conflict/retry, public and owner-history visibility | Provisioned local admin/customer/order/review fixture; admin browser route updated response successfully and customer product page rendered `Phản hồi từ cửa hàng` with current content | PASS | Playwright on `http://127.0.0.1:5174/reviews` and `http://127.0.0.1:5173/products/10000000-0000-0001-0000-000000000001` |
| `PURCHASED-REVIEW-API-R5-001` | Anonymous public collection returns a masked current author label and no identity metadata | Live HTTP returned `i***@example.com`, `viewer: null`, and contained neither the full fixture email nor user ID | PASS | bounded runtime HTTP matrix |
| `PURCHASED-REVIEW-API-R5-003` | Owner/admin reads retain neutral author semantics | Live owner history and admin collection returned `Khách hàng đã mua hàng`; response data remained available | PASS | bounded runtime HTTP matrix and Playwright admin network response |
| `PURCHASED-REVIEW-API-R5-004` | Public label follows the current account email | Updating the fixture email produced `n***@example.org` on the next read; the original email was restored | PASS | bounded runtime HTTP matrix |
| `PURCHASED-REVIEW-API-R5-006` | Frontend-admin revision 4 consumer remains compatible with provider revision 5 | Real admin app loaded the provider-5 admin collection successfully; admin response representation remained unchanged | PASS | Playwright admin smoke and `frontend-admin` gates |
| Public review browser consumer | Masked label is rendered verbatim on the product page | Playwright found `i***@example.com` twice and reported zero console errors after proxy configuration was corrected | PASS | `.playwright-mcp/page-2026-08-29T13-43-27-109Z.yml` |

## Findings

- Local runtime fixture was provisioned for the verification run; it is test data, not a production seed change.
- Runtime process cleanup was verified after the final HTTP/browser run; backend and both Vite ports `18080`, `5173`, and `5174` were released.
- The first browser attempt used a Vite process without `HTTP_PORT=18080` and produced proxy `502`; it was discarded after diagnosis. The successful run used the explicit `HTTP_PORT=18080` proxy target.
