# Kế hoạch Thực hiện (Implementation Plan)

- [x] 1. Backend: Cấu hình Nền tảng, Khôi phục Mật khẩu, Khám phá Danh mục & Chiến dịch Flash Sale

- [x] 1.1 Cấu hình nền tảng `CONFIG-PLATFORM@1`, hạ tầng Mailpit, migration `000025` và API Khôi phục mật khẩu Email OTP (`API-AUTH-RECOVERY@1`)
  - **Produces:**
    - Mở rộng `backend/internal/config/config.go` và `backend/.env.example` nạp & xác thực các biến `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`, `PASSWORD_RESET_OTP_TTL`, `SHIPPING_STANDARD_HN_HCM_VND`, `SHIPPING_STANDARD_MAJOR_CITY_VND`, `SHIPPING_STANDARD_OTHER_VND`, `SHIPPING_EXPRESS_2H_VND`, `FREE_SHIPPING_THRESHOLD_VND` theo `CONFIG-PLATFORM@1`.
    - Thêm `compose.mailpit.yml` (`11025:1025`, `18025:8025`), target `mailpit-up` / `mailpit-down` trong `Makefile` gốc, cập nhật `deployment/docker-compose.yml` và cài đặt adapter `backend/internal/mail/smtp` thực thi `domain.Mailer` (tuyệt đối không ghi log `SMTPPassword` hoặc OTP).
    - Thêm cặp migration `backend/db/migrations/000025_auth_password_recovery.{up,down}.sql` tạo bảng `password_reset_otps` và chỉ mục theo `DB-AUTH-RECOVERY@1`, cập nhật truy vấn SQL và chạy `sqlc generate`.
    - Mở rộng `backend/internal/usecase/auth`, `backend/internal/delivery/http/{auth_handler,error,router}.go` và Wire DI (`backend/cmd/server/{app,wire,wire_gen}.go`) cung cấp `POST /api/v1/auth/forgot-password` và `POST /api/v1/auth/reset-password`; ghi nhận các khóa snapshot khôi phục mật khẩu vào `.dream/specs/commerce-platform-enhancements/contract-snapshots.json`.
  - **Scope:**
    - Đảm bảo chống dò tài khoản (phản hồi `200` đồng nhất và đếm tần suất `5 yêu cầu / 15 phút` theo `email` cho cả tài khoản không tồn tại hoặc bị khóa), giới hạn tối đa `5` lần nhập sai mỗi OTP, cập nhật mật khẩu + thu hồi toàn bộ `refresh_tokens` của người dùng trong cùng giao dịch và xóa cookie `refresh_token`.
    - Viết unit tests (`config_test.go`, `mailer_test.go`, `auth_test.go`), integration-db tests cho migration `000025` + giao dịch OTP/session, và handler tests (`auth_handler_test.go`).
  - **Consumes:** Bảng `users`, `refresh_tokens`, `SessionRepository.RevokeRefreshTokensByUserID` và cơ chế Viper/JWT hiện hữu.
  - **Contracts:** CONFIG-PLATFORM@1 (provider); DB-AUTH-RECOVERY@1 (provider); API-AUTH-RECOVERY@1 (provider)
  - **Acceptance:**
    - Khởi động đọc đúng độ ưu tiên biến môi trường so với `.env`, từ chối cấu hình cổng/thời lượng/tiền tệ sai định dạng và không bao giờ xuất `SMTPPassword` hay OTP ra `slog`.
    - `POST /api/v1/auth/forgot-password` gửi OTP 6 chữ số qua SMTP cho tài khoản đang hoạt động, trả cùng cấu trúc `200` cho email không tồn tại/bị khóa, trả `429 otp_rate_limited` ở lần thứ 6 trong 15 phút và trả `502 email_delivery_failed` khi SMTP lỗi.
    - `POST /api/v1/auth/reset-password` từ chối sau 5 lần sai (`400 invalid_or_expired_otp`), và khi hợp lệ sẽ đổi mật khẩu mới + thu hồi mọi refresh token cũ nguyên tử.
  - **Verification:** `unit`, `integration-db`, `handler`.
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 1.2 Migration `000026` (`DB-CATALOG-DISCOVERY@1`), Tìm kiếm Tiếng Việt Không dấu, Sắp xếp/Thống kê Danh mục, Thông số Kỹ thuật `specs` & Tải Ảnh Object Storage (`API-CATALOG-MEDIA-SPECS@1`)
  - **Produces:**
    - Thêm cặp migration `backend/db/migrations/000026_catalog_specs_search_flash_sales.{up,down}.sql` kích hoạt `unaccent`, `pg_trgm`, `btree_gist`, tạo hàm bất biến `f_unaccent(text)` (xử lý `đ`/`Đ` -> `d`), cột `products.specs` (`jsonb`), chỉ mục GIN `products_search_trgm_idx`, bảng `flash_sales`, `flash_sale_items` và các view `flash_sale_running_variants` / `flash_sale_active_variant_prices` theo `DB-CATALOG-DISCOVERY@1`.
    - Cập nhật `backend/db/seed/catalog.sql` bổ sung dữ liệu `specs` thực tế theo 6 nhóm chuẩn cho các mẫu điện thoại trong danh mục mẫu.
    - Cập nhật `backend/db/queries/catalog.sql`, chạy `sqlc generate`, và mở rộng `CatalogRepository`, fake catalog repository (`internal/usecase/catalog/fakerepos`) cùng `catalog.UseCase` để hỗ trợ: tìm kiếm `q` không dấu + trigram, lọc `min_rating` (`1..5`), sắp xếp phía máy chủ `sort` (`bestselling`, `newest`, `price_asc`, `price_desc`, `rating_desc`, mặc định giữ `name ASC, model ASC, id ASC`), tổng hợp `averageRating`, `reviewCount`, `soldCount`, lưu/đọc `specs` và ánh xạ `variants[].flashSale`.
    - Tích hợp `reviewmedia.Store` vào `catalog.UseCase` và `backend/internal/delivery/http/{admin_catalog_handler,catalog_handler,router,error}.go` cung cấp `POST /api/v1/admin/products/images` (kiểm tra magic bytes `image/jpeg`, `image/png`, `image/webp` `<= 10 MB`, lưu tại `products/<uuid>.<ext>`) và `GET|HEAD /media/products/:imageKey` (kèm header cache & `nosniff`), cập nhật Wire DI và ghi nhận contract snapshots vào `.dream/specs/commerce-platform-enhancements/contract-snapshots.json` (đồng thời cập nhật ngay khóa `product_detail_live_200` trong `.dream/specs/livestream-shopping/contract-snapshots.json` và các mock dữ liệu danh mục liên đới để `go test ./internal/delivery/http` xanh ngay khi hoàn tất `1.2`).
  - **Scope:**
    - Giữ tương thích 100% cho `SaveProductInput.ImageURLs` với cả `/media/products/<key>` và URL `http(s)://...`, cũng như giữ nguyên thứ tự mặc định của `GET /api/v1/products` khi không truyền `sort`.
    - Viết unit tests, integration-db tests (kiểm chứng `f_unaccent` với `"dien thoai"` / `"điện thoại"`, `sort`, `min_rating`, `specs` round-trip) và handler tests (bao gồm upload/stream ảnh và snapshot).
  - **Consumes:** Bảng `products`, `product_variants`, `product_reviews`, `orders`, `order_items` và `reviewmedia.Store` (`MINIO_BUCKET`) hiện hữu.
  - **Contracts:** DB-CATALOG-DISCOVERY@1 (provider); API-CATALOG-MEDIA-SPECS@1 (provider)
  - **Acceptance:**
    - `GET /api/v1/products` tìm khớp tiếng Việt không dấu/có dấu, sắp xếp chính xác toàn tập kết quả trước khi phân trang, lọc đúng `min_rating`, trả `400 invalid_filter` khi `sort`/`min_rating` sai, và trả đầy đủ `averageRating`, `reviewCount`, `soldCount` trên cả danh sách, nổi bật lẫn chi tiết sản phẩm.
    - Tạo/sửa sản phẩm lưu và trả đúng `specs` có cấu trúc; `POST /api/v1/admin/products/images` từ chối tệp giả mạo MIME hoặc `> 10 MB` và `GET|HEAD /media/products/:imageKey` phục vụ đúng luồng ảnh.
  - **Verification:** `unit`, `integration-db`, `handler`.
  - _Requirements: 2.5, 4.1, 4.2, 5.1, 6.1, 6.2, 6.3_

