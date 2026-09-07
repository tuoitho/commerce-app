# Thiết Kế Kỹ Thuật: Nhắn Tin Hỗ Trợ Đính Kèm Ngữ Cảnh Đơn Hàng

## 1. Mục Tiêu Thiết Kế

Thiết kế phân hệ nhắn tin hỗ trợ trực tiếp giữa Khách hàng và Ban Quản Trị (Admin) với các nguyên tắc cốt lõi:
- **Một cuộc hội thoại 1-1 duy nhất cho mỗi khách hàng**: Khách hàng và ban quản trị chỉ duy trì duy nhất một luồng trao đổi liên tục xuyên suốt. Toàn bộ lịch sử hỗ trợ được tập trung tại một nơi, không phân mảnh thành nhiều cuộc hội thoại rời rạc theo từng đơn hàng.
- **Đính kèm ngữ cảnh đơn hàng như một tin nhắn (Order Context Message)**: Khi khách hàng hỏi về một đơn hàng (từ trang chi tiết đơn hàng hoặc từ nút đính kèm trong chat), thông tin đơn hàng được gửi vào hội thoại như một tin nhắn thẻ đơn hàng độc lập, chứa dữ liệu tóm tắt snapshot (mã đơn, ngày đặt, trạng thái, tổng tiền, tóm tắt sản phẩm) và nút chuyển hướng đến chi tiết đơn hàng.
- **Tải phân trang tối ưu (Load X tin nhắn gần nhất & cuộn lên tải tiếp)**: Khi mở hội thoại, chỉ nạp trước X tin nhắn gần nhất (mặc định X = 20 tin). Khi người dùng cuộn lên đỉnh (scroll to top), hệ thống nạp thêm X tin nhắn cũ tiếp theo (cursor-based pagination bằng timestamp/id) và duy trì chính xác vị trí hiển thị thị giác.
- **Chỉ báo tin mới thông minh khi xem tin cũ (Jump-to-bottom & New Message Indicator)**: Khi người dùng đang cuộn xem lịch sử tin nhắn cũ (không ở sát đáy), các tin nhắn mới gửi đến qua WebSocket không làm giật màn hình xuống đáy mà kích hoạt nút thông báo nổi "Có X tin mới". Người dùng có thể nhấp để tự động cuộn mượt xuống đáy.
- **WebSocket Hub thời gian thực**: Gửi/nhận tin nhắn tức thì, cập nhật số tin chưa đọc và phát hiện trạng thái trực tuyến (online/presence).
- **MinIO Object Storage & Media Proxy**: Lưu trữ và streaming ảnh/video an toàn với kiểm tra MIME magic bytes và hỗ trợ HTTP byte-range.

---

## 2. Kiến Trúc Tổng Thể & Luồng Real-time WebSocket

