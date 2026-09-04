# Kế hoạch triển khai: Nhắn tin hỗ trợ khách hàng và Quản trị viên kèm ngữ cảnh đơn hàng (Order Inquiry Messaging)

- [x] 1. Cơ sở dữ liệu, Mô hình dữ liệu & Lưu trữ Media
- [x] 1.1 Khởi tạo Migration cơ sở dữ liệu và Schema Models
  - **Produces:** Migration `000016_create_chat_messaging.up.sql` và `down.sql`, cập nhật SQL queries và sinh code `sqlc` cho các bảng `conversations`, `chat_messages`, `chat_attachments` (với `file_size bigint`, `uploader_id`, `message_id NULL` hỗ trợ tải tệp trước), cùng trường `users.last_active_at`.
  - **Scope:** Định nghĩa các bảng, khóa ngoại tham chiếu `users(id)` và `orders(id)`, chỉ mục tìm kiếm và sắp xếp thời gian; viết truy vấn SQL tính toán động `CustomerName` (từ đơn hàng gần nhất / địa chỉ / email prefix), `UnreadCount`, và `IsRead`; cập nhật `db/queries/chat.sql` và chạy `sqlc generate`.
  - **Consumes:** Thiết kế schema và ràng buộc toàn vẹn từ mục Data Models trong `design.md`.
  - **Acceptance:** Migration áp dụng thành công không lỗi; cấu trúc bảng đảm bảo đầy đủ khóa chính, ràng buộc CHECK độ dài tin nhắn (<= 2000 ký tự), các loại attachment (image/video), vai trò người gửi (customer/admin).
  - **Verification:** Chạy migration test trên database và sinh code sqlc thành công qua `make gen`.
  - _Requirements: 1.5, 1.8, 2.4, 2.7, 5.6, 6.3_

- [x] 1.2 Dịch vụ lưu trữ & Phân phối tệp đa phương tiện (Chat Media Store & Streaming)
  - **Produces:** Module `internal/storage/chatmedia` kết nối MinIO lưu trữ ảnh và video, API upload `POST /api/v1/chat/media`, và endpoint phân phối/streaming tệp `GET /api/v1/chat/media/:id`.
  - **Scope:** Kiểm tra MIME type hợp lệ (JPEG, PNG, WebP, GIF, MP4, WebM), giới hạn kích thước (ảnh <= 10MB, video <= 50MB), tải lên MinIO bucket `chat-media`, tạo bản ghi pending attachment và trả về URL `/api/v1/chat/media/:id`; endpoint `GET` hỗ trợ header HTTP Range (206 Partial Content) cho video và header Cache-Control cho ảnh.
  - **Consumes:** Cấu hình MinIO trong `internal/config/config.go` và hợp đồng `ChatAttachment`.
  - **Acceptance:** Upload file hợp lệ trả về URL và metadata; upload file quá dung lượng hoặc sai MIME type trả về HTTP 400 validation error; gọi endpoint GET tải được ảnh và stream được video với byte range.
  - **Verification:** Unit test kiểm tra validation dung lượng/MIME và HTTP handler test cho endpoint media stream với header Range.
  - _Requirements: 6.1, 6.3, 6.4, 6.5, 6.6, 6.7_

- [x] 2. Nghiệp vụ Backend & Kết nối thời gian thực (WebSocket)
- [x] 2.1 Backend Chat Repository & UseCase phía Khách hàng
  - **Produces:** `internal/repository/chat_repository.go`, `internal/usecase/chat/customer.go`, và các HTTP handler cho khách hàng (`GET /api/v1/chat/conversation`, `GET /api/v1/chat/messages`, `POST /api/v1/chat/messages`, `POST /api/v1/chat/read`, `GET /api/v1/chat/orders`).
  - **Scope:** Khởi tạo hoặc lấy hội thoại của khách hàng; xác thực quyền sở hữu đơn hàng (`order.UserID == customerID`) khi đính kèm `attachedOrderId`; xác thực quyền sở hữu attachment (`uploader_id == customerID` và `message_id IS NULL`) khi truyền `attachmentIds`; kiểm tra độ dài tin nhắn; tạo tin nhắn và liên kết attachments trong 1 transaction; đánh dấu đã đọc.
  - **Consumes:** `domain.ChatRepository`, `domain.ChatUseCase`, `sqlc` models, bảng `orders`.
  - **Acceptance:** Khách hàng gửi tin nhắn thành công; đính kèm đơn hàng hoặc tệp attachment của người khác bị chặn với lỗi 400; tin nhắn rỗng không có attachment bị chặn; lịch sử tin nhắn trả về đúng thứ tự thời gian.
  - **Verification:** Unit tests cho use case (bao gồm các ca hợp lệ, đính kèm đơn hàng sai quyền sở hữu, độ dài vượt quá giới hạn, attachment không hợp lệ) và HTTP delivery tests.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 6.3, 6.8_

