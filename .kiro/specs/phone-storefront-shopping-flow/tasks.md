# Kế hoạch triển khai

- [x] 1. Mở rộng schema catalog cho điện thoại, phân loại động và giỏ hàng
- [x] 1.1 Tạo migration catalog variant và cart
  - Thêm migration up/down `000003_phone_variants_cart` cho model/featured/active, option groups/values, variants/value links và cart items theo thiết kế.
   - Giữ nguyên product-level legacy price/currency/stock cho rollback; thiết lập FK/composite FK, unique keys, `numeric(38,0)` cho giá, numeric stock/quantity với check `trunc` và miền `int64`, SQLC column overrides thành Go `int64`, indexes và deferred integrity checks cho đầy đủ group cùng tổ hợp variant duy nhất.
  - Bảo đảm down migration xóa bảng/cột mới theo thứ tự dependency mà không mất giá/stock của catalog legacy.
  - _Requirements: 7.1, 8.8, 9.8, 10.2, 10.3_

- [x] 1.2 Thay seed catalog generic bằng dữ liệu cửa hàng điện thoại idempotent
  - Cập nhật `backend/db/seed/catalog.sql` để nạp Apple, Xiaomi, nhiều mẫu máy, model, ảnh, featured, các cấu trúc group khác nhau và variants VND trong một transaction.
  - Bao gồm variant còn hàng, hết hàng và một tổ hợp option không tồn tại; giữ dữ liệu generic cũ inactive thay vì xóa, đồng thời điền legacy columns cho phone để rollback hợp lệ.
  - _Requirements: 3.9, 7.1, 8.2, 8.4, 10.1_

- [x] 2. Ổn định domain và SQL contract của catalog backend
- [x] 2.1 Viết test và mở rộng catalog domain/use case
  - Mở rộng domain API projection bằng brand/model/options/variants và giữ multi-category, min/max price, in-stock filters trong `internal/domain/catalog.go` và `internal/usecase/catalog`.
  - Giữ `CreatedAt`/`UpdatedAt` trong product domain/detail projection để response hiện hữu không mất timestamps.
  - Viết test trước cho trim/query, nhiều category UUID, UUID sai, UUID không tồn tại được repository bỏ qua, canonical non-negative tối đa 38 chữ số cho min/max VND, in-stock semantics, featured, detail/not-found và domain errors.
  - _Requirements: 3.2, 3.10, 3.13, 3.14, 8.7, 8.8, 10.4, 10.5, 10.6_

- [x] 2.2 Viết query và repository catalog cho variants
  - Cập nhật `db/queries/catalog.sql` để chỉ list brands có active phone và chỉ trả product có ít nhất một active variant; search theo brand/name/model, nhiều hãng, variant price/in-stock filters; list featured và load detail đầy đủ groups/values/active variants theo thứ tự ổn định.
  - Cập nhật `internal/repository/catalog_repository.go`, chạy `make gen` và thêm repository/mapper tests khả dụng để chứng minh min/max VND, in-stock và dynamic option graph.
  - _Requirements: 2.3, 2.4, 3.1, 3.2, 3.8, 3.9, 3.10, 3.13, 3.14, 7.1, 8.1, 8.2, 8.3, 8.7, 8.8, 10.5, 10.6_

- [x] 2.3 Mở rộng public catalog HTTP API
  - Viết handler tests trước, sau đó cập nhật response contracts và routes cho categories, product summaries, featured products và detail variants.
  - Đọc repeated `category_id`, giữ `min_price`, `max_price`, `in_stock`, error envelope và xác nhận mọi catalog endpoint hoạt động không cần token.
  - _Requirements: 2.3, 2.4, 3.3, 3.4, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13, 3.14, 7.1, 8.1, 8.6, 8.7, 10.4, 10.5, 10.6_

- [x] 3. Xây dựng cart domain và persistence giao dịch
- [x] 3.1 Định nghĩa cart domain, validation và stable errors
  - Tạo domain models/interfaces cho cart/item/options/availability/summary cùng sentinel errors theo design.
  - Định nghĩa canonical `MoneyVND` decimal-string cho giá; stock/quantity dùng `int64` xuyên repository, domain và HTTP mapper; không thu hẹp giá hay aggregate tiền về `int64`.
  - Viết use-case tests trước cho UUID/body validation, caller user ID, add/set/select/select-all/remove và truyền lỗi ownership-neutral.
  - _Requirements: 4.9, 4.10, 5.3, 9.1, 9.2, 9.6, 9.7, 9.15, 9.16_

