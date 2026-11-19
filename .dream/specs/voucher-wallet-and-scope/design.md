# Design Document

## Overview

Thiết kế này triển khai hoàn chỉnh hai tính năng đã được phê duyệt trong `requirements.md` (`1.1–1.7`, `2.1–2.6`, `3.1–3.3`, `4.1–4.10`):
1. **Ví Voucher cá nhân (Customer Wallet & Claim Flow):** Bổ sung bảng `user_vouchers` lưu quan hệ sở hữu giữa khách hàng và voucher, cung cấp các endpoint khám phá voucher, lưu (claim) idempotent, và xem ví voucher cá nhân, đồng thời bắt buộc khách hàng phải có voucher trong ví mới áp dụng được ở `POST /api/v1/checkout/quote` và `POST /api/v1/orders`.
2. **Phạm vi áp dụng voucher theo sản phẩm / danh mục (`scope_type`):** Mở rộng bảng `vouchers` thêm cột `scope_type` (`all` | `categories` | `products`) cùng hai bảng nối `voucher_categories` và `voucher_products`. Cả `QuoteCheckout` và `CreateCheckoutOrder` dùng chung hàm domain tính `eligibleSubtotalVnd` và `discountVnd` trên đúng tập sản phẩm hợp lệ.

## Architecture

### Affected Boundaries
- **Database (`backend/db/migrations/`, `backend/db/queries/`):**
  - Migration `000028_voucher_wallet_and_scope.{up,down}.sql` thêm `vouchers.scope_type`, `voucher_categories`, `voucher_products`, và `user_vouchers`.
  - Mở rộng `ListCartRows` (`cart.sql`) và `LockSubmittedCartItems` (`orders.sql`) để trả về `p.category_id` cho từng sản phẩm trong giỏ/đơn.
  - Bổ sung các query sqlc trong `vouchers.sql` cho quản trị phạm vi, khám phá voucher công khai, claim idempotent, xem ví cá nhân, và kiểm tra quyền sở hữu / phạm vi khi checkout.
- **Backend Domain, Repository, UseCase, HTTP (`backend/internal/`):**
  - `domain/voucher.go`: Thêm `VoucherScopeType`, `VoucherScopeTarget`, `VoucherWalletStatus`, `UserVoucher`, `DiscoverVoucher`, `EvaluateVoucherScope`, và mở rộng `CalculateVoucherDiscount` / `CheckoutQuote`.
  - `domain/errors.go` & `delivery/http/response.go`: Thêm `ErrVoucherNotClaimed` (`409`, `voucher_not_claimed`) và `ErrVoucherScopeMismatch` (`409`, `voucher_scope_mismatch`).
  - `domain/cart.go` & `delivery/http/cart_handler.go`: Thêm trường `CategoryID` (`categoryId`) trên `CartItem`.
  - `repository/voucher_repository.go` & `usecase/voucher/`: Hỗ trợ CRUD phạm vi trong transaction (validate ID mục tiêu tồn tại), danh sách khám phá voucher, claim idempotent, và danh sách ví cá nhân.
  - `repository/order_repository.go`: `QuoteCheckout` và `CreateCheckoutOrder` cùng xác minh quyền sở hữu trong `user_vouchers`, tải danh sách mục tiêu phạm vi của voucher, tính `eligibleSubtotalVnd` theo `category_id` / `product_id`, kiểm tra `min_order_vnd` trên `eligibleSubtotalVnd`, và tính `discountVnd` trên `eligibleSubtotalVnd`.
- **Frontend Customer (`frontend/src/`):**
  - Mở rộng `api/types.ts` (thêm `categoryId` cho `CartItem`, thêm `scopeType`, `scopeCategories`, `scopeProducts`, `claimed`, `claimedAt`, `walletStatus`, `eligibleSubtotalVnd`).
  - Mở rộng `api/vouchers.ts` với `listDiscoverVouchers`, `claimVoucher`, `listWalletVouchers` (giữ `listAvailableVouchers` ánh xạ tới ví khả dụng cho Checkout).
  - Thêm trang `/vouchers` (`VouchersPage.tsx`) gồm 2 tab **Khám phá voucher** (có nút Lưu vào ví) và **Ví của tôi** (lọc theo trạng thái Khả dụng / Đã dùng hết / Hết hạn & không khả dụng).
  - Thêm liên kết điều hướng tới `/vouchers` trong `Header.tsx`, `AccountPage.tsx`, và `CheckoutPage.tsx`.
  - Cập nhật `CheckoutPage.tsx` hiển thị voucher từ ví cá nhân, tính trạng thái phù hợp cục bộ theo `item.productId` / `item.categoryId` của các item đang `selected`, hiển thị rõ phạm vi áp dụng và lý do không áp dụng được, và gửi `quoteCheckout` / `createOrder`.
