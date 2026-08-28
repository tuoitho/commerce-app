# Tài liệu thiết kế

## Tổng quan

Tính năng được triển khai như miền `return` độc lập ở backend, tích hợp additive vào customer order response, cùng workflow customer trong frontend và workflow xử lý riêng trong frontend-admin. Schema `return_requests`/`return_request_items` hiện có được mở rộng thay vì tạo nguồn dữ liệu song song.

`orders` và `order_items` tiếp tục là nguồn sự thật cho ownership, thời điểm giao, sản phẩm, số lượng, giá và phí vận chuyển. Một return request chỉ nhận danh sách order item ID; backend tự lấy toàn bộ quantity và tính refund. Request `refunded` là nguồn sự thật để xác định item đã trả và là contract mà feature review tiêu thụ.

Thiết kế bao phủ yêu cầu 1.1-7.8 và tạo prerequisite kỹ thuật ổn định cho `purchased-product-reviews`.

## Kiến trúc

```text
Customer/Admin HTTP handlers -> return use case -> ReturnRepository -> PostgreSQL/sqlc
                                      |
                                      +-> order/item state and stock in same transaction

Customer order handler -> order use case -> OrderRepository
                                      |
                                      +-> latest return projection/eligibility
```

- `domain`: sở hữu return status/reason/models/errors, state-transition rules và `ReturnRepository` interface.
- `usecase/return`: validation, deadline theo `Asia/Ho_Chi_Minh`, authorization, refund calculation và customer/admin operations.
- `repository`: transaction locks, request/item persistence, stock increment, order transition và paginated queries.
- `delivery/http`: customer/admin JSON contracts và Full Status Envelope.
- Customer frontend: return dialog/tracking trong Order History và Order Detail.
- Admin frontend: return list/detail/actions qua React Query và route riêng.

### State machine

```text
pending_approval -> approved -> received -> refunded
       |              |
       +-> rejected   +-- invalid transition otherwise
       |
       +-> cancelled (customer only)
```

- Mỗi transition dùng transaction, khóa return request bằng `FOR UPDATE` và kiểm tra current source status.
- Create khóa order trước khi kiểm tra eligibility/open/refunded request.
- Receive khóa request và order, tăng stock tất cả selected variants rồi mới đặt `received` trong cùng transaction.
- Refund khóa request và order, đặt refund metadata và order `partially_returned`/`returned` trong cùng transaction.
- Return refund khóa order trước khi ghi item-level refunded state. Contract cho consumer yêu cầu review create cũng khóa order trước khi đọc predicate; lock order là serialization boundary thống nhất và được thực thi ở downstream review feature.

### Thời hạn

Khi admin transition `shipped -> delivered`, transaction đặt `orders.delivered_at = now()` lần đầu. Return deadline là cuối ngày thứ 7 sau local delivery date trong IANA timezone `Asia/Ho_Chi_Minh`. Ví dụ giao lúc bất kỳ thời điểm nào ngày 1/9 thì deadline là `2026-09-08T23:59:59.999999999+07:00`. Backend trả instant UTC tương ứng qua API; UI format theo local time.

Order delivered cũ đã được migration 000010 backfill `delivered_at`; query/domain/response hiện thiếu field này và được mở rộng.

## Thành phần và giao diện

### Shared return payload

```json
{
  "id": "uuid",
  "orderId": "uuid",
  "userId": "uuid",
  "status": "pending_approval",
  "reasonCode": "defective",
  "description": "Màn hình lỗi",
  "rejectReason": "",
  "expectedRefundVnd": "25000000",
  "refundAmountVnd": null,
  "items": [
    {
      "orderItemId": "uuid",
      "variantId": "uuid",
      "productId": "uuid",
      "brandName": "Apple",
      "productName": "iPhone",
      "model": "A123",
      "imageUrl": "/image.webp",
      "options": [{ "groupLabel": "Màu", "valueLabel": "Đen" }],
      "quantity": 1,
      "unitPriceVnd": "25000000",
      "lineTotalVnd": "25000000",
      "receivedVariantId": null
    }
  ],
  "createdAt": "2026-08-27T10:00:00Z",
  "updatedAt": "2026-08-27T10:00:00Z",
  "approvedAt": null,
  "rejectedAt": null,
  "receivedAt": null,
  "refundedAt": null,
  "cancelledAt": null,
  "refundedByUserId": null
}
```

