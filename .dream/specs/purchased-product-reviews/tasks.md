# Tác Vụ Tính Năng Đánh Giá Sản Phẩm Đã Mua

## Contract Baseline

| Contract | Revision | Status |
|---|---:|---|
| PURCHASED-REVIEW-API | 2 | FROZEN |
| PURCHASED-REVIEW-API | 3 | FROZEN |
| PURCHASED-REVIEW-MEDIA | 1 | FROZEN |

## Execution DAG

```text
BE-01 -> BE-02 -> BE-03 --\
                          -> INT-01
FE-01 -> FE-02 -> FE-03 --/

BE-03 -> BE-04 --\
                -> INT-02
FE-03 -> FE-04 --/
```

`BE-01`, `BE-02`, `BE-03` dùng cùng một persistent owner vì chia sẻ schema, transaction, MinIO lifecycle và read model. `FE-01`, `FE-02`, `FE-03` dùng cùng một persistent owner vì chia sẻ API types, mutation state và UI review. Hai workstream có thể bắt đầu song song từ contract revision 1 đã đóng băng.

## Workstream: backend-review

### BE-01 — Thiết lập nguồn sự thật đánh giá và vòng đời media

```yaml
id: BE-01
owner: backend-review
outcome: PostgreSQL bảo đảm một review trên mỗi order item, một lần edit thành công và aggregate chính xác; MinIO private storage lưu/đọc/xóa media với cleanup hội tụ trong giới hạn đã duyệt.
requirements:
  - REQ-REVIEW-01
  - REQ-REVIEW-02
  - REQ-REVIEW-03
  - REQ-REVIEW-04
  - REQ-REVIEW-06
  - REQ-REVIEW-07
acceptance_criteria:
  - AC-REVIEW-01-02
  - AC-REVIEW-01-03
  - AC-REVIEW-02-06
  - AC-REVIEW-02-07
  - AC-REVIEW-02-08
  - AC-REVIEW-02-09
  - AC-REVIEW-03-01
  - AC-REVIEW-03-02
  - AC-REVIEW-04-01
  - AC-REVIEW-04-02
  - AC-REVIEW-04-03
  - AC-REVIEW-04-04
  - AC-REVIEW-04-05
  - AC-REVIEW-04-06
  - AC-REVIEW-06-01
  - AC-REVIEW-06-02
  - AC-REVIEW-06-03
  - AC-REVIEW-06-04
  - AC-REVIEW-07-01
  - AC-REVIEW-07-02
  - AC-REVIEW-07-04
contracts: []
depends_on: []
risk: high
verification:
  - type: integration-db
    scope: migration up/down, unique order_item constraint, conditional single-edit update, aggregate rounding, awaiting-review query, deterministic pagination
  - type: unit
    scope: media MIME/byte/count validation and MinIO adapter error mapping
  - type: runtime-http
    scope: MinIO private bucket, immediate public revocation, reconciler deletion bound using shortened test schedule
  - type: typecheck
    scope: make -C backend gen && make -C backend vet
status: completed
verified_against:
  PURCHASED-REVIEW-API: 2
  PURCHASED-REVIEW-MEDIA: 1
```

**Acceptance scenarios:** `PURCHASED-REVIEW-API-007`, `PURCHASED-REVIEW-API-008`, `PURCHASED-REVIEW-API-009`, `PURCHASED-REVIEW-API-016`, `PURCHASED-REVIEW-API-021`, `PURCHASED-REVIEW-API-022`, `PURCHASED-REVIEW-API-031`, `PURCHASED-REVIEW-API-044`, `PURCHASED-REVIEW-API-045`, `PURCHASED-REVIEW-API-046`.

**Architectural constraints:** PostgreSQL quyết định public state; MinIO bucket private; cấu hình qua Viper; migration up/down và sqlc-generated output được commit; không thêm idempotency journal.

### BE-02 — Cung cấp mutation đánh giá và media proxy theo contract

