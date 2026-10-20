# Kế hoạch thực hiện (Implementation Plan)

- [x] 1. Backend Service and User Review API (`GET /api/v1/reviews/me`)

- [x] 1.1 Triển khai truy vấn cơ sở dữ liệu và tầng Repository cho lịch sử đánh giá
  - **Produces:** Định nghĩa truy vấn sqlc `CountUserReviews` và `ListUserReviews` trong `backend/db/queries/reviews.sql`, code sinh tự động qua `sqlc generate`, và phương thức `GetUserReviews` trong `backend/internal/repository/review_repository.go`.
  - **Scope:** SQL queries (`JOIN order_items`, `JOIN orders`, `LEFT JOIN review_replies`), sqlc code generation, repository implementation với cơ chế batch hydrate media qua `ListReviewMediaByReviewIDs`, unmarshal options JSON, ánh xạ `CanEdit` (`edit_count == 0`), `Edited` (`edit_count > 0`), `AdminReply`, `AdminRepliedAt`, cùng integration tests cho repository.
  - **Consumes:** Bảng dữ liệu `product_reviews`, `order_items`, `orders`, `review_media`, `review_replies` và các kiểu dữ liệu domain trong `backend/internal/domain/review.go`.
  - **Contracts:** DB-USER-REVIEWS@1 (provider)
  - **Acceptance:** `GetUserReviews` trả về chính xác danh sách đánh giá của `userID`, hỗ trợ lọc theo số sao (`0` = tất cả, `1-5` = số sao cụ thể), phân trang chính xác (`limit` tối đa 10), sắp xếp mới nhất trước (`created_at DESC, id DESC`), hydrate đầy đủ media cho từng đánh giá, và chỉ lấy dữ liệu thuộc quyền sở hữu của user (`orders.user_id = userID`).
  - **Verification:** Integration tests trong `backend/internal/repository/review_repository_integration_test.go`.
  - _Requirements: 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 3.1, 3.4, 4.1, 4.2, 6.1_

- [x] 1.2 Triển khai UseCase, HTTP Handler và Đăng ký Route cho API Lịch sử đánh giá
  - **Produces:** Phương thức UseCase `GetUserReviews` trong `backend/internal/usecase/review/review.go`, HTTP Handler `getUserReviews` trong `backend/internal/delivery/http/review_handler.go`, và đăng ký route `GET /api/v1/reviews/me` trong `backend/internal/delivery/http/router.go`.
  - **Scope:** Validate tham số đầu vào (`rating` `0-5`, `page >= 1`, `limit` `1-10`), trích xuất `callerUserID` từ JWT middleware `guard.AuthRequired`, đóng gói kết quả theo chuẩn Full Status Envelope kèm `PaginationMeta`, đảm bảo không đăng ký route `DELETE` đánh giá, và viết unit tests cho usecase và handler.
  - **Consumes:** `DB-USER-REVIEWS@1` (`ReviewRepository.GetUserReviews`), JWT auth middleware `guard.AuthRequired`.
  - **Contracts:** API-USER-REVIEWS@1 (provider); DB-USER-REVIEWS@1 (consumer)
  - **Acceptance:** Request chưa đăng nhập trả về `401`; tham số `rating` không hợp lệ trả về `400 validation_error`; request hợp lệ trả về `200` với đầy đủ cấu trúc Full Status Envelope, danh sách `reviews` và `meta.pagination`; mọi thông báo lỗi nghiệp vụ bằng tiếng Việt; không tồn tại endpoint xóa đánh giá (`DELETE` trả về `404`/`405`).
  - **Verification:** Automated unit tests trong `backend/internal/usecase/review/review_test.go` và `backend/internal/delivery/http/review_handler_test.go`.
  - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3, 2.4, 3.4, 3.5, 5.3, 6.1_

- [x] 2. Frontend Review History Page and Navigation

