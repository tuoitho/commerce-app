# Design Document

## Overview

Feature `admin-order-management`: quản trị viên xem toàn bộ đơn hàng của mọi khách hàng (danh sách có lọc trạng thái + phân trang, chi tiết), và thực hiện 5 chuyển tiếp phía bán hàng mà `order-placement` để dành: xác nhận chuẩn bị hàng, bàn giao đơn vị vận chuyển, đánh dấu đã giao, duyệt yêu cầu hủy (hoàn kho), từ chối yêu cầu hủy. Bao phủ R1–R9.

Không thay đổi enum trạng thái, luồng phía khách hàng (đặt/hủy/yêu cầu hủy/hoàn tác), auto-confirm, hay schema. Chỉ bổ sung: phương thức admin trong `order` context (backend) + trang danh sách/chi tiết đơn hàng (frontend-admin). Đơn "chờ xác nhận" không có hành động admin (auto-confirm xử lý, theo quyết định đã duyệt).

## Architecture

- **Backend:** mở rộng bounded context `order` hiện có theo mẫu `catalog` (customer + admin chung usecase). Thêm `OrderAdminAction` (bảng chuyển tiếp ở `domain`), các query admin trong `db/queries/orders.sql` (join `users` lấy `buyer_email`), repository methods mới, usecase methods mới, handler `admin_order_handler.go` + route dưới group `/api/v1/admin` đã có (`guard.AuthRequired` + `guard.RequireAdmin()`).
- **Frontend-admin:** 2 trang mới `/orders` (danh sách + lọc + phân trang) và `/orders/:id` (chi tiết + nút hành động theo trạng thái); thêm mục "Đơn hàng" vào `AdminLayout`; module API `src/api/orders.ts` + type trong `types.ts`.
- **Không đổi:** migration, config, Wire (handler admin dùng lại `deps.Order` — usecase đã có sẵn trong `Dependencies`).

Luồng dữ liệu:

```
AdminLayout "Đơn hàng" → GET /api/v1/admin/orders?status=&page=&limit= (danh sách, phân trang in-memory)
  → GET /api/v1/admin/orders/:id (chi tiết + email người mua)
  → POST /api/v1/admin/orders/:id/{confirm-preparing|ship|deliver|cancel/approve|cancel/decline}
  → trả OrderAdmin mới → frontend cập nhật UI
```

## Components And Interfaces

### Domain (`internal/domain/order.go`)

- Thêm `BuyerEmail string` vào `Order` — chỉ được điền bởi query admin (join `users.email`); response phía khách (`toOrderResponse`) không đọc field này → không lộ email qua endpoint khách hàng.
- `OrderAdminAction string` + consts: `confirm_preparing`, `ship`, `deliver`, `approve_cancel`, `decline_cancel`; `func (a OrderAdminAction) IsValid() bool`.
- Bảng chuyển tiếp (sở hữu bởi domain, dùng bởi repository trong 1 tx): `func (a OrderAdminAction) Transition() (from, to OrderStatus, restock bool, ok bool)`:
  - `confirm_preparing`: `confirmed` → `preparing`, không hoàn kho.
  - `ship`: `preparing` → `shipped`, không hoàn kho.
  - `deliver`: `shipped` → `delivered`, không hoàn kho.
  - `approve_cancel`: `cancel_requested` → `cancelled`, **hoàn kho** (`IncrementVariantStock` từng dòng).
  - `decline_cancel`: `cancel_requested` → `preparing`, không hoàn kho.
- Thêm lỗi `ErrOrderActionNotAllowed` (mục Error Handling).

`OrderRepository` interface mở rộng:
- `ListByAdmin(ctx, statuses []string) ([]Order, error)` — trả toàn bộ đơn khớp lọc (rỗng = tất cả), kèm `BuyerEmail`.
- `GetByAdminID(ctx, orderID string) (*Order, error)` — không scope theo user; kèm `BuyerEmail`.
- `AdminTransition(ctx, orderID string, action OrderAdminAction) (*Order, error)` — chuyển tiếp trong 1 tx.

