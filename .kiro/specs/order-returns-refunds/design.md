# Design Document

## Overview

Feature `order-returns-refunds`: khách hàng tạo yêu cầu trả hàng theo từng mặt hàng trong 7 ngày kể từ khi giao (thực thể riêng với vòng đời 6 trạng thái), admin xử lý qua 4 bước (duyệt/từ chối → nhận hàng hoàn kho → ghi nhận hoàn tiền thủ công). Đơn chuyển `returned` khi lần hoàn tiền đầu tiên được ghi nhận. Bao phủ R1–R9.

Mở rộng theo mẫu kiến trúc hiện có: bounded context mới `returns` (backend), nhóm route `/api/v1/orders/:id/return-requests` (khách) và `/api/v1/admin/return-requests` (admin), bảng mới `return_requests` + `return_request_items`, cột `delivered_at` cho `orders`. Không đổi luồng đặt/hủy đơn và bucket lọc hiện có.

## Boundaries

```text
B1 — Customer Returns API
     Producer: backend usecase `returns` qua delivery/http
     Consumers: storefront (React)
     Purpose: tạo/xem/rút yêu cầu trả hàng của chính mình
     Auth: guard.AuthRequired + scope owner (user_id khớp đơn/yêu cầu)
     State/failure: tạo (tx khóa dòng orders), rút (chỉ từ pending_approval);
       lỗi 400/404/409 theo bảng Error Handling
     Contract artifact: OpenAPI fragment `/api/v1/orders/{orderId}/return-requests`
     Traces: R1, R2, R3, R4

B2 — Admin Returns API
     Producer: backend usecase `returns`
     Consumers: frontend-admin (React)
     Purpose: duyệt/từ chối/nhận hàng/ghi nhận hoàn tiền, danh sách lọc phân trang
     Auth: guard.AuthRequired + RequireAdmin()
     State/failure: 4 chuyển tiếp trạng thái có chủ sở hữu duy nhất;
       hoàn kho + set orders.status nằm trong tx của bước tương ứng
     Contract artifact: OpenAPI fragment `/api/v1/admin/return-requests`
     Traces: R4, R5, R6, R7, R8, R9

B3 — Persistence schema & giao dịch hoàn kho
     Producer: migration 000010 + db/queries/returns.sql + repository
     Consumers: usecase `returns`; usecase `order` (chỉ đọc cột delivered_at hiển thị)
     Purpose: toàn vẹn dữ liệu — 1 yêu cầu mở/đơn, giới hạn số lượng, hoàn kho nguyên tử
     Auth: n/a (nội bộ)
     State/failure: partial unique index chặn 2 yêu cầu mở; mọi thao tác đổi trạng thái
       chạy FOR UPDATE + rollback đầy đủ khi lỗi
     Contract artifact: SQL DDL + sqlc queries (kiểm chứng bằng make db-up/make gen/test)
     Traces: R2.6, R7.2–7.4, R8.2, R9.1

B4 — Mốc thời gian giao hàng (delivered_at)
     Producer: usecase `order` — AdminTransition(deliver) ghi delivered_at trong tx hiện có
     Consumers: B1 (kiểm tra cửa sổ 7 ngày), B2 (hiển thị)
     Auth: n/a
     State/failure: chỉ set khi to==delivered; các transition khác bảo toàn giá trị cũ
     Contract artifact: migration ALTER TABLE + query SetOrderDeliveredAt
     Traces: R2.3

B5 — Storefront trả hàng UI
     Producer: frontend/src (OrderDetailPage + module API mới)
     Consumers: khách hàng
     Purpose: form tạo yêu cầu, theo dõi trạng thái, rút yêu cầu
     Auth: đã đăng nhập
     Contract artifact: TypeScript types + api client khớp B1
     Traces: R1, R3, R4

B6 — Frontend-admin trả hàng UI
     Producer: frontend-admin/src (2 trang mới + nav)
     Consumers: admin
     Purpose: danh sách/lọc/phân trang, chi tiết, 4 thao tác xử lý
     Auth: ProtectedRoute (admin)
     Contract artifact: TypeScript types + api client khớp B2
     Traces: R5, R6, R7, R8
```