- [x] 2.1 Triển khai Client API và Định nghĩa Types cho Lịch sử đánh giá
  - **Produces:** Hàm API `getUserReviews` trong `frontend/src/api/reviews.ts` và các interface `UserReview`, `UserReviewOrder`, `UserReviewProduct`, `UserReviewsResponse` trong `frontend/src/api/types.ts`.
  - **Scope:** Client request function với `URLSearchParams` handling (`rating`, `page`, `limit`), TypeScript types mapping theo `API-USER-REVIEWS@1`, và unit tests cho API client.
  - **Consumes:** Hợp đồng `API-USER-REVIEWS@1` (`GET /api/v1/reviews/me`) từ `design.md`.
  - **Contracts:** API-USER-REVIEWS@1 (consumer)
  - **Acceptance:** `getUserReviews` truyền đúng query parameters và nhận kết quả phân trang chuẩn xác theo Full Status Envelope từ backend.
  - **Verification:** Automated tests trong `frontend/src/api/reviews.test.ts`.
  - _Requirements: 1.2, 2.1, 2.2, 2.3, 2.4, 5.3_

- [x] 2.2 Xây dựng Trang Giao diện Lịch sử đánh giá (`ReviewHistoryPage`)
  - **Produces:** Component `ReviewHistoryPage` trong `frontend/src/pages/ReviewHistoryPage.tsx` và đăng ký route `/reviews` trong `frontend/src/App.tsx`.
  - **Scope:** Giao diện trang lịch sử đánh giá bao gồm: Header trang, bộ lọc tab số sao (`"Tất cả"`, `"5 sao"`, ..., `"1 sao"`), danh sách thẻ đánh giá (thông tin sản phẩm kèm link trên cả tên và ảnh tới `/products/:productId`, thông tin đơn hàng kèm link tới `/orders/:orderId`, số sao, nhận xét, ngày đánh giá, ngày cập nhật và nhãn `"Đã chỉnh sửa"` khi đã cập nhật, media gallery ảnh/video kèm modal xem ảnh phóng to, player video có controls không tự phát âm thanh, và khung giữ chỗ thay thế khi ảnh/video lỗi), tích hợp `ReviewFormDialog` để sửa đánh giá (`edit_count = 0`) và cập nhật state trực tiếp không reload trang, bộ điều khiển phân trang, trạng thái rỗng theo bộ lọc (kèm nút đặt lại về `"Tất cả"`) và trạng thái rỗng khi chưa có đánh giá (`EmptyState` dẫn tới `/orders?status=reviewable` hoặc `/products`), trạng thái skeleton loading, bố cục responsive `>= 320px`, và hỗ trợ điều hướng bàn phím với chỉ báo focus rõ ràng.
  - **Consumes:** `API-USER-REVIEWS@1` (`getUserReviews`), `API-ORDER-ITEM-REVIEW@1` (`updateOrderItemReview`, `ReviewFormDialog`), `useAuth`, `useToast`, `EmptyState`.
  - **Contracts:** API-USER-REVIEWS@1 (consumer); API-ORDER-ITEM-REVIEW@1 (consumer)
  - **Acceptance:** Tự động chuyển hướng về `/login?redirect=/reviews` khi chưa đăng nhập; hiển thị đúng danh sách đánh giá mới nhất trước với đầy đủ thông tin sản phẩm, đơn hàng, ngày đánh giá, ngày cập nhật và nhãn đã sửa; nhấn tên hoặc ảnh sản phẩm chuyển hướng tới `/products/:productId`; nhấn mã đơn hàng chuyển hướng tới `/orders/:orderId`; chuyển tab số sao lọc đúng và reset về trang 1; hiển thị thông báo rỗng và nút đặt lại về `"Tất cả"` khi bộ lọc không có kết quả; phân trang tối đa 10 mục/trang và chuyển trang chính xác; nhấn ảnh mở lightbox xem ảnh lớn; video có controls và không tự phát âm thanh; media lỗi hiển thị khung giữ chỗ thay thế không làm gián đoạn nội dung khác; nhấn `"Sửa đánh giá"` mở dialog nạp sẵn dữ liệu và cập nhật thành công mà không reload trang; ẩn nút sửa khi `edit_count >= 1` và không có nút xóa; hiển thị empty state khi chưa có đánh giá; responsive từ `320px` không cuộn ngang ngoài ý muốn; hỗ trợ điều hướng bàn phím với focus rõ ràng.
  - **Verification:** Component tests trong `frontend/src/pages/ReviewHistoryPage.test.tsx`.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 5.2, 6.2, 6.3, 6.4_

