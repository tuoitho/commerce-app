# admin-chat-api

Revision: 2
Status: FROZEN

Requirements:
- REQ-CHAT-02
- REQ-CHAT-03
- REQ-CHAT-04
- REQ-CHAT-06

Provider:
- backend

Consumers:
- frontend-admin

Compatibility:
- breaking (Refactored to 1-to-1 conversation per customer, order-as-a-message, and reverse infinite scroll pagination; see CCR-01)

## 1. GET /api/v1/admin/chat/conversations

Lấy danh sách các cuộc hội thoại giữa từng khách hàng và shop dành cho quản trị viên, sắp xếp theo thời điểm có tin nhắn mới nhất giảm dần.

### Caller Context & Auth
- Bắt buộc xác thực tài khoản Quản trị viên (`role = admin`).

### Query Parameters
- `page`: Số trang (mặc định 1).
- `pageSize`: Kích thước trang (mặc định 20, tối đa 50).
- `unreadOnly`: `true` để chỉ lấy các cuộc hội thoại có tin nhắn chưa đọc từ khách hàng (tùy chọn).

### Success — HTTP 200 OK
```json
{
  "success": true,
  "message": "Lấy danh sách hội thoại quản trị thành công",
  "data": [
    {
      "id": "c1f76d49-4112-4c28-9892-0b2f56191b90",
      "userId": "d7b9a528-7690-4131-b21a-289eb170d37e",
      "customerName": "Nguyễn Văn A",
      "customerEmail": "nguyenvana@gmail.com",
      "lastMessage": {
        "id": "m2",
        "senderRole": "customer",
        "messageType": "order",
        "content": "Đơn hàng này bao giờ được giao vậy shop?",
        "hasMedia": false,
        "createdAt": "2026-09-03T08:03:00Z"
      },
      "adminUnreadCount": 1,
      "lastMessageAt": "2026-09-03T08:03:00Z",
      "customerPresence": {
        "status": "online",
        "lastActiveAt": "2026-09-03T08:03:30Z",
        "displayText": "Đang hoạt động"
      }
    }
  ],
  "error": null,
  "meta": {
    "timestamp": "2026-09-03T08:10:00Z",
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "totalItems": 1,
      "totalPages": 1
    }
  }
}
```

---

## 2. GET /api/v1/admin/chat/conversations/:id/messages

Lấy danh sách tin nhắn trong cuộc hội thoại của một khách hàng theo cơ chế phân trang cuộn ngược.

### Caller Context & Auth
- Bắt buộc quyền `admin`.

### Query Parameters
- `limit`: Số tin nhắn (mặc định 20, tối đa 50).
- `before`: Mốc thời gian ISO 8601 để lấy các tin cũ hơn.

### Success — HTTP 200 OK
```json
{
  "success": true,
  "message": "Lấy danh sách tin nhắn thành công",
  "data": [
    {
      "id": "m1",
      "conversationId": "c1f76d49-4112-4c28-9892-0b2f56191b90",
      "senderId": "d7b9a528-7690-4131-b21a-289eb170d37e",
      "senderRole": "customer",
      "messageType": "text",
      "content": "Chào shop, mình cần hỗ trợ về đơn hàng vừa đặt",
      "orderId": null,
      "orderSummary": null,
      "media": [],
      "createdAt": "2026-09-03T08:02:00Z"
    },
    {
      "id": "m2",
      "conversationId": "c1f76d49-4112-4c28-9892-0b2f56191b90",
      "senderId": "d7b9a528-7690-4131-b21a-289eb170d37e",
      "senderRole": "customer",
      "messageType": "order",
      "content": "Đơn hàng này bao giờ được giao vậy shop?",
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
      "createdAt": "2026-09-03T08:03:00Z"
    }
  ],
  "error": null,
  "meta": {
    "timestamp": "2026-09-03T08:11:00Z",
    "hasMore": false,
    "count": 2
  }
}
```

---

## 3. POST /api/v1/admin/chat/conversations/:id/messages

Quản trị viên gửi tin nhắn phản hồi tới khách hàng trong cuộc hội thoại (hỗ trợ văn bản, tệp đa phương tiện hoặc đính kèm đơn hàng).

### Caller Context & Auth
- Bắt buộc quyền `admin`.

### Content-Type
- JSON: `application/json` (cho văn bản thuần hoặc đính kèm orderId)
- Multipart: `multipart/form-data` (khi có gửi kèm file ảnh/video)

### Success — HTTP 201 Created
```json
{
  "success": true,
  "message": "Gửi tin nhắn phản hồi thành công",
  "data": {
    "id": "m3",
    "conversationId": "c1f76d49-4112-4c28-9892-0b2f56191b90",
    "senderId": "a9999999-9999-9999-9999-999999999999",
    "senderRole": "admin",
    "messageType": "text",
    "content": "Dạ shop đã tiếp nhận yêu cầu, đơn hàng đang được đóng gói ạ",
    "orderId": null,
    "orderSummary": null,
    "media": [],
    "createdAt": "2026-09-03T08:12:00Z"
  },
  "error": null,
  "meta": {
    "timestamp": "2026-09-03T08:12:00Z"
  }
}
```

---

## 4. POST /api/v1/admin/chat/conversations/:id/read

Đánh dấu các tin nhắn trong cuộc hội thoại là đã đọc bởi quản trị viên (`admin_last_read_at = now()`).

### Success — HTTP 200 OK
```json
{
  "success": true,
  "message": "Đã đánh dấu đã đọc bởi quản trị viên",
  "data": {
    "conversationId": "c1f76d49-4112-4c28-9892-0b2f56191b90",
    "adminUnreadCount": 0
  },
  "error": null,
  "meta": {
    "timestamp": "2026-09-03T08:12:30Z"
  }
}
```