```yaml
id: BE-02
owner: backend-review
outcome: Khách hàng đủ điều kiện tạo review multipart và sửa nguyên tử đúng một lần; media hợp lệ được proxy qua backend, raw media hỗ trợ reference-first lookup, range và revalidation.
requirements:
  - REQ-REVIEW-01
  - REQ-REVIEW-02
  - REQ-REVIEW-03
  - REQ-REVIEW-04
  - REQ-REVIEW-08
acceptance_criteria:
  - AC-REVIEW-01-01
  - AC-REVIEW-01-02
  - AC-REVIEW-01-03
  - AC-REVIEW-02-01
  - AC-REVIEW-02-02
  - AC-REVIEW-02-03
  - AC-REVIEW-02-04
  - AC-REVIEW-02-05
  - AC-REVIEW-02-06
  - AC-REVIEW-02-07
  - AC-REVIEW-02-08
  - AC-REVIEW-03-01
  - AC-REVIEW-03-02
  - AC-REVIEW-03-03
  - AC-REVIEW-04-01
  - AC-REVIEW-04-02
  - AC-REVIEW-04-03
  - AC-REVIEW-04-04
  - AC-REVIEW-04-05
  - AC-REVIEW-04-06
  - AC-REVIEW-08-01
  - AC-REVIEW-08-03
contracts:
  - id: PURCHASED-REVIEW-API
    revision: 2
    role: provider
  - id: PURCHASED-REVIEW-MEDIA
    revision: 1
    role: provider
depends_on:
  - BE-01
risk: high
verification:
  - type: provider-contract
    scenario: PURCHASED-REVIEW-API-001
  - type: provider-contract
    scenario: PURCHASED-REVIEW-API-005
  - type: provider-contract
    scenario: PURCHASED-REVIEW-API-012
  - type: provider-contract
    scenario: PURCHASED-REVIEW-API-034
  - type: provider-contract
    scenario: PURCHASED-REVIEW-MEDIA-009
  - type: unit
    scope: ownership, eligibility, manifest normalization, plain-text comment, single-edit failure behavior
  - type: runtime-http
    scope: multipart limits, concurrent create/edit, MinIO failure cleanup, raw 200/206/304/404/416/503
  - type: typecheck
    scope: make -C backend test && make -C backend vet
status: completed
verified_against:
  PURCHASED-REVIEW-API: 2
  PURCHASED-REVIEW-MEDIA: 1
```

**Acceptance scenarios:** `PURCHASED-REVIEW-API-001` through `PURCHASED-REVIEW-API-017`, `PURCHASED-REVIEW-API-027` through `PURCHASED-REVIEW-API-035`, `PURCHASED-REVIEW-API-038`, `PURCHASED-REVIEW-API-041`, `PURCHASED-REVIEW-API-048`, `PURCHASED-REVIEW-API-049`, `PURCHASED-REVIEW-API-052`, `PURCHASED-REVIEW-API-053`, `PURCHASED-REVIEW-API-054`, `PURCHASED-REVIEW-MEDIA-001` through `PURCHASED-REVIEW-MEDIA-009`.

**Architectural constraints:** mutation stream file thay vì buffer toàn bộ; product/variant/user lấy từ order item; unique/conditional database guard là cơ chế concurrency duy nhất; object không reference không được phục vụ kể cả ETag khớp.

### BE-03 — Cung cấp product review reads và order review state