## Architecture

- **Backend:** bounded context `returns` mới theo mẫu `order` — `internal/domain/return_request.go` (entity + trạng thái + bảng chuyển tiếp + interface `ReturnRequestRepository` do domain sở hữu), `internal/repository/return_repository.go`, `internal/usecase/returns/` (tên package tránh keyword `return`), handler `return_handler.go` + `admin_return_handler.go`, đăng ký route trong `router.go`.
- **Wire:** thêm `provideReturnRepository` + `provideReturnsUseCase` vào `appProviderSet`; `Dependencies.Returns` trong router; regenerate `wire_gen.go`.
- **Storefront:** module `src/api/returnRequests.ts` + mục trả hàng trên `OrderDetailPage`.
- **Frontend-admin:** module API + 2 trang `/return-requests`, `/return-requests/:id` + nav "Trả hàng".

Luồng dữ liệu chính:

```
Khách: OrderDetailPage → POST /api/v1/orders/:id/return-requests (dòng hàng+số lượng+lý do)
       → GET .../return-requests (theo dõi) → POST .../:requestId/cancel (rút)
Admin: /return-requests → GET /api/v1/admin/return-requests?status=&page=&limit=
       → GET /:id (gồm số tiền đề nghị) → POST /:id/{approve|reject|receive|refund}
       → receive: tx hoàn kho; refund: tx set refunded + orders.status='returned'
```

## Components And Interfaces

### Domain (`internal/domain/return_request.go`)

- `ReturnRequestStatus`: `pending_approval`, `approved`, `received`, `refunded`, `rejected`, `cancelled`; `IsValid()`.
- `ReturnReasonCode` (danh sách cố định): `defective`, `not_as_described`, `wrong_or_missing`, `changed_mind`; kèm nhãn tiếng Việt cho response; `IsValid()`.
- Tập **trạng thái tiêu thụ số lượng**: `pending_approval`, `approved`, `received`, `refunded` (bị từ chối/khách rút không chiếm lượng).
- Entity `ReturnRequest`: id, orderId, userId, status, reasonCode, description (≤500 ký tự, tùy chọn), items[] (`order_item_id`, `quantity`), rejectReason, refundAmountVnd (*string), các mốc `approved_at/rejected_at/received_at/refunded_at/cancelled_at`, createdAt/updatedAt; field chỉ điền bởi query admin: `buyerEmail`.
- Quy tắc chuyển tiếp (hàm domain, repository thực thi trong tx):
  - Khách rút: `pending_approval` → `cancelled`.
  - Admin: `pending_approval` → `approved` | `rejected` (reject bắt buộc reason); `approved` → `received` (**hoàn kho**); `received` → `refunded` (kèm refund_amount; nếu là hoàn đầu tiên của đơn thì set `orders.status='returned'` trong cùng tx).
  - Trạng thái khác → `ErrReturnActionNotAllowed`.
- Hằng số cửa sổ: `ReturnWindowDays = 7` (domain const, không đưa vào config — yêu cầu đã cố định 7 ngày).
- Lỗi mới (mục Error Handling): `ErrReturnNotFound`, `ErrReturnNotAllowed`, `ErrReturnWindowExpired`, `ErrReturnRequestExists`, `ErrReturnItemLimitExceeded`, `ErrReturnActionNotAllowed`.

`ReturnRequestRepository` interface (do domain sở hữu):

