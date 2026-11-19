# Implementation Plan

- [x] 1. Database Schema, Queries, and Domain Foundations

- [x] 1.1 Add voucher wallet and scope migration, SQL queries, and domain contracts
  - **Produces:** Migration `000028_voucher_wallet_and_scope.{up,down}.sql`, updated sqlc queries (`vouchers.sql`, `cart.sql`, `orders.sql`), regenerated sqlc models, and domain types/functions (`VoucherScopeType`, `VoucherScopeTarget`, `VoucherWalletStatus`, `UserVoucher`, `DiscoverVoucher`, `EvaluateVoucherScope`, `ErrVoucherNotClaimed`, `ErrVoucherScopeMismatch`, `CartItem.CategoryID`, `CheckoutQuote.EligibleSubtotalVND`).
  - **Scope:** `backend/db/migrations/`, `backend/db/queries/`, `backend/internal/repository/sqlc/`, `backend/internal/domain/`, `backend/internal/delivery/http/response.go`, `backend/internal/delivery/http/cart_handler.go`, `backend/internal/repository/cart_repository.go`, and domain unit tests.
  - **Consumes:** Existing `vouchers`, `categories`, `products`, `users`, `cart_items` schema.
  - **Contracts:** `DB-VOUCHER-WALLET-SCOPE@1` (provider); `API-CHECKOUT-QUOTE-ORDER@1` (provider)
  - **Acceptance:** Migration applies cleanly (`make db-up`), sqlc generates cleanly, `CartItem` exposes `categoryId`, and domain unit tests prove scope evaluation, wallet status derivation, and scoped discount calculation for `all`, `categories`, `products`, and `freeship`.
  - **Verification:** `unit` tests in `backend/internal/domain/`.
  - _Requirements: 1.1, 1.7, 3.1, 4.3, 4.4, 4.5, 4.7_

- [x] 2. Backend Voucher Admin Scope, Customer Discovery, Claim, and Wallet

- [x] 2.1 Implement admin voucher scope persistence, validation, and HTTP handlers
  - **Produces:** Extended `POST/PUT/GET /api/v1/admin/vouchers` supporting `scopeType`, `categoryIds`, `productIds`, `scopeCategories`, `scopeProducts`.
  - **Scope:** `backend/internal/repository/voucher_repository.go`, `backend/internal/usecase/voucher/`, `backend/internal/delivery/http/admin_voucher_handler.go`, and tests.
  - **Consumes:** `DB-VOUCHER-WALLET-SCOPE@1`, existing `categories` and `products` tables.
  - **Contracts:** `DB-VOUCHER-WALLET-SCOPE@1` (consumer); `API-VOUCHER-ADMIN@1` (provider)
  - **Acceptance:** Admin can create/update/read vouchers with `all`, `categories`, or `products` scope; invalid/empty/non-existent target IDs return `400 validation_error`; existing vouchers default to `all`.
  - **Verification:** `unit`, `integration-db`, and `handler` tests.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 1.7_

- [x] 2.2 Implement customer voucher discovery, idempotent claim, and personal wallet endpoints
  - **Produces:** `GET /api/v1/vouchers/discover`, `POST /api/v1/vouchers/:id/claim`, `GET /api/v1/vouchers/wallet`, and wallet-backed `GET /api/v1/vouchers/available`.
  - **Scope:** `backend/internal/repository/voucher_repository.go`, `backend/internal/usecase/voucher/`, `backend/internal/delivery/http/voucher_handler.go`, `backend/internal/delivery/http/router.go`, and tests.
  - **Consumes:** `DB-VOUCHER-WALLET-SCOPE@1`.
  - **Contracts:** `DB-VOUCHER-WALLET-SCOPE@1` (consumer); `API-VOUCHER-CUSTOMER@1` (provider)
  - **Acceptance:** Authenticated users can discover active vouchers with claim state and scope targets, claim vouchers idempotently without incrementing `used_count`, view wallet filtered by status, and unauthenticated callers receive `401`.
  - **Verification:** `integration-db` and `handler` tests.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2_

- [x] 3. Backend Checkout Quote & Order Creation Enforcement

