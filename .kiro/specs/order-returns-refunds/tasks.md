# order-returns-refunds Workstream Tasks

## Contract baseline

| Contract | Revision | Status |
|---|---:|---|
| RETURN-CUSTOMER-API | 1 | FROZEN |
| RETURN-ADMIN-API | 1 | FROZEN |
| ORDER-DELIVEREDAT-FIELD | 1 | FROZEN |

Quy tắc điều phối: mỗi workstream do MỘT agent bền vững đảm nhận xuyên suốt các task của owner đó; hợp đồng đã FROZEN cho phép frontend và backend triển khai song song mà không cần đọc code nhau. Sau khi mọi task hoàn tất, chạy xác minh tích hợp runtime (INT-01) trên hệ thống lắp ráp thật trước khi nghiệm thu.

## Workstream: backend-returns

### BE-01 — Nền tảng dữ liệu trả hàng: migration 000010, sqlc queries, repository, Wire

```yaml
owner: backend-returns
contracts:
  ORDER-DELIVEREDAT-FIELD: 1 # phần schema (cột delivered_at) phục vụ contract này
depends_on: []
risk: normal
verification:
  - cmd: make -C backend db-up && make -C backend db-down && make -C backend db-up # up/down sạch
  - cmd: make -C backend gen # sqlc sinh code khớp migration mới, diff chỉ là output kỳ vọng
  - cmd: make -C backend build && make -C backend vet
status: pending
verified_against: {}
```

**Acceptance scenarios:** `ORDER-DELIVEREDAT-FIELD-002` (backfill)

**Architectural constraints:** bảng `return_requests`/`return_request_items` + partial unique index `return_requests_one_open_per_order_idx` theo design B3; cột `orders.delivered_at` + backfill `COALESCE(updated_at, created_at)`; không sửa generated sqlc/Wire bằng tay.

### BE-02 — Đơn hàng ghi mốc giao hàng: deliveredAt trên mọi order response

```yaml
owner: backend-returns
contracts:
  ORDER-DELIVEREDAT-FIELD: 1
depends_on: [BE-01]
risk: normal
verification:
  - unit: domain/usecase test — AdminTransition(deliver) set delivered_at, transition khác bảo toàn
  - cmd: go test ./internal/delivery/http -run 'TestAdmin.*Deliver|TestOrder' (workdir backend)
  - provider-contract: ORDER-DELIVEREDAT-FIELD-001
status: pending
verified_against: {}
```

**Acceptance scenarios:** `ORDER-DELIVEREDAT-FIELD-001`

**Architectural constraints:** chỉ usecase `order` được ghi delivered_at (B4), trong tx hiện có của AdminTransition; field additive, không đổi shape hiện có.

### BE-03 — API khách hàng tạo/xem/rút yêu cầu trả hàng

```yaml
owner: backend-returns
contracts:
  RETURN-CUSTOMER-API: 1
depends_on: [BE-01]
risk: high # state machine + toàn vẹn giao dịch số lượng/tồn kho
verification:
  - unit: domain tests — status/reason IsValid, tập trạng thái tiêu thụ, quy tắc chuyển tiếp
  - unit: usecase tests — validate input, lỗi kinh doanh đúng mã
  - handler: tests envelope + owner-scope 404 (SR5) + auth 401
  - provider-contract: RETURN-CUSTOMER-API-001..012
  - cmd: make -C backend test && make -C backend vet
status: pending
verified_against: {}
```

**Acceptance scenarios:** `RETURN-CUSTOMER-API-001` → `RETURN-CUSTOMER-API-012` (toàn bộ)

**Architectural constraints:** Create trong 1 tx khóa dòng orders (SR1–SR5, SR4); rút yêu cầu chỉ từ pending_approval; route dưới `/api/v1/orders/:id/return-requests` với guard.AuthRequired; message lỗi tiếng Việt qua helpers response/error hiện có.

### BE-04 — API admin xử lý yêu cầu trả hàng (duyệt/từ chối/nhận hàng/hoàn tiền)

```yaml
owner: backend-returns
contracts:
  RETURN-ADMIN-API: 1
depends_on: [BE-03] # chung domain/repository/usecase — một session liên tục
risk: high # hoàn kho nguyên tử + tiền đề nghị phí ship một lần + set orders returned
verification:
  - unit: usecase tests — reject bắt buộc reason, refund amount > 0 nguyên VND, action sai trạng thái → 409
  - handler: tests auth 401/403, phân trang in-memory PaginationMeta, filter status
  - provider-contract: RETURN-ADMIN-API-001..016
  - cmd: make -C backend test && make -C backend vet
status: pending
verified_against: {}
```