Các timestamp chưa xảy ra, refund fields và `receivedVariantId` chưa có là `null`, không omitted. `items` theo thứ tự order item ID ổn định. Customer payload không trả `userId`, `refundedByUserId` hoặc `receivedVariantId`; admin payload trả các field audit này và thêm `buyerEmail`. Timeline UI được dựng từ status/timestamps, không có event store riêng.

### Customer API

Các route dùng `AuthRequired`:

- `POST /api/v1/orders/:id/returns` -> `201`, tạo request.
- `POST /api/v1/orders/:id/returns/:returnId/cancel` -> `200`, hủy pending request.

Create body:

```json
{
  "orderItemIds": ["uuid"],
  "reasonCode": "defective",
  "description": "Màn hình lỗi"
}
```

- `orderItemIds`: bắt buộc 1 phần tử trở lên, UUID duy nhất, tất cả thuộc order. API không nhận quantity/refund/product/user; unknown JSON fields bị từ chối với `fields.body`.
- `reasonCode`: một trong bốn giá trị đã duyệt.
- `description`: trim hai đầu; whitespace thành rỗng; tối đa 1.000 Unicode characters.
- Repository lấy snapshot/quantity/line total hiện có. Full-order request được xác định khi tập selected item ID bằng toàn bộ item ID của order.
- `expectedRefundVnd` là tổng selected `line_total_vnd`, cộng `shipping_fee_vnd` chỉ cho full-order request.

### Customer order contract mở rộng

Mọi customer `Order` response thêm:

```json
{
  "deliveredAt": "2026-08-27T10:00:00Z",
  "returnEligibility": {
    "eligible": true,
    "deadline": "2026-09-03T16:59:59.999999999Z"
  },
  "latestReturnRequest": null
}
```

- `deliveredAt` nullable; có giá trị cho `delivered`, `partially_returned`, `returned`.
- `returnEligibility.deadline` nullable; chỉ có khi `deliveredAt` tồn tại. `eligible` chỉ true khi order hiện `delivered`, trong deadline, không có open request và chưa từng có refunded request.
- `latestReturnRequest` là customer payload mới nhất theo `created_at DESC, id DESC`, hoặc null.
- Order lists batch-load latest requests/items, không query theo từng order.

Customer không cần API lookup riêng; order history/detail đã cung cấp order/item IDs, eligibility và latest state cần cho workflow.

### Admin API

Tất cả route dùng `AuthRequired` và `RequireAdmin`:

- `GET /api/v1/admin/returns?status=&page=1&limit=20`
- `GET /api/v1/admin/returns/variant-options?q=&page=1&limit=20`
- `GET /api/v1/admin/returns/:returnId`
- `POST /api/v1/admin/returns/:returnId/approve`
- `POST /api/v1/admin/returns/:returnId/reject` body `{ "rejectReason": "..." }`
- `POST /api/v1/admin/returns/:returnId/receive`
- `POST /api/v1/admin/returns/:returnId/refund`

List filter nhận rỗng hoặc một return status; page mặc định 1, limit mặc định 20 và tối đa 100. Query database phân trang theo `created_at DESC, id DESC`, dùng `writePaginatedSuccess`. Mỗi list summary gồm `id`, `orderId`, `status`, `buyerEmail`, `reasonCode`, `expectedRefundVnd` và `createdAt`; không gồm `items`/description. Detail và action responses dùng full admin payload.

Reject reason trim, bắt buộc 1-1.000 Unicode characters. Refund không nhận body. Receive body phải chứa đúng một mapping cho mỗi selected return item:

```json
{
  "items": [
    { "orderItemId": "uuid", "receivedVariantId": "uuid" }
  ]
}
```

Mapping thiếu/trùng/ngoài request hoặc variant không tồn tại trả `validation_error` với key `items`; không update stock/request một phần. Backend tăng quantity của `receivedVariantId` theo full returned quantity của order item tương ứng và persist mapping audit. Admin ID lấy từ auth context, không từ client.

Variant-options lookup tìm theo brand/product name/model/option labels, gồm cả product hoặc variant inactive, sắp xếp ổn định và phân trang mặc định 20, tối đa 100. Mỗi option trả `variantId`, `productId`, `brandName`, `productName`, `model`, `options`, `stockQuantity`, `productActive`, `variantActive`; UI hiển thị nhãn từ các field này thay vì UUID. Static `/variant-options` route được đăng ký trước `/:returnId`.

Trang admin return detail lấy các field order bắt buộc từ capability hiện có `GET /api/v1/admin/orders/:id`: `id`, `status`, `buyerEmail`, `paymentMethod`, `createdAt`, `deliveredAt`, `totalVnd`. Return detail API không lặp order projection này; frontend tải return detail và admin order detail theo `orderId`.

### Order status contract

Thêm `partially_returned` vào backend/customer/admin `OrderStatus`, validation, database CHECK, labels/badges và filters. Bucket customer `returns` ánh xạ cả `partially_returned` và `returned`. Existing `delivered` bucket chỉ ánh xạ `delivered`; các bucket khác không đổi.

Admin delivery transition được sửa để persist `delivered_at`; tất cả order queries/mappers trả field đó. Refund là producer duy nhất trong application cho:

- `delivered -> partially_returned` nếu selected item set là proper subset của order items.
- `delivered -> returned` nếu selected item set bằng toàn bộ order items.

### Item-level contract cho review

Canonical persisted predicate:

```sql
EXISTS (
  SELECT 1
  FROM return_requests rr
  JOIN return_request_items rri ON rri.return_request_id = rr.id
  WHERE rr.status = 'refunded' AND rri.order_item_id = :order_item_id
)
```

- Item matching predicate này không được tạo review mới.
- Review đã tồn tại không bị xóa/ẩn và quyền edit còn lại không đổi.
- Item không matching vẫn có thể review khi order là `delivered` hoặc `partially_returned`.
- Downstream review create phải khóa cùng order trước khi kiểm tra predicate/current state, bảo đảm cùng item không được review mới sau refund commit. Việc triển khai và kiểm thử consumer thuộc feature `purchased-product-reviews`; order-returns sở hữu persisted predicate và atomic producer.

Đây là shared persistence contract giữa hai feature; review không sao chép cờ `returned` vào bảng riêng.

### Frontend

Customer:

- `returnsApi` và wire types trong `frontend/src/api/`.
- `ReturnRequestDialog` chọn một hoặc nhiều order lines, hiển thị full quantity/read-only refund calculation, reason/description và confirmation.
- Reusable return status/timeline controls ở Order History/Detail, local refresh sau create/cancel.
- Additive `partially_returned` labels/buckets và `deliveredAt`/return projection types.

Admin:

- `adminReturnsApi`, return list page `/returns`, detail page `/returns/:id`, nav entry và status filters.
- Detail page render request/order/items/refund/timeline và chỉ action hợp lệ theo current status; reject dialog bind field error.
- React Query invalidates return list/detail và affected order query sau action.
- Existing fixed-width admin shell phải chuyển sang responsive sidebar/drawer ở mobile để return pages và primary actions dùng được từ 320 CSS px; desktop composition hiện có được giữ.

## Mô hình dữ liệu

Migration `000012_expand_order_returns.up.sql`/`.down.sql`:

1. Thay orders status CHECK để thêm `partially_returned`.
2. Mở rộng `return_requests`:
   - `expected_refund_amount_vnd numeric NOT NULL`, integer VND, > 0.
   - CHECK `char_length(description) <= 1000`.
   - CHECK `char_length(reject_reason) <= 1000` và rejected request phải có reject reason không rỗng.
   - Refunded request phải có `refund_amount_vnd`, `refunded_by_user_id`, `refunded_at`.