- [x] 2.2 Backend Chat UseCase phía Quản trị viên & Phân quyền Admin
  - **Produces:** `internal/usecase/chat/admin.go` và các HTTP handler cho quản trị viên (`GET /api/v1/admin/chat/conversations`, `GET /api/v1/admin/chat/conversations/:id/messages`, `POST /api/v1/admin/chat/conversations/:id/messages`, `POST /api/v1/admin/chat/conversations/:id/read`).
  - **Scope:** Danh sách hội thoại sắp xếp theo `last_message_at DESC`, hỗ trợ lọc "unread" và tìm kiếm theo email/mã đơn; xem tin nhắn hội thoại; admin gửi tin nhắn phản hồi (hỗ trợ `attachmentIds`); đánh dấu đã đọc tin nhắn của khách hàng.
  - **Consumes:** Middleware `RequireRole(domain.RoleAdmin)` và `domain.ChatRepository`.
  - **Acceptance:** Admin truy xuất và phản hồi thành công; người dùng không có vai trò admin bị chặn với lỗi HTTP 403 Forbidden; tìm kiếm và lọc trả về kết quả chính xác.
  - **Verification:** Unit tests cho admin use case và HTTP delivery handler tests với token admin và token non-admin.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 4.1, 4.2, 4.3, 4.4, 4.5, 6.3, 6.8_

- [x] 2.3 WebSocket Hub, Trạng thái truy cập (Presence) & Phát tin nhắn Realtime
  - **Produces:** Module `internal/delivery/ws` (`hub.go`, `client.go`), endpoint `GET /api/v1/chat/ws`, và tích hợp Google Wire vào `cmd/server/wire.go`.
  - **Scope:** Nâng cấp kết nối WebSocket từ HTTP request; xác thực token JWT qua query param; duy trì danh sách client theo `user_id` và `role`; theo dõi và cập nhật `last_active_at`; phát sự kiện `chat:new_message`, `chat:messages_read`, `chat:presence` tới các client liên quan; xử lý ngắt kết nối và dọn dẹp bộ nhớ.
  - **Consumes:** JWT auth service, `domain.ChatUseCase`, `domain.ChatMessage`.
  - **Acceptance:** Client kết nối bằng token hợp lệ thành công; token không hợp lệ đóng kết nối với code 4001; khi có tin nhắn mới được lưu vào DB, Hub phát sự kiện realtime tới cả khách hàng và admin trong vòng dưới 1 giây.
  - **Verification:** Unit tests cho `WSHub` mô phỏng nhiều client kết nối, nhận sự kiện broadcast và ngắt kết nối an toàn.
  - _Requirements: 5.1, 5.2, 5.5, 5.6, 5.7, 5.8_

- [x] 3. Giao diện Người dùng Khách hàng (Frontend Customer)
- [x] 3.1 Hook WebSocket Khách hàng & Floating Inbox Widget
  - **Produces:** `frontend/src/api/chat.ts`, hook `frontend/src/hooks/useChatSocket.ts`, component `frontend/src/components/chat/ChatWidget.tsx` tích hợp cố định ở góc dưới bên phải màn hình trong `frontend/src/App.tsx`.
  - **Scope:** Nút floating widget với biểu tượng tin nhắn và badge hiển thị số tin chưa đọc; popup chat mở ra ở góc phải; tự động kết nối lại WebSocket với exponential backoff; hiển thị trạng thái online/truy cập gần nhất của đội ngũ hỗ trợ trên header.
  - **Consumes:** `apiClient` từ `frontend/src/api/client.ts`, `useAuth()` từ `frontend/src/context/AuthContext.tsx`.
  - **Acceptance:** Nút widget xuất hiện ở góc dưới bên phải mọi trang; click mở popup chat mà không tải lại trang; người dùng chưa đăng nhập click vào hiển thị yêu cầu đăng nhập; badge số tin nhắn chưa đọc cập nhật tự động khi có tin mới.
  - **Verification:** Vitest component tests cho `ChatWidget` (kiểm tra render, toggle popup, badge unread, auth guard).
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 1.7, 5.1, 5.2, 5.5, 5.6, 5.7, 5.8_

- [x] 3.2 Khung trò chuyện Khách hàng & Đính kèm ngữ cảnh Đơn hàng
  - **Produces:** `frontend/src/components/chat/ChatWindow.tsx`, `frontend/src/components/chat/OrderPickerModal.tsx`, `frontend/src/components/chat/OrderCardMessage.tsx`, và tích hợp nút "Hỏi đáp về đơn hàng" trong `frontend/src/pages/OrderDetailPage.tsx`.
  - **Scope:** Hiển thị luồng tin nhắn; khung soạn thảo tin nhắn; nút đính kèm đơn hàng mở modal chọn từ danh sách đơn đã mua; xem trước đơn hàng đính kèm; hiển thị thẻ OrderCard trong tin nhắn có link điều hướng về chi tiết đơn hàng của khách; kích hoạt mở chat và tự động đính kèm đơn hàng từ trang chi tiết đơn.
  - **Consumes:** Hợp đồng `AttachedOrderCard` và endpoint `GET /api/v1/chat/orders`.
  - **Acceptance:** Khách hàng có thể chọn đính kèm đơn hàng, gỡ bỏ trước khi gửi, hoặc bấm nút từ trang chi tiết đơn; thẻ đơn hàng hiển thị đầy đủ mã, ngày, trạng thái, tổng tiền và xem nhanh các sản phẩm.
  - **Verification:** Vitest tests kiểm tra chọn đơn hàng đính kèm, gửi tin nhắn kèm đơn, và render thẻ `OrderCardMessage`.
  - _Requirements: 1.5, 1.8, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