### Query sqlc (`db/queries/orders.sql`)

- `ListOrdersByAdmin :many` — `SELECT o.id, o.user_id, o.status, o.payment_method, o.subtotal_vnd::text, o.shipping_fee_vnd::text, o.total_vnd::text, o.recipient_name, o.phone, o.province_name, o.ward_name, o.detail_address, o.created_at, o.updated_at, o.confirmed_at, o.cancelled_at, u.email AS buyer_email FROM orders o JOIN users u ON u.id = o.user_id WHERE (COALESCE(cardinality(@statuses::text[]),0) = 0 OR o.status = ANY(@statuses::text[])) ORDER BY o.created_at DESC, o.id DESC` (đúng mẫu `ListOrdersByUser`).
- `GetOrderByAdminID :one` — cùng join, `WHERE o.id = $1`.
- `LockOrderForUpdateAdmin :one` — cùng join, `WHERE o.id = $1 FOR UPDATE`.
- Tái dùng: `ListOrderItemsByOrderID`, `ListOrderItemsByOrderIDs`, `SetOrderStatus`, `IncrementVariantStock`.
- `sqlc.yaml`: không thay đổi (money `::text`, `order_items.quantity` override đã có).

### Repository (`internal/repository/order_repository.go`)

- `ListByAdmin`: validate không cần; `ListOrdersByAdmin` + `ListOrderItemsByOrderIDs` (mẫu `ListByUser`), map `BuyerEmail` từ `buyer_email` column; trả `[]domain.Order{}` khi rỗng.
- `GetByAdminID`: validate UUID → `ErrOrderNotFound`; `GetOrderByAdminID` (ErrNoRows → `ErrOrderNotFound`) + `ListOrderItemsByOrderID`; map đầy đủ.
- `AdminTransition`: tx → `LockOrderForUpdateAdmin` (thiếu → `ErrOrderNotFound`) → `action.Transition()` (ok=false → `ErrOrderActionNotAllowed`) → nếu `restock`: `ListOrderItemsByOrderID` + `IncrementVariantStock` từng dòng → `SetOrderStatus(id, to, confirmedAt bảo toàn, cancelledAt = now khi to==cancelled còn không bảo toàn)` → `ListOrderItemsByOrderID` build items → commit; trả `Order` đầy đủ (gồm `BuyerEmail` từ row khóa). Mọi lỗi rollback.

### Usecase (`internal/usecase/order/order.go`)

- `AdminList(ctx, status string) ([]domain.Order, error)` — `status` rỗng = tất cả; khác phải là `OrderStatus.IsValid()` (sai → `ValidationError` field `status`); delegate `ListByAdmin` (statuses = [status] hoặc nil).
- `AdminGetByID(ctx, orderID) (*domain.Order, error)` — UUID sai → `ErrOrderNotFound`; delegate.
- `AdminTransition(ctx, orderID string, action domain.OrderAdminAction) (*domain.Order, error)` — UUID sai → `ErrOrderNotFound`; `!action.IsValid()` → `ValidationError` field `action`; delegate. Không set `CancellableUntil` (admin không hành động trên pending).

### Handler + routes (`internal/delivery/http/admin_order_handler.go`)

Nhóm `/api/v1/admin` (đã có `guard.AuthRequired` + `RequireAdmin`):

```
adminOrders.GET("", h.List)                          // ?status=&page=&limit=
adminOrders.GET("/:id", h.GetByID)
adminOrders.POST("/:id/confirm-preparing", h.ConfirmPreparing)
adminOrders.POST("/:id/ship", h.Ship)
adminOrders.POST("/:id/deliver", h.Deliver)
adminOrders.POST("/:id/cancel/approve", h.ApproveCancel)
adminOrders.POST("/:id/cancel/decline", h.DeclineCancel)
```