- [x] 1.3 Quản trị Chiến dịch Flash Sale theo Khung giờ, API Công khai & Đồng bộ Giá Hiệu lực Giỏ hàng (`API-FLASH-SALES@1`)
  - **Produces:**
    - Tạo `backend/db/queries/flash_sales.sql`, cập nhật `backend/db/queries/cart.sql` (áp dụng quy tắc chọn mức giá thấp hơn giữa `live_active_variant_prices` và `flash_sale_active_variant_prices`, bổ sung `is_flash_sale_price`), chạy `sqlc generate`.
    - Cài đặt `FlashSaleRepository`, `backend/internal/usecase/flashsale`, mở rộng `CartRepository` / `cart_handler.go`, và thêm `backend/internal/delivery/http/{flash_sale_handler,admin_flash_sale_handler}.go` đăng ký `GET /api/v1/flash-sales/current` cùng nhóm `/api/v1/admin/flash-sales` (`GET`, `GET /:id`, `POST`, `PUT /:id`, `DELETE /:id`), cập nhật Wire DI.
    - Ghi nhận contract snapshots cho `API-FLASH-SALES@1` vào `.dream/specs/commerce-platform-enhancements/contract-snapshots.json` và cập nhật `.dream/specs/livestream-shopping/contract-snapshots.json` (cùng mock dữ liệu liên quan nếu hình dạng `ProductDetail` / `Cart` thay đổi).
  - **Scope:**
    - Đảm bảo không cho phép hai chiến dịch `active = true` chồng lấn `[startsAt, endsAt)` (`409 flash_sale_time_overlap`), không cho phép xóa chiến dịch đã có `soldQuantity > 0` (`409 flash_sale_has_orders`), và tự động bật/tắt giá hiệu lực ngay theo thời gian thực của máy chủ mà không cần tiến trình cron phụ.
    - Viết unit tests, integration-db tests (kiểm chứng `EXCLUDE USING gist`, tự động kích hoạt/hết hạn theo thời gian, ưu tiên giá Live vs Flash Sale trong giỏ hàng) và handler tests.
  - **Consumes:** `DB-CATALOG-DISCOVERY@1` (bảng `flash_sales`, `flash_sale_items` và các view từ task `1.2`); `live_active_variant_prices` hiện hữu.
  - **Contracts:** API-FLASH-SALES@1 (provider); DB-CATALOG-DISCOVERY@1 (consumer)
  - **Acceptance:**
    - Admin CRUD xác thực đầy đủ biến thể, giá `flashPriceVnd < priceVnd`, `quota >= soldQuantity` và từ chối khung giờ chồng lấn.
    - `GET /api/v1/flash-sales/current` trả đúng chiến dịch đang diễn ra kèm tiến độ `soldQuantity`/`quota` (hoặc `null` ngoài khung giờ); `GET /api/v1/cart` tính đúng giá tốt nhất giữa Live và Flash Sale kèm cờ `isFlashSalePrice`.
  - **Verification:** `unit`, `integration-db`, `handler`.
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 2. Backend: Hệ thống Voucher, Phí Vận chuyển Khu vực/Hỏa tốc 2h, Hành trình Đơn hàng & Mua lại

