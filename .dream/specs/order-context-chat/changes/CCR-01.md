# CCR-01 — Refactor sang Hội Thoại 1-1 Duy Nhất, Đính Kèm Đơn Hàng Dạng Tin Nhắn, và Phân Trang Cuộn Ngược

**Status:** APPROVED  
**Contract:** `customer-chat-api` rev 1, `admin-chat-api` rev 1, `chat-realtime-websocket` rev 1  
**Raised by:** user / spec-refactoring

## Reason and evidence

Yêu cầu người dùng tái cấu trúc luồng trò chuyện:
1. Giữa mỗi khách hàng và ban quản trị chỉ duy trì duy nhất một cuộc hội thoại xuyên suốt, không tạo hội thoại riêng cho từng đơn hàng.
2. Ngữ cảnh đơn hàng được chuyển thành tin nhắn đính kèm thẻ đơn hàng (Order Context Message) trực tiếp trong luồng chat.
3. Khi mở hội thoại chỉ nạp X tin nhắn gần nhất (mặc định 20 tin), cuộn lên đỉnh mới tải thêm tin cũ hơn.
4. Khi người dùng đang ở vị trí tin nhắn cũ (không ở sát đáy), nếu nhận tin mới thì giữ nguyên vị trí đọc, hiển thị chỉ báo "Có X tin mới" và cho phép bấm để tự cuộn xuống đáy.

## Authority check

- Requirement(s): `REQ-CHAT-01`, `REQ-CHAT-02`, `REQ-CHAT-03`, `REQ-CHAT-04`, `REQ-CHAT-05`, `REQ-CHAT-06` (đã được cập nhật và phê duyệt)
- Design decision(s): `design.md` Sections 1, 2, 3, 4, 5 (đã được cập nhật và phê duyệt)
- Requirement update needed: yes (đã hoàn thành)
- Design update needed: yes (đã hoàn thành)

## Proposed change

1. **`customer-chat-api` (rev 1 -> rev 2)**:
   - Thêm `GET /api/v1/chat/conversation`: Lấy hoặc tự động khởi tạo cuộc hội thoại 1-1 duy nhất của khách hàng hiện tại (thay thế việc truyền `orderId` vào `POST /api/v1/chat/conversations`).
   - `GET /api/v1/chat/conversations/:id/messages`: Hỗ trợ phân trang `limit` (mặc định 20) và `before` (timestamp ISO 8601 của tin nhắn cũ nhất phía client). Metadata trả về `hasMore` (boolean). Sắp xếp `created_at ASC`.
   - `chat_messages` entity: Thêm trường `messageType` (`text`, `media`, `order`), `orderId` (tùy chọn), `orderSummary` (snapshot đơn hàng gồm `id`, `status`, `totalVnd`, `recipientName`, `createdAt`, `itemCount`, `firstItemName`).
   - `POST /api/v1/chat/conversations/:id/messages`: Hỗ trợ gửi `orderId` để đính kèm đơn hàng vào dòng thời gian chat.

2. **`admin-chat-api` (rev 1 -> rev 2)**:
   - `GET /api/v1/admin/chat/conversations`: Danh sách các cuộc hội thoại theo từng khách hàng. Mỗi dòng đại diện cho một khách hàng duy nhất kèm thông tin tin nhắn cuối và số tin chưa đọc.
   - `GET /api/v1/admin/chat/conversations/:id/messages`: Hỗ trợ phân trang `limit` (mặc định 20) và `before`.
   - Entity tin nhắn đồng bộ `messageType`, `orderId`, `orderSummary`.

3. **`chat-realtime-websocket` (rev 1 -> rev 2)**:
   - Action `send_message`: Hỗ trợ tùy chọn `orderId` khi gửi thẻ đơn hàng qua WebSocket.
   - Event `new_message`: Payload mang đầy đủ `messageType`, `orderId`, `orderSummary`.

## Compatibility

`breaking` (Thay đổi mô hình quản lý hội thoại từ per-order sang per-customer, bổ sung cấu trúc phân trang ngược `before` + `hasMore`, và cấu trúc tin nhắn hỗ trợ `orderSummary`). Cả backend, frontend, và frontend-admin cần được cập nhật đồng bộ.

## Impact analysis

- Providers: `backend` (`commerce-backend/internal/delivery/http`, `domain`, `repository`, `wshub`)
- Consumers: `frontend` (`frontend/src/api/chat.ts`, `ChatDrawer`, `ChatWidget`), `frontend-admin` (`frontend-admin/src/api/chat.ts`, `AdminChatPage`)
- Tasks to reopen: BE-01, BE-03, BE-04, BE-05, FE-01, FE-02, FE-03, FE-04, ADM-01, ADM-02, ADM-03, ADM-04, E2E-01
- Evidence to invalidate: Toàn bộ evidence tasks tương ứng vì hợp đồng và yêu cầu đã thay đổi
- Unaffected tasks: BE-02 (Media adapter proxy độc lập giữ nguyên hợp đồng `chat-media-api` rev 1)

## Decision

`APPROVED`