- [x] 3.3 Đính kèm Đa phương tiện & Nút cuộn "X tin nhắn mới ↓"
  - **Produces:** `frontend/src/components/chat/MediaAttachmentPreview.tsx`, `frontend/src/components/chat/ImageLightbox.tsx`, `frontend/src/components/chat/NewMessagesScrollBadge.tsx`.
  - **Scope:** Chọn và xem trước ảnh/video trước khi gửi; tải tệp lên qua `POST /api/v1/chat/media`, nhận ID và truyền vào tin nhắn; hiển thị ảnh qua URL endpoint nội bộ kèm lightbox phóng to; hiển thị video player inline hỗ trợ stream; phát hiện vị trí cuộn: nếu đang xem phía trên mà có tin nhắn mới thì không tự động cuộn mà hiển thị badge "X tin nhắn mới ↓"; nhấn vào badge sẽ cuộn mượt xuống đáy và đánh dấu đã đọc.
  - **Consumes:** API upload media `POST /api/v1/chat/media`, streaming endpoint `GET /api/v1/chat/media/:id`, và `WSEventNewMessage`.
  - **Acceptance:** Người dùng upload được ảnh/video hợp lệ; ảnh phóng to xem được bằng lightbox; video xem được trực tiếp; khi cuộn lên trên và có tin mới đến, badge "X tin nhắn mới ↓" xuất hiện và click vào thì cuộn xuống đáy.
  - **Verification:** Vitest component tests cho `ImageLightbox`, player media, và logic hiển thị badge cuộn khi `isAtBottom === false`.
  - _Requirements: 5.3, 5.4, 6.1, 6.2, 6.4, 6.5, 6.6, 6.7, 6.8_

- [x] 4. Giao diện Quản trị viên (Frontend Admin)
- [x] 4.1 Màn hình Hỗ trợ Tin nhắn & Danh sách Hội thoại Admin
  - **Produces:** `frontend-admin/src/api/chat.ts`, `frontend-admin/src/pages/ChatSupportPage.tsx`, bổ sung mục "Tin nhắn hỗ trợ" vào sidebar điều hướng trong `frontend-admin/src/components/layout/AdminLayout.tsx` với route `/chat`.
  - **Scope:** Cột danh sách hội thoại khách hàng với email, snippet tin nhắn cuối, thời gian, trạng thái online/truy cập gần nhất, badge số tin chưa đọc; ô tìm kiếm theo email/mã đơn hàng; tab lọc trạng thái "Tất cả" / "Chưa đọc".
  - **Consumes:** `apiClient` từ `frontend-admin/src/api/client.ts`, endpoint `GET /api/v1/admin/chat/conversations`.
  - **Acceptance:** Danh sách hội thoại hiển thị đúng thứ tự; lọc "Chưa đọc" chỉ hiện các cuộc gọi có tin nhắn mới từ khách; tìm kiếm theo từ khóa hoạt động mượt mà.
  - **Verification:** Vitest component tests cho danh sách hội thoại admin và bộ lọc tìm kiếm.
  - _Requirements: 3.1, 3.2, 3.5, 3.6, 3.7, 5.5_

- [x] 4.2 Luồng hội thoại Chi tiết, Điều hướng Đơn hàng & Phản hồi Realtime Admin
  - **Produces:** `frontend-admin/src/components/chat/AdminChatDetail.tsx`, `frontend-admin/src/components/chat/AdminReplyComposer.tsx`, tích hợp WebSocket `useAdminChatSocket.ts`.
  - **Scope:** Hiển thị chi tiết toàn bộ tin nhắn trao đổi; hiển thị thẻ đơn hàng có nút liên kết trực tiếp sang `/orders/:id` của trang quản trị; bộ soạn thảo phản hồi hỗ trợ văn bản và đính kèm ảnh/video qua `attachmentIds`; gửi tin phản hồi và cập nhật tức thời qua WebSocket; hiển thị nút "X tin nhắn mới ↓" khi cuộn xem phía trên.
  - **Consumes:** `POST /api/v1/admin/chat/conversations/:id/messages`, `POST /api/v1/admin/chat/conversations/:id/read`, `GET /api/v1/chat/ws`, `GET /api/v1/chat/media/:id`.
  - **Acceptance:** Admin xem được thẻ đơn hàng đính kèm và click chuyển đúng trang chi tiết đơn; gửi phản hồi xuất hiện ngay lập tức; tin nhắn đánh dấu đã đọc khi xem; hỗ trợ gửi ảnh/video phản hồi cho khách hàng.
  - **Verification:** Vitest component tests cho `AdminChatDetail` và `AdminReplyComposer`.
  - _Requirements: 3.3, 3.4, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 5.6, 6.1, 6.2, 6.4, 6.5, 6.8_
