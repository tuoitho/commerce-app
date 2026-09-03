# Thiết Kế Kỹ Thuật Tính Năng Đánh Giá Hữu Ích / Không Hữu Ích (Product Review Helpfulness)

## 1. Mục Tiêu Thiết Kế

Tài liệu này xác định kiến trúc kỹ thuật, ranh giới thành phần, cấu trúc dữ liệu, cơ chế đồng thời và chiến lược kiểm thử cho tính năng đánh giá "Hữu ích" (Helpful) và "Không hữu ích" (Unhelpful) đối với đánh giá sản phẩm trên cả hai kênh: Storefront khách hàng và Quản trị viên (Admin).

Thiết kế bảo đảm:
- Mỗi người dùng đã đăng nhập (bao gồm cả tác giả của bài đánh giá) có tối đa một trạng thái biểu quyết hiệu lực trên mỗi đánh giá.
- Người dùng có thể chuyển đổi giữa "Hữu ích" và "Không hữu ích" hoặc hủy biểu quyết an toàn và lũy đẳng (idempotent).
- Dữ liệu số đếm (`helpfulCount`, `unhelpfulCount`) là số liệu tổng hợp nhất quán, tính trực tiếp từ nguồn sự thật PostgreSQL.
- Dữ liệu cá nhân hóa (`viewer.vote`, `viewer.canVote`) được phân tách rành mạch với số đếm công khai và gắn liền với ngữ cảnh người gọi (caller context).
- Khách vãng lai chưa đăng nhập vẫn xem được tổng số lượt biểu quyết nhưng không thể thay đổi dữ liệu; khi bấm nút trên UI sẽ được nhắc nhở đăng nhập.
- Quản trị viên (Admin) được trải nghiệm quản trị thông minh, trực quan:
  - Xem bảng chỉ số tổng quan (Metrics Cards) gồm: Tổng đánh giá, Tổng 👍 hữu ích, 👎 không hữu ích, và Đánh giá chưa phản hồi.
  - Lọc đánh giá theo sản phẩm (`productId` hoặc tìm kiếm tên sản phẩm `search`), kèm nút bấm nhanh "Lọc theo sản phẩm này" trên từng thẻ đánh giá.
  - Sắp xếp linh hoạt theo độ hữu ích (`most_helpful`, `most_unhelpful`, `latest`) để nhận diện phản hồi quan trọng và ưu tiên phản hồi chăm sóc khách hàng.
  - Hiển thị huy hiệu số lượt vote trực quan trên từng thẻ đánh giá.
- Hiệu năng truy vấn danh sách đánh giá sản phẩm và danh sách đánh giá admin được bảo toàn bằng cách tính toán số đếm và sắp xếp trực tiếp trong câu lệnh truy vấn phân trang của PostgreSQL.

## 2. Kiến Trúc Tổng Thể & Ranh Giới Thành Phần

```text
Khách hàng (Storefront)
  |
  +-- [Public / Optional Auth] GET /api/v1/products/:id/reviews
  |     `--> Danh sách Review có helpfulCount, unhelpfulCount, và viewer (nếu đã đăng nhập)
  |
  +-- [Require Customer Auth] PUT /api/v1/reviews/:reviewId/vote
  |     `--> Ghi nhận hoặc chuyển đổi vote (helpful / unhelpful)
  |
  +-- [Require Customer Auth] DELETE /api/v1/reviews/:reviewId/vote
        `--> Hủy biểu quyết đã thực hiện

Quản trị viên (Admin Dashboard)
  |
  +-- [Require Admin Auth] GET /api/v1/admin/reviews/stats
  |     `--> Trả về { totalReviews, totalHelpful, totalUnhelpful, unansweredCount }
  |
  +-- [Require Admin Auth] GET /api/v1/admin/reviews?page=1&limit=10&sort=...&productId=...&search=...
        `--> Danh sách AdminReviewItem có helpfulCount, unhelpfulCount, lọc theo sản phẩm và sắp xếp
  v
Backend HTTP Layer (Delivery)
  |-- Middleware guard.OptionalCustomerAuth cho GET /products/:id/reviews
  |-- Middleware guard.RequireCustomerAuthForReviews cho PUT & DELETE /reviews/:reviewId/vote
  |-- Middleware guard.RequireAdminRole cho GET /admin/reviews và GET /admin/reviews/stats
  v
Usecase Layer (Review UseCase)
  |-- VoteReview(ctx, reviewID, userID, isHelpful)
  |-- UnvoteReview(ctx, reviewID, userID)
  |-- ListProductReviews(ctx, productID, page, limit, currentUserID)
  |-- ListAdminReviews(ctx, page, limit, sort, productID, search)
  `-- GetAdminReviewStats(ctx)
  v
Repository Layer & PostgreSQL
  |-- Bảng: review_helpful_votes (review_id, user_id, is_helpful, created_at, updated_at)
  |-- Cập nhật ListProductReviews SQL query với aggregation COALESCE(SUM(...))
  |-- Cập nhật ListAdminReviews SQL query với filtering (productId, search) & dynamic sorting
  `-- Bổ sung GetAdminReviewStats query tính tổng quan toàn hệ thống
