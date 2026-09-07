# chat-realtime-websocket

Revision: 2
Status: FROZEN

Requirements:
- REQ-CHAT-01
- REQ-CHAT-02
- REQ-CHAT-03
- REQ-CHAT-04
- REQ-CHAT-05
- REQ-CHAT-06

Provider:
- backend

Consumers:
- frontend
- frontend-admin

Compatibility:
- breaking (Message payload extended with messageType, orderId, and orderSummary; see CCR-01)

## 1. Kết Nối & Xác Thực (WebSocket Handshake)

- **URL Endpoint**: `GET /api/v1/chat/ws?token=<access_token>`
- **Giao thức**: WebSocket (`ws://` hoặc `wss://`)
- **Headers**:
  - `Upgrade: websocket`
  - `Connection: Upgrade`
- **Xác thực**:
  - Tham số `token`: JWT Access Token hợp lệ của người dùng (`role = customer` hoặc `role = admin`).
  - Nếu token không hợp lệ hoặc hết hạn: Máy chủ từ chối kết nối HTTP 401 Unauthorized trước khi nâng cấp (Handshake).
  - Khi nâng cấp thành công: Kết nối chuyển sang song công toàn phần (Full-Duplex).

---

## 2. Các Khung Thông Điệp Phía Client Gửi Lên Server (Client -> Server Actions)

Dữ liệu trao đổi dưới dạng JSON chuỗi (Text Message Frame):

### 2.1 Tham gia kênh hội thoại (`join_conversation`)
Client thông báo cho Hub biết mình đang mở màn hình của cuộc hội thoại cụ thể:
```json
{
  "action": "join_conversation",
  "conversationId": "c1f76d49-4112-4c28-9892-0b2f56191b90"
}
```

### 2.2 Gửi tin nhắn real-time (`send_message`)
Gửi tin nhắn văn bản hoặc đính kèm thẻ đơn hàng qua WebSocket. Máy chủ kiểm tra quyền, lưu vào cơ sở dữ liệu PostgreSQL, và broadcast tới các bên liên quan:
```json
{
  "action": "send_message",
  "conversationId": "c1f76d49-4112-4c28-9892-0b2f56191b90",
  "content": "Dạ shop kiểm tra giúp em đơn này với ạ",
  "orderId": "6a1005b8-537a-4ec6-8960-e42718e81001"
}
```
*(Nếu không đính kèm đơn hàng, `orderId` có thể bỏ qua hoặc để `null`).*

### 2.3 Đánh dấu đã đọc (`mark_read`)
Khi client đang mở cuộc hội thoại và nhận tin nhắn, gửi tín hiệu đánh dấu đã đọc:
```json
{
  "action": "mark_read",
  "conversationId": "c1f76d49-4112-4c28-9892-0b2f56191b90"
}
```

### 2.4 Tín hiệu giữ kết nối (`ping`)
Định kỳ mỗi 25-30 giây:
```json
{
  "action": "ping"
}
```

---

## 3. Các Sự Kiện Máy Chủ Phát Xuống Client (Server -> Client Events)

### 3.1 Sự kiện tin nhắn mới (`new_message`)
Phát tới các bên tham gia cuộc hội thoại ngay khi có tin nhắn mới (được gửi từ WebSocket hoặc REST):
```json
{
  "event": "new_message",
  "data": {
    "id": "m100",
    "conversationId": "c1f76d49-4112-4c28-9892-0b2f56191b90",
    "senderId": "d7b9a528-7690-4131-b21a-289eb170d37e",
    "senderRole": "customer",
    "messageType": "order",
    "content": "Dạ shop kiểm tra giúp em đơn này với ạ",
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
    "createdAt": "2026-09-03T08:15:00Z"
  }
}
```

*(Đối với tin nhắn văn bản thuần, `messageType` là `"text"`, `orderId` và `orderSummary` là `null`).*

### 3.2 Sự kiện xác nhận đã đọc (`read_receipt`)
Thông báo cho bên gửi biết đối phương đã xem tin nhắn:
```json
{
  "event": "read_receipt",
  "data": {
    "conversationId": "c1f76d49-4112-4c28-9892-0b2f56191b90",
    "readerRole": "admin",
    "readAt": "2026-09-03T08:15:10Z"
  }
}
```

### 3.3 Sự kiện cập nhật trạng thái hoạt động (`presence_update`)
Cập nhật trạng thái trực tuyến / hoạt động của người dùng trong cuộc trò chuyện:
```json
{
  "event": "presence_update",
  "data": {
    "userId": "d7b9a528-7690-4131-b21a-289eb170d37e",
    "role": "customer",
    "status": "online",
    "lastActiveAt": "2026-09-03T08:15:00Z",
    "displayText": "Đang hoạt động"
  }
}
```

### 3.4 Phản hồi pong (`pong`)
Máy chủ trả về khi nhận được `ping`:
```json
{
  "event": "pong"
}
```

### 3.5 Báo lỗi (`error`)
Nếu client gửi dữ liệu sai quy cách hoặc không có quyền:
```json
{
  "event": "error",
  "code": "forbidden",
  "message": "Bạn không có quyền gửi tin nhắn vào cuộc hội thoại này"
}
```
