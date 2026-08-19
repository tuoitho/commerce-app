# Implementation Plan

Dependency order và ranh giới file: backend tuần tự `1.1 → 1.2 → 1.3 → 1.4` (chạm chung `domain/order.go`, `db/queries/orders.sql`, `order_repository.go`, `usecase/order`); frontend-admin tuần tự `2.1 → 2.2 → 2.3` (chạm chung `types.ts`, `App.tsx`, `AdminLayout`). Frontend tiêu thụ hợp đồng HTTP từ `design.md` (canonical contract). Không cần migration mới, config mới hay Wire regen (handler admin tái dùng usecase `Order` đã có trong `Dependencies`).

- [x] 1. Backend: admin order management

- [x] 1.1 Hợp đồng domain & query sqlc admin
  - **Produces:** `internal/domain/order.go` thêm `BuyerEmail string` vào `Order`; enum `OrderAdminAction` (`confirm_preparing`, `ship`, `deliver`, `approve_cancel`, `decline_cancel`) + `IsValid()` + `Transition() (from, to OrderStatus, restock bool, ok bool)` (bảng: confirmed→preparing, preparing→shipped, shipped→delivered, cancel_requested→cancelled+restock, cancel_requested→preparing); `ErrOrderActionNotAllowed` trong `errors.go`; mở rộng interface `OrderRepository` (`ListByAdmin`, `GetByAdminID`, `AdminTransition`); thêm query `db/queries/orders.sql`: `ListOrdersByAdmin :many`, `GetOrderByAdminID :one`, `LockOrderForUpdateAdmin :one` (join `users` lấy `email AS buyer_email`, lọc `status = ANY` theo mẫu `ListOrdersByUser`); chạy `make gen`.
  - **Scope:** hợp đồng + bảng chuyển tiếp + query/binding; không cài repository/usecase/handler.
  - **Consumes:** design (bảng chuyển tiếp, query); enum trạng thái hiện có từ order-placement.
  - **Acceptance:** `make gen` không drift; `go build`/`go vet` sạch; `Transition()` trả đúng from/to/restock cho cả 5 action (riêng `approve_cancel` restock=true) và `ok=false` cho action lạ; query trả đủ cột order + `buyer_email`.
  - **Verification:** test `domain/order_test.go` cho `IsValid`/`Transition`; `make gen`, `go build`, `go vet`.
  - _Requirements: 2.3, 3.1, 4.1–4.2, 5.1–5.2, 6.1–6.2, 7.1–7.3, 8.1–8.2_

- [x] 1.2 Repository admin: danh sách, chi tiết, chuyển tiếp
  - **Produces:** `OrderRepository.ListByAdmin(ctx, statuses []string)` (dùng `ListOrdersByAdmin` + `ListOrderItemsByOrderIDs`, map `BuyerEmail`, mẫu `ListByUser`); `GetByAdminID(ctx, orderID)` (validate UUID → `ErrOrderNotFound`; `GetOrderByAdminID` ErrNoRows → `ErrOrderNotFound`; kèm items); `AdminTransition(ctx, orderID, action)` trong 1 tx — `LockOrderForUpdateAdmin` (thiếu → `ErrOrderNotFound`) → `action.Transition()` (ok=false → `ErrOrderActionNotAllowed`) → nếu restock: `ListOrderItemsByOrderID` + `IncrementVariantStock` từng dòng → `SetOrderStatus` (`confirmed_at` bảo toàn; `cancelled_at` = now khi đến `cancelled`, còn không bảo toàn) → load items → commit; mọi lỗi rollback; trả `Order` đầy đủ kèm `BuyerEmail`.
  - **Scope:** triển khai persistence + transaction chuyển tiếp; không đổi query phi admin hiện có.
  - **Consumes:** 1.1 (interface, bảng Transition, binding).
  - **Acceptance:** `go build`/`go vet` sạch; luồng tx đúng (khóa dòng, hoàn kho đủ các dòng, set status, commit); sai trạng thái → `ErrOrderActionNotAllowed`; đơn không tồn tại → `ErrOrderNotFound`.
  - **Verification:** review luồng tx + `make gen` diff + `go vet` (không có unit test DB theo convention repo).
  - _Requirements: 2.1–2.3, 3.1–3.2, 4.1–4.2, 5.1–5.2, 6.1–6.2, 7.1–7.3, 8.1–8.2_