- [x] 2.1 Migration `000027` (`DB-CHECKOUT-FULFILLMENT@1`) và Tầng Repository Giao dịch cho Voucher, Báo giá Vùng/Hỏa tốc, Hạn mức Đồng thời, Hành trình Đơn hàng, Mua lại & Hoàn tiền Trả hàng
  - **Produces:**
    - Thêm cặp migration `backend/db/migrations/000027_vouchers_shipping_timeline.{up,down}.sql` tạo bảng `vouchers`, `voucher_usages`, `order_status_events`, mở rộng bảng `orders`, `order_items.flash_sale_id` và cập nhật ràng buộc `return_requests` cho phép `expected_refund_amount_vnd >= 0` & `refund_amount_vnd >= 0` (kèm backfill lịch sử mốc thời gian cho các đơn hàng hiện có) theo `DB-CHECKOUT-FULFILLMENT@1`.
    - Thêm `backend/db/queries/vouchers.sql`, cập nhật `backend/db/queries/{orders,returns}.sql`, chạy `sqlc generate`.
    - Cài đặt `VoucherRepository`, mở rộng `OrderRepository` (thực thi `CheckoutOrderRepository` & `FulfillmentOrderRepository`: báo giá vùng/hỏa tốc 2h + voucher, đặt đơn khóa đồng thời `LockUser` + `vouchers FOR UPDATE` + `consumeFlashSaleQuota` / `consumeLiveQuota`, hoàn trả nguyên tử lượt dùng voucher + suất Flash Sale trên cả 3 luồng hủy đơn `Cancel` / `ApproveCancel` / `AutoCancelExpiredMomoOrders`, xuất kho lưu `carrier` + `trackingCode` + `shipped_at`, ghi `order_status_events` ở mọi nhánh chuyển trạng thái, và thực thi `BuyAgain`), cùng cập nhật `ReturnRepository` (`CreateReturnRequest` tính `expectedRefundVnd` theo `PD-2` và `RefundAdmin` ghi `order_status_events`).
  - **Scope:**
    - Bảo toàn nguyên vẹn chữ ký `domain.OrderRepository.Create` và `domain.MomoOrderRepository.CreateWithPaymentMethod` để mọi test hiện có tiếp tục chạy đúng.
    - Viết unit tests cho bộ tính phí vùng/hỏa tốc & công thức giảm giá/hoàn tiền, cùng integration-db tests kiểm chứng đua tranh đồng thời nhiều goroutine trên lượt Voucher cuối cùng và suất Flash Sale cuối cùng, hoàn trả idempotent khi hủy đơn và hoàn tiền trả hàng một phần/toàn phần.
  - **Consumes:** `CONFIG-PLATFORM@1` (từ task `1.1`), `DB-CATALOG-DISCOVERY@1` (từ task `1.2`), bảng `orders`, `addresses`, `cart_items`, `return_requests` hiện hữu.
  - **Contracts:** DB-CHECKOUT-FULFILLMENT@1 (provider); CONFIG-PLATFORM@1 (consumer); DB-CATALOG-DISCOVERY@1 (consumer)
  - **Acceptance:**
    - Không một giao dịch đồng thời nào vượt `usage_limit`, `per_user_limit` của voucher hoặc `quota` của Flash Sale; hủy đơn ở bất kỳ luồng nào trong 3 luồng đều hoàn đúng 1 lượt voucher và đúng số suất Flash Sale.
    - Phí vận chuyển tính chuẩn theo 3 vùng (`1, 79` -> `25.000 ₫` & mở `express_2h` `60.000 ₫`; `31, 46, 48, 92` -> `30.000 ₫`; tỉnh khác -> `40.000 ₫`; miễn phí `standard` khi đạt ngưỡng), từ chối `express_2h` ngoài HN/TP.HCM; `order_status_events` ghi đầy đủ thứ tự thời gian; `BuyAgain` kẹp trần theo tồn kho và `ReturnRepository` không bao giờ tính tiền hoàn vượt `totalVnd` thực trả.
  - **Verification:** `unit`, `integration-db`.
  - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.6, 1.7, 2.3, 2.6, 2.7, 4.5, 7.1, 7.2, 7.3, 7.4_