- [x] 3.2 Viết SQL cart và repository transaction
  - Tạo `db/queries/cart.sql` và `internal/repository/cart_repository.go` cho get/add/set quantity/set selection/select all/remove theo `user_id`.
  - Reconcile product/variant inactive, zero stock và insufficient stock trong mỗi transaction; giữ snapshot, tự bỏ chọn, chỉ tính summary từ dòng available được chọn.
  - Khóa user row làm per-cart mutex trước mọi lock khác; dùng unique `(user_id, variant_id)` và conditional upsert/update để serialize full-cart responses, không duplicate, mất increment hay vượt stock.
  - Commit reconcile bắt buộc trước khi trả domain error cho mutation bị từ chối; chỉ rollback lỗi hạ tầng.
  - Tính line/summary bằng PostgreSQL numeric hoặc `math/big.Int` và serialize mọi trường tiền thành decimal string; nullable cho out-of-stock/unavailable.
  - Viết mandatory integration suite có build tag `integration` và `testcontainers-go` image `postgres:17.6-alpine`; kiểm tra migration up/down/up, seed hai lần, constraints, 38-digit price, ownership, concurrent same/different-line mutations, rejected-mutation reconcile commit, arbitrary-precision totals, live/nullable price, snapshot và mọi transition availability.
  - Thêm target `test-integration` vào `backend/Makefile`; suite tự tạo và cleanup database, fail nếu Docker/test không chạy thay vì bỏ qua im lặng.
  - Chạy `make gen` và kiểm tra generated SQL code compile.
  - _Requirements: 4.2, 4.3, 4.4, 4.7, 4.9, 4.10, 5.2, 5.3, 5.4, 5.6, 5.9, 5.10, 5.11, 5.12, 6.1, 6.2, 6.3, 6.4, 9.1, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10, 9.11, 9.12, 9.13, 9.14, 9.15, 9.16_

- [x] 3.3 Cung cấp protected cart HTTP API
  - Wire cart repository/use case trong `cmd/server/app.go`, thêm `Cart` dependency và group `/api/v1/cart` sau `AuthRequired` trong router.
  - Viết handler tests trước cho GET/POST/PUT/PATCH/DELETE success, malformed JSON/UUID/quantity, missing/invalid token, caller isolation và tất cả stable 404/409 codes.
  - Mọi mutation thành công trả full reconciled cart response với live price/stock, snapshots, availability, decimal-string line totals và summary; business error giữ stable envelope, frontend sẽ GET cart để nhận reconcile đã commit.
  - _Requirements: 1.6, 4.1, 4.2, 4.3, 4.4, 4.9, 4.10, 5.2, 5.3, 5.4, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11, 5.12, 6.1, 6.2, 6.3, 6.4, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.9, 9.10, 9.11, 9.12, 9.13, 9.14, 9.15, 9.16, 10.4_

- [x] 4. Tích hợp frontend API và state dùng chung
- [x] 4.1 Cập nhật API client và catalog wire types
  - Viết API tests trước, bổ sung `put`, `patch`, `delete` vào shared client mà không thay đổi credentials/bearer/one-time refresh semantics.
  - Cập nhật `src/api/catalog.ts` cho phone summary/detail/options/variants với decimal-string money, featured endpoint, repeated `category_id` và giữ min/max/in-stock filters; cập nhật formatter dùng `BigInt` VND `vi-VN`.
  - _Requirements: 2.3, 3.3, 3.4, 3.8, 3.9, 3.11, 3.12, 3.13, 3.14, 7.1, 8.7, 10.4_

- [x] 4.2 Tạo cart API và CartProvider pessimistic
  - Tạo `src/api/cart.ts`, `src/cart/CartProvider.tsx` và tests cho load/reload cùng sáu actions theo full-cart response.
  - Sửa `AuthProvider` và test để persisted access token khôi phục `user` qua `/auth/me`, còn nhánh không token tiếp tục dùng refresh cookie; chỉ kết thúc auth loading sau restore.
  - Không fetch cart khi auth chưa xác định hoặc user null; reset khi user đổi/logout và ignore stale responses.
  - Xếp mọi mutation theo Promise queue, disable controls trong lúc pending, áp response đúng thứ tự; khi business error xảy ra, reload cart để nhận reconcile đã commit trước khi cho retry.
  - Xử lý one-time refresh failure bằng auth lifecycle hiện có để không hiển thị mutation thất bại như thành công.
  - Viết integration test với hai client/session storage độc lập cùng đăng nhập một tài khoản: client một thay content/selection, client hai reload và nhận đúng cart backend; không dùng chung provider memory hay storage.
  - _Requirements: 1.2, 4.1, 4.2, 4.5, 5.2, 5.4, 5.6, 5.7, 5.8, 6.2, 6.3, 6.4, 9.1, 9.5, 9.9, 9.16, 10.4_

- [x] 5. Xây dựng khung storefront và luồng duyệt sản phẩm
- [x] 5.1 Cập nhật routes, header và auth return location
  - Bọc router content bằng `CartProvider`, làm `/` công khai, bảo vệ `/cart`, thêm route cart và wildcard not-found.
  - Cập nhật header có Trang chủ/Điện thoại/Giỏ hàng với total units, giữ auth controls; cập nhật Login/Register giữ và dùng router `state.from` nội bộ an toàn.
  - Viết route tests bằng `MemoryRouter` cho SPA navigation, unknown route, cart login/return và header count.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 4.8, 5.8, 10.4_

