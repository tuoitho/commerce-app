# Kế hoạch triển khai

- [ ] 1. Ổn định nền tảng dữ liệu và media

- [ ] 1.1 Tạo schema và shared domain contracts cho review
  - **Produces:** Migration `000013_create_product_reviews` cho `product_reviews`/`review_media` sau prerequisite `000012_expand_order_returns`, domain models/errors/interfaces đã duyệt và sqlc generated models tương thích schema.
  - **Scope:** Viết migration up/down, constraints/indexes, model review/media, `ReviewRepository` và `ReviewMediaStore` contracts; thêm migration/integration tests cho unique order item, rating/comment/edit count, media MIME/size/position và quan hệ FK; chạy database migration và sqlc generation theo quy trình repository.
  - **Consumes:** `orders`, `order_items`, `users`, product/options snapshot và migration conventions hiện có; schema chính xác trong `design.md`.
  - **Acceptance:** Database thực thi một review mỗi order item, rating 1-5, comment tối đa 1.000 ký tự, edit count 0-1 và metadata media hợp lệ; review không lặp user/product source of truth; generated code khớp migration và không được sửa tay.
  - **Verification:** Migration up/down trên PostgreSQL test, focused repository constraint tests, `make db-up`, `make gen` và kiểm tra generated diff.
  - _Requirements: 1.4, 1.5, 2.9, 3.6, 6.3, 6.4_

- [ ] 1.2 Cung cấp MinIO private media storage
  - **Produces:** MinIO configuration qua Viper, `minio-go/v7` adapter thực thi `ReviewMediaStore`, private-bucket startup validation, `compose.minio.yml`, `.env.example` và root Make targets `minio-up`/`minio-down`.
  - **Scope:** Parse/validate `MINIO_ENDPOINT`, access key, secret key, bucket và SSL; implement put/stat/open-range/remove với object key server-generated; không tạo bucket/policy trong application; thêm fake-client unit tests và bounded MinIO-container integration tests.
  - **Consumes:** `ReviewMediaStore` từ task 1.1, cấu hình MinIO và object-key contract đã duyệt; MinIO/bucket là supporting dependency được provision bởi compose ở development và hạ tầng ngoài ứng dụng ở production.
  - **Acceptance:** Backend fail fast khi config/kết nối/bucket/private policy sai; credential và object key không bị log/lộ; adapter upload, range-read và remove đúng object; development command tạo MinIO khỏe và bucket private mà không cần hướng dẫn thủ công ngoài executable config.
  - **Verification:** Config boundary tests, storage unit tests, `make minio-up`, MinIO integration tests, xác nhận bucket không anonymous-read, rồi `make minio-down`.
  - _Requirements: 2.5, 2.6, 2.8, 2.11, 4.6, 6.7_

- [ ] 2. Xây dựng backend review workflows

- [ ] 2.1 Triển khai tạo review từ dòng hàng đã giao
  - **Produces:** Authenticated `POST /api/v1/orders/:id/items/:itemId/review`, review use case/repository create path, multipart validation, MinIO upload orchestration, error mappings và Wire/router integration.
  - **Scope:** TDD eligibility/ownership preflight và transaction recheck; lock order theo prerequisite, kiểm tra `delivered`/`partially_returned` cùng canonical refunded-item predicate; normalize rating/comment, canonical field errors, inspect actual MIME/signature, enforce limits, upload private objects, insert review/media atomically, compensate objects on failure và map envelope.
  - **Consumes:** Schema/contracts task 1.1, MinIO task 1.2, approved `order-returns` migration/predicate/order-first lock contract, auth caller ID, order/item ownership và exact multipart/error/private-media contracts.
  - **Acceptance:** Owner tạo được review cho item chưa refund trong order delivered/partial; refunded item bị chặn; quantity không tạo thêm quyền, mỗi lần mua khác có quyền riêng; duplicate create chỉ lưu một; refund/create race tuân commit order; invalid/file/storage/database failure không công khai review thiếu; thành công trả `201` với canonical `ReviewMedia[]` đọc lại/retain được.
  - **Verification:** Use case tests với fake repository/storage, multipart handler tests, repository transaction/concurrency integration tests và focused Wire/router build tests.
  - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 2.2, 2.3, 2.4, 2.5, 2.6, 2.8, 2.9, 2.10, 2.11, 6.2, 6.3, 6.4, 6.5, 6.7, 6.8_

- [ ] 2.2 Triển khai chỉnh sửa review đúng một lần
  - **Produces:** Authenticated `PUT /api/v1/orders/:id/items/:itemId/review` với replacement semantics cho text/rating/media, retained-media contract và atomic `edit_count` enforcement.
  - **Scope:** TDD ownership/preflight, retained media validation/order, upload object mới, transaction lock review/order/item, conditional first update, post-commit remove object cũ và compensation khi lỗi; không đăng ký DELETE route.
  - **Consumes:** Create workflow và canonical private `ReviewMedia[]` task 2.1; MinIO adapter; approved rule cho một successful edit, no delete và refunded review vẫn edit được.
  - **Acceptance:** First valid PUT thay toàn bộ nội dung, retain bằng canonical media IDs và trả `edited=true`, `canEdit=false`; invalid/storage/transaction failure giữ review/quota; concurrent PUT chỉ một thành công; owner có thể sửa sau partial/full refund; mọi update tiếp theo conflict; không có delete.
  - **Verification:** Use case/repository concurrency tests, multipart retained-media handler tests, MinIO compensation/removal tests và route absence test cho DELETE.
  - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 4.10, 5.4, 6.2, 6.8_

