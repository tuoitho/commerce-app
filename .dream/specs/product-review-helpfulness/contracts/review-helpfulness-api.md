# review-helpfulness-api

Revision: 1
Status: FROZEN

Requirements:
- REQ-VOTE-01
- REQ-VOTE-02
- REQ-VOTE-03
- REQ-VOTE-04
- REQ-VOTE-05
- REQ-VOTE-06

Provider:
- backend

Consumers:
- frontend
- frontend-admin

Compatibility:
- none (first revision)

## 1. PUT /api/v1/reviews/:reviewId/vote

Biểu quyết "Hữu ích" hoặc "Không hữu ích" cho một đánh giá sản phẩm, hoặc chuyển đổi trực tiếp giữa hai loại biểu quyết.

### Caller Context & Auth
- Yêu cầu xác thực khách hàng (Bearer Token có `role = customer`).
- Cho phép cả tác giả của bài đánh giá tự biểu quyết (REQ-VOTE-03).

### Request
- Path param: `reviewId` (UUID chuỗi).
- Body (application/json):
  - `vote`: chuỗi bắt buộc, chỉ nhận một trong hai giá trị `"helpful"` hoặc `"unhelpful"`.

```json
{
  "vote": "helpful"
}
```

### Success — HTTP 200 OK
```json
{
  "success": true,
  "message": "Ghi nhận biểu quyết thành công",
  "data": {
    "reviewId": "7b0d9f48-038c-4cf8-b391-b36be9fbb001",
    "helpfulCount": 1,
    "unhelpfulCount": 0,
    "viewerVote": "helpful"
  },
  "error": null,
  "meta": {
    "timestamp": "2026-09-03T12:00:00Z"
  }
}
```

### Material Failures
- `400 validation_error`: `error.fields.vote` hoặc `error.fields.reviewId`.
- `401 unauthorized`: Chưa đăng nhập hoặc token không hợp lệ.
- `404 review_not_found`: Đánh giá không tồn tại.

---

## 2. DELETE /api/v1/reviews/:reviewId/vote

Hủy bỏ biểu quyết hiện thời của người dùng đối với một bài đánh giá.

### Caller Context & Auth
- Yêu cầu xác thực khách hàng (Bearer Token có `role = customer`).

### Request
- Path param: `reviewId` (UUID chuỗi).
- Body: Không có body.

### Success — HTTP 200 OK
```json
{
  "success": true,
  "message": "Hủy biểu quyết thành công",
  "data": {
    "reviewId": "7b0d9f48-038c-4cf8-b391-b36be9fbb001",
    "helpfulCount": 0,
    "unhelpfulCount": 0,
    "viewerVote": null
  },
  "error": null,
  "meta": {
    "timestamp": "2026-09-03T12:00:00Z"
  }
}
```

---

## 3. GET /api/v1/products/:id/reviews (Storefront)

Danh sách đánh giá sản phẩm hiển thị trên trang chi tiết sản phẩm.

### Changes to Review Object
Mỗi đối tượng trong `data` bổ sung:
- `helpfulCount`: số nguyên không âm.
- `unhelpfulCount`: số nguyên không âm.
- `viewer`:
  - Khi chưa đăng nhập (khách vãng lai): `viewer` là `null`.
  - Khi đã đăng nhập: `viewer` là object có `isOwner` (boolean), `canEdit` (boolean), `remainingEdits` (number), `canVote: true`, `vote: "helpful" | "unhelpful" | null`.

---

## 4. GET /api/v1/admin/reviews/stats (Admin Dashboard Metrics)

Truy xuất các chỉ số tổng quan phục vụ các thẻ thống kê đầu trang Quản trị.

### Caller Context & Auth
- Yêu cầu quyền quản trị viên (`guard.RequireAdminRole`).

### Success — HTTP 200 OK
```json
{
  "success": true,
  "message": "Thống kê đánh giá",
  "data": {
    "totalReviews": 10,
    "totalHelpful": 25,
    "totalUnhelpful": 4,
    "unansweredCount": 3
  },
  "error": null,
  "meta": {
    "timestamp": "2026-09-03T12:00:00Z"
  }
}
```

---

## 5. GET /api/v1/admin/reviews (Admin Dashboard List)