```text
┌────────────────────────────────────────────────────────────────────────┐
│                          Frontend Khách Hàng                           │
│  - Floating Chat Bubble (góc dưới bên phải)                            │
│  - Hộp thoại Chat trực tiếp vào cuộc trò chuyện 1-1 duy nhất           │
│  - Nạp 20 tin nhắn gần nhất & cuộn lên đỉnh để tải thêm tin cũ         │
│  - Nút "Có X tin mới" khi đang xem tin cũ + cuộn mượt xuống đáy        │
│  - Nút "Đính kèm đơn hàng" & Thẻ đơn hàng (Order Context Message Card) │
│  - Trình đính kèm Media & Dán Clipboard (Ctrl+V)                       │
│  - Kết nối WebSocket nhận tin nhắn realtime & cập nhật presence        │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   │ WebSocket (ws://.../api/v1/chat/ws)
                                   │ & REST HTTP (/api/v1/chat/...)
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        Backend HTTP / Delivery                         │
│  - WebSocket Upgrader & Hub: Quản lý kết nối theo User ID             │
│  - ChatHandler: Quản lý hội thoại duy nhất, phân trang tin nhắn cũ,    │
│    lưu tin nhắn text/media/order_card, đánh dấu đã đọc                 │
│  - MediaProxy: GET /media/chat/:mediaId (Streaming Range Bytes)        │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
                    ▼                                ▼
┌──────────────────────────────────────┐  ┌──────────────────────────────┐
│        Chat UseCase / Domain         │  │     MinIO Storage Adapter    │
│  - Đảm bảo 1 hội thoại/user          │  │  - Upload ảnh/video tin nhắn │
│  - Xác thực quyền sở hữu đơn hàng    │  │  - Bucket private an toàn    │
│  - Gắn snapshot đơn hàng vào message │  │  - Phục vụ Range streaming   │
│  - Broadcast tin nhắn qua WS Hub     │  └──────────────────────────────┘
│  - Phân trang cursor-based (before)  │
│  - Đánh dấu đã đọc & Tính Unread     │
└───────────────────┬──────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        PostgreSQL Database                             │
│  - Bảng chat_conversations: UNIQUE(user_id), last_read, presence       │
│  - Bảng chat_messages: Lưu tin nhắn, message_type (text/media/order),  │
│    order_id (khóa ngoại đơn hàng đính kèm)                             │
│  - Bảng chat_message_media: Metadata ảnh/video, object_key MinIO       │
└────────────────────────────────────────────────────────────────────────┘
                    ▲
                    │ WebSocket (ws://.../api/v1/chat/ws)
                    │ & REST HTTP (/api/v1/admin/chat/...)
                    │
┌───────────────────┴────────────────────────────────────────────────────┐
│                         Frontend Quản Trị                              │
│  - Trang quản lý tin nhắn tập trung (/admin/messages) theo Khách Hàng  │
│  - Khung chat hội thoại của khách hàng, nạp 20 tin gần nhất & tải thêm │
│  - Hiển thị thẻ đơn hàng trong luồng chat kèm nút chuyển nhanh chi tiết │
│  - Nút "Có X tin mới" khi đang xem tin cũ + cuộn mượt xuống đáy        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Thiết Kế Cơ Sở Dữ Liệu (PostgreSQL Schema)

### 3.1 Bảng `chat_conversations`

Lưu trữ cuộc hội thoại 1-1 duy nhất giữa mỗi khách hàng và ban quản trị:

```sql
CREATE TABLE chat_conversations (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    customer_last_read_at   timestamptz NOT NULL DEFAULT now(),
    admin_last_read_at      timestamptz NOT NULL DEFAULT now(),
    customer_last_active_at timestamptz NOT NULL DEFAULT now(),
    admin_last_active_at    timestamptz NULL,
    last_message_at         timestamptz NOT NULL DEFAULT now(),
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chat_conversations_user_id_unique UNIQUE (user_id)
);