- [x] 2.3 Tích hợp Liên kết Điều hướng "Lịch sử đánh giá" vào Header
  - **Produces:** Thêm liên kết `"Lịch sử đánh giá"` vào thanh điều hướng Desktop và Drawer Mobile trong `frontend/src/components/Header.tsx`.
  - **Scope:** Hiển thị liên kết `/reviews` khi người dùng đã đăng nhập, áp dụng active style khi ở trang `/reviews`, và cập nhật unit tests cho `Header` component.
  - **Consumes:** Route `/reviews`, `useAuth`.
  - **Contracts:** none
  - **Acceptance:** Người dùng đã đăng nhập nhìn thấy link `"Lịch sử đánh giá"` trên cả Desktop và Mobile Menu; người dùng chưa đăng nhập không nhìn thấy; nhấn vào chuyển hướng đến `/reviews`.
  - **Verification:** Automated tests trong `frontend/src/components/Header.test.tsx`.
  - _Requirements: 5.1_

- [x] 3. End-to-End Verification (Mode 2)

- [x] 3.1 Xác minh End-to-End theo Mode 2 (Contract-Verified Mock E2E) và xuất báo cáo bằng chứng trực quan
  - **Produces:** Tệp golden snapshot hợp đồng backend `.dream/specs/review-history/contract-snapshots.json` được sinh/kiểm chứng tự động từ `backend/internal/delivery/http/review_handler_test.go`, bộ kiểm thử Playwright E2E tại `frontend/e2e/review-history.spec.ts` (kèm Page Object / contract helper nếu cần), bộ ảnh chụp màn hình từng bước tại `.dream/specs/review-history/imgs/`, và báo cáo tổng hợp tại `.dream/specs/review-history/report.md`.
  - **Scope:** Load skill `e2e-testing` và thực thi đúng chế độ đã phê duyệt trong `design.md`: **`Mode 2: Contract-Verified Mock E2E (1:1 Backend Contract Lock)`** (tuyệt đối không tự ý chuyển sang Mode 1). Trong `backend/internal/delivery/http/review_handler_test.go`, ghi nhận và kiểm chứng `.dream/specs/review-history/contract-snapshots.json` qua `httptest.NewRecorder()` cho `API-USER-REVIEWS@1` (`200` có dữ liệu, `200` rỗng, `400` validation error, `401` unauthenticated) và `API-ORDER-ITEM-REVIEW@1` (`200` cập nhật thành công, `400` validation error, `409` `review_edit_limit_reached`). Trong `frontend/e2e/review-history.spec.ts`, nạp trực tiếp `contract-snapshots.json`, áp dụng đầy đủ 4 quy tắc bắt buộc của Mode 2 (Rule 1: Golden Snapshot Lock & `assertMatchesContractShape`; Rule 2: Inbound Auth & Query/Multipart Validation; Rule 3: Outbound Full Status Envelope & User Isolation Check; Rule 4: Stateful In-Memory Transitions đồng bộ xuyên suốt giữa `/reviews`, `/products/:productId` và `/orders/:orderId`), chạy trình duyệt Chromium thật qua Playwright, chụp ảnh màn hình từng bước lưu vào `.dream/specs/review-history/imgs/` và xuất báo cáo `.dream/specs/review-history/report.md`. Nếu quá trình chạy E2E phát hiện lỗi tích hợp hoặc thiếu sót hành vi UI trong phạm vi spec đã duyệt (ví dụ: hiển thị `updatedAt`, liên kết trên cả ảnh và tên sản phẩm, fallback khi media lỗi, đồng bộ dữ liệu sau khi sửa), sửa triệt để nguyên nhân gốc, chạy lại unit/integration tests bị ảnh hưởng cùng bộ E2E Playwright, và cập nhật lại `imgs/` cùng `report.md`; nếu phát hiện hợp đồng đã duyệt bị sai hoặc thiếu, dừng lại và gọi `managing-contract-changes`.
  - **Consumes:** `API-USER-REVIEWS@1`, `API-ORDER-ITEM-REVIEW@1`, `DB-USER-REVIEWS@1`, `ReviewHistoryPage.tsx`, `Header.tsx`, `ReviewFormDialog.tsx`.
  - **Contracts:** API-USER-REVIEWS@1 (verifier); API-ORDER-ITEM-REVIEW@1 (verifier); DB-USER-REVIEWS@1 (verifier)
  - **Acceptance:**
    - `go test ./internal/delivery/http/...` tại `backend/` chạy pass và xác nhận `.dream/specs/review-history/contract-snapshots.json` khớp 1:1 với đầu ra thực tế của Gin router & handler (`Req 5.3`).
    - Truy cập `/reviews` khi chưa đăng nhập tự động chuyển hướng tới `/login?redirect=/reviews` (`Req 1.1`).
    - Khách hàng đã đăng nhập thấy và điều hướng được tới `/reviews` từ liên kết `"Lịch sử đánh giá"` trên cả Header Desktop (`1440x900`) và Mobile Menu (`375x812`) (`Req 5.1`).
    - Danh sách đánh giá hiển thị đúng dữ liệu của chính khách hàng đó (`Req 6.1`), sắp xếp mới nhất trước (`Req 1.2`), hiển thị skeleton khi đang tải (`Req 6.3`), và hiển thị đầy đủ thông tin sản phẩm (tên, ảnh, thương hiệu, model, options), mã đơn hàng, ngày đặt mua, số sao, nhận xét, ảnh/video đính kèm, ngày đánh giá, ngày cập nhật và nhãn `"Đã chỉnh sửa"` nếu đã chỉnh sửa (`Req 1.3`).
    - Nhấn vào tên hoặc ảnh sản phẩm điều hướng đến `/products/:productId` (`Req 1.4`); nhấn vào mã đơn hàng điều hướng đến `/orders/:orderId` (`Req 1.5`); trạng thái trống khi chưa có đánh giá hiển thị thông báo kèm nút dẫn tới `/orders?status=reviewable` hoặc `/products` (`Req 1.6`).
    - Bộ lọc 6 tab số sao (`Tất cả`, `5 sao`..`1 sao`) lọc chính xác, reset về trang 1 (`Req 2.1, 2.2`); phân trang tối đa 10 mục/trang và chuyển trang hoạt động đúng (`Req 2.3, 2.4`); bộ lọc không có kết quả hiển thị thông báo rỗng và nút đặt lại về `"Tất cả"` (`Req 2.5`).
    - Đánh giá có `edit_count = 0` hiển thị nút `"Sửa đánh giá"`, mở modal nạp sẵn dữ liệu hiện tại, gửi chỉnh sửa hợp lệ cập nhật ngay trên trang (`edit_count = 1`, hiện nhãn `"Đã chỉnh sửa"` và ngày cập nhật, ẩn nút sửa, hiện thông báo thành công) mà không reload trang (`Req 3.1, 3.2, 3.3`); đánh giá có `edit_count >= 1` ẩn nút sửa và mọi yêu cầu sửa tiếp bị từ chối bằng lỗi `409 review_edit_limit_reached` tiếng Việt (`Req 3.4`); không có nút hoặc hành động xóa đánh giá (`Req 3.5`); sau khi sửa, điều hướng sang `/products/:productId` và `/orders/:orderId` phản ánh nội dung đánh giá mới nhất (`Req 5.2`).
    - Nhấn vào ảnh thu nhỏ mở modal/lightbox phóng to (`Req 4.1`); video hiển thị khung phát có đầy đủ controls và không tự động phát âm thanh (`Req 4.2`); ảnh/video lỗi hiển thị khung giữ chỗ thay thế mà không làm gián đoạn nội dung khác (`Req 4.3`).
    - Giao diện hiển thị tốt trên các viewport từ `320px` (`320x720`, `375x812`, `1440x900`) không bị vỡ bố cục hay cuộn ngang ngoài ý muốn (`Req 6.2`), hỗ trợ điều hướng bàn phím với chỉ báo focus rõ ràng (`Req 6.4`).
    - Toàn bộ ảnh chụp màn hình từng bước được lưu tại `.dream/specs/review-history/imgs/` và được nhúng đầy đủ trong `.dream/specs/review-history/report.md`.
  - **Verification:** Chạy `go test -v ./internal/delivery/http -run "TestGetUserReviews_HTTPHandler|TestUpdateReview_HTTPHandler"` từ `backend/` và `npx playwright test e2e/review-history.spec.ts` từ `frontend/`, kiểm tra tất cả pass và kiểm tra sự tồn tại của `.dream/specs/review-history/contract-snapshots.json`, `.dream/specs/review-history/imgs/*.png`, `.dream/specs/review-history/report.md`.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 5.1, 5.2, 5.3, 6.1, 6.2, 6.3, 6.4_