Danh sách đánh giá cho Quản trị viên, hỗ trợ lọc theo sản phẩm và sắp xếp theo độ hữu ích.

### Caller Context & Auth
- Yêu cầu quyền quản trị viên (`guard.RequireAdminRole`).

### Query Parameters
- `page`: số nguyên dương (mặc định: `1`).
- `limit`: số nguyên dương từ 1 đến 50 (mặc định: `10`).
- `sort`: `"latest"` (mặc định) | `"most_helpful"` | `"most_unhelpful"`.
- `productId`: UUID chuỗi lọc theo sản phẩm cụ thể (tùy chọn).
- `search`: chuỗi tìm kiếm theo tên sản phẩm (tùy chọn).

### Success — HTTP 200 OK
Trả về mảng `AdminReviewItem`, trong đó mỗi phần tử `review` chứa `helpfulCount` và `unhelpfulCount`.

```json
{
  "success": true,
  "message": "Danh sách đánh giá",
  "data": [
    {
      "review": {
        "id": "7b0d9f48-038c-4cf8-b391-b36be9fbb001",
        "productId": "4a18b76c-132d-4229-a1d2-094bf34b92b6",
        "rating": 5,
        "comment": "Sản phẩm tốt",
        "helpfulCount": 10,
        "unhelpfulCount": 1,
        "createdAt": "2026-09-01T10:00:00Z",
        "updatedAt": "2026-09-01T10:00:00Z"
      },
      "product": {
        "id": "4a18b76c-132d-4229-a1d2-094bf34b92b6",
        "name": "Điện thoại mẫu X",
        "publicPath": "/products/4a18b76c-132d-4229-a1d2-094bf34b92b6"
      },
      "responseVersion": null
    }
  ],
  "error": null,
  "meta": {
    "timestamp": "2026-09-03T12:00:00Z",
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 1,
      "totalPages": 1,
      "hasNext": false,
      "hasPrev": false
    }
  }
}
```

---

## Contract Examples

### Example 1: Bỏ phiếu hữu ích lần đầu
Given Khách hàng A chưa từng biểu quyết đánh giá R,
when Gửi `PUT /api/v1/reviews/R/vote` với body `{"vote": "helpful"}` kèm token của A,
then Nhận HTTP 200 với `helpfulCount = 1`, `unhelpfulCount = 0`, `viewerVote = "helpful"`.

### Example 2: Đổi từ hữu ích sang không hữu ích
Given Khách hàng A đã vote `helpful` cho đánh giá R,
when Gửi `PUT /api/v1/reviews/R/vote` với body `{"vote": "unhelpful"}` kèm token của A,
then Nhận HTTP 200 với `helpfulCount = 0`, `unhelpfulCount = 1`, `viewerVote = "unhelpful"`.

### Example 3: Hủy bỏ phiếu
Given Khách hàng A đã vote `unhelpful` cho đánh giá R,
when Gửi `DELETE /api/v1/reviews/R/vote` kèm token của A,
then Nhận HTTP 200 với `helpfulCount = 0`, `unhelpfulCount = 0`, `viewerVote = null`.

### Example 4: Admin lấy thống kê tổng quan
Given Hệ thống có 10 đánh giá với tổng 25 vote hữu ích, 4 không hữu ích và 3 chưa phản hồi,
when Admin gửi `GET /api/v1/admin/reviews/stats` kèm token Admin,
then Nhận HTTP 200 với `totalReviews = 10, totalHelpful = 25, totalUnhelpful = 4, unansweredCount = 3`.

### Example 5: Admin lọc đánh giá theo sản phẩm P1
Given Có các đánh giá thuộc P1 và P2,
when Admin gửi `GET /api/v1/admin/reviews?productId=P1` kèm token Admin,
then Nhận HTTP 200 chỉ chứa các đánh giá của sản phẩm P1.

### Example 6: Admin sắp xếp theo độ hữu ích
Given Đánh giá R1 có 10 vote helpful và R2 có 2 vote helpful,
when Admin gửi `GET /api/v1/admin/reviews?sort=most_helpful` kèm token Admin,
then Nhận HTTP 200 với R1 nằm trước R2.