- [x] 2.2 Điều phối UseCase, HTTP Handlers Voucher/Checkout/Fulfillment (`API-VOUCHERS-CHECKOUT-FULFILLMENT@1`), Thông báo Xuất kho, Wire DI & Đồng bộ Contract Snapshots
  - **Produces:**
    - Cài đặt `backend/internal/usecase/voucher`, mở rộng `backend/internal/usecase/order` và `backend/internal/usecase/notification/service.go` (đính kèm `carrier` & `trackingCode` trong thông báo `order_shipped`).
    - Thêm `backend/internal/delivery/http/{voucher_handler,admin_voucher_handler}.go`, mở rộng `{order_handler,admin_order_handler,error,router}.go` cung cấp `/api/v1/admin/vouchers`, `GET /api/v1/vouchers/available`, `POST /api/v1/checkout/quote`, mở rộng `POST /api/v1/orders` (`deliveryMethod`, `voucherCode`), cập nhật `POST /api/v1/admin/orders/:id/ship` yêu cầu `{carrier, trackingCode}` (cập nhật đồng bộ `admin_order_handler_test.go`), bổ sung `POST /api/v1/orders/:id/buy-again`, mở rộng `orderResponse` / `adminOrderResponse`, và sinh lại `wire_gen.go`.
    - Ghi nhận đầy đủ các khóa snapshot của `API-VOUCHERS-CHECKOUT-FULFILLMENT@1` vào `.dream/specs/commerce-platform-enhancements/contract-snapshots.json`, đồng thời cập nhật `.dream/specs/momo-payment/contract-snapshots.json` (và mock dữ liệu liên đới trong `frontend/e2e/momo-payment.spec.ts` nếu cần) cho khớp các trường mới trên `orderResponse` / `adminOrderResponse`.
  - **Scope:**
    - Kiểm chứng hạn mức Ví MoMo (`1.000..50.000.000`) hoạt động chính xác trên `totalVnd` sau giảm giá voucher và phí vận chuyển vùng/hỏa tốc.
    - Viết unit tests (`voucher/usecase_test.go`, `order/order_test.go`, `notification/service_test.go`) và handler tests (`voucher_handler_test.go`, `order_handler_test.go`, `admin_order_handler_test.go`).
  - **Consumes:** `DB-CHECKOUT-FULFILLMENT@1` và các phương thức repository từ task `2.1`, `CONFIG-PLATFORM@1` (từ task `1.1`).
  - **Contracts:** API-VOUCHERS-CHECKOUT-FULFILLMENT@1 (provider); DB-CHECKOUT-FULFILLMENT@1 (consumer); CONFIG-PLATFORM@1 (consumer)
  - **Acceptance:**
    - Toàn bộ endpoint Admin Voucher, `GET /vouchers/available`, `POST /checkout/quote`, `POST /orders`, `POST /admin/orders/:id/ship` và `POST /orders/:id/buy-again` trả đúng HTTP status, Full Status Envelope và mã lỗi tiếng Việt theo thiết kế.
    - Toàn bộ `go test ./...` và `go vet ./...` trong `backend/` vượt qua 100% cùng các tệp `contract-snapshots.json` nhất quán.
  - **Verification:** `unit`, `handler`.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.6, 4.5, 7.1, 7.2, 7.3_

- [x] 3. Storefront (`frontend`): Khôi phục Mật khẩu, Khám phá & Flash Sale, So sánh Điện thoại, Thanh toán & Hành trình Đơn hàng