```yaml
id: BE-03
owner: backend-review
outcome: Product detail và collection trả summary/danh sách review công khai đúng; order detail trả review state từng item và awaitingReview đếm order item chưa review.
requirements:
  - REQ-REVIEW-05
  - REQ-REVIEW-06
  - REQ-REVIEW-07
  - REQ-REVIEW-08
acceptance_criteria:
  - AC-REVIEW-05-01
  - AC-REVIEW-05-02
  - AC-REVIEW-05-03
  - AC-REVIEW-05-05
  - AC-REVIEW-06-01
  - AC-REVIEW-06-02
  - AC-REVIEW-06-03
  - AC-REVIEW-06-04
  - AC-REVIEW-07-01
  - AC-REVIEW-07-02
  - AC-REVIEW-07-03
  - AC-REVIEW-07-04
  - AC-REVIEW-08-01
contracts:
  - id: PURCHASED-REVIEW-API
    revision: 2
    role: provider
depends_on:
  - BE-02
risk: normal
verification:
  - type: provider-contract
    scenario: PURCHASED-REVIEW-API-018
  - type: provider-contract
    scenario: PURCHASED-REVIEW-API-020
  - type: provider-contract
    scenario: PURCHASED-REVIEW-API-023
  - type: provider-contract
    scenario: PURCHASED-REVIEW-API-037
  - type: provider-contract
    scenario: PURCHASED-REVIEW-API-R2-005
  - type: integration-db
    scope: stable updatedAt/id pagination, anonymous/owner viewer state, variant snapshot, quantity-one pending count
  - type: typecheck
    scope: make -C backend test && make -C backend vet
status: completed
verified_against:
  PURCHASED-REVIEW-API: 2
```

**Acceptance scenarios:** `PURCHASED-REVIEW-API-018` through `PURCHASED-REVIEW-API-026`, `PURCHASED-REVIEW-API-036`, `PURCHASED-REVIEW-API-037`, `PURCHASED-REVIEW-API-039`, `PURCHASED-REVIEW-API-040`, `PURCHASED-REVIEW-API-044`, `PURCHASED-REVIEW-API-047`.

**Architectural constraints:** average tính lúc đọc và round-half-up; author label trung lập; optional auth chỉ thêm viewer state; giữ mọi baseline field hiện có và Full Status Envelope.

## Workstream: frontend-review

### FE-01 — Tiêu thụ contract và cung cấp form review dùng chung

```yaml
id: FE-01
owner: frontend-review
outcome: Frontend gửi multipart đúng contract, giữ auth refresh, preview/validate media, tạo hoặc sửa review bằng bàn phím và tải lại state có thẩm quyền sau timeout trước khi cho retry.
requirements:
  - REQ-REVIEW-02
  - REQ-REVIEW-03
  - REQ-REVIEW-04
  - REQ-REVIEW-08
acceptance_criteria:
  - AC-REVIEW-02-01
  - AC-REVIEW-02-02
  - AC-REVIEW-02-03
  - AC-REVIEW-02-04
  - AC-REVIEW-02-05
  - AC-REVIEW-02-06
  - AC-REVIEW-02-08
  - AC-REVIEW-03-03
  - AC-REVIEW-04-01
  - AC-REVIEW-04-04
  - AC-REVIEW-04-05
  - AC-REVIEW-08-02
  - AC-REVIEW-08-03
  - AC-REVIEW-08-04
contracts:
  - id: PURCHASED-REVIEW-API
    revision: 2
    role: consumer
  - id: PURCHASED-REVIEW-MEDIA
    revision: 1
    role: consumer
depends_on: []
risk: high
verification:
  - type: consumer-contract
    scenario: PURCHASED-REVIEW-API-005
  - type: consumer-contract
    scenario: PURCHASED-REVIEW-API-010
  - type: consumer-contract
    scenario: PURCHASED-REVIEW-API-014
  - type: consumer-contract
    scenario: PURCHASED-REVIEW-API-R2-002
  - type: consumer-contract
    scenario: PURCHASED-REVIEW-API-R2-004
  - type: component
    scope: rating keyboard control, media picker/reorder/remove, one-edit warning, validation, timeout reload before retry
  - type: typecheck
    scope: npm run lint && npm test && npm run build in frontend
status: completed
verified_against:
  PURCHASED-REVIEW-API: 2
  PURCHASED-REVIEW-MEDIA: 1
```

**Acceptance scenarios:** `PURCHASED-REVIEW-API-005`, `PURCHASED-REVIEW-API-006`, `PURCHASED-REVIEW-API-010`, `PURCHASED-REVIEW-API-012`, `PURCHASED-REVIEW-API-014`, `PURCHASED-REVIEW-API-029`, `PURCHASED-REVIEW-API-031`, `PURCHASED-REVIEW-API-052`, `PURCHASED-REVIEW-API-053`.

