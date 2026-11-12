# Tài liệu thiết kế

## Tổng quan (Overview)

Thiết kế thay trang giữ chỗ `frontend-admin/src/pages/DashboardPage.tsx` bằng trang tổng quan đọc số liệu thật từ một endpoint quản trị mới `GET /api/v1/admin/dashboard`. Toàn bộ số liệu của một lần xem (doanh thu, biểu đồ, đơn hàng, việc cần xử lý, sản phẩm bán chạy, tồn kho thấp) được trả về trong **một** phản hồi, tính trong **một** giao dịch đọc. Nhờ vậy các con số trên trang nhất quán với nhau và nút "Làm mới" chỉ cần một lời gọi.

Phạm vi theo yêu cầu: 1.1–1.4, 2.1–2.6, 3.1–3.5, 4.1–4.5, 5.1–5.3, 6.1–6.5, 7.1–7.6, 8.1–8.5, 9.1–9.5, 10.1–10.4.

Các quyết định chính:

| Quyết định | Lựa chọn | Lý do | Phương án đã loại |
|---|---|---|---|
| Số endpoint | Một endpoint tổng hợp | Một snapshot nhất quán (4.5, 6.3), một lần tải và một trạng thái lỗi (9.2) | Mỗi khu vực một endpoint: nhiều lời gọi, số liệu giữa các khu vực có thể lệch nhau |
| Nguồn số "chưa phản hồi" và "chưa đọc" | Gọi lại đúng query sqlc `CountAdminReviews` (`has_reply_filter = 'no'`) và `CountConversationsForAdmin` (`status = 'unread'`) | Bảo đảm số trên trang tổng quan khớp với trang đích (6.3) mà không tạo định nghĩa song song | Viết lại điều kiện SQL trong query mới: dễ lệch khi định nghĩa gốc đổi |
| Biểu đồ | Tự vẽ bằng SVG/CSS trong `frontend-admin`, không thêm thư viện | Tối đa 30 cột; `frontend-admin` chưa có thư viện biểu đồ; tránh thêm dependency cho một biểu đồ | Thêm `recharts`: tăng bundle và có thêm một dependency cần bảo trì |
| Tính tổng doanh thu | Use case cộng từ chuỗi theo ngày | Tổng doanh thu bằng tổng các điểm theo đúng cấu trúc tính (4.5) | Query tổng riêng: có thể lệch với chuỗi theo ngày |
| Hiệu năng | Thêm index cho các cột lọc theo thời gian (migration `000019`) | Đạt 9.5 khi lọc theo `delivered_at`, `created_at`, `refunded_at` | Bảng tổng hợp hoặc cache: phức tạp và phải xử lý dữ liệu cũ, không cần ở quy mô 50.000 đơn |

## Kiến trúc (Architecture)

```text
frontend-admin                                   backend
DashboardPage ──useQuery(['admin-dashboard', range])──► GET /api/v1/admin/dashboard?range=7d
  │  (range lưu trên URL ?range=)                        │ guard.AuthRequired + RequireAdmin (401/403)
  ├─ RangeSelector / RefreshButton                       ▼
  ├─ RevenueSummary + RevenueChart                AdminDashboardHandler (delivery/http)
  ├─ OrderStatusBreakdown ──► /orders?status=…           │ parse + validate range
  ├─ PendingWorkList ──► /orders, /returns,               ▼
  │                      /reviews?has_reply=no,    dashboard.UseCase (usecase/dashboard)
  │                      /chat?filter=unread               │ tính ranh giới kỳ (UTC+7, clock inject)
  ├─ TopProductsList ──► /products/:id                    │ lấp ngày trống, tính net/avg
  └─ LowStockList ──► /products/:id                       ▼
                                                   domain.DashboardRepository
                                                          │ một tx READ ONLY, REPEATABLE READ
                                                          ▼
                                                   repository.DashboardRepository → sqlc (db/queries/dashboard.sql
                                                                                   + CountAdminReviews, CountConversationsForAdmin)
```

Chiều phụ thuộc giữ nguyên `delivery -> usecase -> domain`; repository hiện thực interface do `internal/domain` sở hữu.

## Thành phần và giao diện (Components And Interfaces)

### Contract API-ADMIN-DASHBOARD (rev 1)

`GET /api/v1/admin/dashboard`