- [x] 3.1 Mở rộng kiểu chia sẻ Storefront (`TYPE-STOREFRONT-ADMIN-SHARED@1`) và Luồng Khôi phục Mật khẩu qua Email OTP
  - **Produces:**
    - Mở rộng `frontend/src/api/types.ts` bổ sung đầy đủ các kiểu dữ liệu của đặc tả theo `TYPE-STOREFRONT-ADMIN-SHARED@1` (tương thích ngược với các fixture hiện có).
    - Mở rộng `frontend/src/api/auth.ts` (`forgotPassword`, `resetPassword`), cập nhật `frontend/src/api/client.ts` bỏ qua tự động làm mới token (`isAuthRoute`) cho `/auth/forgot-password` và `/auth/reset-password`.
    - Bổ sung liên kết **"Quên mật khẩu?"** trên `frontend/src/pages/LoginPage.tsx`, xây dựng `ForgotPasswordPage.tsx` (`/forgot-password`) và `ResetPasswordPage.tsx` (`/reset-password`, có đếm ngược gửi lại mã `60s`, nhập OTP 6 số, mật khẩu mới + xác nhận) và đăng ký route trong `frontend/src/App.tsx`.
  - **Scope:**
    - Viết component tests cho `LoginPage`, `ForgotPasswordPage` và `ResetPasswordPage`.
  - **Consumes:** `API-AUTH-RECOVERY@1` từ `design.md`.
  - **Contracts:** TYPE-STOREFRONT-ADMIN-SHARED@1 (provider); API-AUTH-RECOVERY@1 (consumer)
  - **Acceptance:**
    - Khách hàng đi từ `/login` sang `/forgot-password`, gửi email nhận mã, chuyển sang `/reset-password` nhập OTP + mật khẩu mới (kiểm tra khớp xác nhận mật khẩu & xử lý lỗi OTP sai), gửi lại mã sau 60s và quay về `/login` khi hoàn tất.
  - **Verification:** `component`.
  - _Requirements: 3.5_

- [x] 3.2 Tìm kiếm Gợi ý Tức thì (`Header`), Sắp xếp/Lọc Đồng bộ URL, Điểm sao/Lượt bán (`ProductCard`, `CatalogPage`) & Hiển thị Flash Sale (`HomePage`, `ProductDetailPage`)
  - **Produces:**
    - Mở rộng `frontend/src/api/catalog.ts` truyền `sort` và `min_rating`, thêm `frontend/src/api/flashSales.ts` (`getCurrentFlashSale`).
    - Cập nhật `frontend/src/components/Header.tsx` triển khai khung gợi ý tìm kiếm tức thì (debounce `250ms` từ `>= 2` ký tự gọi `listProductsWithMeta({ q, limit: 5 })`, hiển thị ảnh/tên/thương hiệu/giá/điểm sao, điều hướng bàn phím `ArrowUp`/`ArrowDown`/`Enter`/`Escape`, đóng khi click ra ngoài và liên kết xem tất cả).
    - Cập nhật `frontend/src/components/ProductCard.tsx` hiển thị điểm sao `averageRating`, số đánh giá `reviewCount` và `"Đã bán X"` (`soldCount`), loại bỏ danh sách thông số giả lập cố định theo tên máy.
    - Cập nhật `frontend/src/pages/CatalogPage.tsx` đồng bộ hai chiều `sort`, `min_rating` cùng các bộ lọc hiện có với `searchParams` trên cả giao diện desktop và mobile, xóa bỏ logic sort mảng 6 phần tử phía client.
    - Cập nhật `frontend/src/pages/HomePage.tsx` hiển thị khu vực **Flash Sale** có đồng hồ đếm ngược tới `endsAt` + thanh tiến độ `"Đã bán X/Y"` (ẩn khi không có chiến dịch), và cập nhật `frontend/src/pages/ProductDetailPage.tsx` hiển thị khung Flash Sale đếm ngược + tiến độ cho biến thể đang chọn.
  - **Scope:**
    - Viết/cập nhật component tests cho `Header`, `ProductCard`, `CatalogPage`, `HomePage` và phần Flash Sale trên `ProductDetailPage`.
  - **Consumes:** `TYPE-STOREFRONT-ADMIN-SHARED@1` (từ task `3.1`), `API-CATALOG-MEDIA-SPECS@1` và `API-FLASH-SALES@1` từ `design.md`.
  - **Contracts:** TYPE-STOREFRONT-ADMIN-SHARED@1 (consumer); API-CATALOG-MEDIA-SPECS@1 (consumer); API-FLASH-SALES@1 (consumer)
  - **Acceptance:**
    - Ô tìm kiếm đầu trang gợi ý tức thì kèm đầy đủ thao tác bàn phím; `CatalogPage` đồng bộ URL query `sort`/`min_rating` và gọi sắp xếp phía server trên cả desktop & mobile; `ProductCard` hiển thị đúng sao & lượt bán; `HomePage` và `ProductDetailPage` hiển thị chuẩn đồng hồ đếm ngược và tiến độ `"Đã bán X/Y"`.
  - **Verification:** `component`.
  - _Requirements: 2.4, 2.5, 6.4, 6.5, 6.6_