- **Frontend Admin (`frontend-admin/src/`):**
  - Mở rộng `api/types.ts` và `api/vouchers.ts` với `scopeType`, `categoryIds`, `productIds`, `scopeCategories`, `scopeProducts`.
  - Cập nhật `VouchersPage.tsx` thêm bộ chọn phạm vi áp dụng (`Toàn sàn` / `Theo danh mục` / `Theo sản phẩm`) và hộp chọn nhiều danh mục/sản phẩm tải từ `categoriesApi` và `productsApi` hiện có.

## Components And Interfaces

#### Contract DB-VOUCHER-WALLET-SCOPE (rev 1)
Migration `000028_voucher_wallet_and_scope.up.sql`:
- `ALTER TABLE vouchers ADD COLUMN scope_type text NOT NULL DEFAULT 'all' CHECK (scope_type IN ('all', 'categories', 'products'));`
- `CREATE TABLE voucher_categories (voucher_id uuid NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE, category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE, PRIMARY KEY (voucher_id, category_id));`
- `CREATE INDEX voucher_categories_category_id_idx ON voucher_categories (category_id);`
- `CREATE TABLE voucher_products (voucher_id uuid NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE, product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE, PRIMARY KEY (voucher_id, product_id));`
- `CREATE INDEX voucher_products_product_id_idx ON voucher_products (product_id);`
- `CREATE TABLE user_vouchers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, voucher_id uuid NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE, claimed_at timestamptz NOT NULL DEFAULT now(), UNIQUE (user_id, voucher_id));`
- `CREATE INDEX user_vouchers_user_claimed_idx ON user_vouchers (user_id, claimed_at DESC, id DESC);`
- `CREATE INDEX user_vouchers_voucher_id_idx ON user_vouchers (voucher_id);`

#### Contract API-VOUCHER-ADMIN (rev 1)
Endpoints hiện có `/api/v1/admin/vouchers`, `/api/v1/admin/vouchers/:id`:
- Request body `POST` / `PUT` bổ sung:
  - `scopeType?: "all" | "categories" | "products"` (mặc định `"all"` khi rỗng)
  - `categoryIds?: string[]` (bắt buộc không rỗng khi `scopeType = "categories"`, phải rỗng khi khác)
  - `productIds?: string[]` (bắt buộc không rỗng khi `scopeType = "products"`, phải rỗng khi khác)
- Response object `Voucher` bổ sung:
  - `scopeType: "all" | "categories" | "products"`
  - `scopeCategories: Array<{ id: string; name: string }>` (mảng rỗng `[]` nếu không phải `categories`)
  - `scopeProducts: Array<{ id: string; name: string }>` (mảng rỗng `[]` nếu không phải `products`)
- Validation `400` (`validation_error`) trả `error.fields` khi:
  - `scopeType` không thuộc `all|categories|products`
  - `scopeType = categories` nhưng `categoryIds` rỗng / chứa UUID sai / trùng hoặc không tồn tại trong bảng `categories`, hoặc `productIds` không rỗng
  - `scopeType = products` nhưng `productIds` rỗng / chứa UUID sai / trùng hoặc không tồn tại trong bảng `products`, hoặc `categoryIds` không rỗng
  - `scopeType = all` nhưng `categoryIds` hoặc `productIds` không rỗng

#### Contract API-VOUCHER-CUSTOMER (rev 1)
Tất cả endpoint dưới `/api/v1/vouchers` yêu cầu `guard.AuthRequired` (`401` nếu chưa đăng nhập):
1. `GET /api/v1/vouchers/discover`
   - Trả về danh sách `DiscoverVoucher[]`: các voucher đang `active = true`, `starts_at <= now <= ends_at`, `usage_limit IS NULL OR used_count < usage_limit`.
   - Fields: toàn bộ trường cơ bản của voucher (`id`, `code`, `title`, `description`, `voucherType`, `discountValue`, `maxDiscountVnd`, `minOrderVnd`, `usageLimit`, `usedCount`, `perUserLimit`, `startsAt`, `endsAt`) + `scopeType`, `scopeCategories`, `scopeProducts`, `userRemainingUses`, `claimed: boolean`, `claimedAt: string | null`.