- [x] 3.1 Enforce wallet ownership and product/category scope in QuoteCheckout and CreateCheckoutOrder
  - **Produces:** Updated `POST /api/v1/checkout/quote` and `POST /api/v1/orders` enforcing `user_vouchers` ownership, scope matching (`all` | `categories` | `products`), `minOrderVnd` on `eligibleSubtotalVnd`, and scoped `discountVnd` with parity between quote and order creation.
  - **Scope:** `backend/internal/repository/order_repository.go`, `backend/internal/delivery/http/order_handler.go`, and order/return repository & handler tests.
  - **Consumes:** `DB-VOUCHER-WALLET-SCOPE@1`, `EvaluateVoucherScope`, `CalculateVoucherDiscount`.
  - **Contracts:** `DB-VOUCHER-WALLET-SCOPE@1` (consumer); `API-CHECKOUT-QUOTE-ORDER@1` (provider)
  - **Acceptance:** Unclaimed vouchers fail with `409 voucher_not_claimed`; non-matching carts fail with `409 voucher_scope_mismatch`; `minOrderVnd` and `discountVnd` compute identically on `eligibleSubtotalVnd` in both quote and create; concurrent orders respect limits; cancelled orders restore usage while keeping voucher in wallet; return refund calculation remains compatible.
  - **Verification:** `integration-db` and `handler` tests.
  - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10_

- [x] 4. Frontend Admin Voucher Scope Configuration

- [x] 4.1 Add scope selector and category/product multi-select to Admin VouchersPage
  - **Produces:** Updated `frontend-admin` voucher types, API client, and `VouchersPage.tsx` with scope configuration and display.
  - **Scope:** `frontend-admin/src/api/types.ts`, `frontend-admin/src/api/vouchers.ts`, `frontend-admin/src/pages/VouchersPage.tsx`, and Vitest tests.
  - **Consumes:** `API-VOUCHER-ADMIN@1`, existing `categoriesApi.list()` and `productsApi.list()`.
  - **Contracts:** `API-VOUCHER-ADMIN@1` (consumer)
  - **Acceptance:** Admin form allows selecting `all`, `categories`, or `products`, picks categories/products by name from existing admin catalog APIs, validates non-empty targets before submit, and displays scope summary in the vouchers list.
  - **Verification:** `component` tests in `frontend-admin/`.
  - _Requirements: 1.5, 1.6_

- [x] 5. Frontend Customer Voucher Hub, Wallet, and Scoped Checkout

- [x] 5.1 Build Customer Voucher Hub & Wallet page and navigation links
  - **Produces:** Customer `/vouchers` page (`VouchersPage.tsx`) with Discover & My Wallet tabs, claim button, wallet status filters, scope badges, and navigation links from `Header`, `AccountPage`, and `CheckoutPage`.
  - **Scope:** `frontend/src/api/types.ts`, `frontend/src/api/vouchers.ts`, `frontend/src/pages/VouchersPage.tsx`, `frontend/src/App.tsx`, `frontend/src/components/Header.tsx`, `frontend/src/pages/AccountPage.tsx`, and Vitest tests.
  - **Consumes:** `API-VOUCHER-CUSTOMER@1`.
  - **Contracts:** `API-VOUCHER-CUSTOMER@1` (consumer)
  - **Acceptance:** Authenticated users can browse discoverable vouchers, claim vouchers into wallet with live UI state update, filter wallet by status, and navigate easily from Header/Account/Checkout.
  - **Verification:** `component` tests in `frontend/`.
  - _Requirements: 2.1, 2.2, 3.1, 3.2, 3.3_

- [x] 5.2 Update CheckoutPage to use claimed wallet vouchers and display scope eligibility
  - **Produces:** Updated `CheckoutPage.tsx` showing wallet vouchers with scope labels, local eligibility check against selected cart items' `productId`/`categoryId` and `eligibleSubtotalVnd`, link to `/vouchers` when wallet is empty, and quote/order parity display.
  - **Scope:** `frontend/src/pages/CheckoutPage.tsx`, `frontend/src/pages/CheckoutPage.test.tsx`, `frontend/src/api/vouchers.test.ts`.
  - **Consumes:** `API-VOUCHER-CUSTOMER@1`, `API-CHECKOUT-QUOTE-ORDER@1`.
  - **Contracts:** `API-VOUCHER-CUSTOMER@1` (consumer); `API-CHECKOUT-QUOTE-ORDER@1` (consumer)
  - **Acceptance:** Checkout lists wallet vouchers, disables or annotates vouchers that do not match selected items' scope or minimum eligible subtotal, shows error messages for unclaimed/mismatched manual codes, and displays quote breakdown including discount and total matching order creation.
  - **Verification:** `component` tests in `frontend/`.
  - _Requirements: 4.1, 4.2, 4.6, 4.7_