- [x] 3.3 Thông số Kỹ thuật Có cấu trúc trên Trang Chi tiết & Tính năng So sánh Điện thoại (`CompareTray` & `ComparePage`)
  - **Produces:**
    - Cập nhật tab **Thông số kỹ thuật** trên `frontend/src/pages/ProductDetailPage.tsx` hiển thị các nhóm và dòng `product.specs` thực tế từ API (xóa bỏ hàm giả lập `getPhoneTechSpecs`) kèm trạng thái trống rõ ràng.
    - Xây dựng `frontend/src/context/CompareContext.tsx` (lưu tối đa 3 sản phẩm trong `sessionStorage`), thanh cố định `frontend/src/components/CompareTray.tsx`, tích hợp nút chọn **"So sánh"** trên `ProductCard.tsx` và `ProductDetailPage.tsx`.
    - Xây dựng trang `frontend/src/pages/ComparePage.tsx` đăng ký tại route `/compare` trong `frontend/src/App.tsx`: đọc danh sách máy từ query `?ids=...` hoặc `CompareContext`, tải chi tiết song song qua `catalogApi.getProduct(id)`, cho phép chọn phiên bản dung lượng/màu sắc riêng từng cột cập nhật giá hiệu lực + tồn kho + nút **Thêm vào giỏ**, và lọc bảng thông số với công tắc **"Chỉ hiện điểm khác biệt"**.
  - **Scope:**
    - Viết component tests cho tab `specs` trên `ProductDetailPage`, `CompareTray` (bao gồm chặn chọn máy thứ 4) và `ComparePage` (đổi phiên bản dung lượng & bật/tắt lọc điểm khác biệt).
  - **Consumes:** `TYPE-STOREFRONT-ADMIN-SHARED@1` (từ task `3.1`) và `API-CATALOG-MEDIA-SPECS@1` từ `design.md`.
  - **Contracts:** TYPE-STOREFRONT-ADMIN-SHARED@1 (consumer); API-CATALOG-MEDIA-SPECS@1 (consumer)
  - **Acceptance:**
    - Mọi mẫu máy hiển thị đúng thông số cấu hình riêng; thanh `CompareTray` giữ tối đa 3 máy xuyên suốt phân trang danh mục và cảnh báo khi chọn quá 3 máy; trang `/compare` đối chiếu trực quan từng phiên bản dung lượng và lọc chính xác các dòng thông số khác biệt.
  - **Verification:** `component`.
  - _Requirements: 5.3, 5.4, 5.5, 5.6_

- [x] 3.4 Thanh toán (Voucher + Phí Vùng & Hỏa tốc 2h), Hành trình Đơn hàng Realtime, Mua lại & Dự tính Hoàn tiền Trả hàng trên Storefront
  - **Produces:**
    - Thêm `frontend/src/api/vouchers.ts` (`listAvailableVouchers`, `quoteCheckout`), mở rộng `frontend/src/api/orders.ts` (`createOrder` kèm `deliveryMethod`/`voucherCode`, `buyAgain`).
    - Cập nhật `frontend/src/pages/CartPage.tsx` hiển thị nhãn `"Giá Flash Sale"` (khi `isFlashSalePrice`) và hiển thị dòng phí vận chuyển `"Tính ở bước thanh toán (Miễn phí giao tiêu chuẩn từ 5.000.000 ₫)"`.
    - Cập nhật `frontend/src/pages/CheckoutPage.tsx`: chọn phương thức **Giao tiêu chuẩn** hoặc **Giao hỏa tốc 2 giờ** (tự động mở cho Hà Nội `1` / TP.HCM `79`, khóa kèm chú thích cho tỉnh khác và tự quay về `standard` khi đổi sang tỉnh khác), chọn mã từ danh sách voucher khả dụng hoặc nhập tay mã giảm giá, gọi `quoteCheckout` hiển thị xem trước `shippingFeeVnd` / `discountVnd` / `totalVnd`, và tự động cập nhật điều kiện Ví MoMo theo `totalVnd` cuối cùng.
    - Cập nhật `frontend/src/pages/OrderHistoryPage.tsx`, `frontend/src/pages/OrderDetailPage.tsx` và `frontend/src/components/ReturnRequestDialog.tsx`: hiển thị dòng giảm giá voucher, phương thức vận chuyển, đơn vị vận chuyển + mã vận đơn (có nút sao chép), thanh tiến trình `OrderStepper` + `OrderTimeline`, tự động làm mới đơn hàng theo thời gian thực qua `useChatSocket` khi nhận thông báo khớp `orderId`, nút **"Mua lại"** cho đơn `delivered`/`partially_returned`/`returned`/`cancelled` (làm mới `CartContext` & điều hướng `/cart`), và tính đúng dự kiến tiền hoàn theo `PD-2` trên hộp thoại trả hàng.
  - **Scope:**
    - Viết/bổ sung component tests cho `CartPage`, `CheckoutPage`, `OrderHistoryPage`, `OrderDetailPage` và `ReturnRequestDialog`; chạy `npm run lint`, `npm test`, `npm run build` trong `frontend/`.
  - **Consumes:** `TYPE-STOREFRONT-ADMIN-SHARED@1` (từ task `3.1`) và `API-VOUCHERS-CHECKOUT-FULFILLMENT@1` từ `design.md`; `useChatSocket` và `CartContext` hiện hữu.
  - **Contracts:** TYPE-STOREFRONT-ADMIN-SHARED@1 (consumer); API-VOUCHERS-CHECKOUT-FULFILLMENT@1 (consumer)
  - **Acceptance:**
    - `CheckoutPage` báo giá chính xác phí vùng, mở/khóa Hỏa tốc 2h theo tỉnh thành, áp/gỡ voucher kèm hiển thị lỗi tiếng Việt rõ ràng và tự chuyển về `COD` nếu `totalVnd < 1.000 ₫`.
    - `OrderDetailPage` hiển thị đầy đủ mã vận đơn, Stepper/Timeline cập nhật tức thì khi có sự kiện WebSocket của đơn hàng; nút `"Mua lại"` đưa sản phẩm khả dụng vào giỏ kèm thông báo phù hợp và điều hướng `/cart`; `ReturnRequestDialog` hiển thị đúng tiền hoàn dự kiến cho đơn có voucher.
  - **Verification:** `component`.
  - _Requirements: 1.3, 1.4, 1.5, 1.7, 4.4, 4.5, 7.1, 7.5_