- [x] 1.3 Usecase admin: danh sách, chi tiết, chuyển tiếp
  - **Produces:** `orderuc.UseCase.AdminList(ctx, status string)` (status rỗng = tất cả; khác phải `OrderStatus.IsValid()` → sai `ValidationError` field `status`); `AdminGetByID(ctx, orderID)` (UUID sai → `ErrOrderNotFound`); `AdminTransition(ctx, orderID, action)` (UUID sai → `ErrOrderNotFound`; `!action.IsValid()` → `ValidationError` field `action`); delegate repo tương ứng; không set `CancellableUntil`.
  - **Scope:** validation đầu vào + delegate; không cài logic DB.
  - **Consumes:** 1.1 (domain), 1.2 (repo impl).
  - **Acceptance:** test usecase (fake repo) — `AdminList`: rỗng/all/hợp lệ/sai → validation; `AdminGetByID`: 404 khi UUID sai hoặc repo trả `ErrOrderNotFound`; `AdminTransition`: action hợp lệ delegate đúng, action sai → 400, UUID sai → 404.
  - **Verification:** test `usecase/order` (fake repo theo mẫu hiện có).
  - _Requirements: 2.1–2.3, 3.1–3.2, 4.1–4.2, 5.1–5.2, 6.1–6.2, 7.1–7.3, 8.1–8.2_

- [x] 1.4 Handler admin + routes + test
  - **Produces:** `internal/delivery/http/admin_order_handler.go` — `adminOrderResponse` (reuse `toOrderResponse` + `buyerEmail`, không `cancellableUntil`); handler `List` (parse `status`/`page`/`limit` mặc định 1/20, cap limit ≤ 100; gọi `uc.AdminList`; phân trang in-memory + `PaginationMeta` + `writePaginatedSuccess` theo mẫu `catalog_handler.go:185-219`), `GetByID`, `ConfirmPreparing`, `Ship`, `Deliver`, `ApproveCancel`, `DeclineCancel` (map path → action → `uc.AdminTransition` → 200 `adminOrderResponse`); đăng ký trong `router.go` dưới group `/api/v1/admin` (`guard.AuthRequired` + `RequireAdmin`) với các path `GET ""`, `GET "/:id"`, `POST "/:id/confirm-preparing"`, `POST "/:id/ship"`, `POST "/:id/deliver"`, `POST "/:id/cancel/approve"`, `POST "/:id/cancel/decline"`; test handler (`admin_order_handler_test.go` theo mẫu `admin_catalog_handler_test.go`).
  - **Scope:** HTTP layer + test auth/pagination/lỗi/chuyển tiếp; không đổi handler/customer route.
  - **Consumes:** 1.1, 1.3 (usecase); envelope/middleware hiện có.
  - **Acceptance:** test — 401 thiếu token, 403 role customer (message VN), admin cho phép; `List` đúng `PaginationMeta` (page/limit/total/totalPages/hasNext/hasPrev), lọc status, empty, cap limit, status sai → 400; `GetByID` 200 có `buyerEmail`, 404; mỗi chuyển tiếp 200 trả `adminOrderResponse`, sai trạng thái → 409 `order_action_not_allowed` message VN, đơn không tồn tại → 404.
  - **Verification:** `go test ./internal/delivery/http -run AdminOrder`, `make test`, `make vet`.
  - _Requirements: 1.1–1.3, 2.1–2.8, 3.1–3.2, 4.1–4.2, 5.1–5.2, 6.1–6.2, 7.1–7.3, 8.1–8.2_

- [x] 2. Frontend-admin: trang đơn hàng