- **Bảo vệ:** đăng ký trong nhóm `admin` hiện có của `router.go` (`guard.AuthRequired`, `guard.RequireAdmin()`). Thiếu hoặc sai token trả 401; người dùng không phải `admin` trả 403 với `error.code = "forbidden"`. Cả hai đi qua middleware hiện có.
- **Query parameter `range`:** một trong `today`, `7d`, `30d`. Thiếu hoặc rỗng thì dùng `7d`. Giá trị khác trả HTTP 400 với `error.code = "invalid_filter"` và `error.fields = {"range": "Kỳ báo cáo không hợp lệ"}` qua `domain.FilterValidationError`. `error.message` dùng thông điệp chung hiện có của `invalid_filter`.
- **Thành công:** HTTP 200 theo Full Status Envelope, `message = "Dashboard retrieved successfully"`, không có `meta.pagination`. `data` có dạng:

```jsonc
{
  "range": "7d",                              // "today" | "7d" | "30d", giá trị đã áp dụng
  "rangeStart": "2026-11-05T17:00:00Z",       // RFC 3339 UTC, 00:00 giờ VN của ngày đầu kỳ
  "generatedAt": "2026-11-12T03:15:42Z",      // RFC 3339 UTC, thời điểm tính = cuối kỳ
  "revenue": {
    "deliveredVnd": "125990000",              // chuỗi số nguyên thập phân, >= 0
    "refundedVnd": "25990000",                // chuỗi số nguyên thập phân, >= 0
    "netVnd": "100000000",                    // chuỗi số nguyên, có thể có dấu "-"
    "deliveredOrders": 5,                     // number nguyên >= 0
    "averageOrderVnd": "25198000"             // floor(deliveredVnd / deliveredOrders), "0" nếu deliveredOrders = 0
  },
  "dailyRevenue": [                           // 1, 7 hoặc 30 phần tử, ngày tăng dần, không bỏ ngày nào
    { "date": "2026-11-06", "deliveredVnd": "0", "refundedVnd": "0", "netVnd": "0" }
  ],
  "orders": {
    "newInRange": 12,
    "cancelledInRange": 1,
    "byStatus": {                             // luôn đủ 9 khóa, giá trị 0 khi không có đơn
      "pending_confirmation": 3, "confirmed": 1, "preparing": 2, "shipped": 4,
      "delivered": 40, "cancel_requested": 1, "cancelled": 6,
      "partially_returned": 1, "returned": 2
    }
  },
  "pendingWork": {
    "pendingConfirmationOrders": 3,
    "cancelRequestedOrders": 1,
    "pendingApprovalReturns": 2,
    "receivedReturns": 1,
    "unrepliedReviews": 7,
    "unreadConversations": 4
  },
  "topProducts": [                            // 0..5 phần tử, đã sắp xếp theo 7.3
    {
      "productId": "uuid",
      "name": "iPhone 16 Pro",
      "brand": "Apple",
      "imageUrl": "",                         // chuỗi rỗng khi sản phẩm không có ảnh
      "active": true,                         // false khi sản phẩm đã bị xóa (products.active = false)
      "quantitySold": 9,
      "revenueVnd": "233910000"
    }
  ],
  "lowStock": {
    "threshold": 5,
    "total": 14,                              // tổng số biến thể thỏa điều kiện, không bị giới hạn 10
    "items": [                                // 0..10 phần tử, đã sắp xếp theo 8.1
      {
        "variantId": "uuid",
        "productId": "uuid",
        "productName": "iPhone 16 Pro",
        "options": [{ "groupLabel": "Dung lượng", "valueLabel": "256GB" }],
        "stockQuantity": 0
      }
    ]
  }
}
```

Bất biến của contract:

- Mọi số tiền (`*Vnd`) là chuỗi số nguyên thập phân, đúng quy ước `MoneyVND` hiện có. Mọi số đếm và số lượng là JSON number nguyên.
- `revenue.deliveredVnd`, `revenue.refundedVnd` và `revenue.netVnd` bằng tổng các trường cùng tên trong `dailyRevenue`. Với mỗi phần tử, `netVnd = deliveredVnd - refundedVnd`.
- `dailyRevenue[i].date` là ngày lịch giờ Việt Nam dạng `YYYY-MM-DD`. Phần tử đầu là ngày chứa `rangeStart`, phần tử cuối là ngày chứa `generatedAt`.
- `orders.byStatus` và `pendingWork` không phụ thuộc `range`.
- `options` là mảng rỗng khi biến thể không có phân loại.