- `Create(ctx, orderID, userID string, reasonCode, description string, items []ReturnRequestItemInput) (*ReturnRequest, error)` — 1 tx: khóa dòng orders (scope user), kiểm tra trạng thái đơn ∈ (`delivered`,`returned`), cửa sổ 7 ngày theo `delivered_at`, không có yêu cầu mở, đối soát lượng tiêu thụ từng dòng, insert request + items.
- `ListByOrder(ctx, orderID, userID string) ([]ReturnRequest, error)` — scope owner.
- `CancelByCustomer(ctx, requestID, userID string) (*ReturnRequest, error)` — tx khóa + kiểm tra trạng thái.
- `ListByAdmin(ctx, statuses []string) ([]ReturnRequestAdminRow, error)` — join orders/users (email người mua, mã đơn).
- `GetByAdminID(ctx, requestID string) (*ReturnRequestAdminRow, error)` — gồm `suggestedRefundVnd` tính tại repository (Σ unit_price×qty của items + `orders.shipping_fee_vnd` nếu chưa có request nào `refunded` cho đơn đó).
- `Approve(ctx, requestID)`, `Reject(ctx, requestID, reason)`, `MarkReceived(ctx, requestID)`, `MarkRefunded(ctx, requestID, amountVnd)` — mỗi cái 1 tx: `LockReturnForUpdate` → kiểm tra trạng thái trước → ghi (MarkReceived: `IncrementVariantStock` từng dòng; MarkRefunded: cập nhật request + `SetOrderStatusReturned` nếu chưa `returned`).

### Queries sqlc (`db/queries/returns.sql`, tái dùng `orders.sql`)

- `LockOrderByUserIDForUpdate :one` (tái dùng mẫu `LockOrderForUpdate`).
- `InsertReturnRequest :one`, `InsertReturnRequestItem :exec`.
- `ListReturnRequestsByOrder :many` + items `ListReturnRequestItemsByRequestIDs :many` (mẫu order_items).
- `CountOpenReturnRequests :one` (`WHERE order_id=$1 AND status IN ('pending_approval','approved')`).
- `SumConsumedQuantitiesByOrder :many` — join items × requests, lọc tập tiêu thụ, `GROUP BY order_item_id`.
- `ListReturnRequestsByAdmin :many` (join orders + users, lọc `status ANY`, ORDER created_at DESC).
- `GetReturnRequestByAdminID :one`, `LockReturnRequestForUpdate :one` (không scope user, cho admin + customer-cancel dùng bản scope user riêng), `LockReturnRequestForUser :one`.
- `HasRefundedReturnRequest :one` (`EXISTS ... status='refunded'`).
- `ApproveReturnRequest/RejectReturnRequest/ReceiveReturnRequest/RefundReturnRequest/CancelReturnRequest :exec` — set đúng mốc thời gian tương ứng.
- `SetOrderStatusReturned :exec` — `UPDATE orders SET status='returned', updated_at=now() WHERE id=$1 AND status<>'returned'`.
- `SetOrderDeliveredAt :exec` (queries/orders.sql) — gọi trong `AdminTransition` khi `to==delivered`, cùng tx.
- `sqlc.yaml`: giữ override hiện có (money `::text`, quantity bigint).

### Migration (`db/migrations/000010_order_returns.{up,down}.sql`)

- `ALTER TABLE orders ADD COLUMN delivered_at timestamptz NULL;` + backfill: `UPDATE orders SET delivered_at = COALESCE(updated_at, created_at) WHERE status = 'delivered' AND delivered_at IS NULL;`
- `CREATE TABLE return_requests (...)`: `id uuid PK`, `order_id → orders(id) ON DELETE CASCADE`, `user_id → users(id) ON DELETE RESTRICT`, `status text CHECK (6 giá trị) NOT NULL DEFAULT 'pending_approval'`, `reason_code text CHECK (4 giá trị) NOT NULL`, `description text NOT NULL DEFAULT ''`, `reject_reason text NOT NULL DEFAULT ''`, `refund_amount_vnd numeric NULL CHECK (refund_amount_vnd > 0 AND refund_amount_vnd = trunc(...))`, `created_at/updated_at` NOT NULL DEFAULT now(), `approved_at/rejected_at/received_at/refunded_at/cancelled_at timestamptz NULL`.
- Partial unique index: `CREATE UNIQUE INDEX return_requests_one_open_per_order_idx ON return_requests (order_id) WHERE status IN ('pending_approval','approved');` — bảo vệ DB-level quy tắc "1 yêu cầu mở/đơn".
- `CREATE INDEX return_requests_status_created_at_idx ON return_requests (status, created_at);`, `return_requests_order_id_idx`.
- `CREATE TABLE return_request_items (...)`: `id uuid PK`, `return_request_id → return_requests(id) ON DELETE CASCADE`, `order_item_id → order_items(id) ON DELETE RESTRICT`, `quantity bigint NOT NULL CHECK (quantity > 0)`; index trên cả hai FK.
- Down: drop 2 bảng + drop cột `delivered_at`.

