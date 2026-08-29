# Verification Report

## Scope

- Feature: `purchased-product-reviews`
- Phase: `integration`
- Contract baseline: `PURCHASED-REVIEW-API@4`

## Results

| Scenario/check | Expected | Actual | Result | Evidence |
|---|---|---|---|---|
| `PURCHASED-REVIEW-API-R4-006` | Invalid response content returns validation error and preserves state | Provider HTTP and repository tests pass, including trim/length validation | PASS | `backend/internal/delivery/http/review_handler_test.go`, `make test-integration` |
| `PURCHASED-REVIEW-API-R4-005` | Concurrent create leaves one response and one conflict | PostgreSQL integration tests pass | PASS | `make test-integration` (`15.052s`) |
| `PURCHASED-REVIEW-API-R4-004` | Stale response version returns conflict without overwrite | PostgreSQL/provider tests pass | PASS | `make test-integration`, backend review tests |
| Admin unauthenticated HTTP smoke | Missing admin auth returns Vietnamese 401 envelope | Built current backend binary on `:18080` returned `401`, `unauthorized`, Vietnamese message | PASS | bounded `Start-Process runtime-int03-server.exe`; cleanup confirmed port released |
| Package regression gates | All package tests/builds pass | Root `make test` and `make build` pass; backend `make vet` pass | PASS | command output |
| Full admin-to-customer browser flow | Create/update response, conflict/retry, public and owner-history visibility | Provisioned local admin/customer/order/review fixture; admin browser route updated response successfully and customer product page rendered `Phản hồi từ cửa hàng` with current content | PASS | Playwright on `http://127.0.0.1:5174/reviews` and `http://127.0.0.1:5173/products/10000000-0000-0001-0000-000000000001` |

## Findings

- Local runtime fixture was provisioned for the verification run; it is test data, not a production seed change.
- Runtime process cleanup was verified after each binary smoke test; no project server remains listening on port `18080`.