```

## 3. Cấu Trúc Dữ Liệu & Lưu Trữ (PostgreSQL)

### 3.1 Migration `000014_review_helpful_votes.up.sql`

```sql
CREATE TABLE review_helpful_votes (
    review_id  uuid NOT NULL REFERENCES product_reviews(id) ON DELETE CASCADE,
    user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_helpful boolean NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (review_id, user_id)
);

CREATE INDEX review_helpful_votes_review_id_idx ON review_helpful_votes (review_id);
CREATE INDEX review_helpful_votes_user_id_idx ON review_helpful_votes (user_id);
```

### 3.2 Migration `000014_review_helpful_votes.down.sql`

```sql
DROP TABLE IF EXISTS review_helpful_votes;
```

## 4. Xử Lý Đồng Thời & Tính Nhất Quán (Concurrency & Consistency)

### 4.1 Ghi Nhận Biểu Quyết (Upsert)
```sql
-- name: UpsertReviewVote :exec
INSERT INTO review_helpful_votes (review_id, user_id, is_helpful, updated_at)
VALUES (@review_id, @user_id, @is_helpful, now())
ON CONFLICT (review_id, user_id)
DO UPDATE SET is_helpful = EXCLUDED.is_helpful, updated_at = now();
```

### 4.2 Hủy Biểu Quyết (Delete)
```sql
-- name: DeleteReviewVote :exec
DELETE FROM review_helpful_votes
WHERE review_id = @review_id AND user_id = @user_id;
```

### 4.3 Thống Kê Tổng Quan Admin
```sql
-- name: GetAdminReviewStats :one
SELECT
    count(DISTINCT pr.id)::bigint AS total_reviews,
    COALESCE(SUM(CASE WHEN rhv.is_helpful = true THEN 1 ELSE 0 END), 0)::bigint AS total_helpful,
    COALESCE(SUM(CASE WHEN rhv.is_helpful = false THEN 1 ELSE 0 END), 0)::bigint AS total_unhelpful,
    count(DISTINCT pr.id) FILTER (WHERE rr.review_id IS NULL)::bigint AS unanswered_count
FROM product_reviews pr
LEFT JOIN review_responses rr ON rr.review_id = pr.id
LEFT JOIN review_helpful_votes rhv ON rhv.review_id = pr.id;
```

## 5. Truy Vấn Danh Sách Đánh Giá (Read Models)

### 5.1 Danh Sách Đánh Giá Storefront
Cập nhật câu lệnh `ListProductReviews`:
```sql
-- name: ListProductReviews :many
SELECT pr.id, pr.order_item_id, pr.user_id, pr.product_id, pr.variant_id,
       pr.rating, pr.comment, pr.created_at, pr.updated_at, pr.edited_at,
       oi.options::text AS purchased_options,
       u.email AS author_email,
       rr.content AS response_content, rr.created_at AS response_created_at,
       rr.updated_at AS response_updated_at,
       COALESCE(SUM(CASE WHEN rhv.is_helpful = true THEN 1 ELSE 0 END), 0)::bigint AS helpful_count,
       COALESCE(SUM(CASE WHEN rhv.is_helpful = false THEN 1 ELSE 0 END), 0)::bigint AS unhelpful_count,
       MAX(CASE WHEN @current_user_id::text != '' AND rhv.user_id = @current_user_id::uuid THEN (CASE WHEN rhv.is_helpful THEN 'helpful' ELSE 'unhelpful' END) ELSE NULL END)::text AS viewer_vote
FROM product_reviews pr
JOIN order_items oi ON oi.id = pr.order_item_id
JOIN users u ON u.id = pr.user_id
LEFT JOIN review_responses rr ON rr.review_id = pr.id
LEFT JOIN review_helpful_votes rhv ON rhv.review_id = pr.id
WHERE pr.product_id = @product_id
GROUP BY pr.id, oi.options, u.email, rr.content, rr.created_at, rr.updated_at
ORDER BY pr.updated_at DESC, pr.id DESC
LIMIT @limit_count OFFSET @offset_count;
```

### 5.2 Danh Sách Đánh Giá Admin với Bộ Lọc Sản Phẩm & Sắp Xếp Động
Cập nhật câu lệnh `ListAdminReviews`:
```sql
-- name: ListAdminReviews :many
SELECT pr.id, pr.order_item_id, pr.product_id, pr.variant_id, pr.rating, pr.comment,
       pr.created_at, pr.updated_at, pr.edited_at,
       oi.product_name AS purchased_product_name, oi.options::text AS purchased_options,
       EXISTS (
           SELECT 1 FROM products p
           WHERE p.id = pr.product_id AND p.active
             AND EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.active)
       ) AS is_product_public,
       rr.content AS response_content, rr.created_at AS response_created_at,
       rr.updated_at AS response_updated_at, rr.version AS response_version,
       COALESCE(SUM(CASE WHEN rhv.is_helpful = true THEN 1 ELSE 0 END), 0)::bigint AS helpful_count,
       COALESCE(SUM(CASE WHEN rhv.is_helpful = false THEN 1 ELSE 0 END), 0)::bigint AS unhelpful_count