CREATE INDEX chat_conversations_admin_last_msg_idx ON chat_conversations (last_message_at DESC);
```

### 3.2 Bảng `chat_messages`

Lưu các tin nhắn trong cuộc hội thoại, hỗ trợ tin nhắn văn bản, media hoặc đính kèm đơn hàng:

```sql
CREATE TABLE chat_messages (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    sender_id       uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    sender_role     text NOT NULL CHECK (sender_role IN ('customer', 'admin')),
    message_type    text NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'media', 'order')),
    order_id        uuid NULL REFERENCES orders(id) ON DELETE SET NULL,
    content         text NOT NULL DEFAULT '',
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX chat_messages_conv_created_idx ON chat_messages (conversation_id, created_at ASC);
CREATE INDEX chat_messages_conv_created_desc_idx ON chat_messages (conversation_id, created_at DESC);
CREATE INDEX chat_messages_order_id_idx ON chat_messages (order_id) WHERE order_id IS NOT NULL;
```

### 3.3 Bảng `chat_message_media`

Lưu metadata các tệp ảnh và video đính kèm tin nhắn (giữ nguyên):

```sql
CREATE TABLE chat_message_media (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id   uuid NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
    media_type   text NOT NULL CHECK (media_type IN ('image', 'video')),
    object_key   text NOT NULL,
    content_type text NOT NULL,
    file_size    bigint NOT NULL CHECK (file_size > 0),
    file_name    text NOT NULL DEFAULT '',
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX chat_message_media_message_id_idx ON chat_message_media (message_id);
```

---

## 4. Quyết Định Kỹ Thuật Chi Tiết

### 4.1 Cơ Chế Phân Trang Cuộn Ngược (Reverse Infinite Scroll)
- **API**: `GET /api/v1/chat/conversations/:id/messages?limit=20&before=<timestamp>`
  - Khi mở hội thoại lần đầu: Client gọi API không truyền `before`. Backend lấy 20 tin nhắn mới nhất (`ORDER BY created_at DESC LIMIT 20`), sau đó đảo ngược danh sách theo thứ tự thời gian tăng dần (`created_at ASC`) để trả về cho client.
  - Phản hồi bao gồm cờ `hasMore` (boolean) chỉ định còn tin nhắn cũ hơn hay không.
  - Khi client cuộn lên trên đỉnh (`scrollTop <= 20px`):
    - Client lưu lại chiều cao container hiện tại: `const previousScrollHeight = containerRef.scrollHeight`.
    - Gọi API với `before = oldestMessage.createdAt` và `limit = 20`.
    - Khi nhận kết quả, nối tin nhắn cũ vào đầu danh sách tin nhắn hiện tại.
    - Trong chu kỳ render tiếp theo (`useLayoutEffect` hoặc `requestAnimationFrame`), điều chỉnh vị trí cuộn:
      `containerRef.scrollTop = containerRef.scrollHeight - previousScrollHeight`.
    - Điều này đảm bảo trải nghiệm cuộn liền mạch, người dùng không bị mất dấu nội dung đang đọc.

### 4.2 Cơ Chế Chỉ Báo Tin Mới (Jump to Bottom & New Message Indicator)
- **Xác định vị trí sát đáy**: Client lắng nghe sự kiện `scroll` trên container tin nhắn.
  - Một người dùng được coi là đang ở đáy khi: `containerRef.scrollHeight - containerRef.scrollTop - containerRef.clientHeight <= 100`.
- **Xử lý sự kiện tin nhắn mới (`new_message`)**:
  - Nếu người dùng đang ở đáy: Tự động cuộn xuống dưới cùng (`scrollTo({ top: scrollHeight, behavior: 'smooth' })`). Đặt `newMessagesCount = 0`.
  - Nếu người dùng đang ở vị trí cũ (cách đáy > 100px):
    - Thêm tin nhắn mới vào mảng dữ liệu.
    - Giữ nguyên vị trí cuộn hiện tại (không auto-scroll).
    - Tăng bộ đếm `newMessagesCount += 1`.
    - Hiển thị nút nổi (Floating Pill) ở góc dưới khung chat: `Có ${newMessagesCount} tin mới ↓`.
- **Tương tác với nút nổi**:
  - Người dùng bấm nút: Thực hiện `scrollToBottom({ behavior: 'smooth' })`, ẩn nút, đặt `newMessagesCount = 0`.
  - Người dùng tự tay cuộn xuống đáy: Khi vị trí scroll đạt điều kiện sát đáy, tự động ẩn nút và đặt `newMessagesCount = 0`.

### 4.3 Đính Kèm Đơn Hàng Dưới Dạng Tin Nhắn (Order Context Message)
- Khi gửi tin nhắn có `orderId` (`message_type = 'order'`):
  - Backend kiểm tra đơn hàng:
    - Nếu người gửi là `customer`: Bắt buộc kiểm tra `orders.user_id == current_user.id`.
    - Truy vấn thông tin snapshot đơn hàng từ DB (`id`, `status`, `total_vnd`, `recipient_name`, `created_at`, tóm tắt sản phẩm đầu tiên và tổng số món).
  - Backend lưu bản ghi vào `chat_messages` với `message_type = 'order'` và `order_id = ...`.
  - Khi trả về qua REST API hoặc broadcast qua WebSocket, payload của message chứa đối tượng `orderSummary`:
    ```json
    {
      "id": "m-order-1",
      "conversationId": "c1f76d49-4112-4c28-9892-0b2f56191b90",
      "senderId": "user-uuid",
      "senderRole": "customer",
      "messageType": "order",
      "content": "Mình cần hỗ trợ đơn hàng này",
      "orderId": "6a1005b8-537a-4ec6-8960-e42718e81001",
      "orderSummary": {
        "id": "6a1005b8-537a-4ec6-8960-e42718e81001",
        "status": "confirmed",
        "totalVnd": 15990000,
        "recipientName": "Nguyễn Văn A",
        "createdAt": "2026-09-02T10:00:00Z",
        "itemCount": 1,
        "firstItemName": "iPhone 15 128GB"
      },
      "media": [],
      "createdAt": "2026-09-03T08:00:00Z"
    }
    ```
  - Giao diện người dùng render component `OrderMessageCard` trực tiếp trong dòng thời gian tin nhắn.

### 4.4 Quản Trị Viên & Danh Sách Hội Thoại Theo Khách Hàng
- Trong trang `/admin/messages`, danh sách hiển thị mỗi dòng là một khách hàng (`chat_conversations JOIN users`).
- Lọc theo khách hàng, thời gian tương tác gần nhất và trạng thái chưa đọc (`unreadOnly`).
- Khi admin mở cuộc trò chuyện của một khách hàng, hệ thống nạp dòng thời gian duy nhất của khách hàng đó, trong đó hiển thị xen kẽ mọi tin nhắn văn bản, hình ảnh và các thẻ đơn hàng mà khách hàng đã từng đính kèm.

---

## 5. Danh Sách Ranh Giới Hệ Thống & Hợp Đồng (Boundaries)

### Boundary ID: BOUNDARY-CHAT-01 (Customer Chat REST API)
- **Producer / Provider**: Backend (`commerce-backend/internal/delivery/http/chat_handler.go`)
- **Consumer**: Frontend Khách hàng (`frontend/src/api/chat.ts`)
- **Mục đích**: Lấy cuộc hội thoại duy nhất của khách hàng (`GET /api/v1/chat/conversation`), phân trang lấy tin nhắn cũ (`GET /api/v1/chat/conversations/:id/messages?limit=20&before=...`), gửi tin nhắn text/media/order_card, đánh dấu đã đọc, lấy tổng số tin chưa đọc.
- **Xác thực**: JWT Bearer (`RoleCustomer`).
- **Yêu cầu ánh xạ**: REQ-CHAT-01, REQ-CHAT-02, REQ-CHAT-03, REQ-CHAT-05, REQ-CHAT-06.
- **Mức độ kiểm thử (Proof level)**: `provider-contract` + `runtime-http`.
- **Yêu cầu hợp đồng chia sẻ (Shared Contract Required)**: Có (`contracts/customer-chat-api.md`).

### Boundary ID: BOUNDARY-CHAT-02 (Admin Chat REST API)
- **Producer / Provider**: Backend (`commerce-backend/internal/delivery/http/admin_chat_handler.go`)
- **Consumer**: Frontend Quản trị (`frontend-admin/src/api/chat.ts`)
- **Mục đích**: Lấy danh sách hội thoại theo khách hàng, phân trang lịch sử tin nhắn, admin gửi phản hồi kèm media hoặc thẻ đơn hàng, đánh dấu đã đọc.
- **Xác thực**: JWT Bearer (`RoleAdmin`).
- **Yêu cầu ánh xạ**: REQ-CHAT-02, REQ-CHAT-03, REQ-CHAT-04, REQ-CHAT-06.
- **Mức độ kiểm thử (Proof level)**: `provider-contract` + `runtime-http`.
- **Yêu cầu hợp đồng chia sẻ (Shared Contract Required)**: Có (`contracts/admin-chat-api.md`).

### Boundary ID: BOUNDARY-CHAT-03 (Real-time WebSocket Contract)
- **Producer / Provider**: Backend (`commerce-backend/internal/delivery/http/ws_handler.go` & `wshub`)
- **Consumer**: Frontend Khách hàng & Frontend Quản trị (`useChatSocket` hook)
- **Mục đích**: Kết nối real-time 2 chiều gửi/nhận tin nhắn tức thời (hỗ trợ cả text và order card snapshot), thông báo sự kiện đọc tin, cập nhật presence trực tuyến.
- **Giao thức**: WebSocket (`/api/v1/chat/ws?token=<jwt>`).
- **Yêu cầu ánh xạ**: REQ-CHAT-02, REQ-CHAT-03, REQ-CHAT-04, REQ-CHAT-05, REQ-CHAT-06.
- **Mức độ kiểm thử (Proof level)**: `contract` + `runtime-http`.
- **Yêu cầu hợp đồng chia sẻ (Shared Contract Required)**: Có (`contracts/chat-realtime-websocket.md`).

### Boundary ID: BOUNDARY-CHAT-04 (Chat Media Streaming Proxy)
- **Producer / Provider**: Backend (`commerce-backend/internal/delivery/http/media_handler.go`)
- **Consumer**: Trình duyệt khách hàng và trình duyệt quản trị
- **Mục đích**: Phục vụ file ảnh và video tin nhắn có hỗ trợ Range header, ETag, MIME type.
- **Xác thực**: Public / Token-scoped qua Media ID.
- **Yêu cầu ánh xạ**: REQ-CHAT-02.
- **Mức độ kiểm thử (Proof level)**: `provider-contract` + `runtime-http`.
- **Yêu cầu hợp đồng chia sẻ (Shared Contract Required)**: Có (`contracts/chat-media-api.md`).

---

## 6. Chiến Lược Xác Minh & Ma Trận Kiểm Thử (Verification Strategy)

| Thành phần / Hành vi | Cấp độ kiểm thử | Cơ chế xác minh cụ thể |
|---|---|---|
| Ràng buộc 1 hội thoại duy nhất/user, kiểm tra quyền sở hữu đơn hàng khi đính kèm thẻ đơn hàng | `unit` | Go unit tests trong `backend/internal/domain` & `usecase/chat` |
| Bảng `chat_conversations` (UNIQUE user_id), `chat_messages` (order_id, message_type), phân trang `created_at DESC` | `integration-db` | Go sqlc / postgres test với migration up/down thực tế |
| Các API REST `/api/v1/chat/...` và `/api/v1/admin/chat/...` tuân thủ Full Status Envelope & phân trang `before` | `provider-contract` + `runtime-http` | HTTP handler tests với Gin TestContext & httptest server |
| WebSocket Handshake, gửi/nhận tin nhắn order_card, broadcast sự kiện `new_message` qua socket | `contract` + `runtime-http` | Go websocket client test kết nối tới test server |
| Cuộn lên đỉnh tải thêm 20 tin cũ, giữ vị trí scroll, hiển thị nút "Có X tin mới", cuộn mượt xuống đáy | `component` | Vitest + React Testing Library trong `frontend` và `frontend-admin` |
| Luồng toàn vẹn: Đính kèm đơn hàng từ trang đơn hàng -> Tin nhắn hiển thị trong hội thoại duy nhất -> Admin nhận và phản hồi | `browser` | Playwright test kịch bản hai trình duyệt thực tế |