**Acceptance scenarios:** `RETURN-ADMIN-API-001` → `RETURN-ADMIN-API-016` (toàn bộ)

**Architectural constraints:** MarkReceived = 1 tx (khóa request + IncrementVariantStock từng dòng + received_at) — rollback giữ nguyên kho (R7.4); MarkRefunded = 1 tx set refunded + SetOrderStatusReturned khi chưa returned (SR7); suggestedRefundVnd tính theo SR6 tại repository; route `/api/v1/admin/return-requests` với RequireAdmin; regenerate wire_gen.go sau khi thêm providers.

## Workstream: frontend-storefront

### FE-S1 — Storefront mục trả hàng trên trang chi tiết đơn

```yaml
owner: frontend-storefront
contracts:
  RETURN-CUSTOMER-API: 1
  ORDER-DELIVEREDAT-FIELD: 1
depends_on: [] # hợp đồng đã FROZEN — triển khai song song với backend
risk: normal
verification:
  - consumer-contract: render/form/theo dõi khớp ReturnRequestView + mã lỗi trong scenarios
  - cmd: npm run lint && npm test && npm run build (workdir frontend)
status: pending
verified_against: {}
```

**Acceptance scenarios:** `RETURN-CUSTOMER-API-001`, `-007`, `-008`, `-009`, `-010`, `ORDER-DELIVEREDAT-FIELD-001` (góc nhìn consumer — mock API module)

**Architectural constraints:** derive lượng còn được phép trả phía client theo ghi chú DeliveredAtExtension (= đã mua − Σ lượng tiêu thụ SR4); server vẫn là thẩm quyền cửa sổ 7 ngày; nút/rút chỉ hiện theo trạng thái hợp đồng; message lỗi hiển thị `error.message` từ envelope.

## Workstream: frontend-admin

### FE-A1 — Frontend-admin trang quản lý yêu cầu trả hàng

```yaml
owner: frontend-admin
contracts:
  RETURN-ADMIN-API: 1
  ORDER-DELIVEREDAT-FIELD: 1
depends_on: []
risk: normal
verification:
  - consumer-contract: danh sách/lọc/phân trang/chi tiết/4 hành động khớp AdminReturnRequestView
  - cmd: npm run lint && npm test && npm run build (workdir frontend-admin)
status: pending
verified_against: {}
```

**Acceptance scenarios:** `RETURN-ADMIN-API-001`, `-005`, `-007`, `-008`, `-011`, `-013`, `-014` (góc nhìn consumer — mock API module)

**Architectural constraints:** Dialog từ chối bắt buộc nhập lý do; Dialog hoàn tiền prefill `suggestedRefundVnd` (chỉ gợi ý, admin nhập số thực tế); AlertDialog cảnh báo hoàn kho trước "Xác nhận đã nhận hàng"; nav "Trả hàng" trong AdminLayout; hành động hiển thị đúng theo trạng thái từ hợp đồng.

## Workstream: integration (orchestrator)

### INT-01 — Xác minh tích hợp runtime trên hệ thống lắp ráp thật

```yaml
owner: orchestrator
contracts:
  RETURN-CUSTOMER-API: 1
  RETURN-ADMIN-API: 1
  ORDER-DELIVEREDAT-FIELD: 1
depends_on: [BE-02, BE-03, BE-04, FE-S1, FE-A1]
risk: high
verification:
  - e2e: chuỗi đầy đủ tạo yêu cầu → duyệt → nhận hàng (kho tăng) → hoàn tiền (đơn thành returned) trên tiến trình thật (backend + PostgreSQL thật, kiểm tra HTTP)
  - e2e: RETURN-CUSTOMER-API-012 (tạo đồng thời không vượt lượng mua) trên DB thật
  - regression: luồng đặt/hủy đơn + auto-confirm + tab Lịch sử mua hàng không thay đổi hành vi
  - cmd: make test (root — cả 3 package) && make build
status: pending
verified_against: {}
```

**Acceptance scenarios:** chuỗi `RETURN-CUSTOMER-API-001` → `RETURN-ADMIN-API-007` → `-011` → `-014` → `-015`; `RETURN-CUSTOMER-API-012`; `ORDER-DELIVEREDAT-FIELD-001`

**Architectural constraints:** chạy migration thật (`make db-up`) trước khởi động; không dùng dev server/watch unbounded foreground — background + timeout + dừng sau khi verify; log/PID được ghi lại.

> Phân rã file/class nội bộ cố ý để dành cho owner workstream, trừ những ranh giới kiến trúc đã cố định trong design.md (bounded context `returns`, interface `ReturnRequestRepository` do domain sở hữu, nhóm route).