FROM product_reviews pr
JOIN order_items oi ON oi.id = pr.order_item_id
LEFT JOIN review_responses rr ON rr.review_id = pr.id
LEFT JOIN review_helpful_votes rhv ON rhv.review_id = pr.id
WHERE (@product_id::text = '' OR pr.product_id = @product_id::uuid)
  AND (@search::text = '' OR oi.product_name ILIKE '%' || @search || '%')
GROUP BY pr.id, oi.product_name, oi.options, rr.content, rr.created_at, rr.updated_at, rr.version
ORDER BY
    CASE WHEN @sort_by::text = 'most_helpful' THEN COALESCE(SUM(CASE WHEN rhv.is_helpful = true THEN 1 ELSE 0 END), 0) END DESC,
    CASE WHEN @sort_by::text = 'most_unhelpful' THEN COALESCE(SUM(CASE WHEN rhv.is_helpful = false THEN 1 ELSE 0 END), 0) END DESC,
    pr.updated_at DESC, pr.id DESC
LIMIT @limit_count OFFSET @offset_count;

-- name: CountAdminReviewsFiltered :one
SELECT count(DISTINCT pr.id)::bigint
FROM product_reviews pr
JOIN order_items oi ON oi.id = pr.order_item_id
WHERE (@product_id::text = '' OR pr.product_id = @product_id::uuid)
  AND (@search::text = '' OR oi.product_name ILIKE '%' || @search || '%');
```

## 6. Ranh Giới Giao Tiếp & Đặc Tả Hợp Đồng (Boundaries & Shared Contracts)

### Boundary B-VOTE-01: Biểu quyết đánh giá
- **Provider**: Backend (`PUT /api/v1/reviews/:reviewId/vote`)
- **Consumer**: Frontend (`voteReview`)
- **Contract Required**: Yes (`contracts/review-helpfulness-api.md`).
- **Traced REQ**: `REQ-VOTE-01`, `REQ-VOTE-03`, `REQ-VOTE-05`.

### Boundary B-VOTE-02: Hủy biểu quyết đánh giá
- **Provider**: Backend (`DELETE /api/v1/reviews/:reviewId/vote`)
- **Consumer**: Frontend (`unvoteReview`)
- **Contract Required**: Yes (`contracts/review-helpfulness-api.md`).
- **Traced REQ**: `REQ-VOTE-02`, `REQ-VOTE-03`, `REQ-VOTE-05`.

### Boundary B-VOTE-03: Danh sách đánh giá Storefront
- **Provider**: Backend (`GET /api/v1/products/:id/reviews`)
- **Consumer**: Frontend (`ProductReviewsSection.tsx`)
- **Contract Required**: Yes (`contracts/review-helpfulness-api.md`).
- **Traced REQ**: `REQ-VOTE-04`.

### Boundary B-VOTE-04: Thống kê tổng quan Admin
- **Provider**: Backend (`GET /api/v1/admin/reviews/stats`)
- **Consumer**: Frontend Admin (`frontend-admin/src/pages/ReviewsPage.tsx`)
- **Response 200 OK**:
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
    "meta": { "timestamp": "2026-09-03T12:00:00Z" }
  }
  ```
- **Contract Required**: Yes (`contracts/review-helpfulness-api.md`).
- **Traced REQ**: `REQ-VOTE-06`.

### Boundary B-VOTE-05: Danh sách đánh giá Admin có lọc sản phẩm và sắp xếp
- **Provider**: Backend (`GET /api/v1/admin/reviews?page=...&limit=...&sort=...&productId=...&search=...`)
- **Consumer**: Frontend Admin (`frontend-admin/src/api/reviews.ts -> getAdminReviews`)
- **Contract Required**: Yes (`contracts/review-helpfulness-api.md`).
- **Traced REQ**: `REQ-VOTE-06`.

## 7. Thiết Kế Giao Diện Người Dùng (UI Design)