### Backend

| Thành phần | Vị trí | Trách nhiệm |
|---|---|---|
| Kiểu domain và `DashboardRepository` | `internal/domain/dashboard.go` | Kiểu `DashboardRange` (`today`/`7d`/`30d` + `IsValid`), các struct snapshot, interface repository nhận `(ctx, rangeStart, rangeEnd time.Time, loc *time.Location)` và trả dữ liệu thô: doanh thu và hoàn tiền theo ngày, số đơn theo trạng thái, đơn mới và đơn hủy trong kỳ, việc cần xử lý, top sản phẩm, tồn kho thấp |
| Use case | `internal/usecase/dashboard` | Kiểm tra `range`; tính `rangeStart` (00:00 UTC+7 của ngày đầu kỳ) và `rangeEnd` (= `now`) từ clock được inject; lấp đủ ngày trống bằng 0; tính tổng, `netVnd` và `averageOrderVnd` (chia lấy phần nguyên); trả `FilterValidationError` khi `range` sai |
| Repository | `internal/repository/dashboard_repository.go` + `db/queries/dashboard.sql` | Chạy mọi query trong một transaction `READ ONLY, ISOLATION LEVEL REPEATABLE READ`. Gọi lại `CountAdminReviews(rating 0, has_reply 'no')` và `CountConversationsForAdmin(status 'unread', search '')` |
| Handler | `internal/delivery/http/admin_dashboard_handler.go` | Đọc `range`, gọi use case, map sang JSON camelCase theo API-ADMIN-DASHBOARD@1 qua `writeSuccess` và `writeError` |
| Router | `internal/delivery/http/router.go` | Thêm `Dashboard` vào `Dependencies`; đăng ký `admin.GET("/dashboard", …)` trong nhóm `admin` |
| Wire | `cmd/server/wire.go`, `app.go`, `wire_gen.go` | Thêm `provideDashboardRepository` và `provideDashboardUseCase`, truyền vào `provideGinRouter`, regenerate `wire_gen.go` |

Ngữ nghĩa từng query, tất cả tham số hóa bằng `rangeStart` và `rangeEnd` (điều kiện `rangeStart <= t <= rangeEnd`), gom ngày theo `AT TIME ZONE 'Asia/Ho_Chi_Minh'`:

- **Doanh thu đã giao theo ngày:** `orders` có `delivered_at` trong kỳ và `status IN ('delivered','partially_returned','returned')`, `SUM(total_vnd)` và `COUNT(*)` theo ngày của `delivered_at`.
- **Hoàn tiền theo ngày:** `return_requests` có `status = 'refunded'` và `refunded_at` trong kỳ, `SUM(refund_amount_vnd)` theo ngày của `refunded_at`.
- **Đơn mới và đơn hủy trong kỳ:** `orders` có `created_at` trong kỳ, đếm toàn bộ và đếm `status = 'cancelled'`.
- **Đơn theo trạng thái:** `SELECT status, COUNT(*) FROM orders GROUP BY status`. Use case bổ sung trạng thái thiếu bằng 0.
- **Đổi trả chờ xử lý:** đếm `return_requests` theo `status IN ('pending_approval','received')`.
- **Top sản phẩm:** `order_items` JOIN `orders` với `orders.created_at` trong kỳ và `orders.status <> 'cancelled'`, gom theo `product_id`, `SUM(quantity)` và `SUM(line_total_vnd)`. Tên, thương hiệu và `active` lấy từ `products` hiện tại. Không lọc theo `products.active`: sản phẩm đã xóa (xóa mềm) vẫn được xếp hạng, kèm `active = false`. Ảnh là `product_images` có `position` nhỏ nhất, rỗng nếu không có. Sắp xếp `quantity DESC, revenue DESC, name ASC`, `LIMIT 5`.
- **Tồn kho thấp:** `product_variants v JOIN products p` với `v.active AND p.active AND v.stock_quantity <= 5`. `total` là `COUNT(*) OVER()`. Nhãn phân loại dùng cùng cách tổng hợp JSON như `SearchVariantOptionsAdmin`. Sắp xếp `stock_quantity ASC, p.name ASC, v.id ASC`, `LIMIT 10`.