- [x] 2.1 Types & API module orders
  - **Produces:** `src/api/types.ts` thêm `OrderStatus` (8 giá trị + nhãn VN), `OrderItem`, `Order`, `AdminOrder` (kế thừa Order + `buyerEmail`); `src/api/orders.ts` — `getAdminOrders({status?, page?, limit?})` → `ApiResponseWithMeta<AdminOrder[]>` (dùng `apiClientWithMeta`), `getAdminOrder(id)`, `adminConfirmPreparing(id)`, `adminShip(id)`, `adminDeliver(id)`, `adminApproveCancel(id)`, `adminDeclineCancel(id)` (dùng `apiClient`, path đúng 5 endpoint POST); test module (mock fetch theo mẫu `products.test.ts`).
  - **Scope:** typed client + types; không cài page.
  - **Consumes:** contract HTTP admin từ design (path, payload `buyerEmail`, pagination meta).
  - **Acceptance:** build sạch; mỗi hàm map đúng method/path/query; `getAdminOrders` truyền `page`/`limit`/`status` đúng; test gọi đúng endpoint và parse `ApiResponseWithMeta`.
  - **Verification:** `npm run lint`, `npm test`, `npm run build`.
  - _Requirements: 9.2–9.6_

- [x] 2.2 Trang danh sách đơn hàng + nav
  - **Produces:** `src/pages/OrdersPage.tsx` (route `/orders` trong `App.tsx`): react-query `useQuery(['admin-orders', status, page])` gọi `getAdminOrders`; bộ lọc trạng thái bằng `Select` (Tất cả + 8 trạng thái); bảng `Table` (mã đơn, trạng thái `Badge`, email người mua, tên người nhận, phone, địa chỉ tỉnh/phường-xã/chi tiết, tổng tiền, số dòng sản phẩm, thời gian tạo); nhấn dòng → `/orders/:id`; phân trang Prev/Next + thông tin trang dùng `meta.pagination`; loading row, empty state, lỗi + nút "Thử lại" (mẫu `CategoriesPage`); thêm mục "Đơn hàng" vào `AdminLayout` nav; test vitest.
  - **Scope:** danh sách + lọc + phân trang + entry point nav.
  - **Consumes:** 2.1; contract `GET /admin/orders`.
  - **Acceptance:** render đủ cột theo 2.2 requirements; đổi filter/trang → gọi API đúng tham số; `meta.pagination` điều khiển Prev/Next đúng; empty/loading/error đúng; nav "Đơn hàng" hiển thị và active đúng route.
  - **Verification:** vitest tests + `npm run lint` + `npm run build`.
  - _Requirements: 2.1–2.8, 9.1–9.2, 9.6_

- [x] 2.3 Trang chi tiết đơn hàng + hành động theo trạng thái
  - **Produces:** `src/pages/AdminOrderDetailPage.tsx` (route `/orders/:id`): render đầy đủ (trạng thái, thanh toán, email người mua, thông tin giao hàng, bảng items, tạm tính/phí/tổng, thời gian tạo/cập nhật/confirmed/cancelled); nút hành động theo trạng thái — `confirmed` → "Xác nhận chuẩn bị hàng"; `preparing` → "Bàn giao vận chuyển"; `shipped` → "Đánh dấu đã giao"; `cancel_requested` → "Duyệt hủy" (mở `AlertDialog` cảnh báo "sẽ hủy đơn và khôi phục tồn kho") + "Từ chối hủy"; trạng thái khác → không nút; mutation react-query gọi 5 hàm API tương ứng, thành công → invalidate `['admin-orders']` + `['admin-order', id]` + message thành công; lỗi → `apiMessage(err, fallback)` (mẫu CategoriesPage); test vitest.
  - **Scope:** chi tiết + hành động; không quản lý danh sách.
  - **Consumes:** 2.1; contract `GET /admin/orders/:id`, 5 POST transition.
  - **Acceptance:** mỗi trạng thái render đúng nút theo 9.3; "Duyệt hủy" yêu cầu xác nhận qua AlertDialog nêu rõ hoàn kho; mutation thành công cập nhật query + message VN; lỗi kinh doanh (`order_action_not_allowed`...) hiển thị message VN; detail 404 → thông báo.
  - **Verification:** vitest tests + `npm run lint` + `npm run build`.
  - _Requirements: 3.1–3.2, 4.1–4.2, 5.1–5.2, 6.1–6.2, 7.1–7.3, 8.1–8.2, 9.3–9.6_