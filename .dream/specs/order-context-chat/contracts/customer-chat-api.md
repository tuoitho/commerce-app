# customer-chat-api

Revision: 2
Status: FROZEN

Requirements:
- REQ-CHAT-01
- REQ-CHAT-02
- REQ-CHAT-03
- REQ-CHAT-05
- REQ-CHAT-06

Provider:
- backend

Consumers:
- frontend

Compatibility:
- breaking (Refactored to 1-to-1 conversation per customer, order-as-a-message, and reverse infinite scroll pagination; see CCR-01)

## 1. GET /api/v1/chat/conversation

Lấy thông tin cuộc hội thoại 1-1 duy nhất giữa khách hàng đang đăng nhập và shop. Nếu khách hàng chưa có cuộc hội thoại nào, hệ thống tự động khởi tạo mới.

### Caller Context & Auth
- Bắt buộc xác thực tài khoản Khách hàng (Bearer Token có `role = customer`).

### Success — HTTP 200 OK
```json
{
  "success": true,
  "message": "Lấy thông tin cuộc hội thoại thành công",
  "data": {
    "id": "c1f76d49-4112-4c28-9892-0b2f56191b90",
    "userId": "d7b9a528-7690-4131-b21a-289eb170d37e",
    "customerLastReadAt": "2026-09-03T08:00:00Z",
    "adminLastReadAt": "2026-09-03T08:00:00Z",
    "customerUnreadCount": 0,
    "lastMessageAt": "2026-09-03T08:00:00Z",
    "createdAt": "2026-09-03T08:00:00Z",
    "adminPresence": {
      "status": "online",
      "lastActiveAt": "2026-09-03T08:01:00Z",
      "displayText": "Đang hoạt động"
    }
  },
  "error": null,
  "meta": {
    "timestamp": "2026-09-03T08:01:30Z"
  }
}
```

### Failures
- **HTTP 401 Unauthorized**: Chưa đăng nhập hoặc token hết hạn (`unauthorized`).

---

## 2. GET /api/v1/chat/conversations/:id/messages

Lấy lịch sử tin nhắn trong cuộc hội thoại theo cơ chế phân trang cuộn ngược.
- Mặc định khi mở hội thoại (không truyền `before`), hệ thống nạp **X tin nhắn gần nhất** (mặc định 20 tin).
- Khi người dùng cuộn lên trên đỉnh, client truyền tham số `before` mang mốc thời gian của tin nhắn cũ nhất hiện có trên client để nạp tiếp các tin cũ hơn.
- Tin nhắn trả về luôn được sắp xếp theo thứ tự thời gian tăng dần (`created_at ASC`) để hiển thị xuôi dòng thời gian.

### Caller Context & Auth
- Bắt buộc xác thực khách hàng sở hữu cuộc hội thoại đó.

### Query Parameters
- `limit`: Số lượng tin nhắn cần lấy (mặc định 20, tối đa 50).
- `before`: Mốc thời gian ISO 8601 (ví dụ `2026-09-03T08:00:00Z`) để lấy các tin nhắn tạo trước thời điểm này.

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
    },
    {
      "id": "m3",
      "conversationId": "c1f76d49-4112-4c28-9892-0b2f56191b90",
      "senderId": "a9999999-9999-9999-9999-999999999999",
      "senderRole": "admin",
      "messageType": "text",
      "content": "Dạ shop đã xác nhận và chuẩn bị giao cho đơn vị vận chuyển ạ",
      "orderId": null,
      "orderSummary": null,
      "media": [],
      "createdAt": "2026-09-03T08:05:00Z"
    }
  ],
  "error": null,
  "meta": {
    "timestamp": "2026-09-03T08:06:00Z",
    "hasMore": true,
    "count": 3
  }
}
```

### Failures
- **HTTP 401 Unauthorized**: Chưa đăng nhập.
- **HTTP 403 Forbidden**: Cuộc hội thoại không thuộc sở hữu của khách hàng.
- **HTTP 404 Not Found**: Hội thoại không tồn tại.

---

## 3. POST /api/v1/chat/conversations/:id/messages

Gửi tin nhắn văn bản, tệp tin đa phương tiện (ảnh, video) hoặc đính kèm đơn hàng vào dòng thời gian cuộc trò chuyện.

### Headers & Content-Type
- **Gửi văn bản hoặc thẻ đơn hàng**: `Content-Type: application/json`
  - Body mẫu:
    ```json
    {
      "content": "Shop hỗ trợ đơn hàng này giúp mình nhé",
      "orderId": "6a1005b8-537a-4ec6-8960-e42718e81001"
    }
    ```
    *(Nếu không đính kèm đơn hàng, `orderId` để `null` hoặc bỏ trống).*
- **Gửi có đính kèm media**: `Content-Type: multipart/form-data`
  - Field `content`: Chuỗi văn bản (tùy chọn, tối đa 2000 ký tự).
  - Field `orderId`: UUID đơn hàng (tùy chọn).
  - Field `files`: Danh sách tệp đính kèm (tối đa 5 files, ảnh <= 10MB, video <= 50MB).

### Caller Context & Auth
- Khách hàng sở hữu cuộc hội thoại.
- Nếu có truyền `orderId`: Hệ thống bắt buộc xác thực quyền sở hữu `order.user_id == current_user.id`.

### Success — HTTP 201 Created
```json
{
  "success": true,
  "message": "Gửi tin nhắn thành công",
  "data": {
    "id": "m4",
    "conversationId": "c1f76d49-4112-4c28-9892-0b2f56191b90",
    "senderId": "d7b9a528-7690-4131-b21a-289eb170d37e",
    "senderRole": "customer",
    "messageType": "order",
    "content": "Shop hỗ trợ đơn hàng này giúp mình nhé",
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
    "createdAt": "2026-09-03T08:07:00Z"
  },
  "error": null,
  "meta": {
    "timestamp": "2026-09-03T08:07:00Z"
  }
}
```

### Failures
- **HTTP 400 Bad Request**: Tin nhắn rỗng không có text, file hay orderId (`validation_error`), tệp sai định dạng magic bytes (`invalid_media_type`), hoặc tệp quá dung lượng (`file_too_large`).
- **HTTP 403 Forbidden**: Cuộc hội thoại không thuộc khách hàng, hoặc đơn hàng không thuộc sở hữu khách hàng (`forbidden`, message: `"Đơn hàng không tồn tại hoặc bạn không có quyền truy cập"`).
- **HTTP 404 Not Found**: Đơn hàng không tồn tại (`order_not_found`).

---

## 4. POST /api/v1/chat/conversations/:id/read

Đánh dấu các tin nhắn trong cuộc hội thoại là đã đọc bởi khách hàng (`customer_last_read_at = now()`).

### Success — HTTP 200 OK
```json
{
  "success": true,
  "message": "Đã đánh dấu đã đọc",
  "data": {
    "conversationId": "c1f76d49-4112-4c28-9892-0b2f56191b90",
    "customerUnreadCount": 0
  },
  "error": null,
  "meta": {
    "timestamp": "2026-09-03T08:07:30Z"
  }
}
```

---

## 5. GET /api/v1/chat/unread-count

Lấy tổng số tin nhắn chưa đọc từ admin cho cuộc hội thoại của khách hàng (dùng để hiển thị badge đỏ trên ô inbox nổi).

### Success — HTTP 200 OK
```json
{
  "success": true,
  "message": "Lấy số tin nhắn chưa đọc thành công",
  "data": {
    "totalUnread": 1
  },
  "error": null,
  "meta": {
    "timestamp": "2026-09-03T08:08:00Z"
  }
}
```