"Biến thể đang hoạt động" (8.1, 8.4) được hiện thực là biến thể `active` thuộc sản phẩm `active`. Biến thể của sản phẩm đã ẩn không còn bán được nên không được tính.

### Frontend-admin

| Thành phần | Vị trí | Trách nhiệm |
|---|---|---|
| API service và wire types | `src/api/dashboard.ts` | `getDashboard(range)` qua `src/api/client.ts`; kiểu TypeScript đúng 1:1 với API-ADMIN-DASHBOARD@1 |
| Trang | `src/pages/DashboardPage.tsx` (thay toàn bộ nội dung) | Đọc và ghi `?range=` bằng `useSearchParams`. Giá trị không hợp lệ được thay bằng `7d` (`replace`), không gửi lên API. Dùng `useQuery(['admin-dashboard', range])` với `placeholderData: keepPreviousData` (9.1). Nút "Làm mới" gọi `refetch()`. Hiển thị `generatedAt` theo `HH:mm dd/MM/yyyy` giờ VN. Lỗi hiển thị thông báo tiếng Việt kèm nút "Thử lại" và không render số 0 (9.2). Tắt refetch tự động (`refetchOnWindowFocus: false`, không `refetchInterval`) (2.6) |
| Thành phần con | `src/components/dashboard/` | `RangeSelector`, `RevenueSummary`, `RevenueChart`, `OrderStatusBreakdown`, `PendingWorkList`, `TopProductsList`, `LowStockList`, và skeleton của từng khu vực |
| Định dạng tiền | Tại chỗ hiển thị | Số tiền là chuỗi, phải định dạng mà không qua `Number` để không mất độ chính xác (9.4). Truyền chuỗi trực tiếp cho `Intl.NumberFormat('vi-VN', {style:'currency', currency:'VND'})`, hoặc dùng `BigInt`. Hỗ trợ giá trị âm cho `netVnd` |
| Nhãn trạng thái đơn | Dùng lại `ORDER_STATUS_LABELS` trong `src/api/types.ts` | Nhãn giống trang đơn hàng (5.2) |
| Biểu đồ | `RevenueChart` | SVG/CSS thuần. Mỗi ngày có cột "Đã giao" và cột "Đã hoàn tiền", cùng một điểm đánh dấu "Doanh thu thuần" nối thành đường. Ba chuỗi phân biệt bằng cả màu lẫn hình dạng (cột đặc, cột có họa tiết sọc, điểm hình thoi trên đường), kèm chú giải (legend). Mỗi cột focus được, khi hover/chạm/focus hiện tooltip với ngày `dd/MM`, đã giao, đã hoàn và thuần (4.4). Có `<table>` ẩn trực quan (`sr-only`) chứa toàn bộ điểm dữ liệu cho trình đọc màn hình (10.3) |
| Điều hướng | `PendingWorkList`, `OrderStatusBreakdown`, `TopProductsList`, `LowStockList` | Mỗi mục là `<Link>` của React Router tới đích trong 5.3, 6.1, 7.4, 8.3. Sản phẩm bán chạy có `active = false` không render thành `<Link>` và hiển thị nhãn "Đã ngừng bán" (7.6). Mục việc cần xử lý > 0 được làm nổi bật, mục = 0 hiển thị trung tính (6.5) |

### Layout quản trị responsive (10.1, 10.4)

`frontend-admin/src/components/layout/AdminLayout.tsx` là layout dùng chung của mọi route admin (`App.tsx`). Breakpoint là `lg` của Tailwind (1024px).

- **Từ `lg` trở lên:** giữ nguyên giao diện hiện tại: sidebar `w-64` cố định, header và `main` như cũ, không có nút menu.
- **Dưới `lg`:**
  - Sidebar ẩn.
  - Header có nút menu (`<button>` với `aria-label="Mở menu điều hướng"`, `aria-expanded`, `aria-controls` trỏ tới ngăn).
  - Nhấn nút mở ngăn điều hướng dạng overlay. Ngăn chứa đúng các `NavLink` hiện có, giữ kiểu active hiện tại; danh sách mục được dùng chung cho sidebar và ngăn, không lặp lại.
  - Ngăn đóng khi chọn một mục, nhấn Escape, hoặc nhấn vào lớp phủ. Khi đóng, focus trở về nút menu. Khi mở, focus chuyển vào ngăn.
