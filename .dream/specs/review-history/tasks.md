# Kế hoạch thực hiện (Implementation Plan)

- [x] 1. Backend Service and User Review API (`GET /api/v1/reviews/me`)

- [x] 1.1 Triển khai truy vấn cơ sở dữ liệu và tầng Repository cho lịch sử đánh giá
  - **Produces:** Định nghĩa truy vấn sqlc `CountUserReviews` và `ListUserReviews` trong `backend/db/queries/reviews.sql`, code sinh tự động qua `sqlc generate`, và phương thức `GetUserReviews` trong `backend/internal/repository/review_repository.go`.
  - **Scope:** SQL queries, sqlc code generation, repository implementation với cơ chế batch hydrate media qua `ListReviewMediaByReviewIDs`, unmarshal options JSON, ánh xạ `CanEdit` (`edit_count == 0`) và `Edited` (`edit_count > 0`), cùng integration tests cho repository.
  - **Consumes:** Bảng dữ liệu `product_reviews`, `order_items`, `orders`, `review_media` và các kiểu dữ liệu domain trong `backend/internal/domain/review.go`.
  - **Acceptance:** `GetUserReviews` trả về chính xác danh sách đánh giá của `userID`, hỗ trợ lọc theo số sao (0 = tất cả, 1-5 = số sao cụ thể), phân trang chính xác, sắp xếp mới nhất trước (`created_at DESC`), hydrate đầy đủ media cho từng đánh giá, và chỉ lấy dữ liệu thuộc quyền sở hữu của user.
  - **Verification:** Integration tests trong `backend/internal/repository/review_repository_integration_test.go`.
  - _Requirements: 1.2, 1.3, 2.1, 2.2, 2.3, 3.1, 3.4, 4.1, 4.2, 6.1_

- [x] 1.2 Triển khai UseCase, HTTP Handler và Đăng ký Route cho API Lịch sử đánh giá
  - **Produces:** Phương thức UseCase `GetUserReviews` trong `backend/internal/usecase/review/review.go`, HTTP Handler `getUserReviews` trong `backend/internal/delivery/http/review_handler.go`, và đăng ký route `GET /api/v1/reviews/me` trong `backend/internal/delivery/http/router.go`.
  - **Scope:** Validate tham số đầu vào (`rating` 0-5, `page` >= 1, `limit` 1-10), trích xuất `callerUserID` từ JWT middleware `guard.AuthRequired`, đóng gói kết quả theo chuẩn Full Status Envelope kèm `PaginationMeta`, và viết unit tests cho usecase và handler.
  - **Consumes:** `ReviewRepository.GetUserReviews`, JWT auth middleware `guard.AuthRequired`.
  - **Acceptance:** Request chưa đăng nhập trả về 401; tham số không hợp lệ trả về 400 validation error; request hợp lệ trả về 200 với đầy đủ cấu trúc Full Status Envelope, danh sách reviews và metadata phân trang.
  - **Verification:** Automated unit tests trong `backend/internal/usecase/review/review_test.go` và `backend/internal/delivery/http/review_handler_test.go`.
  - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3, 5.3, 6.1_

- [x] 2. Frontend Review History Page and Navigation

- [x] 2.1 Triển khai Client API và Định nghĩa Types cho Lịch sử đánh giá
  - **Produces:** Hàm API `getUserReviews` trong `frontend/src/api/reviews.ts` và các interface `UserReview`, `UserReviewsResponse` trong `frontend/src/api/types.ts`.
  - **Scope:** Client request function với URLSearchParams handling (`rating`, `page`, `limit`), TypeScript types mapping, và unit tests cho API client.
  - **Consumes:** Hợp đồng API `GET /api/v1/reviews/me` đã được phê duyệt.
  - **Acceptance:** `getUserReviews` truyền đúng query parameters và nhận kết quả phân trang chuẩn xác từ backend.
  - **Verification:** Automated tests trong `frontend/src/api/reviews.test.ts`.
  - _Requirements: 1.2, 2.1, 2.2, 2.3, 5.3_

- [x] 2.2 Xây dựng Trang Giao diện Lịch sử đánh giá (`ReviewHistoryPage`)
  - **Produces:** Component `ReviewHistoryPage` trong `frontend/src/pages/ReviewHistoryPage.tsx` và đăng ký route `/reviews` trong `frontend/src/App.tsx`.
  - **Scope:** Giao diện trang lịch sử đánh giá bao gồm: Header trang, bộ lọc tab số sao ("Tất cả", "5 sao", ..., "1 sao"), danh sách thẻ đánh giá (thông tin sản phẩm kèm link, thông tin đơn hàng kèm link, số sao, nhận xét, nhãn đã sửa, media gallery ảnh/video kèm modal xem ảnh phóng to và player video), tích hợp `ReviewFormDialog` để sửa đánh giá và cập nhật state trực tiếp, bộ điều khiển phân trang, trạng thái rỗng `EmptyState` dẫn tới `/orders?status=reviewable`, trạng thái skeleton loading và xử lý lỗi mạng.
  - **Consumes:** `getUserReviews`, `updateOrderItemReview`, `ReviewFormDialog`, `useAuth`, `useToast`, `EmptyState`.
  - **Acceptance:** Tự động chuyển hướng về `/login?redirect=/reviews` khi chưa đăng nhập; hiển thị đúng danh sách đánh giá mới nhất trước; chuyển tab số sao lọc đúng và reset về trang 1; phân trang chuyển trang chính xác; bấm ảnh mở lightbox xem ảnh lớn; bấm "Sửa đánh giá" mở dialog và cập nhật thành công mà không reload trang; ẩn nút sửa khi đã hết lượt chỉnh sửa; hiển thị empty state khi không có đánh giá.
  - **Verification:** Component tests trong `frontend/src/pages/ReviewHistoryPage.test.tsx`.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 5.2, 6.2, 6.3, 6.4_

- [x] 2.3 Tích hợp Liên kết Điều hướng "Lịch sử đánh giá" vào Header
  - **Produces:** Thêm liên kết "Lịch sử đánh giá" vào thanh điều hướng Desktop và Drawer Mobile trong `frontend/src/components/Header.tsx`.
  - **Scope:** Hiển thị liên kết `/reviews` khi người dùng đã đăng nhập, áp dụng active style khi ở trang `/reviews`, và cập nhật unit tests cho Header component.
  - **Consumes:** Route `/reviews`, `useAuth`.
  - **Acceptance:** Người dùng đã đăng nhập nhìn thấy link "Lịch sử đánh giá" trên cả Desktop và Mobile; người dùng chưa đăng nhập không nhìn thấy; bấm vào chuyển hướng đến `/reviews`.
  - **Verification:** Automated tests trong `frontend/src/components/Header.test.tsx`.
  - _Requirements: 5.1_