2. `POST /api/v1/vouchers/:id/claim`
   - Lưu voucher vào ví của user hiện tại.
   - Kiểm tra voucher tồn tại (`404 voucher_not_found`), `active` (`409 voucher_inactive`), `now >= startsAt` (`409 voucher_not_started`), `now <= endsAt` (`409 voucher_expired`), `usageLimit == nil || usedCount < *usageLimit` (`409 voucher_exhausted`).
   - Ghi nhận bằng `INSERT INTO user_vouchers ... ON CONFLICT (user_id, voucher_id) DO NOTHING` rồi đọc lại bản ghi ví để đảm bảo idempotent tuyệt đối dưới concurrent requests.
   - Trả `200 OK` kèm đối tượng `UserVoucher` (envelope chuẩn).
3. `GET /api/v1/vouchers/wallet` (tùy chọn query `?status=available|used_up|unavailable`)
   - Trả về danh sách `UserVoucher[]` đã claim bởi user hiện tại, sắp xếp theo `claimedAt DESC, id DESC`.
   - Fields: tương tự voucher + `scopeType`, `scopeCategories`, `scopeProducts`, `userRemainingUses`, `claimedAt`, `walletStatus: "available" | "used_up" | "expired" | "exhausted" | "inactive" | "scheduled"`.
   - Quy tắc tính `walletStatus`:
     - Nếu `!active` -> `inactive`
     - Nếu `now > endsAt` -> `expired`
     - Nếu `now < startsAt` -> `scheduled`
     - Nếu `userRemainingUses <= 0` -> `used_up`
     - Nếu `usageLimit != nil && usedCount >= *usageLimit` -> `exhausted`
     - Ngược lại -> `available`
4. `GET /api/v1/vouchers/available`
   - Bảo toàn endpoint hiện có cho màn hình Checkout nhưng **chuyển nguồn sang ví của user**: chỉ trả về các voucher user **đã claim** và đang có `walletStatus == "available"` (kèm `scopeType`, `scopeCategories`, `scopeProducts`, `claimedAt`).

#### Contract API-CHECKOUT-QUOTE-ORDER (rev 1)
1. `GET /api/v1/cart` (và các endpoint trả về `Cart`):
   - Mỗi phần tử trong `items` bổ sung trường `categoryId: string`.
2. `POST /api/v1/checkout/quote`:
   - Khi `voucherCode` không rỗng:
     - Kiểm tra voucher tồn tại (`404 voucher_not_found`).
     - Kiểm tra user đã claim voucher trong `user_vouchers` (`409 voucher_not_claimed`).
     - Kiểm tra trạng thái, thời gian, lượt tổng, lượt cá nhân (`409` tương ứng).
     - Tính tập item hợp lệ (`eligibleSubtotalVnd`, `eligibleItemCount`) theo `scopeType`:
       - `all`: tất cả item hợp lệ đang `selected`.
       - `categories`: các item có `categoryId` thuộc `voucher_categories`.
       - `products`: các item có `productId` thuộc `voucher_products`.
     - Nếu `scopeType != "all"` và `eligibleItemCount == 0` -> trả `409 voucher_scope_mismatch`.
     - Kiểm tra `eligibleSubtotalVnd >= minOrderVnd` -> nếu không đạt trả `409 voucher_min_order_not_met`.
     - Tính `discountVnd` trên `eligibleSubtotalVnd` (với `percent`/`fixed_amount`) hoặc `shippingFeeVnd` (với `freeship`).
   - Response `CheckoutQuote` bổ sung trường `eligibleSubtotalVnd: string` (bằng `subtotalVnd` khi không có voucher hoặc `scopeType = all`; bằng tổng phần hợp lệ khi áp dụng voucher có phạm vi).
3. `POST /api/v1/orders`:
   - Trong transaction (sau khi khóa user và khóa các dòng giỏ hàng/biến thể, trước khi trừ quota/kho):
     - Khóa hàng `vouchers` (`LockVoucherByCode`).
     - Thực thi đúng trình tự kiểm tra như `POST /api/v1/checkout/quote`: kiểm tra `user_vouchers`, phạm vi `categories`/`products`, `eligibleSubtotalVnd >= minOrderVnd`, và tính `discountVnd` từ `eligibleSubtotalVnd`.
     - Giữ nguyên thứ tự khóa xác định (`product_variants -> vouchers -> live_variant_prices -> flash_sale_items`) và cơ chế hoàn trả `voucher_usages` khi hủy đơn (không xóa bản ghi `user_vouchers`).

## Data Models