- `adminOrderResponse` = các field `orderResponse` (reuse `toOrderResponse`) + `buyerEmail string` (`json:"buyerEmail"`). Không set `cancellableUntil` cho admin.
- `List`: đọc `status` (mặc định rỗng), `page`/`limit` (mặc định `1`/`20`, cap `limit` ≤ 100); gọi `uc.AdminList`; phân trang **in-memory** tại handler theo đúng mẫu `catalog_handler.go:185-219` (slice + `PaginationMeta` + `writePaginatedSuccess`). Lý do: nhất quán với convention hiện có (catalog/admin products), khối lượng giới hạn.
- Các handler chuyển tiếp: map path → action, gọi `uc.AdminTransition`, trả 200 `adminOrderResponse`. Lỗi qua `writeError` (mapping chuẩn).

## Data Models

Không có migration mới — không thêm bảng/cột. `buyer_email` là giá trị tính từ join `users` (email đã tồn tại), không lưu snapshot riêng. `OrderAdminAction` là enum ứng dụng (không phải cột DB). Trạng thái `orders.status` đã đủ 8 giá trị (order-placement).

## Error Handling

Bổ sung vào `internal/domain/errors.go` + `internal/delivery/http/error.go`:

| Domain error | HTTP | code | message (VN) |
|---|---|---|---|
| `ErrOrderActionNotAllowed` | 409 | `order_action_not_allowed` | "Không thể thực hiện thao tác này trên đơn hàng ở trạng thái hiện tại" |
| `ErrOrderNotFound` (tái dùng) | 404 | `order_not_found` | "Không tìm thấy đơn hàng" |
| `ValidationError` (tái dùng) | 400 | `validation_error` | fields: `status`/`action`/`page`/`limit` |

`order_action_not_allowed` là lỗi kinh doanh (không `fields`) theo chuẩn AGENTS. Các thao tác trên đơn thuộc user nào cũng hợp lệ cho admin (không có khái niệm 404-ẩn phía admin — admin được xem mọi đơn; đơn không tồn tại → 404 chuẩn). Lỗi 500 → `internal` mặc định.

## Testing Strategy

Backend (theo mẫu hiện có — fake repository, không cần PostgreSQL):

- **domain** (`order_test.go`): `OrderAdminAction.IsValid`; bảng `Transition()` — 5 cặp from/to/restock đúng (đặc biệt `approve_cancel` → `cancelled` + restock=true).
- **order usecase** (fake `OrderRepository`): `AdminList` — status rỗng = tất cả, status hợp lệ truyền đúng, status sai → 400 `validation_error`; `AdminGetByID` — UUID sai/không tìm thấy → `ErrOrderNotFound`; `AdminTransition` — action hợp lệ delegate đúng, action sai → 400, UUID sai → 404.
- **order handler** (`admin_order_handler_test.go`, theo mẫu `admin_catalog_handler_test.go`): auth — thiếu token → 401, role customer → 403 message VN, role admin → cho phép; list — phân trang đúng `PaginationMeta`, lọc status, rỗng, cap limit, lỗi filter → 400; detail — 200 đầy đủ + `buyerEmail`, 404; 5 chuyển tiếp — 200 trả `adminOrderResponse`, sai trạng thái → 409 `order_action_not_allowed`, đơn không tồn tại → 404.
- **Toàn vẹn transition/hoàn kho (R7.1):** `AdminTransition` chạy trong 1 tx (khóa dòng + hoàn kho + set status + commit; lỗi → rollback) — bảo đảm bằng thiết kế SQL; verify `make gen`/`make vet`/`make test` như order-placement.

Frontend-admin (vitest, mock `api/orders.ts`):