3. Thay unique open index để bao gồm `pending_approval`, `approved`, `received`.
4. Thêm unique partial index `(order_id) WHERE status = 'refunded'` để một successful refund mỗi order.
5. Thêm unique `(return_request_id, order_item_id)` cho return items.
6. Thêm `return_request_items.received_variant_id uuid NULL REFERENCES product_variants(id) ON DELETE RESTRICT`; field chỉ được set khi transition sang `received` và được dùng làm inventory audit source.

Nếu có row return cũ, migration backfill `expected_refund_amount_vnd` từ selected quantity × snapshot order item unit price và cộng shipping khi selected set bao phủ toàn order; data không thỏa invariant mới làm migration fail thay vì bị xóa. Refund amount hiện có được giữ.

Down migration kiểm tra trước và chủ động fail với lỗi rõ ràng nếu còn bất kỳ order `partially_returned`; operator phải xử lý dữ liệu theo policy vận hành trước khi rollback. Down migration không tự đổi `partially_returned` thành `delivered`/`returned` và không làm mất semantic persisted state. Up/down integration test phải bao phủ cả database chưa dùng feature và database có partial-return row.

Không thêm quantity returned vào order item: mỗi request item lưu full original quantity và transaction create xác nhận equality. `return_request_items` là item-level refunded source cho review.

`delivered_at` đã tồn tại từ migration 000010; query/update/domain/API được sửa, không tạo cột mới. Sau migration chạy `make db-up` và `make gen`; thay đổi providers chạy `make wire`.

## Xử lý lỗi

| HTTP/code | Trường hợp |
|---|---|
| `400 validation_error` | `orderItemIds`, `reasonCode`, `description`, `rejectReason`, `status`, `page`, `limit` hoặc body sai |
| `401 invalid_token` | Customer/admin chưa xác thực |
| `403 forbidden` | User không có admin role |
| `404 order_not_found` | Customer order không thuộc caller hoặc không tồn tại; `Không tìm thấy đơn hàng` |
| `404 return_request_not_found` | Request không tồn tại/không thuộc customer context; `Không tìm thấy yêu cầu trả hàng` |
| `409 return_not_eligible` | Order status/deadline/history không cho tạo request; `Đơn hàng không đủ điều kiện trả hàng` |
| `409 return_request_open` | Đã có pending/approved/received request; `Đơn hàng đang có yêu cầu trả hàng được xử lý` |
| `409 return_already_refunded` | Order đã có refunded request; `Đơn hàng đã được hoàn tiền trả hàng` |
| `409 return_transition_not_allowed` | Source status không khớp action; `Không thể thực hiện thao tác ở trạng thái hiện tại` |
| `500 internal` | Database/system failure; transaction rollback toàn bộ |

Validation fields dùng đúng wire keys: `orderItemIds`, `reasonCode`, `description`, `rejectReason`, `items`, `q`, `status`, `page`, `limit`, `body`. `wrong_or_missing` được trình bày là “Sai sản phẩm hoặc thiếu phụ kiện/thành phần”; claim chưa nhận toàn bộ dòng hàng nằm ngoài workflow. Business messages bằng tiếng Việt. Ownership failures dùng not-found để không lộ request/order của user khác.

Không log shipping address, phone, full request description, token hoặc credential. Internal transition logs chỉ gồm category, return ID/order ID/action và error. Stock receive và refund transition rollback toàn transaction khi bất kỳ query/update nào lỗi.

## Chiến lược kiểm thử

### Backend