### Repository (`internal/repository/return_repository.go`)

Thực thi interface domain bằng sqlc queries; mọi thao tác đổi trạng thái chạy trong `pgx.Tx` theo mẫu `AdminTransition` hiện có: khóa dòng → kiểm tra điều kiện (vi phạm → lỗi domain cụ thể) → ghi → commit; mọi lỗi rollback. Mapping money giữ dạng chuỗi số nguyên VND.

### Usecase (`internal/usecase/returns/returns.go`)

- `Create(ctx, userID, orderID string, input CreateReturnInput)`: UUID sai → `ErrOrderNotFound`; validate lý do hợp lệ, mô tả ≤500, ít nhất 1 dòng, quantity ≥1 (sai → `ValidationError` fields); delegate `repo.Create`.
- `ListByOrder(ctx, userID, orderID)`; `Cancel(ctx, userID, requestID)`.
- `AdminList(ctx, status)` — rỗng = tất cả, sai → `ValidationError` field `status` (mẫu `AdminList` của order); `AdminGetByID` — UUID sai → `ErrReturnNotFound`.
- `AdminTransition(ctx, requestID, action, params)`: action `approve|reject|receive|refund`; reject thiếu reason hoặc refund amount ≤0/không nguyên → `ValidationError` fields; delegate repo.

### Handler + routes (`internal/delivery/http/`)

Khách (group `orders` hiện có, `guard.AuthRequired`):

```
orders.POST("/:id/return-requests", h.CreateReturn)
orders.GET("/:id/return-requests", h.ListReturnRequests)
orders.POST("/:id/return-requests/:requestId/cancel", h.CancelReturn)
```

Admin (nhóm `/api/v1/admin`):

```
adminReturns.GET("", h.AdminList)                 // ?status=&page=&limit=
adminReturns.GET("/:id", h.AdminGetByID)
adminReturns.POST("/:id/approve", h.Approve)
adminReturns.POST("/:id/reject", h.Reject)        // body { reason }
adminReturns.POST("/:id/receive", h.Receive)
adminReturns.POST("/:id/refund", h.RecordRefund)  // body { amount }
```

- Response khách: `returnRequestResponse` (trạng thái, lý do + nhãn VN, mô tả, items, refundAmount khi đã hoàn, mốc thời gian). Response admin: + `buyerEmail`, `orderTotalVnd`, `shippingFeeVnd`, `suggestedRefundVnd`. Phân trang in-memory theo mẫu `catalog_handler.go` (`writePaginatedSuccess`).
- `orderResponse` bổ sung `deliveredAt` (additive, cả khách + admin) để UI tính cửa sổ; endpoint không tự chặn theo thời gian ngoài server-side đã có.

### Frontend