- **Chống tràn ngang:** padding của header và `main` thu nhỏ dưới `lg` (ví dụ `px-4`/`p-4`). Tiêu đề header được rút gọn hoặc ẩn bớt phần phụ (badge phiên bản) để không tràn ngang từ 320px. Thông tin người dùng giữ hành vi `hidden sm:block` hiện có.
- **Thư viện:** không thêm dependency; dùng Tailwind, `lucide-react` (`Menu`, `X`) và các thành phần `src/components/ui/` có sẵn.

### Mở rộng trang hiện có (6.4)

- **`ReviewsPage`:** khởi tạo `has_reply` từ `?has_reply=` (`yes` hoặc `no`; giá trị khác hoặc không có tham số thì về `''`). Khi đổi bộ lọc `has_reply` thì ghi tham số lên URL (bỏ tham số khi là "Tất cả"). Các bộ lọc khác (`rating`, `page`) giữ nguyên hành vi hiện tại trong state.
- **`ChatSupportPage`:** khởi tạo `filter` từ `?filter=unread` (giá trị khác thì về `'all'`). Khi đổi tab thì ghi `?filter=unread` hoặc bỏ tham số. Route `chat/:conversationId` giữ query string khi chuyển hội thoại.
- **`OrdersPage`:** đã đọc `?status=` từ URL, nhưng ô chọn trạng thái thiếu tùy chọn `partially_returned`, nên với `/orders?status=partially_returned` danh sách đã lọc mà ô chọn lại hiển thị "Tất cả trạng thái". Cần bổ sung tùy chọn "Trả hàng một phần" (nhãn lấy từ `ORDER_STATUS_LABELS`), để cả 9 trạng thái ở 5.3 đều hiển thị đúng bộ lọc tại trang đích.
- **`ReturnsPage`:** đã đọc `?status=` từ URL và có đủ `pending_approval`, `received`, không cần thay đổi.

## Mô hình dữ liệu (Data Models)

Không có bảng hay cột mới. Tính năng chỉ đọc dữ liệu.

#### Contract DB-DASHBOARD-INDEXES (rev 1)

Migration `backend/db/migrations/000019_dashboard_indexes.up.sql`:

```sql
CREATE INDEX orders_delivered_at_idx ON orders (delivered_at) WHERE delivered_at IS NOT NULL;
CREATE INDEX orders_created_at_idx ON orders (created_at);
CREATE INDEX return_requests_refunded_at_idx ON return_requests (refunded_at) WHERE status = 'refunded';
```

File `.down.sql` tương ứng `DROP INDEX IF EXISTS` ba index trên. Sau khi thêm migration thì chạy `make db-up` và `make gen`.

Nguồn dữ liệu chuẩn:

| Số liệu | Nguồn |
|---|---|
| Doanh thu, đơn | `orders` (`total_vnd`, `status`, `created_at`, `delivered_at`) |
| Hoàn tiền | `return_requests` (`refund_amount_vnd`, `refunded_at`, `status`) |
| Sản phẩm bán chạy | `order_items` (`product_id`, `quantity`, `line_total_vnd`) + `products` + `product_images` |
| Tồn kho | `product_variants` (`stock_quantity`, `active`) + `products.active` + `variant_option_values` / `product_option_groups` / `product_option_values` |
| Đánh giá chưa phản hồi | sqlc `CountAdminReviews` |
| Hội thoại chưa đọc | sqlc `CountConversationsForAdmin` |

## Xử lý lỗi (Error Handling)

| Tình huống | Phản hồi |
|---|---|
| Thiếu hoặc sai token | 401, middleware hiện có |
| Không phải admin | 403 `forbidden`, middleware hiện có |
| `range` không hợp lệ | 400 `invalid_filter`, `fields.range = "Kỳ báo cáo không hợp lệ"` |
| Lỗi DB hoặc lỗi không mong đợi | 500 `internal` qua `writeError`; log `slog` ở mức error kèm `range`, không log dữ liệu nhạy cảm |
| Frontend: lỗi tải lần đầu | Khu vực nội dung thay bằng thông báo "Không thể tải số liệu tổng quan" và nút "Thử lại" (`refetch`) |
| Frontend: lỗi khi đổi kỳ hoặc làm mới | Không giữ số liệu cũ như thể là số liệu của kỳ mới: hiển thị trạng thái lỗi và nút "Thử lại" (9.2) |
| Frontend: 401 | Theo `client.ts` hiện có (refresh hoặc chuyển về đăng nhập) |