- `OrdersPage`: render danh sách (mã/trạng thái/email/người nhận/phone/địa chỉ/tổng/số dòng/thời gian); lọc trạng thái → refetch; chuyển trang → refetch; empty state; loading; lỗi + nút thử lại (mẫu `CategoriesPage`).
- `AdminOrderDetailPage`: render đầy đủ thông tin; nút hành động theo trạng thái (confirmed→"Xác nhận chuẩn bị hàng"; preparing→"Bàn giao vận chuyển"; shipped→"Đánh dấu đã giao"; cancel_requested→"Duyệt hủy" + "Từ chối hủy"; khác→không nút); "Duyệt hủy" mở AlertDialog cảnh báo hoàn kho trước khi xác nhận; mutation thành công → cập nhật query + message thành công; lỗi kinh doanh → `apiMessage` hiển thị.
- `AdminLayout`: có mục "Đơn hàng".

Verification: `go test ./...`, `go vet ./...`, `make gen`; frontend-admin `npm run lint`, `npm test`, `npm run build`.

## Requirement Traceability

| Requirement | Design Elements | Verification |
|---|---|---|
| 1.1–1.3 | Group `/api/v1/admin` + `guard.AuthRequired` + `RequireAdmin`; handler test auth | admin_order_handler_test |
| 2.1–2.8 | `AdminList`/`ListOrdersByAdmin` + `List` handler (lọc status, `writePaginatedSuccess`, in-memory slice); frontend OrdersPage (lọc + phân trang + empty/loading/error) | usecase/handler tests; OrdersPage tests |
| 3.1–3.2 | `AdminGetByID`/`GetOrderByAdminID` join `users.email`; `adminOrderResponse` (3.1); 404 | usecase/handler tests; AdminOrderDetailPage tests |
| 4.1–4.2 | `confirm_preparing` (confirmed→preparing) + `ErrOrderActionNotAllowed` | domain/usecase/handler tests |
| 5.1–5.2 | `ship` (preparing→shipped) | domain/usecase/handler tests |
| 6.1–6.2 | `deliver` (shipped→delivered) | domain/usecase/handler tests |
| 7.1–7.3 | `approve_cancel` (cancel_requested→cancelled + hoàn kho trong 1 tx); terminal `cancelled` không còn action hợp lệ | domain/usecase/handler tests |
| 8.1–8.2 | `decline_cancel` (cancel_requested→preparing) | domain/usecase/handler tests |
| 9.1–9.6 | `AdminLayout` nav; OrdersPage; AdminOrderDetailPage + AlertDialog xác nhận "Duyệt hủy"; message thành công/lỗi VN (mẫu CategoriesPage); loading/error | OrdersPage/AdminOrderDetailPage/AdminLayout tests |

## Existing System Integration

- **Downstream impact — luồng khách hàng (order-placement):** không đổi. Customer `Cancel`/`UndoCancelRequest`/auto-confirm giữ nguyên; admin chỉ bổ sung đường chuyển tiếp chưa từng xảy ra. `cancel_requested` nay có hướng kết thúc (admin duyệt/từ chối) — khớp quy tắc order-placement: duyệt hủy **hoàn kho** (giống R7.3 instant-cancel), từ chối → về `preparing`. Storefront `OrderDetailPage`/`OrderHistoryPage` đã xử lý sẵn các trạng thái này (không cần sửa). Auto-confirm filter `status='pending_confirmation'` không bị ảnh hưởng bởi trạng thái admin tạo ra.
- **Downstream impact — frontend-admin:** thêm 2 route + nav "Đơn hàng"; Dashboard (Spec 4 tương lai) sẽ tái dùng dữ liệu đơn nhưng ngoài phạm vi.
- **Supporting dependencies (đã đủ):** phân quyền admin (`guard.RequireAdmin`, role trong JWT); dữ liệu đơn/order_items/`users.email`; hoàn kho (`IncrementVariantStock`); phân trang (`PaginationMeta`/`writePaginatedSuccess`/`apiClientWithMeta`); AlertDialog/Table/Select/Badge/Badge (admin đã có); pattern message `apiMessage` (CategoriesPage). Không tạo capability song song.
- **Compatibility:** mọi endpoint mới nằm dưới `/api/v1/admin` theo Full Status Envelope; không đổi contract khách hàng; không cần migration/config/Wire mới (handler tái dùng `deps.Order`).