**Architectural constraints:** FormData không đặt JSON Content-Type toàn request; giữ token refresh/ApiError hiện có; không tự động retry mutation sau timeout; object preview URL được revoke khi không dùng.

### FE-02 — Hiển thị section đánh giá trên trang chi tiết sản phẩm

```yaml
id: FE-02
owner: frontend-review
outcome: Trang chi tiết sản phẩm hiển thị summary thật và section review phân trang của mọi khách hàng, gồm variant snapshot, ảnh/video responsive và mọi trạng thái đọc.
requirements:
  - REQ-REVIEW-05
  - REQ-REVIEW-06
  - REQ-REVIEW-08
acceptance_criteria:
  - AC-REVIEW-05-01
  - AC-REVIEW-05-02
  - AC-REVIEW-05-03
  - AC-REVIEW-05-04
  - AC-REVIEW-05-05
  - AC-REVIEW-06-01
  - AC-REVIEW-06-02
  - AC-REVIEW-06-03
  - AC-REVIEW-06-04
  - AC-REVIEW-08-01
  - AC-REVIEW-08-04
contracts:
  - id: PURCHASED-REVIEW-API
    revision: 2
    role: consumer
  - id: PURCHASED-REVIEW-MEDIA
    revision: 1
    role: consumer
depends_on:
  - FE-01
risk: normal
verification:
  - type: consumer-contract
    scenario: PURCHASED-REVIEW-API-018
  - type: consumer-contract
    scenario: PURCHASED-REVIEW-API-020
  - type: component
    scope: summary, empty/loading/error/pagination, neutral author, plain text, image/video fallback and keyboard controls
  - type: browser
    scope: public product review pagination and media interaction
  - type: visual
    scope: representative mobile and desktop product detail widths
status: completed
verified_against:
  PURCHASED-REVIEW-API: 2
  PURCHASED-REVIEW-MEDIA: 1
```

**Acceptance scenarios:** `PURCHASED-REVIEW-API-018` through `PURCHASED-REVIEW-API-022`, `PURCHASED-REVIEW-API-029`, `PURCHASED-REVIEW-API-040`, `PURCHASED-REVIEW-API-044`, `PURCHASED-REVIEW-API-047`, `PURCHASED-REVIEW-MEDIA-001` through `PURCHASED-REVIEW-MEDIA-009`.

**Architectural constraints:** thay hoàn toàn `5.0 / 128` tĩnh; giữ visual language hiện có; comment là text; video native controls; section usable khi anonymous.

### FE-03 — Tích hợp review state vào luồng đơn hàng

```yaml
id: FE-03
owner: frontend-review
outcome: Chi tiết đơn hiển thị hành động độc lập trên từng order item và lịch sử đơn hiển thị awaitingReview đúng; create/edit cập nhật state, login return và timeout recovery an toàn.
requirements:
  - REQ-REVIEW-01
  - REQ-REVIEW-03
  - REQ-REVIEW-04
  - REQ-REVIEW-07
  - REQ-REVIEW-08
acceptance_criteria:
  - AC-REVIEW-01-01
  - AC-REVIEW-01-02
  - AC-REVIEW-01-03
  - AC-REVIEW-03-01
  - AC-REVIEW-03-02
  - AC-REVIEW-03-03
  - AC-REVIEW-04-01
  - AC-REVIEW-04-03
  - AC-REVIEW-04-04
  - AC-REVIEW-04-05
  - AC-REVIEW-04-06
  - AC-REVIEW-07-01
  - AC-REVIEW-07-02
  - AC-REVIEW-07-03
  - AC-REVIEW-07-04
  - AC-REVIEW-08-02
  - AC-REVIEW-08-03
contracts:
  - id: PURCHASED-REVIEW-API
    revision: 2
    role: consumer
depends_on:
  - FE-02
risk: normal
verification:
  - type: consumer-contract
    scenario: PURCHASED-REVIEW-API-023
  - type: consumer-contract
    scenario: PURCHASED-REVIEW-API-024
  - type: consumer-contract
    scenario: PURCHASED-REVIEW-API-R2-005
  - type: component
    scope: per-item eligible/reviewed/ineligible actions, independent same-product rows, stats delta, timeout authoritative reload
  - type: browser
    scope: safe login return and create/edit flow from delivered order item
  - type: visual
    scope: order detail review actions on mobile and desktop
status: completed
verified_against:
  PURCHASED-REVIEW-API: 2
```