- [ ] 2.3 Cung cấp review công khai và media proxy
  - **Produces:** Public paginated `GET /api/v1/products/:id/reviews`, aggregate summary, masked-email projection và binary `GET|HEAD /media/reviews/:mediaId` backed by private MinIO.
  - **Scope:** Implement product-active validation, stable pagination, average/count/empty projection, canonical bare/display-name email parsing/fallback, order snapshot and media mapping; implement media metadata resolution, headers, HEAD/Range `206`, missing/MinIO-unavailable behavior.
  - **Consumes:** Review/media schema task 1.1, MinIO task 1.2, records from create/edit, catalog active-product source, users.email accepted forms và pagination envelope.
  - **Acceptance:** Anonymous users đọc review thật; empty average null/0; average một chữ số; page tối đa 10 ổn định; payload chỉ lộ masked canonical email hoặc null fallback, purchase snapshot và canonical media; media stream không lộ MinIO; product/media failures dùng contract.
  - **Verification:** Aggregate/pagination repository tests, public handler envelope tests, masking/privacy tests và media GET/HEAD/Range/private-bucket integration tests.
  - _Requirements: 1.7, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.9, 4.10, 4.11, 6.1, 6.6, 6.7, 6.8_

- [ ] 2.4 Mở rộng order review state và thống kê chờ đánh giá
  - **Produces:** Additive four-value `OrderItem.reviewStatus`/`review`, `reviewable` order bucket và `awaitingReview` query cho distinct delivered/partial orders còn eligible item.
  - **Scope:** Batch-load private reviews và refunded-item state tránh N+1; derive eligible/reviewed/refunded/ineligible; implement reviewable EXISTS predicate; giữ delivered/returns buckets và order lifecycle; cập nhật order backend/types/tests.
  - **Consumes:** Canonical private review payload tasks 2.1-2.2, `order-returns` statuses/refunded predicate, order/order-item source, review table và existing order response/stats contracts.
  - **Acceptance:** Unrefunded unreviewed item trong delivered/partial là eligible; reviewed luôn giữ payload/canEdit; refunded unreviewed là refunded; item khác ineligible; stats/reviewable đếm đúng và giảm sau create/refund; delivered/returns lists không đổi; không N+1/lifecycle regression.
  - **Verification:** Focused order repository/use case/handler tests cho create/get/list/stats/status transitions, query-count check chống N+1 và existing order suite.
  - _Requirements: 1.1, 1.2, 1.3, 1.6, 1.7, 3.1, 3.3, 3.8, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 7.5_

- [ ] 3. Hoàn thiện frontend customer experience

- [ ] 3.1 Xây dựng workflow tạo và sửa review trong đơn hàng
  - **Produces:** FormData-capable `apiClient`, reviews API module, accessible `ReviewFormDialog`, reusable order-item controls và tích hợp vào Order History/Order Detail.
  - **Scope:** TDD FormData/401 retry, canonical field/form error binding, star radio group, Unicode comment validation, image/video checks, previews/removal/object-URL cleanup, canonical retained media edit, loading/error/success; update item và refetch stats/reviewable list locally.
  - **Consumes:** Multipart/private review API tasks 2.1-2.2 và additive order contract task 2.4; order IDs/item IDs/options do existing order API cung cấp; existing auth, ApiError, Dialog, Button và responsive visual language.
  - **Acceptance:** Eligible partial/delivered item mở đúng form; refunded item nêu rõ không đủ điều kiện; canonical field/body errors giữ state; create cập nhật trạng thái/stats/reviewable list không reload; existing media hiển thị/retain đúng; edit hoạt động sau refund rồi biến mất sau một lần; không delete; keyboard/screen reader/320 px dùng được.
  - **Verification:** API client tests, dialog interaction/a11y tests, Order History/Detail behavior tests và representative desktop/mobile keyboard checks.
  - _Requirements: 1.1, 2.1, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.10, 3.1, 3.2, 3.4, 3.5, 3.6, 3.7, 3.8, 5.2, 5.3, 5.4, 5.5, 5.6, 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 3.2 Hiển thị review thật trên trang chi tiết sản phẩm
  - **Produces:** `ProductReviewsSection`, review summary thay số liệu hard-code, pagination, public gallery/video và Vite `/media` proxy.
  - **Scope:** TDD independent loading/empty/error/retry states, summary/list API mapping, masked identity, verified-purchase/options presentation, page navigation, image fallback and native video controls; giữ product information/purchase workflow usable khi review API hoặc media lỗi.
  - **Consumes:** Public review/media contracts task 2.3, product ID từ catalog detail, shared API client và frontend design/accessibility conventions.
  - **Acceptance:** Trang hiển thị average/count thật hoặc no-review state, không còn `5.0 (128 đánh giá)` giả; review newest-first và tải trang tiếp theo tối đa 10; email che/options/badge/media đúng contract; review failure retry riêng; broken media không che content; ảnh có accessible description, video không autoplay và dùng keyboard được; layout không overflow ở 320 CSS px.
  - **Verification:** Product Detail/Review Section tests, pagination/error/media tests, frontend lint/full test/build và desktop/mobile keyboard/visual checks của vùng bị ảnh hưởng.
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 6.1, 7.3, 7.4, 7.5, 7.6, 7.7_