- [x] 4. Admin Portal (`frontend-admin`): Ảnh Object Storage & Cấu hình Sản phẩm, Quản trị Voucher/Flash Sale & Vận đơn Đơn hàng

- [x] 4.1 Mở rộng kiểu Admin (`TYPE-STOREFRONT-ADMIN-SHARED@1`), Trình tải Ảnh Object Storage & Biên tập Thông số Kỹ thuật trên `ProductFormPage`
  - **Produces:**
    - Mở rộng `frontend-admin/src/api/types.ts` theo `TYPE-STOREFRONT-ADMIN-SHARED@1` và `frontend-admin/src/api/products.ts` (`uploadProductImage` gửi `FormData` lên `POST /admin/products/images`), cập nhật schema xác thực `frontend-admin/src/lib/validations/product.ts`.
    - Nâng cấp `frontend-admin/src/pages/ProductFormPage.tsx`: thay ô dán mảng URL thô bằng trình tải ảnh nhiều tệp / kéo-thả lên Object Storage kèm xem trước, nhãn **"Ảnh đại diện"** cho ảnh đầu tiên, đổi thứ tự, xóa ảnh (và tùy chọn thêm URL ngoài để tương thích dữ liệu cũ); bổ sung trình biên tập **Thông số kỹ thuật có cấu trúc** (`specs`) kèm nút **"Áp dụng mẫu Điện thoại"** khởi tạo 6 nhóm chuẩn mà không ghi đè dữ liệu đã nhập.
  - **Scope:**
    - Viết/cập nhật component tests trong `frontend-admin/src/pages/ProductFormPage.test.tsx`.
  - **Consumes:** `API-CATALOG-MEDIA-SPECS@1` từ `design.md`.
  - **Contracts:** TYPE-STOREFRONT-ADMIN-SHARED@1 (provider); API-CATALOG-MEDIA-SPECS@1 (consumer)
  - **Acceptance:**
    - Quản trị viên tải nhiều ảnh trực tiếp, đổi ảnh đại diện, xóa ảnh và áp dụng mẫu thông số Điện thoại nhanh chóng, gửi đúng mảng `imageUrls` và `specs` khi tạo/cập nhật sản phẩm.
  - **Verification:** `component`.
  - _Requirements: 4.3, 5.2_

- [x] 4.2 Trang Quản trị Voucher (`VouchersPage`), Chiến dịch Flash Sale (`FlashSalesPage`) & Xuất kho Mã vận đơn / Hành trình Đơn hàng trên `AdminOrderDetailPage`
  - **Produces:**
    - Thêm `frontend-admin/src/api/vouchers.ts` và `frontend-admin/src/api/flashSales.ts`, mở rộng `frontend-admin/src/api/orders.ts` (`adminShip(id, { carrier, trackingCode })`).
    - Xây dựng `frontend-admin/src/pages/VouchersPage.tsx` (`/vouchers`: danh sách phân trang, lọc trạng thái, tạo/sửa/bật-tắt/xóa mã giảm giá `%`, tiền mặt, `freeship`) và `frontend-admin/src/pages/FlashSalesPage.tsx` (`/flash-sales`: danh sách chiến dịch, bộ chọn sản phẩm/biến thể cài đặt `flashPriceVnd` & `quota`, cấu hình khung giờ tự động); đăng ký route trong `frontend-admin/src/App.tsx` và mục điều hướng trong `frontend-admin/src/components/layout/AdminLayout.tsx`.
    - Cập nhật `frontend-admin/src/pages/AdminOrderDetailPage.tsx` (và `OrdersPage.tsx` nơi liên quan): mở hộp thoại nhập **Đơn vị vận chuyển** (kèm gợi ý chọn nhanh GHN, GHTK, Viettel Post, Ahamove 2h) & **Mã vận đơn** khi bấm xuất kho, hiển thị dòng giảm giá voucher, phương thức giao hàng, mã vận đơn và `OrderStepper` + `OrderTimeline` tự động làm mới qua `useAdminChatSocket`.
  - **Scope:**
    - Viết/bổ sung component tests cho `VouchersPage`, `FlashSalesPage` và `AdminOrderDetailPage`; chạy `npm run lint`, `npm test`, `npm run build` trong `frontend-admin/`.
  - **Consumes:** `TYPE-STOREFRONT-ADMIN-SHARED@1` (từ task `4.1`), `API-FLASH-SALES@1` và `API-VOUCHERS-CHECKOUT-FULFILLMENT@1` từ `design.md`; `useAdminChatSocket` hiện hữu.
  - **Contracts:** TYPE-STOREFRONT-ADMIN-SHARED@1 (consumer); API-FLASH-SALES@1 (consumer); API-VOUCHERS-CHECKOUT-FULFILLMENT@1 (consumer)
  - **Acceptance:**
    - Quản trị viên tạo/sửa/xóa và xử lý lỗi xung đột tiếng Việt đầy đủ cho cả Voucher lẫn Flash Sale; thao tác xuất kho bắt buộc nhập `carrier` + `trackingCode` và trang chi tiết đơn hàng Admin hiển thị đầy đủ mã vận đơn, giảm giá cùng Stepper/Timeline cập nhật realtime.
  - **Verification:** `component`.
  - _Requirements: 1.1, 1.5, 2.1, 7.3, 7.5_

