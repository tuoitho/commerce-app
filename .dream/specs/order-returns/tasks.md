# Kế hoạch triển khai

- [x] 1. Ổn định order và return persistence contracts

- [x] 1.1 Mở rộng schema return và order delivery state
  - **Produces:** Migration `000012_expand_order_returns`, sqlc generated bindings, `partially_returned` order status và `deliveredAt` được persist/map qua customer/admin order contracts.
  - **Scope:** TDD migration constraints/backfill/indexes và down-migration precondition khi có partial-return data; sửa deliver transaction đặt `delivered_at`; mở rộng mọi order query/domain/handler/type/filter/bucket liên quan; giữ các transition/bucket khác không đổi; chạy migration/sqlc generation.
  - **Consumes:** Existing `orders`, `order_items`, `return_requests`, `return_request_items`, order transition conventions và schema contract từ design.
  - **Acceptance:** Schema thực thi một open request, một refunded request mỗi order, unique selected item và refund invariants; deliver đặt timestamp đúng một lần; partial/full return statuses hợp lệ; down migration từ chối rõ ràng thay vì biến đổi partial-return rows; returns bucket gồm cả hai trạng thái; existing order lifecycle không regression.
  - **Verification:** Migration up/down/integration tests, focused order domain/repository/usecase/handler tests, `make db-up`, `make gen` và generated diff inspection.
  - _Requirements: 1.2, 1.3, 1.4, 1.5, 5.4, 5.5, 6.1, 6.2, 6.7, 7.4, 7.5_

- [x] 2. Xây dựng backend return workflows

- [x] 2.1 Triển khai customer create, projection và cancellation
  - **Produces:** Authenticated create/cancel APIs, return domain/repository/use case, additive order eligibility/latest-request projection và Wire/router integration.
  - **Scope:** TDD deadline `Asia/Ho_Chi_Minh`, ownership/open/refunded checks, strict JSON item-ID selection, server full-quantity/refund calculation, transaction create/cancel, batch latest-request loading, customer payload/error mapping.
  - **Consumes:** Schema/order contracts task 1.1; caller ID từ auth; canonical order/item snapshots, `deliveredAt`, shipping fee và exact customer HTTP contract.
  - **Acceptance:** Customer nhận eligibility/deadline/current request không cần ID ngoài order response; create chỉ nhận unique owned item IDs, tính partial/full refund chính xác, chống tampering/race và hỗ trợ retry sau cancel/reject trong 7 ngày; cancel chỉ owner/pending; responses dùng envelope và không lộ order khác.
  - **Verification:** Deadline boundary tests, use case tests, transaction/concurrency integration tests, handler/auth/error tests và order query-count test chống N+1.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 3.1, 3.2, 3.3, 3.4, 7.1, 7.2, 7.4, 7.5_

- [x] 2.2 Triển khai admin list, detail, approve và reject
  - **Produces:** Paginated admin return list/detail APIs và locked approve/reject transitions với admin payload/audit timestamps.
  - **Scope:** TDD status/page/limit filters, stable database pagination, summary/detail projections, admin guard, reject validation và compare-current-state transitions; register routes/Wire without changing existing admin order APIs.
  - **Consumes:** Return repository/models task 2.1, existing admin auth guard/user ID, users.email và approved admin HTTP/error contracts.
  - **Acceptance:** Admin list/filter/detail trả đúng selected snapshots/refund/timeline; non-admin bị chặn; approve/reject chỉ từ pending; reject reason 1-1.000 chars; competing/repeated actions chỉ một thành công; customer data ngoài contract không bị lộ.
  - **Verification:** Repository pagination tests, use case state-machine/concurrency tests, handler envelope/auth/field tests và existing admin order regression suite.
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 7.3, 7.4, 7.5_