## Chiến lược kiểm thử (Testing Strategy)

### Backend

- **Use case unit test (`internal/usecase/dashboard`):** dùng clock cố định và repository giả.
  - Ranh giới kỳ UTC+7 cho `today`, `7d`, `30d`, kể cả thời điểm 23:30 và 00:10 giờ VN.
  - Lấp ngày trống. Tổng bằng tổng chuỗi theo ngày.
  - `netVnd` âm.
  - `averageOrderVnd` chia lấy phần nguyên và bằng `"0"` khi không có đơn.
  - Đủ 9 trạng thái.
  - `range` sai trả `FilterValidationError`, `range` rỗng dùng `7d`.
- **Repository integration test (`internal/repository/dashboard_repository_integration_test.go`, cần PostgreSQL theo mẫu integration test hiện có):**
  - Đơn ở mọi trạng thái, với `delivered_at` và `created_at` ở trong, ngoài và đúng ranh giới kỳ.
  - Hoàn tiền `refunded` và không `refunded`.
  - Đơn hủy bị loại khỏi top sản phẩm. Tie-break của top sản phẩm. Sản phẩm đã xóa mềm vẫn được xếp hạng với `active = false`.
  - Biến thể và sản phẩm inactive bị loại. Tồn kho đúng 5 và 6.
  - Giới hạn 10 kèm `total` lớn hơn 10.
  - Số "chưa phản hồi" và "chưa đọc" bằng kết quả của query gốc.
  - Hiệu năng (9.5): seed 50.000 đơn và 200.000 dòng hàng, gọi repository cho cả ba `range`, assert mỗi lần dưới 1 giây.
- **Handler test + contract snapshot (`internal/delivery/http/admin_dashboard_handler_test.go`):**
  - 401 không token. 403 tài khoản customer.
  - 400 `range=1y`. 200 với `range` mặc định và `range=today`.
  - Ghi golden snapshot vào `.dream/specs/admin-dashboard/contract-snapshots.json` qua `assertOrRecordContractSnapshot`.

### Frontend-admin (Vitest + Testing Library)

- **`src/api/dashboard.test.ts`:** URL và tham số `range`, trả về payload.
- **`src/pages/DashboardPage.test.tsx`:**
  - Mặc định `7d`. Đọc và ghi `?range=`. `?range=bad` chuyển về `7d`.
  - Skeleton khi tải; giữ số liệu cũ kèm chỉ báo khi đổi kỳ.
  - Lỗi kèm "Thử lại" và không hiển thị số 0.
  - "Làm mới" gọi lại API và cập nhật thời điểm.
  - Không còn nội dung giữ chỗ cũ.
  - Render đúng số tiền dạng chuỗi lớn (vượt `Number.MAX_SAFE_INTEGER`) và số âm.
  - Đủ 9 trạng thái với link đúng. Đủ 6 mục việc cần xử lý với link đúng và trạng thái nổi bật hoặc trung tính.
  - Top sản phẩm và tồn kho kèm empty state. Nhãn "Hết hàng". Sản phẩm `active = false` có nhãn "Đã ngừng bán" và không phải là link.
  - Tooltip của biểu đồ khi hover/focus. Bảng `sr-only`. Thao tác bàn phím.
- **`src/pages/ReviewsPage.test.tsx`, `src/pages/ChatSupportPage.test.tsx`:** khởi tạo bộ lọc từ URL, ghi URL khi đổi bộ lọc, mặc định không đổi khi không có tham số.
- **`src/pages/OrdersPage.test.tsx`:** `/orders?status=partially_returned` hiển thị đúng tùy chọn "Trả hàng một phần" trong ô chọn.
- **`src/components/layout/AdminLayout.test.tsx`:** nút menu có `aria-expanded` đúng; nhấn mở ngăn chứa đủ các mục điều hướng; đóng khi chọn mục, nhấn Escape, nhấn lớp phủ; focus trở về nút menu. Test hiện có `CategoriesPage.test.tsx` và `OrdersPage.test.tsx` (render `AdminLayout`) vẫn pass.
- **`src/test/App.test.tsx`:** thay các assertion về nội dung giữ chỗ cũ bằng assertion trang tổng quan mới, mock API dashboard cho các test render `/`.