**Acceptance scenarios:** `PURCHASED-REVIEW-API-001` through `PURCHASED-REVIEW-API-004`, `PURCHASED-REVIEW-API-009`, `PURCHASED-REVIEW-API-010`, `PURCHASED-REVIEW-API-013` through `PURCHASED-REVIEW-API-017`, `PURCHASED-REVIEW-API-023` through `PURCHASED-REVIEW-API-026`, `PURCHASED-REVIEW-API-036`, `PURCHASED-REVIEW-API-037`, `PURCHASED-REVIEW-API-038`.

**Architectural constraints:** một action trên mỗi order item; không gộp theo product/variant; không giả định eligibility khi API lỗi; giữ route/auth patterns hiện có.

## Workstream: review-integration

### INT-01 — Xác minh runtime xuyên PostgreSQL, MinIO, backend và browser

```yaml
id: INT-01
owner: review-integration
outcome: Hệ thống lắp ráp chứng minh toàn bộ boundary contract và user flow chính với PostgreSQL, MinIO, backend cùng browser thật mà không để media hoặc state một phần.
requirements:
  - REQ-REVIEW-01
  - REQ-REVIEW-02
  - REQ-REVIEW-03
  - REQ-REVIEW-04
  - REQ-REVIEW-05
  - REQ-REVIEW-06
  - REQ-REVIEW-07
  - REQ-REVIEW-08
acceptance_criteria:
  - AC-REVIEW-01-01
  - AC-REVIEW-01-03
  - AC-REVIEW-02-05
  - AC-REVIEW-02-07
  - AC-REVIEW-02-09
  - AC-REVIEW-03-02
  - AC-REVIEW-03-03
  - AC-REVIEW-04-03
  - AC-REVIEW-04-05
  - AC-REVIEW-04-06
  - AC-REVIEW-05-01
  - AC-REVIEW-05-04
  - AC-REVIEW-06-02
  - AC-REVIEW-07-03
  - AC-REVIEW-08-02
  - AC-REVIEW-08-03
  - AC-REVIEW-08-04
contracts:
  - id: PURCHASED-REVIEW-API
    revision: 2
    role: verifier
  - id: PURCHASED-REVIEW-MEDIA
    revision: 1
    role: verifier
depends_on:
  - BE-03
  - FE-03
risk: high
verification:
  - type: provider-contract
    scope: execute inherited revision 1 scenarios plus all PURCHASED-REVIEW-API revision 2 scenarios
  - type: provider-contract
    scenario: PURCHASED-REVIEW-API-R2-005
  - type: provider-contract
    scope: execute all PURCHASED-REVIEW-MEDIA revision 1 scenarios
  - type: runtime-http
    scope: PostgreSQL + MinIO + backend create/edit/race/failure/range/revalidation/reconciliation scenarios
  - type: browser
    scope: anonymous product reads, authenticated order-item create/edit, timeout state reload, media keyboard interaction
  - type: visual
    scope: product and order surfaces at representative mobile and desktop widths
  - type: typecheck
    scope: root make test && root make build after make db-up
status: completed
verified_against:
  PURCHASED-REVIEW-API: 2
  PURCHASED-REVIEW-MEDIA: 1
```

**Acceptance scenarios:** toàn bộ scenario trong `contracts/scenarios.yaml` revision 1.

**Architectural constraints:** dùng process/runtime thật với timeout hữu hạn và cleanup; không thay thế DB/MinIO bằng mock cho proof xuyên boundary; dừng mọi process sau xác minh và lưu evidence ở workflow implementation.

## Revision 3 Extension: Lịch Sử Đánh Giá Cá Nhân