- **Storefront:** `src/api/returnRequests.ts` (create/list/cancel + types); `OrderDetailPage` thêm mục "Yêu cầu trả hàng": nút "Yêu cầu trả hàng" (hiện khi đơn `delivered`/`returned` và còn hạn — tính từ `deliveredAt`), Dialog form chọn dòng + số lượng (max = đã mua − đã tiêu thụ) + Select lý do + Textarea mô tả; danh sách yêu cầu với Badge trạng thái; nút "Rút yêu cầu" + AlertDialog xác nhận khi `pending_approval`; hiển thị lý do từ chối và tiền hoàn.
- **Frontend-admin:** `src/api/returnRequests.ts`; routes `/return-requests` (Table + Select lọc trạng thái + phân trang, mẫu `OrdersPage`) và `/return-requests/:id` (chi tiết + lịch sử trạng thái + nút hành động theo trạng thái: `pending_approval`→Duyệt/Từ chối (Dialog bắt buộc nhập lý do), `approved`→Xác nhận đã nhận hàng (AlertDialog cảnh báo hoàn kho), `received`→Ghi nhận hoàn tiền (Dialog input số tiền, prefill `suggestedRefundVnd`)); nav "Trả hàng" trong `AdminLayout`.

## Data Models

Xem Migration. Ghi chú:

- Lượng tiêu thụ một dòng = SUM(quantity) của items thuộc requests có trạng thái trong tập tiêu thụ; số lượng còn được phép trả = `order_items.quantity − lượng tiêu thụ`.
- Tiền đề nghị (R8.1/8.3): `Σ unit_price_vnd × quantity` + `orders.shipping_fee_vnd` nếu `HasRefundedReturnRequest = false`. Số tiền thực tế do admin nhập (chuyển khoản tay có thể lệch) — chỉ ràng buộc nguyên VND > 0.
- `ReturnWindowDays = 7` là hằng số ứng dụng; DB không lưu cấu hình này.
- Không có bảng payments; hoàn tiền chỉ là dữ liệu ghi nhận trên `return_requests.refund_amount_vnd/refunded_at` + admin id lấy từ JWT context (cột `refunded_by_user_id uuid NULL REFERENCES users(id)`).

## Error Handling

Bổ sung vào `internal/domain/errors.go` + mapping trong `internal/delivery/http/error.go`:

| Domain error | HTTP | code | message (VN) |
|---|---|---|---|
| `ErrReturnNotFound` | 404 | `return_request_not_found` | "Không tìm thấy yêu cầu trả hàng" |
| `ErrOrderNotFound` (tái dùng) | 404 | `order_not_found` | "Không tìm thấy đơn hàng" |
| `ErrReturnNotAllowed` | 409 | `return_not_allowed` | "Đơn hàng không thể yêu cầu trả hàng ở trạng thái hiện tại" |
| `ErrReturnWindowExpired` | 409 | `return_window_expired` | "Đã quá 7 ngày kể từ khi nhận hàng, không thể yêu cầu trả hàng" |
| `ErrReturnRequestExists` | 409 | `return_request_exists` | "Đơn hàng đang có một yêu cầu trả hàng đang mở" |
| `ErrReturnItemLimitExceeded` | 409 | `return_item_limit_exceeded` | "Số lượng trả vượt quá số lượng có thể trả của mặt hàng" |
| `ErrReturnActionNotAllowed` | 409 | `return_action_not_allowed` | "Không thể thực hiện thao tác này trên yêu cầu trả hàng ở trạng thái hiện tại" |
| `ValidationError` (tái dùng) | 400 | `validation_error` | fields: `items`, `reasonCode`, `description`, `reason`, `amount`, `status`, `action` |

Lỗi kinh doanh không kèm `fields` theo chuẩn AGENTS; message tiếng Việt. 500 → `internal`.

## Testing Strategy

Backend (fake repositories, không cần PostgreSQL — theo mẫu `order_test.go`):

- **domain:** `ReturnRequestStatus.IsValid`, `ReturnReasonCode.IsValid`; bảng chuyển tiếp 4 hành động admin + rút của khách (from/to/điều kiện); tập tiêu thụ số lượng.
- **usecase `returns`:** Create — validate lý do/dòng/số lượng/mô tả, UUID sai → 404; Cancel — sai trạng thái → 409; AdminList — filter/page; AdminTransition — reject thiếu reason → 400, refund amount sai → 400, action sai → 409/400.
- **handler:** auth (401/403 hai phía), owner-scope (khách A không thấy/rút yêu cầu của khách B — 404), envelope chuẩn, phân trang `PaginationMeta`, các case lỗi kinh doanh trả đúng `error.code` + message VN.
- **Toàn vẹn tx:** bảo đảm bằng thiết kế SQL (FOR UPDATE + rollback) — verify qua `make test`/`make vet`/`make gen` và review SQL; migration verify bằng `make db-up`/`make db-down` (down sạch).