### E2E

Chế độ thực thi: **`Mode 2: Shape-Locked Mock E2E`**. Mọi route `/api/v1` được khai báo trong một lần gọi `mountContractRoutes` của helper dùng chung `frontend/e2e/fixtures/contract.ts`, nạp từ `.dream/specs/admin-dashboard/contract-snapshots.json`. Suite nằm tại `frontend/e2e/admin-dashboard.spec.ts` (Page Object nếu cần đặt dưới `frontend/e2e/pages/`), vì `frontend/playwright.config.ts` là cấu hình Playwright duy nhất và đã khởi động cả dev server admin `:15174`. Lệnh chạy (từ `frontend/`): `npx playwright test e2e/admin-dashboard.spec.ts`.

- `mock-e2e`: từ trang tổng quan nhấn từng mục việc cần xử lý, trang đích mở với đúng bộ lọc (6.2). Nhấn một trạng thái đơn mở `/orders?status=…` (5.3).
- `visual`: ảnh chụp trang tổng quan ở `1440x900` và `375x812` (10.1), ảnh ngăn điều hướng đang mở ở `375x812` (10.4), cùng ảnh chụp chỉ báo focus bàn phím (10.2), lưu vào `.dream/specs/admin-dashboard/imgs/`. Báo cáo ghi ở `.dream/specs/admin-dashboard/report.md`.

## Truy vết yêu cầu (Requirement Traceability)

| Yêu cầu | Thành phần thiết kế | Kiểm chứng |
|---|---|---|
| 1.1 | `DashboardPage` + các thành phần `components/dashboard` | `component` |
| 1.2 | `DashboardPage` thay nội dung giữ chỗ | `component` |
| 1.3 | `ProtectedRoute` hiện có (không đổi) | `component` (test hiện có) |
| 1.4 | Nhóm route `admin` + middleware hiện có | `handler` |
| 2.1 | `DashboardPage` mặc định `7d`; API mặc định `7d` | `component`, `unit` |
| 2.2 | `useQuery` key theo `range`; `byStatus`/`pendingWork`/`lowStock` không phụ thuộc kỳ | `component`, `integration-db` |
| 2.3 | `?range=` qua `useSearchParams` | `component` |
| 2.4 | Frontend chuyển về `7d`; handler trả 400 `invalid_filter` | `component`, `handler` |
| 2.5 | `generatedAt` + nút "Làm mới" → `refetch` | `component` |
| 2.6 | Tắt refetch tự động | `component` |
| 3.1–3.3 | Query doanh thu/hoàn tiền theo ngày + use case tính tổng và `netVnd` | `integration-db`, `unit`, `component` (hiển thị số âm) |
| 3.4 | Use case tính `deliveredOrders`, `averageOrderVnd` | `unit`, `integration-db` |
| 3.5 | Điều kiện trạng thái trong query doanh thu | `integration-db` |
| 4.1–4.3 | Use case lấp đủ 1/7/30 ngày; `RevenueChart` | `unit`, `component` |
| 4.4 | Tooltip của `RevenueChart` | `component` |
| 4.5 | Tổng tính từ `dailyRevenue` | `unit` |
| 5.1 | Query đơn mới và đơn hủy trong kỳ | `integration-db`, `component` |
| 5.2 | Query theo trạng thái + bổ sung 0; `ORDER_STATUS_LABELS` | `unit`, `component` |
| 5.3 | `OrderStatusBreakdown` link `/orders?status=` | `component`, `mock-e2e` |
| 6.1 | `pendingWork` + `PendingWorkList` | `integration-db`, `component` |
| 6.2 | Link đích + trang đích đọc bộ lọc từ URL | `mock-e2e` |
| 6.3 | Dùng lại `CountAdminReviews`, `CountConversationsForAdmin` | `integration-db` |
| 6.4 | Mở rộng `ReviewsPage`, `ChatSupportPage` | `component` |
| 5.3 (trang đích) | `OrdersPage` bổ sung tùy chọn `partially_returned` | `component` |
| 6.5 | Trạng thái nổi bật/trung tính trong `PendingWorkList` | `component` |
| 7.1, 7.3 | Query top sản phẩm | `integration-db` |
| 7.2, 7.4, 7.5 | `TopProductsList` | `component` |
| 7.6 | Query top sản phẩm trả `active`; `TopProductsList` bỏ link và gắn nhãn | `integration-db`, `component` |
| 8.1, 8.4 | Query tồn kho thấp | `integration-db` |
| 8.2, 8.3, 8.5 | `LowStockList` | `component` |
| 9.1, 9.2 | `keepPreviousData`, skeleton, trạng thái lỗi | `component` |
| 9.3 | `writeSuccess` / `writeError`, contract snapshot | `handler` |
| 9.4 | Tiền là chuỗi; định dạng không qua `Number` | `handler`, `component` |
| 9.5 | Index `DB-DASHBOARD-INDEXES@1`, một tx | `integration-db` (test build tag `integration` seed 50.000 đơn / 200.000 dòng hàng, assert mỗi `range` hoàn tất trong 1 giây) |
| 10.1 | Bố cục responsive | `visual` |
| 10.2 | Phần tử tương tác là `<Link>`/`<button>` có focus ring | `component`, `visual` |
| 10.3 | Bảng `sr-only` + phân biệt bằng họa tiết/legend | `component` |
| 10.4 | `AdminLayout` responsive: sidebar ẩn dưới `lg`, nút menu + ngăn điều hướng, đóng bằng chọn mục/Escape/lớp phủ, trả focus | `component`, `visual` |