### BE-04 — Cung cấp collection lịch sử đánh giá theo owner

```yaml
id: BE-04
owner: backend-review
outcome: Khách hàng đã xác thực đọc được collection phân trang chỉ gồm review hiện tại của chính mình, với product identity/link state và owner viewer state đúng revision 3.
requirements:
  - REQ-REVIEW-09
acceptance_criteria:
  - AC-REVIEW-09-01
  - AC-REVIEW-09-02
  - AC-REVIEW-09-03
  - AC-REVIEW-09-04
  - AC-REVIEW-09-05
  - AC-REVIEW-09-07
contracts:
  - id: PURCHASED-REVIEW-API
    revision: 3
    role: provider
depends_on:
  - BE-03
risk: normal
verification:
  - type: provider-contract
    scope: PURCHASED-REVIEW-API-R3-001 through PURCHASED-REVIEW-API-R3-010
  - type: integration-db
    scope: owner isolation, updatedAt/id ordering, pagination boundaries, current post-edit state and hidden-product identity
  - type: typecheck
    scope: make -C backend test && make -C backend vet
status: completed
verified_against:
  PURCHASED-REVIEW-API: 3
```

### FE-04 — Cung cấp trang tài khoản "Đánh giá của tôi"

```yaml
id: FE-04
owner: frontend-review
outcome: Khu vực tài khoản có trang lịch sử review responsive, phân trang, chỉ đọc hoặc chỉnh sửa theo owner state, với login return và đầy đủ loading/empty/error states.
requirements:
  - REQ-REVIEW-09
acceptance_criteria:
  - AC-REVIEW-09-01
  - AC-REVIEW-09-02
  - AC-REVIEW-09-03
  - AC-REVIEW-09-04
  - AC-REVIEW-09-05
  - AC-REVIEW-09-06
  - AC-REVIEW-09-07
contracts:
  - id: PURCHASED-REVIEW-API
    revision: 3
    role: consumer
  - id: PURCHASED-REVIEW-MEDIA
    revision: 1
    role: consumer
depends_on:
  - FE-03
risk: normal
verification:
  - type: consumer-contract
    scope: PURCHASED-REVIEW-API-R3-001 through PURCHASED-REVIEW-API-R3-010
  - type: component
    scope: auth redirect, ordering/pagination, product links, editable/final review, post-edit replacement, loading/empty/error/retry and session data clearing
  - type: browser
    scope: safe login return and edit flow from owner history
  - type: visual
    scope: representative mobile and desktop account-history widths
  - type: typecheck
    scope: npm run lint && npm test && npm run build in frontend
status: completed
verified_against:
  PURCHASED-REVIEW-API: 3
  PURCHASED-REVIEW-MEDIA: 1
```

### INT-02 — Xác minh revision 3 xuyên backend và browser

```yaml
id: INT-02
owner: review-integration
outcome: Runtime lắp ráp chứng minh owner isolation, pagination, product link availability và create/edit reflection của lịch sử đánh giá cá nhân.
requirements:
  - REQ-REVIEW-09
acceptance_criteria:
  - AC-REVIEW-09-01
  - AC-REVIEW-09-02
  - AC-REVIEW-09-03
  - AC-REVIEW-09-04
  - AC-REVIEW-09-05
  - AC-REVIEW-09-06
  - AC-REVIEW-09-07
contracts:
  - id: PURCHASED-REVIEW-API
    revision: 3
    role: verifier
depends_on:
  - BE-04
  - FE-04
risk: normal
verification:
  - type: provider-contract
    scope: execute all PURCHASED-REVIEW-API revision 3 scenarios
  - type: runtime-http
    scope: two-customer isolation, stable multi-page ordering, hidden/public product link state and post-edit current state
  - type: browser
    scope: login return, empty history, pagination and edit from account history
  - type: visual
    scope: account history at representative mobile and desktop widths
  - type: typecheck
    scope: root make test && root make build
status: completed
verified_against:
  PURCHASED-REVIEW-API: 3
  PURCHASED-REVIEW-MEDIA: 1
```