- `vouchers.scope_type`: `text NOT NULL DEFAULT 'all' CHECK (scope_type IN ('all', 'categories', 'products'))`.
- `voucher_categories`: bảng nối N-N giữa `vouchers` và `categories` (`ON DELETE CASCADE`).
- `voucher_products`: bảng nối N-N giữa `vouchers` và `products` (`ON DELETE CASCADE`).
- `user_vouchers`: bảng sở hữu ví cá nhân với ràng buộc `UNIQUE (user_id, voucher_id)`.
- Migration down (`000028_voucher_wallet_and_scope.down.sql`) gỡ bỏ `user_vouchers`, `voucher_products`, `voucher_categories` và cột `vouchers.scope_type`.

## Error Handling

Bổ sung các mã lỗi nghiệp vụ tiếng Việt theo chuẩn Full Status Envelope:
- `voucher_not_claimed` (`HTTP 409`): `"Bạn cần lưu mã giảm giá vào ví trước khi sử dụng"`
- `voucher_scope_mismatch` (`HTTP 409`): `"Mã giảm giá không áp dụng cho sản phẩm nào trong đơn hàng"`
- Giữ nguyên toàn bộ mã lỗi hiện có: `voucher_not_found` (`404`), `voucher_inactive` (`409`), `voucher_not_started` (`409`), `voucher_expired` (`409`), `voucher_exhausted` (`409`), `voucher_user_limit` (`409`), `voucher_min_order_not_met` (`409`).

## Testing Strategy

Tất cả tiêu chí nghiệm thu được kiểm chứng ở mức thấp nhất đủ tin cậy (`unit`, `integration-db`, `handler`, `component`) — không yêu cầu trình duyệt Playwright riêng biệt vì mọi logic điều hướng, chọn phạm vi, hiển thị ví và checkout đều kiểm chứng đầy đủ bằng Vitest + Testing Library và Go test suites.

## Requirement Traceability

| Requirement | Design Elements | Verification |
|---|---|---|
| 1.1, 1.2, 1.3, 1.4 | `DB-VOUCHER-WALLET-SCOPE@1`, `API-VOUCHER-ADMIN@1`, `usecase/voucher`, `repository/voucher_repository` | `unit`, `integration-db`, `handler` |
| 1.5, 1.6, 1.7 | `API-VOUCHER-ADMIN@1`, `frontend-admin/src/pages/VouchersPage.tsx` | `integration-db`, `handler`, `component` |
| 2.1, 2.2, 2.3, 2.4, 2.5, 2.6 | `DB-VOUCHER-WALLET-SCOPE@1`, `API-VOUCHER-CUSTOMER@1`, `repository/voucher_repository`, `delivery/http/voucher_handler.go` | `integration-db`, `handler` |
| 3.1, 3.2, 3.3 | `API-VOUCHER-CUSTOMER@1`, `frontend/src/pages/VouchersPage.tsx`, `Header.tsx`, `AccountPage.tsx` | `unit`, `handler`, `component` |
| 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7 | `API-CHECKOUT-QUOTE-ORDER@1`, `domain/voucher.go`, `repository/order_repository.go`, `frontend/src/pages/CheckoutPage.tsx` | `unit`, `integration-db`, `handler`, `component` |
| 4.8, 4.9, 4.10 | `repository/order_repository.go`, `repository/return_repository.go` | `integration-db` |

## Existing System Integration

- **Catalog Admin APIs (`GET /api/v1/admin/categories`, `GET /api/v1/admin/products`):** Tái sử dụng trực tiếp tại `frontend-admin` để chọn danh mục và sản phẩm trong form voucher; không tạo endpoint tra cứu song song.
- **Cart API (`GET /api/v1/cart`):** Mở rộng tối thiểu bằng trường `categoryId` trên `CartItem` để `CheckoutPage` và `QuoteCheckout` cùng xác định đúng phạm vi danh mục.
- **Checkout Quote & Create Order:** Tái sử dụng cùng hàm domain `EvaluateVoucherScope` và `CalculateVoucherDiscount` để đảm bảo kết quả báo giá và tạo đơn giống hệt nhau.
- **Order Cancellation & Returns:** Khi hủy đơn hàng, `restoreVoucherAndPromoTargetsSorted` vẫn hoàn trả `voucher_usages` và `vouchers.used_count` mà không xóa dòng `user_vouchers`. `return_repository.go` tiếp tục tính hoàn tiền dựa trên `order.DiscountVnd` đã lưu trên đơn hàng mà không thay đổi contract trả hàng.