- Migration/integration: new status CHECK, open/refunded unique indexes, item uniqueness, expected refund backfill/constraints.
- Order regression: deliver sets `deliveredAt`; all order queries map it; `partially_returned` validation, admin/customer labels and returns bucket.
- Create use case/repository: exact 7-day timezone boundaries, ownership, selected item set, duplicate/foreign IDs, full quantities, partial/full shipping refund, cancelled/rejected retry, open/refunded rejection và create races.
- State machine: every valid/invalid transition, customer cancellation ownership, reject validation and competing transitions.
- Receive/refund transactions: exact received-variant mapping, all physical variant quantities increment exactly once, active flags remain unchanged, all-or-nothing failure, partial/full order status, admin audit fields and no duplicate refund.
- Downstream boundary: persisted refunded-item predicate and atomic visibility of request/item/order state; review consumer/race tests belong to `purchased-product-reviews`.
- HTTP: customer/admin guards, payloads, pagination/envelopes, field/error codes and additive order contract.

### Frontend customer

- Eligibility/deadline and return states in order list/detail.
- Item selection, immutable quantity, refund preview including shipping only full-order, validation, create/cancel success/error and local refresh.
- `partially_returned`/`returned` bucket rendering, loading/empty/retry, keyboard/a11y and 320 px layout.

### Frontend admin

- List/filter/pagination/detail payloads and React Query invalidation.
- Variant lookup/selection for every selected line, action availability by status, reject/receive validation, transition conflict/error, stock/refund status display.
- Responsive admin navigation/page at 320 px, keyboard/focus and loading/disabled states.

### Verification commands

- Backend: focused tests, `make db-up`, `make gen`, `make wire`, `make test`, `make test-integration`, `make vet`.
- Frontend: focused tests, `npm run lint`, `npm test`, `npm run build`.
- Frontend admin: focused tests, `npm run lint`, `npm test`, `npm run build`.
- Root: `make test`, `make build` after package checks.

## Truy vết yêu cầu

| Requirement IDs | Thiết kế | Verification |
|---|---|---|
| 1.1-1.7 | Order return projection, deadline, create locks/history constraints | Order/create boundary tests |
| 2.1-2.4 | Customer dialog, strict item-ID create contract, full quantity | Customer UI/API/repository tests |
| 2.5-2.10 | Server refund calculation, strict validation, success projection | Partial/full/tampering/refresh tests |
| 3.1-3.4 | Latest request projection, cancellation transition, customer states | Ownership/status/UI tests |
| 4.1-4.6 | Admin list/detail/approve/reject APIs and pages | Admin API/UI/state machine tests |
| 5.1-5.10 | Physical-variant lookup/mapping, receive/refund locked transactions, stock/active-state preservation and order transitions | Validation/atomicity/concurrency/integration tests |
| 6.1-6.2 | Order status producer and latest request integration | Order transition/bucket tests |
| 6.3-6.6 | Atomic refunded-item predicate producer and locked refund transition | Repository predicate/atomicity/concurrency tests |
| 6.7 | Returns bucket maps partial/full status | Customer order filter tests |
| 7.1-7.5 | Existing guards, ownership not-found, locks, envelopes | Auth/error/concurrency tests |
| 7.6-7.8 | Accessible responsive customer/admin states | UI interaction/visual tests |

## Tích hợp hệ thống hiện có

- Reuse `return_requests`/`return_request_items` migration 000010; capability requires full domain/query/API/UI implementation and constraints extension.
- Reuse order snapshots and `IncrementVariantStock`; return receive owns new atomic restock path without changing cancel restock behavior.
- Fix existing deliver transition to persist the already-owned `delivered_at` field and expose it additively.
- Extend `OrderStatus` everywhere with `partially_returned`; no existing status is removed or reinterpreted.
- Customer `returns` bucket intentionally expands to partial/full returns; delivered and other buckets remain unchanged.
- Admin order mapper currently reuses customer item mapper; additive return fields must not expose customer-only private controls and admin consumers continue accepting additive JSON.
- Review feature consumes refunded item predicate and lock ordering defined here; its own requirements/design/tasks must own eligibility, edit preservation, awaiting-review semantics and refund/create-review race verification.
- Frontend admin navigation/layout is directly affected because a supported return management page and 320 px requirement cannot fit the current permanently fixed 256 px sidebar.
