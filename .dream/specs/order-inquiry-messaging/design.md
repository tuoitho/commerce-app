# Tài liệu thiết kế: Nhắn tin hỗ trợ khách hàng và Quản trị viên kèm ngữ cảnh đơn hàng (Order Inquiry Messaging)

## Overview

Tài liệu này xác định kiến trúc kỹ thuật và đặc tả hợp đồng cho tính năng "Nhắn tin hỗ trợ khách hàng và Quản trị viên kèm ngữ cảnh đơn hàng" (Order Inquiry Messaging), hiện thực hóa toàn bộ các tiêu chí trong [requirements.md](file:///E:/v3-v3-singleagent/.dream/specs/order-inquiry-messaging/requirements.md) bao gồm:
- **Yêu cầu 1 (1.1 - 1.8):** Nút chat nổi góc dưới bên phải màn hình (floating widget) và khởi tạo/xem hội thoại phía khách hàng.
- **Yêu cầu 2 (2.1 - 2.8):** Gửi tin nhắn và đính kèm ngữ cảnh đơn hàng từ phía khách hàng.
- **Yêu cầu 3 (3.1 - 3.7):** Màn hình quản lý hội thoại, lọc trạng thái và tra cứu phía quản trị viên.
- **Yêu cầu 4 (4.1 - 4.5):** Quản trị viên phản hồi tin nhắn khách hàng.
- **Yêu cầu 5 (5.1 - 5.8):** Đồng bộ thời gian thực qua WebSocket, badge thông báo "X tin nhắn mới ↓" khi đang cuộn xem phía trên, và lưu trữ dữ liệu bền vững.
- **Yêu cầu 6 (6.1 - 6.8):** Đính kèm hình ảnh và video trong tin nhắn với MinIO Object Storage và streaming endpoint hỗ trợ HTTP Range.

---

## Architecture

Hệ thống bao gồm 3 tầng chính: Client (Frontend & Frontend-Admin), Backend Services (HTTP API & WebSocket Hub), và Persistence Layer (PostgreSQL & MinIO).

```
+------------------------------------+       +------------------------------------+
|         Frontend (Customer)        |       |       Frontend-Admin (Admin)       |
|  - Floating Chat Widget (Bottom-R) |       |  - Support Chat Management Page    |
|  - Order Attachment Card & Picker  |       |  - Conversation List & Filters     |
|  - Media Uploader & Lightbox       |       |  - Order Detail Navigation Link    |
|  - WebSocket Client (Auto-reconnect|       |  - WebSocket Client (Live Updates) |
+------------------+-----------------+       +-----------------+------------------+
                   |                                           |
                   | REST (Upload/Init) & WebSocket (Realtime) |
                   +---------------------+---------------------+
                                         |
                                         v
+---------------------------------------------------------------------------------+
|                               Backend (Go / Gin)                                |
|                                                                                 |
|  [Delivery Layer]                                                               |
|    - HTTP Handlers: /api/v1/chat/* & /api/v1/admin/chat/*                       |
|    - Media Stream Handler: GET /api/v1/chat/media/:id (HTTP 206 Partial Content)|
|    - WebSocket Handler & Hub: /api/v1/chat/ws (JWT Auth & Client Sessions)      |
|                                                                                 |
|  [Domain & UseCase Layer]                                                       |
|    - ChatUseCase (Validation, Order Ownership Check, Message Persistence)       |
|    - Presence Tracker (In-memory + DB Last Active Timestamp)                    |
|                                                                                 |
|  [Repository & Storage Layer]                                                   |
|    - Postgres ChatRepository (SQLC / PGX)                                       |
|    - MinIO ChatMediaStore (Bucket: chat-media)                                  |
+----------------------------------------+----------------------------------------+
                                         |
                       +-----------------+-----------------+
                       |                                   |
                       v                                   v
        +----------------------------+      +-----------------------------+
        |   PostgreSQL (Commerce DB) |      |     MinIO Object Storage    |
        |  - conversations           |      |  - chat-media bucket        |
        |  - chat_messages           |      |  - Image / Video objects    |
        |  - chat_attachments        |      +-----------------------------+
        |  - users (last_active_at)  |
        |  - orders / order_items    |
        +----------------------------+
```

### Quy trình trao đổi tin nhắn (Message Flow)

1. **Khởi tạo và kết nối:**
   - Khi người dùng (khách hàng hoặc admin) đăng nhập thành công, client thiết lập kết nối WebSocket tới `GET /api/v1/chat/ws?token=<jwt_access_token>`.
   - Backend xác thực token, lưu session của client vào `WSHub` theo `user_id` và phân loại `role`.
   - Cập nhật trạng thái `last_active_at` của người dùng.

2. **Gửi tin nhắn kèm ảnh/video (nếu có):**
   - Nếu có tệp ảnh/video, client gọi `POST /api/v1/chat/media` (multipart/form-data) để tải tệp lên MinIO.
   - Backend kiểm tra loại file (MIME type) và dung lượng (<=10MB cho ảnh, <=50MB cho video), lưu file vào bucket `chat-media`, tạo bản ghi đính kèm tạm trong `chat_attachments` với `message_id = NULL` và `uploader_id = user_id`.
   - API trả về metadata đính kèm: `{ "id": string, "fileUrl": "/api/v1/chat/media/" + id, "fileType": "image"|"video", "fileName": string, "fileSize": number, "mimeType": string }`.
   - Client gửi tin nhắn qua `POST /api/v1/chat/messages` (REST), kèm `content`, `attachedOrderId` (nếu có), và danh sách `attachmentIds` (mảng ID chuỗi).
   - `ChatUseCase` kiểm tra tính hợp lệ:
     - Độ dài nội dung <= 2.000 ký tự. Tin nhắn không được rỗng trừ khi có `attachedOrderId` hoặc `attachmentIds`.
     - Nếu có `attachedOrderId`, kiểm tra đơn hàng tồn tại và thuộc quyền sở hữu của khách hàng (`order.UserID == customerID`).
     - Nếu có `attachmentIds`, kiểm tra các bản ghi trong `chat_attachments` có `uploader_id == senderID` và `message_id IS NULL`.
     - Trong một giao dịch cơ sở dữ liệu (transaction): Lưu tin nhắn mới vào `chat_messages`, cập nhật `message_id = message.id` cho các attachment tương ứng, và cập nhật `last_message_at` của cuộc hội thoại.
   - `WSHub` phát sự kiện `chat:new_message` tới kênh hội thoại (khách hàng và các admin liên quan).

3. **Phân phối và phát đa phương tiện (Media Serving & Streaming):**
   - Khi client hiển thị ảnh hoặc video, client gửi request tới `GET /api/v1/chat/media/:id`.
   - Backend xác thực quyền truy cập của người dùng (người tham gia hội thoại hoặc admin), đọc tệp từ MinIO và trả về dữ liệu.
   - Đối với video, endpoint hỗ trợ tiêu đề HTTP `Range` (trả về status `206 Partial Content`) cho phép trình duyệt tua (seek) và phát mượt mà trực tiếp trong giao diện chat.
   - Đối với ảnh, endpoint trả về tiêu đề `Content-Type` chuẩn cùng `Cache-Control: public, max-age=86400`.

4. **Cập nhật trạng thái đọc và cuộn tin nhắn:**
   - Khi người nhận đang xem hội thoại:
     - Nếu người dùng đang ở đáy khung chat: giao diện cuộn xuống và client gọi `POST /api/v1/chat/read` (hoặc admin gọi `POST /api/v1/admin/chat/conversations/:id/read`). Server cập nhật `last_read_at` và phát sự kiện `chat:messages_read` qua WebSocket.
     - Nếu người dùng đang cuộn xem các tin nhắn cũ phía trên: không tự động cuộn mà hiển thị nút nổi "X tin nhắn mới ↓". Khi nhấn vào nút, giao diện cuộn mượt xuống đáy và đánh dấu đã đọc.

---

## Components And Interfaces

### 1. Backend Domain Interfaces (`internal/domain/chat.go`)

```go
package domain

import (
	"context"
	"io"
	"time"
)

type ChatSenderRole string

const (
	ChatSenderCustomer ChatSenderRole = "customer"
	ChatSenderAdmin    ChatSenderRole = "admin"
)

type ChatAttachmentType string

const (
	ChatAttachmentImage ChatAttachmentType = "image"
	ChatAttachmentVideo ChatAttachmentType = "video"
)

type ChatAttachment struct {
	ID         string             `json:"id"`
	MessageID  *string            `json:"messageId,omitempty"`
	UploaderID string             `json:"uploaderId"`
	FileType   ChatAttachmentType `json:"fileType"`
	FileURL    string             `json:"fileUrl"`
	FileName   string             `json:"fileName"`
	FileSize   int64              `json:"fileSize"`
	MimeType   string             `json:"mimeType"`
	CreatedAt  time.Time          `json:"createdAt"`
}

type AttachedOrderItemSummary struct {
	ProductName  string   `json:"productName"`
	Quantity     int64    `json:"quantity"`
	UnitPriceVND MoneyVND `json:"unitPriceVnd"`
	ImageURL     string   `json:"imageUrl"`
}

type AttachedOrderCard struct {
	ID              string                     `json:"id"`
	Status          OrderStatus                `json:"status"`
	TotalVND        MoneyVND                   `json:"totalVnd"`
	CreatedAt       time.Time                  `json:"createdAt"`
	ItemsSummary    []AttachedOrderItemSummary `json:"itemsSummary"`
	TotalItemsCount int                        `json:"totalItemsCount"`
}

type ChatMessage struct {
	ID              string             `json:"id"`
	ConversationID  string             `json:"conversationId"`
	SenderID        string             `json:"senderId"`
	SenderRole      ChatSenderRole     `json:"senderRole"`
	SenderName      string             `json:"senderName"`
	Content         string             `json:"content"`
	AttachedOrderID *string            `json:"attachedOrderId,omitempty"`
	AttachedOrder   *AttachedOrderCard `json:"attachedOrder,omitempty"`
	Attachments     []ChatAttachment   `json:"attachments"`
	CreatedAt       time.Time          `json:"createdAt"`
	IsRead          bool               `json:"isRead"`
}

type Conversation struct {
	ID                 string     `json:"id"`
	UserID             string     `json:"userId"`
	CustomerEmail      string     `json:"customerEmail"`
	CustomerName       string     `json:"customerName"`
	CustomerLastActive *time.Time `json:"customerLastActive"`
	IsOnline           bool       `json:"isOnline"`
	LastMessageAt      time.Time  `json:"lastMessageAt"`
	LastMessageSnippet string     `json:"lastMessageSnippet"`
	UnreadCount        int        `json:"unreadCount"`
	CreatedAt          time.Time  `json:"createdAt"`
	UpdatedAt          time.Time  `json:"updatedAt"`
}

type AdminConversationFilter struct {
	Status string // "all", "unread"
	Search string // email hoặc order id
	Limit  int
	Offset int
}

type CreateMessageInput struct {
	ConversationID  string
	SenderID        string
	SenderRole      ChatSenderRole
	Content         string
	AttachedOrderID *string
	AttachmentIDs   []string
}

type UploadAttachmentResult struct {
	ID        string
	ObjectKey string
	FileType  ChatAttachmentType
	FileName  string
	FileSize  int64
	MimeType  string
	FileURL   string
}

type ChatRepository interface {
	GetOrCreateConversation(ctx context.Context, userID string) (*Conversation, error)
	GetConversationByID(ctx context.Context, conversationID string) (*Conversation, error)
	ListConversationsForAdmin(ctx context.Context, filter AdminConversationFilter) ([]Conversation, int, error)
	ListMessages(ctx context.Context, conversationID string, limit, offset int, currentRole ChatSenderRole) ([]ChatMessage, error)
	CreatePendingAttachment(ctx context.Context, uploaderID string, objectKey string, fileType ChatAttachmentType, fileName string, fileSize int64, mimeType string) (*ChatAttachment, error)
	GetAttachmentByID(ctx context.Context, attachmentID string) (*ChatAttachment, error)
	CreateMessage(ctx context.Context, input CreateMessageInput) (*ChatMessage, error)
	MarkConversationRead(ctx context.Context, conversationID string, readerRole ChatSenderRole) error
	GetAttachedOrderCard(ctx context.Context, orderID string) (*AttachedOrderCard, error)
	UpdateUserLastActive(ctx context.Context, userID string, t time.Time) error
}

type ChatUseCase interface {
	GetOrCreateCustomerConversation(ctx context.Context, customerID string) (*Conversation, error)
	ListCustomerMessages(ctx context.Context, customerID string, limit, offset int) ([]ChatMessage, error)
	SendCustomerMessage(ctx context.Context, customerID string, content string, orderID *string, attachmentIDs []string) (*ChatMessage, error)
	MarkCustomerConversationRead(ctx context.Context, customerID string) error

	ListAdminConversations(ctx context.Context, filter AdminConversationFilter) ([]Conversation, int, error)
	ListAdminMessages(ctx context.Context, conversationID string, limit, offset int) ([]ChatMessage, error)
	SendAdminReply(ctx context.Context, adminID string, conversationID string, content string, attachmentIDs []string) (*ChatMessage, error)
	MarkAdminConversationRead(ctx context.Context, conversationID string) error

	UploadMedia(ctx context.Context, uploaderID string, fileName string, reader io.Reader, size int64, mimeType string) (*ChatAttachment, error)
	GetMediaStream(ctx context.Context, requesterID string, requesterRole string, attachmentID string, start, length int64) (io.ReadCloser, *ChatAttachment, error)
	ListCustomerOrdersForPicker(ctx context.Context, customerID string, limit int) ([]AttachedOrderCard, error)
}
```

### 2. Quy tắc chuẩn hóa Tên người dùng và Trạng thái Đọc

- **Xác định `CustomerName`:**
  - Do bảng `users` không có cột tên riêng, tên khách hàng được tính toán có thứ tự ưu tiên:
    1. `recipient_name` từ đơn hàng gần nhất của khách hàng (`orders.recipient_name`).
    2. Nếu khách hàng chưa có đơn hàng, lấy `recipient_name` từ địa chỉ giao hàng mặc định (`addresses.recipient_name`).
    3. Nếu không có địa chỉ, fallback sang phần ký tự đứng trước ký hiệu `@` trong `users.email`.
- **Xác định `SenderName`:**
  - Nếu `sender_role == 'admin'`: trả về giá trị `"Hỗ trợ viên"`.
  - Nếu `sender_role == 'customer'`: trả về `CustomerName`.
- **Quy tắc tính toán `ChatMessage.IsRead`:**
  - Nếu `sender_role == 'admin'`: `IsRead = (created_at <= conversation.customer_last_read_at)`.
  - Nếu `sender_role == 'customer'`: `IsRead = (created_at <= conversation.admin_last_read_at)`.
- **Quy tắc tính toán `Conversation.UnreadCount`:**
  - Phía Admin: Đếm số lượng tin nhắn trong cuộc hội thoại có `sender_role == 'customer'` và `created_at > conversation.admin_last_read_at`.
  - Phía Khách hàng: Đếm số lượng tin nhắn có `sender_role == 'admin'` và `created_at > conversation.customer_last_read_at`.

### 3. WebSocket Protocols & Event Schemas

Endpoint: `GET /api/v1/chat/ws?token=<token>`
WebSocket được sử dụng thuần túy làm kênh phân phối sự kiện đẩy (Server-to-Client push notification). Mọi tác vụ tạo và đọc dữ liệu được thực hiện qua REST API tiêu chuẩn.

```typescript
// Gửi từ Server -> Client: Tin nhắn mới
type WSEventNewMessage = {
  type: "chat:new_message";
  payload: ChatMessage;
};

// Gửi từ Server -> Client: Đã đọc tin nhắn
type WSEventMessagesRead = {
  type: "chat:messages_read";
  payload: {
    conversationId: string;
    readerRole: "customer" | "admin";
    readAt: string;
  };
};

// Gửi từ Server -> Client: Cập nhật trạng thái truy cập/online
type WSEventPresenceUpdate = {
  type: "chat:presence";
  payload: {
    userId: string;
    role: "customer" | "admin";
    isOnline: boolean;
    lastActiveAt: string;
  };
};

// Gửi từ Client -> Server: Heartbeat Ping
type WSEventPing = {
  type: "ping";
};
```

### 4. REST API Contract Endpoints

Tuân thủ chuẩn Envelope của hệ thống (`success`, `message`, `data`, `error`, `meta`):

- **Khách hàng (Customer Endpoints):**
  - `GET /api/v1/chat/conversation`: Lấy thông tin hội thoại hiện tại của khách hàng kèm unread count và trạng thái online của shop.
  - `GET /api/v1/chat/messages?limit=50&offset=0`: Danh sách tin nhắn trong cuộc hội thoại (sắp xếp thời gian tăng dần).
  - `POST /api/v1/chat/messages`:
    - Payload: `{ "content": string, "attachedOrderId"?: string, "attachmentIds"?: string[] }`
    - Returns: `ChatMessage`
  - `POST /api/v1/chat/media`: Upload ảnh/video (`multipart/form-data`, field `file`). Trả về `{ "id": string, "fileUrl": string, "fileType": "image"|"video", "fileName": string, "fileSize": number, "mimeType": string }`.
  - `GET /api/v1/chat/media/:id`: Tải/stream file đa phương tiện từ MinIO (hỗ trợ HTTP Range 206 cho video và Cache-Control cho ảnh).
  - `POST /api/v1/chat/read`: Đánh dấu đã đọc các tin nhắn gửi từ admin.
  - `GET /api/v1/chat/orders`: Lấy danh sách 10 đơn hàng gần nhất của khách hàng để hiển thị trong bộ chọn đơn hàng đính kèm.

- **Quản trị viên (Admin Endpoints):**
  - `GET /api/v1/admin/chat/conversations?status=all|unread&search=&page=1&limit=20`: Danh sách các cuộc hội thoại khách hàng, có phân trang.
  - `GET /api/v1/admin/chat/conversations/:id/messages?limit=50&offset=0`: Chi tiết lịch sử tin nhắn của cuộc hội thoại `:id`.
  - `POST /api/v1/admin/chat/conversations/:id/messages`:
    - Payload: `{ "content": string, "attachmentIds"?: string[] }`
    - Returns: `ChatMessage`
  - `POST /api/v1/admin/chat/conversations/:id/read`: Đánh dấu đã đọc tin nhắn từ khách hàng trong hội thoại `:id`.

---

## Data Models & Migrations

Tạo migration mới: `backend/db/migrations/000016_create_chat_messaging.up.sql` và `down.sql`:

```sql
-- Cập nhật cột last_active_at cho users
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at timestamptz NULL;

-- Bảng cuộc hội thoại (1 conversation cho mỗi khách hàng)
CREATE TABLE conversations (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    last_message_at        timestamptz NOT NULL DEFAULT now(),
    customer_last_read_at  timestamptz NOT NULL DEFAULT now(),
    admin_last_read_at     timestamptz NOT NULL DEFAULT now(),
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversations_last_message_at ON conversations (last_message_at DESC);
CREATE INDEX idx_conversations_user_id ON conversations (user_id);

-- Bảng tin nhắn
CREATE TABLE chat_messages (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id    uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id          uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    sender_role        text NOT NULL CHECK (sender_role IN ('customer', 'admin')),
    content            text NOT NULL DEFAULT '' CHECK (char_length(content) <= 2000),
    attached_order_id  uuid NULL REFERENCES orders(id) ON DELETE SET NULL,
    created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_messages_conv_created ON chat_messages (conversation_id, created_at ASC);
CREATE INDEX idx_chat_messages_attached_order ON chat_messages (attached_order_id) WHERE attached_order_id IS NOT NULL;

-- Bảng tệp đính kèm hình ảnh / video
CREATE TABLE chat_attachments (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id  uuid NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
    uploader_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    object_key  text NOT NULL UNIQUE,
    file_type   text NOT NULL CHECK (file_type IN ('image', 'video')),
    file_name   text NOT NULL,
    file_size   bigint NOT NULL CHECK (file_size > 0),
    mime_type   text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_attachments_message_id ON chat_attachments (message_id);
CREATE INDEX idx_chat_attachments_uploader ON chat_attachments (uploader_id);
```

---

## Error Handling

Tất cả các lỗi trả về qua HTTP đều tuân thủ định dạng Full Status Envelope:
- **Lỗi xác thực dữ liệu (Validation Errors - HTTP 400):**
  - Mã lỗi `error.code = "validation_error"`.
  - `fields["content"]`: "Nội dung tin nhắn không được vượt quá 2000 ký tự" hoặc "Vui lòng nhập nội dung tin nhắn hoặc đính kèm đơn hàng/tệp".
  - `fields["attachedOrderId"]`: "Đơn hàng không hợp lệ hoặc không thuộc tài khoản của bạn".
  - `fields["attachmentIds"]`: "Tệp đính kèm không hợp lệ hoặc chưa được tải lên hoàn tất".
  - `fields["file"]`: "Dung lượng tệp vượt quá giới hạn cho phép (tối đa 10MB cho ảnh, 50MB cho video)".
  - `fields["file_type"]`: "Định dạng tệp không được hỗ trợ (chỉ chấp nhận JPEG, PNG, WebP, GIF, MP4, WebM)".
- **Lỗi phân quyền & xác thực (HTTP 401 & 403):**
  - HTTP 401: `unauthorized` - "Vui lòng đăng nhập để tiếp tục trò chuyện".
  - HTTP 403: `forbidden` - "Bạn không có quyền truy cập vào tài nguyên này".
- **Lỗi tài nguyên không tìm thấy (HTTP 404):**
  - `not_found` - "Không tìm thấy cuộc hội thoại, tệp đính kèm hoặc đơn hàng yêu cầu".
- **Lỗi WebSocket:**
  - Kết nối chưa xác thực hoặc token hết hạn: đóng WebSocket với Close Code `4001` (Unauthorized).
  - Client tự động xử lý kết nối lại với thuật toán Exponential Backoff (1s, 2s, 4s, tối đa 30s).
  - Tin nhắn gửi không thành công hiển thị trạng thái "Gửi thất bại" kèm nút "Thử lại".

---

## Testing Strategy

### 1. Backend Verification
- **Unit Tests (`internal/usecase/chat`):**
  - Kiểm tra logic khởi tạo hội thoại cho khách hàng.
  - Kiểm tra xác thực quyền sở hữu đơn hàng khi đính kèm `attachedOrderId` (chặn khi order ID thuộc user khác).
  - Kiểm tra xác thực `attachmentIds` (chặn khi attachment thuộc user khác hoặc đã được gán vào tin nhắn khác).
  - Kiểm tra ràng buộc độ dài tin nhắn (<= 2.000 ký tự) và điều kiện tin nhắn rỗng nhưng có attachment / order.
  - Kiểm tra định dạng và kích thước tệp upload (ảnh <= 10MB, video <= 50MB).
- **Delivery HTTP & WS Tests (`internal/delivery/http` & `internal/delivery/ws`):**
  - Test các endpoint REST: gửi tin nhắn khách hàng, admin trả lời, upload media, đánh dấu đã đọc.
  - Test endpoint `GET /api/v1/chat/media/:id`: trả về đúng Content-Type cho ảnh và hỗ trợ byte range 206 cho video streaming.
  - Test nâng cấp kết nối WebSocket (`/api/v1/chat/ws`) với token hợp lệ và không hợp lệ.
  - Test phát sự kiện tin nhắn mới qua WebSocket Hub.

### 2. Frontend Customer Verification (`frontend/`)
- **Unit & Component Tests (Vitest & React Testing Library):**
  - Kiểm tra nút floating chat widget hiển thị ở góc dưới bên phải màn hình.
  - Kiểm tra mở/đóng popup chat khi nhấn nút.
  - Kiểm tra badge số lượng tin nhắn chưa đọc cập nhật chính xác.
  - Kiểm tra hành vi cuộn: khi nhận tin nhắn mới và màn hình đang cuộn ở phía trên -> hiển thị badge "X tin nhắn mới ↓"; khi nhấn vào badge -> cuộn xuống đáy.
  - Kiểm tra đính kèm đơn hàng: hiển thị OrderCard với mã đơn, trạng thái, tổng tiền, ảnh sản phẩm; nút "Hỏi đáp về đơn hàng" từ trang chi tiết đơn mở sẵn ngữ cảnh.
  - Kiểm tra xem trước ảnh/video, tải tệp, hiển thị qua `fileUrl` endpoint nội bộ và lightbox phóng to ảnh.

### 3. Frontend Admin Verification (`frontend-admin/`)
- **Component Tests:**
  - Màn hình quản trị tin nhắn hỗ trợ tại route `/chat`: tích hợp vào menu sidebar trong `AdminLayout.tsx`.
  - Danh sách hội thoại, tìm kiếm theo email/mã đơn, lọc hội thoại chưa đọc.
  - Xem chi tiết hội thoại: hiển thị thẻ tóm tắt đơn hàng có link chuyển sang trang chi tiết đơn quản trị `/orders/:id`.
  - Soạn và gửi phản hồi từ admin theo thời gian thực kèm đính kèm đa phương tiện.

---

## Requirement Traceability

| Yêu cầu ID | Mô tả tiêu chí | Thành phần thiết kế (Design Elements) | Phương án kiểm thử (Verification) |
|---|---|---|---|
| **1.1 - 1.2** | Floating chat widget góc dưới bên phải, hiển thị lịch sử hoặc empty state | `ChatWidget.tsx`, `ChatWindow.tsx`, `GET /api/v1/chat/messages` | Test render component widget, test empty state message |
| **1.3** | Tải và hiển thị lịch sử hội thoại của khách hàng theo thời gian | `ChatRepository.ListMessages`, sắp xếp thời gian tăng dần | Test lấy danh sách tin nhắn theo thứ tự `created_at ASC` |
| **1.4** | Hiển thị tên đội ngũ hỗ trợ và trạng thái online / last active | Header trong `ChatWindow.tsx`, `WSEventPresenceUpdate` | Test hiển thị "Đang trực tuyến" và "Hoạt động X phút trước" |
| **1.5, 1.8** | Bảo lưu toàn vẹn lịch sử tin nhắn trước đó | Bảng `chat_messages`, phân trang `GET /api/v1/chat/messages` | Test reload trang và xem lại lịch sử tin nhắn đã lưu |
| **1.6** | Người dùng chưa đăng nhập yêu cầu đăng nhập | Auth guard trong `ChatWidget.tsx`, trigger modal/redirect đăng nhập | Test click widget khi `user == null` |
| **1.7** | Đánh dấu đã đọc tin nhắn từ admin, xóa badge | `POST /api/v1/chat/read`, sự kiện `chat:messages_read` | Test gọi API read khi mở chat, kiểm tra unread count về 0 |
| **2.1** | Nút "Hỏi đáp về đơn hàng" từ trang đơn hàng tự động gán ngữ cảnh | Nút bấm trên `OrderDetailPage.tsx`, mở chat và set `attachedOrderId` | Test click nút mở chat và thấy preview đơn hàng tương ứng |
| **2.2 - 2.3** | Bộ chọn đơn hàng trong chat và preview trước khi gửi | `OrderPickerModal.tsx`, `OrderAttachmentPreview.tsx`, `GET /api/v1/chat/orders` | Test chọn đơn hàng từ danh sách và nút gỡ bỏ đính kèm |
| **2.4** | Thẻ đơn hàng trực quan trong luồng chat (mã, ngày, trạng thái, tiền, items) | `OrderCardMessage.tsx`, liên kết tới `/orders/:id` | Test hiển thị chi tiết thẻ đơn hàng và link chuyển hướng |
| **2.5 - 2.7** | Gửi văn bản thường, chặn tin nhắn rỗng và giới hạn 2.000 ký tự | `ChatUseCase.SendCustomerMessage`, `check (char_length <= 2000)` | Test gửi tin nhắn 2001 ký tự, test gửi rỗng không đính kèm |
| **2.8** | Chặn đính kèm đơn hàng không thuộc sở hữu của khách hàng | Kiểm tra `order.UserID == customerID` trong `ChatUseCase` | Test gửi orderId của user khác -> trả về lỗi 400 |
| **3.1 - 3.2** | Admin xem danh sách hội thoại, snippet tin nhắn cuối, unread badge | `AdminChatPage.tsx`, `GET /api/v1/admin/chat/conversations` | Test render danh sách hội thoại admin sắp xếp theo last_message_at |
| **3.3 - 3.4** | Admin xem chi tiết hội thoại, xem thẻ đơn hàng có link tới `/orders/:id` | `AdminChatDetail.tsx`, `OrderCardMessage.tsx` liên kết admin | Test click hội thoại, hiển thị thẻ đơn và điều hướng admin |
| **3.5 - 3.6** | Lọc theo "Chưa đọc", tìm kiếm theo email / mã đơn | `AdminConversationFilter`, query SQL LIKE / ILIKE | Test lọc unread và tìm kiếm theo từ khóa email/mã đơn |
| **3.7** | Chặn người dùng không có role admin truy cập trang/API admin chat | Middleware `RequireRole(domain.RoleAdmin)` | Test gọi API admin chat với token customer -> trả về 403 Forbidden |
| **4.1 - 4.3** | Admin gửi phản hồi, validation rỗng / giới hạn 2.000 ký tự | `ChatUseCase.SendAdminReply`, `POST /api/v1/admin/chat/...` | Test admin gửi phản hồi thành công và test validation |
| **4.4 - 4.5** | Đa admin hỗ trợ, gắn nhãn định danh "Quản trị viên" phía khách hàng | `sender_role = 'admin'`, nhãn "Hỗ trợ viên" trên giao diện | Test hiển thị nhãn Admin bên cạnh bubble chat |
| **5.1 - 5.2** | Kết nối WebSocket xác thực token, phát tin nhắn mới realtime < 1s | `internal/delivery/ws/hub.go`, `WSEventNewMessage` | Test gửi tin nhắn qua REST/WS, kiểm tra nhận event trên WS client |
| **5.3 - 5.4** | Khi cuộn phía trên: không tự cuộn mà hiện badge "X tin nhắn mới ↓", click mới cuộn | `NewMessagesScrollBadge.tsx` trong `ChatWindow.tsx` & `AdminChatDetail.tsx` | Test nhận tin khi `isAtBottom == false` -> hiện badge, click -> cuộn đáy |
| **5.5** | Unread badge trên floating button khi đóng chat | `UnreadBadge.tsx` trên nút widget góc phải | Test nhận tin nhắn khi đóng chat -> hiển thị badge số lượng |
| **5.6** | Cập nhật mốc thời gian hoạt động gần nhất (last active) | Cột `users.last_active_at`, hàm `UpdateUserLastActive` | Test kết nối/gửi tin làm cập nhật `last_active_at` |
| **5.7 - 5.8** | Tự động kết nối lại (auto-reconnect) và hiển thị nút gửi lại khi lỗi | Hook `useChatSocket` với exponential backoff, retry button | Test ngắt kết nối giả lập, kiểm tra client tự reconnect |
| **6.1 - 6.3** | Đính kèm ảnh (<=10MB) và video (<=50MB), lưu MinIO, phát tin nhắn | `POST /api/v1/chat/media`, `MinioStore.PutObject` | Test upload ảnh/video, kiểm tra lưu trữ MinIO và link file |
| **6.4 - 6.5** | Hiển thị thumbnail ảnh (kèm lightbox phóng to), trình phát video inline qua endpoint HTTP Range | `GET /api/v1/chat/media/:id`, `ImageLightbox.tsx`, video player | Test render thumbnail, click phóng to ảnh, play video với Range request |
| **6.6 - 6.7** | Chặn tệp quá dung lượng hoặc sai định dạng MIME | Validation trong `UploadMedia` handler & use case | Test upload file 15MB ảnh -> báo lỗi; file .exe -> từ chối |
| **6.8** | Kết hợp văn bản, tệp media và đơn hàng trong một khối tin nhắn | Cấu trúc `ChatMessage` hiển thị đồng bộ trong 1 bubble/card | Test tin nhắn có cả text + ảnh + đơn hàng |

---

## Existing System Integration

1. **Người dùng & Xác thực (Auth & Users):**
   - Tái sử dụng middleware xác thực JWT `internal/delivery/http/middleware/auth.go`.
   - Bảng `conversations` và `chat_messages` tham chiếu trực tiếp đến `users(id)`.
   - Bổ sung trường `last_active_at timestamptz` trên bảng `users`.
   - `CustomerName` được suy ra theo thứ tự ưu tiên từ `orders.recipient_name` -> `addresses.recipient_name` -> `users.email`.

2. **Đơn hàng (Orders Context):**
   - Tái sử dụng bảng `orders` và `order_items`.
   - Khi tạo tin nhắn có `attachedOrderId`, use case xác thực quyền sở hữu đơn hàng: `order.UserID == customerID`.
   - Phía frontend, trang chi tiết đơn hàng (`frontend/src/pages/OrderDetailPage.tsx`) tích hợp nút "Hỏi đáp về đơn hàng", kích hoạt mở widget chat và tự động gán order context.
   - Phía admin, thẻ đơn hàng trong khung chat liên kết điều hướng trực tiếp đến `/orders/:id` trên `frontend-admin`.

3. **Lưu trữ & Phân phối tệp đa phương tiện (MinIO Storage & Media Streaming):**
   - Tái sử dụng cấu hình MinIO từ `backend/internal/config` (`MinioEndpoint`, `MinioAccessKey`, `MinioSecretKey`, `MinioUseSSL`).
   - Sử dụng bucket riêng `chat-media` đảm bảo lưu trữ an toàn.
   - Cung cấp endpoint nội bộ `GET /api/v1/chat/media/:id` proxy trực tiếp từ MinIO, hỗ trợ HTTP Range (206 Partial Content) để trình duyệt stream video mượt mà và cache ảnh tĩnh.

4. **Wire & Router Injection:**
   - Đăng ký `ChatRepository`, `ChatUseCase`, `ChatHandler`, `WSHub` vào dependency injection `backend/cmd/server/wire.go`.
   - Đăng ký các route `/api/v1/chat/*` và `/api/v1/admin/chat/*` vào `internal/delivery/http/router.go`.
   - Tích hợp `ChatWidget` vào layout chung của `frontend/src/App.tsx`.
   - Tích hợp mục "Tin nhắn hỗ trợ" vào sidebar điều hướng trong `frontend-admin/src/components/layout/AdminLayout.tsx` với đường dẫn `/chat`.