### 7.1 Storefront (`ProductReviewsSection.tsx`)
- Thêm cụm nút ThumbsUp (Hữu ích) và ThumbsDown (Không hữu ích).
- Hỗ trợ cập nhật lạc quan, hoàn tác khi gặp lỗi mạng, nhắc nhở đăng nhập cho khách vãng lai.

### 7.2 Admin Dashboard (`ReviewsPage.tsx`)
- **Hàng thẻ chỉ số tổng quan (Overview Metrics Cards)**:
  - Thẻ 1: Tổng đánh giá (icon `MessageSquareText`, hiển thị `stats.totalReviews`).
  - Thẻ 2: Đánh giá hữu ích (icon `ThumbsUp`, hiển thị `stats.totalHelpful`, badge màu xanh lá).
  - Thẻ 3: Đánh giá không hữu ích (icon `ThumbsDown`, hiển thị `stats.totalUnhelpful`, badge màu cam/đỏ để cảnh báo).
  - Thẻ 4: Chưa phản hồi (icon `Clock` hoặc `AlertCircle`, hiển thị `stats.unansweredCount`, nhắc nhở Admin xử lý).
- **Thanh công cụ lọc và tìm kiếm (Filters & Search Bar)**:
  - Ô tìm kiếm theo tên sản phẩm (`Search` input với icon kính lúp).
  - Bộ chọn sắp xếp (Sort dropdown): "Mới nhất" (`latest`), "Nhiều hữu ích nhất" (`most_helpful`), "Nhiều không hữu ích nhất" (`most_unhelpful`).
  - Chip trạng thái đang lọc theo sản phẩm kèm nút "Xóa lọc" khi Admin chọn lọc một sản phẩm cụ thể.
- **Từng thẻ đánh giá (`ReviewCard`)**:
  - Hiển thị hai huy hiệu:
    - `👍 {helpfulCount} Hữu ích`
    - `👎 {unhelpfulCount} Không hữu ích`
  - Nút bấm nhanh **"Lọc theo sản phẩm này"**: Giúp Admin bấm 1 chạm là lọc toàn bộ đánh giá của cùng sản phẩm để đánh giá chất lượng tổng thể của sản phẩm đó.

## 8. Chiến Lược Kiểm Thử & Lựa Chọn Bằng Chứng Xác Minh (Verification Strategy)

| Behavior / Requirement | Mô Tả Hành Vi | Mức Proof Mục Tiêu | Cơ Chế Xác Minh |
|---|---|---|---|
| `REQ-VOTE-01`, `INV-VOTE-01-01` | Tính bất biến 1 vote/user/review, upsert vote | `integration-db` | `TestReviewRepository_VoteUpsertAndStats` |
| `REQ-VOTE-01`, `AC-VOTE-01-01`, `AC-VOTE-01-02` | Vote hữu ích và đổi sang không hữu ích qua HTTP API | `provider-contract` | `TestReviewHandler_VoteEndpoint` |
| `REQ-VOTE-02`, `INV-VOTE-02-01`, `AC-VOTE-02-01` | Hủy vote lũy đẳng, số đếm giảm chính xác | `integration-db` + `provider-contract` | `TestReviewRepository_DeleteVote` & `TestReviewHandler_UnvoteEndpoint` |
| `REQ-VOTE-03`, `AC-VOTE-03-01`, `AC-VOTE-03-02` | Tác giả đánh giá được phép tự vote và hủy vote | `integration-db` + `provider-contract` | `TestReviewHandler_AuthorSelfVoteAllowed` |
| `REQ-VOTE-04`, `AC-VOTE-04-01`, `AC-VOTE-04-02` | GET reviews trả về helpfulCount, unhelpfulCount, viewer | `integration-db` + `provider-contract` | `TestReviewRepository_GetProductReviewsWithVotes` |
| `REQ-VOTE-05`, `AC-VOTE-05-01..03` | Storefront tương tác nút bấm, optimistic update, rollback | `component` | `ProductReviewsSection.test.tsx` |
| `REQ-VOTE-06`, `AC-VOTE-06-01` | Admin GET `/api/v1/admin/reviews/stats` trả về metrics | `integration-db` + `provider-contract` | `TestReviewHandler_AdminReviewStats` |
| `REQ-VOTE-06`, `AC-VOTE-06-02..04` | Admin GET reviews với sort=most_helpful/unhelpful & productId filter | `integration-db` + `provider-contract` | `TestReviewHandler_ListAdminReviews_SortAndFilter` |
| `REQ-VOTE-06`, `AC-VOTE-06-05` | Admin ReviewsPage hiển thị 4 thẻ metrics, filter bar & badges | `component` | `ReviewsPage.test.tsx` |
| End-to-End API Integration | Xác thực luồng HTTP trực tiếp từ endpoint đến DB | `runtime-http` | Chạy test integration backend HTTP suite |