Frontend (vitest, mock API modules): OrderDetailPage — render mục trả hàng, form validate, rút yêu cầu, hiển thị từ chối/tiền hoàn; admin 2 trang — danh sách/lọc/phân trang/empty/loading/error, chi tiết + nút theo trạng thái, Dialog reject bắt buộc lý do, refund prefill; nav mới.

Verification: `go test ./...`, `go vet ./...`, `make gen` (backend); `npm run lint`, `npm test`, `npm run build` (hai frontend); `make db-up`.

## Requirement Traceability

| Requirement | Design Elements | Verification |
|---|---|---|
| 1.1–1.5 | B1 POST return-requests; B5 form; ValidationError | usecase/handler tests; OrderDetailPage tests |
| 2.1–2.6 | Create tx (khóa orders, scope owner, cửa sổ 7 ngày theo delivered_at — B4, chặn yêu cầu mở + unique index, đối soát lượng tiêu thụ) | domain/usecase/handler tests; migration |
| 3.1–3.3 | CancelByCustomer (pending_approval → cancelled); B5 nút rút | usecase/handler tests; OrderDetailPage tests |
| 4.1–4.3 | GET return-requests theo đơn (mốc thời gian, refundAmount); B5 mục theo dõi | handler tests; OrderDetailPage tests |
| 5.1–5.4 | B2 AdminList (filter + phân trang in-memory) + AdminGetByID (buyerEmail, suggestedRefundVnd); RequireAdmin; B6 | handler tests; admin page tests |
| 6.1–6.4 | Approve/Reject (reject bắt buộc reason) từ pending_approval; B6 Dialog | usecase/handler tests; AdminReturnDetail tests |
| 7.1–7.4 | MarkReceived tx: khóa + IncrementVariantStock từng dòng + set received_at; biến thể xóa mềm vẫn cộng kho an toàn (UPDATE ... WHERE id) | usecase tests; SQL review |
| 8.1–8.5 | MarkRefunded tx + HasRefundedReturnRequest (phí ship một lần); lưu amount/refunded_at/refunded_by; ValidationError amount | usecase/handler tests |
| 9.1–9.3 | SetOrderStatusReturned trong tx refund; bucket `returns` giữ nguyên | usecase tests; handler tests |

## Existing System Integration

- **Downstream — order-placement (khách):** không đổi hành vi hiện có; chỉ thêm `deliveredAt` vào `orderResponse` (additive) và các endpoint mới. Auto-confirm, hủy/hoàn tác hủy không bị ảnh hưởng (đơn `delivered` không còn đường hủy nào).
- **Downstream — admin-order-management:** `deliver` nay ghi thêm `delivered_at` trong tx hiện có (B4); các transition khác bất biến. Trang admin đơn hàng không cần sửa.
- **Chủ sở hữu chuyển tiếp trạng thái:** `orders.status` do usecase `order` sở hữu, ngoại lệ duy nhất và tường minh là `SetOrderStatusReturned` do usecase `returns` gọi trong tx hoàn tiền; `return_requests.*` do usecase `returns` sở hữu duy nhất. Không có chuyển tiếp chia sẻ ngầm.
- **Supporting dependencies (đã đủ):** guard JWT + role; `IncrementVariantStock`; Full Status Envelope + `writePaginatedSuccess`; shadcn Table/Select/Badge/Dialog/AlertDialog/Textarea/Input; react-query mutations. Không tạo capability song song.
- **Compatibility:** mọi endpoint mới tuân Full Status Envelope; migration đánh số `000010` kèm down; Wire regenerate sau khi thêm providers; sqlc regenerate sau migration.