- [x] 5.2 Xây dựng ProductCard và trang chủ storefront
  - Viết component tests trước rồi tạo reusable `ProductCard`; thay HomePage đăng nhập hiện tại bằng hero cửa hàng điện thoại công khai, CTA và featured loading/content/empty/error-retry.
  - Hiển thị brand/name/model, ảnh/fallback, VND range, stock và hành động xem phân loại.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 7.1, 7.3, 7.4_

- [x] 5.3 Hoàn thiện catalog tìm kiếm và multi-brand filter
  - Cập nhật hook/page tests trước cho URL `q`, repeated `category_id`, `min_price`, `max_price`, `in_stock`, direct restore, invalid/nonexistent IDs, combined search, result count, reset, loading, empty và retry.
  - Render brands Apple/Xiaomi từ API và product grid bằng `ProductCard`.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.14, 7.4_

- [x] 6. Xây dựng chọn biến thể và thêm vào giỏ
- [x] 6.1 Tạo VariantSelector với option groups động
  - Viết unit/component tests trước cho option graph khác nhau, enabled/disabled values, selected value luôn có thể click lại để bỏ chọn, chuyển giữa các nhánh disconnected, không chọn mặc định và match duy nhất một variant.
  - Serialize selection bằng repeated `option=<groupId>:<valueId>` và bỏ query IDs không thuộc product.
  - _Requirements: 4.6, 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 6.2 Hoàn thiện ProductDetailPage và authenticated add flow
  - Viết page tests trước cho loading/not-found, fields/options, price/stock update, thiếu group, invalid/out-of-stock variant và API error feedback.
  - Với khách, lưu full internal location và chuyển login; sau login quay lại selection nhưng không tự add. Với user, gửi chỉ `variantId`, thay cart bằng response và thông báo success.
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.6, 4.7, 4.8, 4.10, 7.1, 7.2, 7.3, 7.4, 8.1, 8.3, 8.4, 8.5, 8.6_

- [x] 7. Xây dựng trang giỏ và trạng thái catalog thay đổi
- [x] 7.1 Render giỏ, chỉnh số lượng và xóa dòng
  - Viết CartPage tests trước cho loading/error/retry, empty state, variant details, line totals, increase/decrease/remove và header summary update từ response.
  - Phân biệt controls cho `available`, `insufficient_stock`, `out_of_stock`, `unavailable`; dòng out-of-stock/unavailable hiển thị trạng thái thay nullable price/totals, giữ nội dung và không tự giảm/xóa; format decimal-string money bằng `BigInt`.
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.7, 5.9, 5.10, 5.11, 5.12, 7.1, 7.3, 7.4, 9.9, 9.10, 9.11, 9.12, 9.13, 9.14_

- [x] 7.2 Thêm chọn item, chọn tất cả và cart summary
  - Viết tests trước cho default selected, row selection, select/unselect all, bỏ qua unavailable lines, selected line count, valid-only VND total và persistence qua reload.
  - Disable CTA khi không có dòng hợp lệ được chọn; khi enabled chỉ hiển thị thông báo checkout chưa thuộc phạm vi.
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 9.5, 9.15, 9.16_

- [x] 8. Hoàn thiện giao diện responsive, accessibility và regression verification
- [x] 8.1 Mở rộng centralized CSS cho storefront và cart responsive
  - Chỉ sửa `src/index.css`, giữ breakpoint 900/600 px; bảo đảm header, filters, product/detail/cart layouts dùng được từ 320 px và không gây horizontal page scroll.
  - Thêm visible `:focus-visible`, trạng thái disabled/error/availability có text, mobile stacked cart và semantic image fallback.
  - _Requirements: 1.5, 7.2, 7.3, 7.4, 7.5_

- [x] 8.2 Tự động hóa responsive smoke matrix
  - Thêm Playwright dependency/config, script `test:e2e` trong `frontend/package.json` và deterministic API fixtures cho Chromium tại 320/600/900/1180 px.
  - Viết smoke tests cho home/catalog/detail/cart/login/not-found, filters, variant selection, login return, add/select/quantity; assert no horizontal overflow, controls visible/actionable và không có page/console errors.
  - Ở desktop và mobile, chỉ dùng `Tab`/`Shift+Tab`, `Enter`/`Space` để kiểm tra focus order cùng visible focus indicator và kích hoạt navigation, search/filter, variant, quantity, row/select-all checkbox, remove, cart CTA.
  - _Requirements: 1.3, 1.5, 7.2, 7.3, 7.4, 7.5_

- [x] 8.3 Chạy và sửa toàn bộ automated verification
  - Chạy backend focused tests, `make gen`, `make test`, `make test-integration`, `make vet`; Docker/PostgreSQL integration gate, migration/sqlc, existing auth/catalog và cart suites đều phải qua.
  - Chạy frontend focused tests, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e`; bổ sung regression tests còn thiếu cho keyboard roles/names và routing.
  - Chạy root `make test` và `make build`, chỉ sửa lỗi trực tiếp do feature gây ra.
  - _Requirements: 1.3, 7.2, 7.3, 7.4, 10.4_