## Tích hợp hệ thống hiện có (Existing System Integration)

- **Xác thực admin:** dùng lại `guard.AuthRequired` + `guard.RequireAdmin()` của nhóm `/api/v1/admin`, không thêm cơ chế mới.
- **Định nghĩa "chưa phản hồi" và "chưa đọc":** nguồn chuẩn là `CountAdminReviews` (`db/queries/reviews.sql`) và `CountConversationsForAdmin` (`db/queries/chat.sql`). Dashboard gọi lại đúng các query này, nên khi định nghĩa gốc thay đổi thì số trên dashboard tự đổi theo.
- **Trang `ReviewsPage` và `ChatSupportPage` (thay đổi có chủ đích):** thêm đồng bộ bộ lọc với URL. Khi không có tham số URL, hành vi giữ nguyên như hiện tại. API `GET /admin/reviews` và `GET /admin/chat/conversations` không đổi (`has_reply=no`, `filter=unread` đã được hỗ trợ).
- **Trang `OrdersPage`:** dùng lại `?status=` sẵn có. Ô chọn trạng thái được bổ sung tùy chọn `partially_returned`; các tùy chọn và hành vi khác giữ nguyên.
- **Trang `ReturnsPage`:** dùng lại `?status=` sẵn có, không đổi.
- **`AdminLayout` (thay đổi có chủ đích, áp dụng cho mọi trang admin):** dưới 1024px dùng nút menu và ngăn điều hướng thay cho sidebar cố định. Từ 1024px trở lên giao diện giữ nguyên. Các route, mục điều hướng, chuông thông báo và nút đăng xuất không đổi.
- **Trang chỉnh sửa sản phẩm:** dùng route `/products/:id` sẵn có làm đích cho 7.4 và 8.3.
- **Nhãn trạng thái đơn:** nguồn chuẩn là `ORDER_STATUS_LABELS` trong `frontend-admin/src/api/types.ts`.
- **Quy ước tiền:** `MoneyVND` dạng chuỗi số nguyên như các API đơn hàng và đổi trả.
- **Múi giờ:** hằng số UTC+7 đã có ở `internal/domain/return.go` (`vietnamLocation`). Dashboard dùng cùng định nghĩa múi giờ, trong SQL là `'Asia/Ho_Chi_Minh'`.
- **Giả định về dữ liệu cũ:** đơn `delivered` được backfill `delivered_at` trong migration `000010`, nên mọi đơn đã giao đều có `delivered_at`. Đơn có `delivered_at` NULL không được tính doanh thu.
- **Ngoài phạm vi kỹ thuật:** không cache, không bảng tổng hợp, không cập nhật realtime qua WebSocket.