- [x] 5. Xác minh E2E Trình duyệt & Trực quan

- [x] 5.1 Kiểm thử E2E trình duyệt (`Mode 2: Shape-Locked Mock E2E`) và bằng chứng trực quan trên Storefront & Admin Portal
  - **Produces:**
    - Bộ kiểm thử `frontend/e2e/commerce-platform-enhancements.spec.ts` nạp kỹ năng `e2e-testing` và thực thi theo chế độ **`Mode 2: Shape-Locked Mock E2E`** qua `mountContractRoutes` đối chiếu trực tiếp `.dream/specs/commerce-platform-enhancements/contract-snapshots.json` (không gọi `page.route` trực tiếp trên `/api/v1`).
    - Ảnh chụp bằng chứng trực quan tại `.dream/specs/commerce-platform-enhancements/imgs/*.png` và báo cáo tổng hợp `.dream/specs/commerce-platform-enhancements/report.md`.
  - **Scope:**
    - Thực thi trên trình duyệt thực đối với Storefront (`http://localhost:15173`) và Admin Portal (`http://localhost:15174`) cho đúng tập tiêu chí cấp độ trình duyệt:
      1. Gợi ý tìm kiếm bàn phím trên `Header` -> đồng bộ URL lọc/sắp xếp trên `/products` -> ghim 3 điện thoại vào `CompareTray` sang `/compare` đổi phiên bản dung lượng & bật `"Chỉ hiện điểm khác biệt"`.
      2. Hiển thị Flash Sale đếm ngược + `"Đã bán X/Y"` trên `/` và `/products/:id`.
      3. Luồng `/login` -> `/forgot-password` -> `/reset-password` về `/login`.
      4. Chọn địa chỉ Hà Nội/TP.HCM mở Giao hỏa tốc 2h vs tỉnh khác khóa Hỏa tốc, chọn/nhập Voucher xem trước giảm giá tại `/checkout` -> xem mã vận đơn & `OrderStepper`/`OrderTimeline` cập nhật realtime qua WebSocket giả lập trên `/orders/:id` -> bấm `"Mua lại"` chuyển sang `/cart`.
      5. Trên Admin Portal: tải ảnh sản phẩm + áp dụng mẫu Điện thoại trên `/products/new`, tạo Voucher/Flash Sale, và nhập đơn vị vận chuyển + mã vận đơn khi xuất kho trên `/orders/:id` kèm Stepper/Timeline.
      6. Kiểm tra không tràn ngang (`scrollWidth <= innerWidth`), chụp và tự đọc kiểm tra ảnh cho desktop (`1440x900`) & mobile (`375x812`) trên Storefront và desktop (`1440x900`) trên Admin Portal, đồng thời xác nhận các bài Playwright hiện hữu không bị hồi quy do cập nhật snapshot.
  - **Consumes:** `.dream/specs/commerce-platform-enhancements/contract-snapshots.json` (từ các task `1.1`, `1.2`, `1.3`, `2.2`), giao diện Storefront (`3.1`–`3.4`) và giao diện Admin Portal (`4.1`–`4.2`).
  - **Contracts:** API-AUTH-RECOVERY@1 (verifier); API-CATALOG-MEDIA-SPECS@1 (verifier); API-FLASH-SALES@1 (verifier); API-VOUCHERS-CHECKOUT-FULFILLMENT@1 (verifier); TYPE-STOREFRONT-ADMIN-SHARED@1 (verifier)
  - **Acceptance:**
    - Toàn bộ kịch bản Playwright trong `frontend/e2e/commerce-platform-enhancements.spec.ts` vượt qua ở `Mode 2: Shape-Locked Mock E2E`.
    - Ảnh chụp trong `.dream/specs/commerce-platform-enhancements/imgs/` sắc nét, tuân thủ ngôn ngữ thiết kế, không tràn ngang hay che khuất phần tử, và `.dream/specs/commerce-platform-enhancements/report.md` ghi nhận đầy đủ kết quả kiểm chứng.
  - **Verification:** `mock-e2e`, `visual`.
  - _Requirements: 1.3, 1.4, 2.4, 2.5, 3.5, 4.3, 4.5, 5.2, 5.4, 5.5, 5.6, 6.5, 6.6, 7.1, 7.3, 7.5, 7.6_