- [x] 2.3 Triển khai receive, restock và refund transitions
  - **Produces:** Admin active/inactive variant-options lookup, receive/refund APIs, persisted physical-variant mapping, all-or-nothing restock, refund audit metadata, atomic `partially_returned`/`returned` order transition và stable refunded-item persistence predicate.
  - **Scope:** TDD searchable/paginated variant projection, exact receive mapping validation, request/order lock ordering, physical-variant stock increments exactly once, rollback on any item failure, refund amount/status/admin audit, partial/full selected-set classification and duplicate/concurrent transition handling; expose persisted item predicate through repository queries needed for integration tests.
  - **Consumes:** State machine/admin payload task 2.2, order/return schema task 1.1, existing variant stock update và caller admin ID.
  - **Acceptance:** Admin finds active/inactive variants without knowing UUID; receive requires one valid physical variant per returned line and increments full quantities atomically while preserving active flags; refund only from received and uses expected amount; full request returns order, partial request partially returns order; no second refund/request; selected items have canonical refunded state and request/item/order completion is atomically visible.
  - **Verification:** Variant lookup repository/handler tests, receive mapping validation, transaction/failure/concurrency tests, active/inactive/wrong-variant stock assertions, full/partial order response tests and refunded-item predicate/atomic visibility integration tests.
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 7.3, 7.4, 7.5_

- [x] 3. Hoàn thiện customer và admin interfaces

- [x] 3.1 Xây dựng customer return experience trong lịch sử đơn
  - **Produces:** `returnsApi`, return types/dialog/status/timeline controls và tích hợp Order History/Order Detail cho eligibility, create, cancel và partial/full return states.
  - **Scope:** TDD item selection, immutable quantities, local refund preview including shipping only full-order, reason/description validation, loading/error/retry/success refresh; update status buckets/types and responsive accessible controls.
  - **Consumes:** Additive order/customer APIs task 2.1, resulting states task 2.3, existing auth/ApiError/toast/dialog/order snapshots.
  - **Acceptance:** Customer nhận biết action/status theo từng line, chọn một hoặc nhiều lines, không chỉnh quantity, thấy refund đúng, create/cancel không reload page và theo dõi timeline; selected và unselected lines hiển thị đúng qua pending/refunded/rejected/cancelled; returned/partially-returned xuất hiện trong returns bucket; keyboard/screen reader/mobile 320 px hoạt động; unrelated order/cart/review placeholders không regression.
  - **Verification:** API module tests, dialog/form interaction tests, Order History/Detail tests, frontend lint/full test/build và desktop/mobile keyboard/visual checks.
  - _Requirements: 1.1, 1.5, 1.7, 2.1, 2.2, 2.3, 2.5, 2.6, 2.7, 2.10, 3.1, 3.2, 3.4, 6.1, 6.2, 6.7, 7.1, 7.2, 7.5, 7.6, 7.7, 7.8_

- [x] 3.2 Xây dựng admin return management experience
  - **Produces:** `adminReturnsApi`, `/returns` list, `/returns/:id` detail/actions, admin navigation entry và responsive mobile admin shell.
  - **Scope:** TDD React Query list/filter/pagination/detail, debounced active/inactive variant lookup and one mapping per returned line, action visibility, approve/reject/receive/refund flows, reject/receive field errors, invalidation of return/order queries and loading/conflict states; adapt fixed sidebar/header to accessible mobile navigation while preserving desktop layout.
  - **Consumes:** Admin APIs tasks 2.2-2.3, existing `GET /api/v1/admin/orders/:id` as canonical order-information source, existing admin client/auth/React Query/UI primitives và approved summary/detail payloads.
  - **Acceptance:** Admin tìm/lọc/xem đúng request và selected items cùng mã/status/email/payment/created/delivered/total từ canonical order API, tìm được physical variant active/inactive bằng nhãn thay vì UUID và map đủ từng line, chỉ thấy action hợp lệ, reject/receive validation bind đúng field, actions refresh timeline/refund/order state, non-admin guard remains intact; 320 px has no unintended horizontal overflow and primary actions/focus remain reachable.
  - **Verification:** API tests, list/detail/action page tests, responsive navigation interaction tests, admin lint/full test/build và representative desktop/mobile keyboard/visual checks.
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.8, 5.9, 5.10, 7.3, 7.5, 7.6, 7.7, 7.8_
