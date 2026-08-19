# Design Document

## Overview

Feature `order-placement`: đặt hàng (checkout), sổ địa chỉ, dữ liệu tỉnh/phường-xã, tạo đơn COD, vòng đời đơn hàng (chờ xác nhận → tự xác nhận → chuẩn bị → chờ duyệt hủy), hủy/hết-hủy theo trạng thái, tự động xác nhận sau 30 phút, trang chi tiết đơn và trang lịch sử mua hàng (tabs + thống kê). Bao phủ R1–R10.

Không bao gồm phía admin/người bán: đánh dấu "đang chuẩn bị hàng", duyệt/từ chối yêu cầu hủy, chuyển sang "đã giao cho đơn vị vận chuyển", hoàn tất giao hàng, trả hàng, đánh giá sản phẩm. Các trạng thái tương ứng vẫn được mô hình hóa trong enum/DB/giao diện (số đếm = 0) để feature tương lai chỉ cần bổ sung chuyển tiếp.

## Architecture

- **Backend (Go, Gin + sqlc + Wire + pgx):** 3 bounded context mới theo mẫu hiện có `delivery -> usecase -> domain`:
  - `order`: tạo/lấy/lọc/thống kê/hủy/hoàn tác-hủy/tự-xác-nhận đơn hàng.
  - `address`: sổ địa chỉ của người dùng (CRUD + mặc định).
  - `area`: dữ liệu đơn vị hành chính (tỉnh + phường/xã) từ dataset nhúng (go:embed).
- **Frontend (React + Vite + Tailwind + shadcn/ui):** 3 trang mới (`/checkout`, `/orders`, `/orders/:id`) + chỉnh `CartPage` (CTA thật, hiển thị phí vận chuyển) + link "Lịch sử mua hàng" ở header.
- **Auto-confirm:** goroutine nền trong `cmd/server` chạy định kỳ suốt vòng đời tiến trình (tick 1 phút, hằng số nội bộ), gọi usecase `AutoConfirmDue`; không phụ thuộc signal handling (main dùng `context.Background()`). Ngưỡng 30 phút từ config `ORDER_CONFIRM_TIMEOUT`.

Luồng dữ liệu chính:

```
CartPage (chọn dòng) → GET /cart → /checkout (xem trước)
  + GET /addresses, GET /provinces, GET /provinces/:code/wards, phí VC từ cart.shippingFeeVnd
  → POST /orders {addressId, lines:[{variantId,quantity,productName,unitPriceVnd}]}
  → 201 Order → /orders/:id
  → (đã tạo) POST /orders/:id/cancel (hủy ngay | yêu cầu hủy) / POST /orders/:id/cancel/undo
  → GET /orders?status=… , GET /orders/stats
```

## Components And Interfaces

### Trạng thái đơn hàng (shared contract — mọi tầng dùng chung)

Enum duy nhất, lưu `orders.status`:

| Code | Nhãn | Thuộc tính feature này |
|---|---|---|
| `pending_confirmation` | chờ xác nhận | tạo, hủy ngay, auto-confirm |
| `confirmed` | đã xác nhận (chưa chuẩn bị) | hủy ngay |
| `preparing` | đang chuẩn bị hàng | yêu cầu hủy |
| `cancel_requested` | chờ duyệt hủy | hoàn tác yêu cầu hủy |
| `shipped` | đã giao cho vận chuyển | chặn hủy (transition do admin tương lai) |
| `delivered` | đã giao | chặn hủy (transition do feature tương lai) |
| `cancelled` | đã hủy | terminal |
| `returned` | trả hàng | terminal (feature tương lai) |

Chuyển tiếp được cài trong feature này: `pending_confirmation` → `confirmed` (auto 30p), → `cancelled` (hủy ngay); `confirmed` → `cancelled` (hủy ngay); `preparing` → `cancel_requested` (yêu cầu hủy); `cancel_requested` → `preparing` (hoàn tác). Mọi chuyển tiếp khác bị từ chối bởi usecase (an toàn kể cả khi DB không có trigger — DB chỉ kiểm tra giá trị enum).

### Backend

**`internal/domain/order.go`** — `OrderStatus`, `Order` (ID, UserID, Status, PaymentMethod="cod", SubtotalVND, ShippingFeeVND, TotalVND, ShippingInfo{RecipientName, Phone, ProvinceName, WardName, DetailAddress}, Items []OrderItem, CreatedAt, UpdatedAt, ConfirmedAt, CancelledAt, CancellableUntil), `OrderItem` (VariantID, ProductID, BrandName, ProductName, Model, ImageURL, Options, UnitPriceVND, Quantity, LineTotalVND), `OrderFilter` (StatusBucket), `OrderStats` (PendingConfirmation, AwaitingPickup, AwaitingDelivery, AwaitingReview int).

`OrderRepository` interface:
- `Create(ctx, userID string, addressID string, lines []OrderLineInput, shippingFeeVND MoneyVND) (*Order, error)`
- `GetByID(ctx, userID, orderID string) (*Order, error)`
- `ListByUser(ctx, userID string, bucket OrderStatusBucket) ([]Order, error)`
- `StatsByUser(ctx, userID string) (OrderStats, error)`
- `Cancel(ctx, userID, orderID string) (*Order, error)` — hủy ngay hoặc tạo yêu cầu hủy theo trạng thái
- `UndoCancelRequest(ctx, userID, orderID string) (*Order, error)`
- `AutoConfirmDue(ctx, cutoff time.Time) error`

`OrderLineInput{ VariantID, Quantity int64, ProductName, UnitPriceVND }` — là ảnh chụp người dùng đã xem trước (chỉ dùng để phát hiện drift; dữ liệu gốc lấy từ giỏ hàng đã khóa).

**`internal/domain/address.go`** — `Address` (ID, RecipientName, Phone, ProvinceCode int, ProvinceName, WardCode int, WardName, DetailAddress, IsDefault, CreatedAt, UpdatedAt), `AddressInput`. `AddressRepository`:
- `ListByUser(ctx, userID) ([]Address, error)`
- `GetByID(ctx, userID, id string) (*Address, error)`
- `Create(ctx, userID string, input AddressInput) (*Address, error)` — tự đặt mặc định nếu là địa chỉ đầu tiên (trong 1 tx dùng `LockUser` như `SetDefault`)
- `Update(ctx, userID, id string, input AddressInput) (*Address, error)`
- `Delete(ctx, userID, id string) error`
- `SetDefault(ctx, userID, id string) (*Address, error)`

**`internal/domain/area.go`** — `Province{Code int, Name}`, `Ward{Code int, Name}`, `AreaRepository`:
- `ListProvinces(ctx) ([]Province, error)`
- `ListWards(ctx, provinceCode int) ([]Ward, error)`
- `Resolve(ctx, provinceCode, wardCode int) (Province, Ward, error)` — dùng để validate địa chỉ + lấy tên.

**`internal/repository/order_repository.go`** — triển khai `OrderRepository`; sở hữu transaction tạo đơn (chi tiết ở "Data Models / giao dịch tạo đơn"). Tái sử dụng các query sqlc hiện có `LockUser`, `ReconcileCart`, `RefreshCartSnapshots` (db/queries/cart.sql) và các query mới trong `db/queries/orders.sql`.

**`internal/repository/address_repository.go`** — triển khai `AddressRepository`; `SetDefault` (và `Update` khi thay đổi `is_default`) chạy trong 1 tx dùng `LockUser` (quy ước giỏ hàng) để tuần tự hóa theo user, rồi xóa cờ cũ + set cờ mới — đảm bảo mỗi user chỉ có 1 địa chỉ mặc định (R2.5) kể cả khi gọi đồng thời.

**`internal/repository/area_repository.go`** — triển khai `AreaRepository` bằng dataset tĩnh nhúng `internal/area/data/admin_divisions.json` (go:embed), không đụng DB. Dữ liệu lấy từ `https://provinces.open-api.vn/api/v2` (2 cấp sau sáp nhập 2025: 34 tỉnh/thành → phường/xã), snapshot trong repo khi phát triển.

**Usecase:** `internal/usecase/order` (validate UUID + ràng buộc trạng thái), `internal/usecase/address` (validate input, ủy quyền sở hữu, phụ thuộc `AreaRepository` để resolve/validate tỉnh/xã), `internal/usecase/area` (đơn giản đọc dataset).

**Handlers + routes** (`internal/delivery/http/`):

Public (không auth — dữ liệu tham chiếu, giống catalog):
- `GET /provinces` → `Province[]`
- `GET /provinces/:code/wards` → `Ward[]` (404 nếu tỉnh không tồn tại)

Auth (`guard.AuthRequired`):
- `GET /addresses` → `Address[]`
- `POST /addresses` → 201 `Address`
- `PUT /addresses/:id` → `Address`
- `PATCH /addresses/:id/default` → `Address`
- `DELETE /addresses/:id` → 200 (data null)
- `POST /orders` → 201 `Order`
- `GET /orders?status=<bucket>` → `Order[]` (bucket: `all|pending|pickup|delivery|delivered|returns|cancelled`; mặc định `all`)
- `GET /orders/stats` → `OrderStats` (đăng ký trước `/orders/:id`)
- `GET /orders/:id` → `Order`
- `POST /orders/:id/cancel` → `Order`
- `POST /orders/:id/cancel/undo` → `Order`

`Order` JSON: `{id, status, paymentMethod:"cod", items:[{variantId, productId, brandName, productName, model, imageUrl, options, unitPriceVnd, quantity, lineTotalVnd}], recipientName, phone, provinceName, wardName, detailAddress, subtotalVnd, shippingFeeVnd, totalVnd, createdAt, updatedAt, confirmedAt?, cancelledAt?, cancellableUntil?}`. `cancellableUntil` chỉ hiện khi `status = pending_confirmation` (created_at + timeout).

**Config (`internal/config/config.go`)** — thêm 2 khóa Viper:
- `ORDER_CONFIRM_TIMEOUT` (`time.Duration`, mặc định `30m`) → `Config.OrderConfirmTimeout`.
- `SHIPPING_FEE_VND` (chuỗi số nguyên VND, mặc định `"0"`) → `Config.ShippingFeeVND MoneyVND` (validate `IsCanonical`).
Cả hai đi qua Wire vào các usecase; không đọc env ngoài `internal/config`.

**Cart response mở rộng:** `domain.Cart` và `cartResponse` thêm trường `shippingFeeVnd` (additive, backward-compatible). Cart usecase nhận `ShippingFeeVND` từ config và gán lên cart sau khi repo trả về (repo giữ nguyên — không đưa config vào tầng DB). Cart page và checkout dùng chung giá trị này.

### Frontend

- `src/api/types.ts` — thêm `Address`, `Province`, `Ward`, `OrderStatus`, `OrderItem`, `Order`, `OrderStats`, `OrderStatusBucket`; thêm `shippingFeeVnd: string` vào `Cart`.
- `src/api/areas.ts` — `listProvinces()`, `listWards(provinceCode)`.
- `src/api/addresses.ts` — `listAddresses()`, `createAddress(input)`, `updateAddress(id, input)`, `deleteAddress(id)`, `setDefaultAddress(id)`.
- `src/api/orders.ts` — `createOrder(input)`, `listOrders(status?)`, `getOrderStats()`, `getOrder(id)`, `cancelOrder(id)`, `undoCancelOrder(id)`.
- `src/pages/CheckoutPage.tsx` (`/checkout`): xem trước đơn hàng từ các dòng `selected` của giỏ hàng; chọn địa chỉ (mặc định được chọn sẵn) + quản lý địa chỉ ngay tại đó (Dialog form với Select tỉnh/phường-xã phụ thuộc tầng); hiển thị tạm tính / phí vận chuyển (`cart.shippingFeeVnd`) / tổng thanh toán; COD cố định; nút "Đặt hàng". Xử lý lỗi `product_changed` bằng Dialog "Sản phẩm X vừa được cập nhật" với **Tải lại** (refetch cart+addresses) và **Thoát** (về `/cart`). Empty state khi không có dòng được chọn.
- `src/pages/OrderHistoryPage.tsx` (`/orders`): tabs (Tất cả/Chờ xác nhận/Chờ lấy hàng/Chờ giao hàng/Đã giao/Trả hàng/Đã hủy) + thống kê 4 số (chờ xác nhận, chờ lấy hàng, chờ giao hàng, chờ đánh giá); mỗi tab gọi `listOrders(bucket)`; chọn đơn → `/orders/:id`.
- `src/pages/OrderDetailPage.tsx` (`/orders/:id`): hiển thị đầy đủ thông tin đơn; nút theo trạng thái — `pending_confirmation`: "Hủy đơn" + đếm ngược `cancellableUntil`; `confirmed`: "Hủy đơn"; `preparing`: "Yêu cầu hủy"; `cancel_requested`: "Hoàn tác yêu cầu hủy" + dòng "chờ người bán xác nhận hủy". Trạng thái khác: không hiển thị nút hủy.
- `src/pages/CartPage.tsx`: thay modal placeholder bằng điều hướng `/checkout`; dòng "Phí vận chuyển" hiển thị `cart.shippingFeeVnd` (0 → "Miễn phí").
- `src/App.tsx`: đăng ký 3 route; `Header`: thêm link "Lịch sử mua hàng" khi đã đăng nhập.
- **shadcn/ui mới trong storefront:** `dialog`, `select`, `label` (nhập theo chuẩn shadcn hiện có; admin đã có select/label/alert-dialog làm tham chiếu). Tái dùng `Button/Card/Badge/Input/Skeleton/Checkbox`. Toast dùng `ToastContext` hiện có (storefront chưa có sonner).

## Data Models

### Migration `000009_order_placement` (up/down)

`addresses`:
```
id uuid PK default gen_random_uuid()
user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE
recipient_name text NOT NULL
phone text NOT NULL
province_code integer NOT NULL
province_name text NOT NULL
ward_code integer NOT NULL
ward_name text NOT NULL
detail_address text NOT NULL
is_default boolean NOT NULL DEFAULT false
created_at / updated_at timestamptz NOT NULL DEFAULT now()
INDEX (user_id); INDEX (user_id) WHERE is_default
```
Ràng buộc "một mặc định/người dùng" được duy trì ở tầng ứng dụng (trong tx), không dùng partial unique index (cho phép "không có mặc định" khi xóa mặc định).

`orders`:
```
id uuid PK
user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT
status text NOT NULL DEFAULT 'pending_confirmation'
  CHECK (status IN ('pending_confirmation','confirmed','preparing','shipped','delivered','cancelled','cancel_requested','returned'))
payment_method text NOT NULL DEFAULT 'cod' CHECK (payment_method = 'cod')
subtotal_vnd numeric NOT NULL CHECK (trunc, >=0)
shipping_fee_vnd numeric NOT NULL CHECK (trunc, >=0)
total_vnd numeric NOT NULL CHECK (trunc, >=0)
recipient_name text NOT NULL
phone text NOT NULL
province_name text NOT NULL
ward_name text NOT NULL
detail_address text NOT NULL
created_at / updated_at timestamptz NOT NULL DEFAULT now()
confirmed_at timestamptz NULL
cancelled_at timestamptz NULL
INDEX (user_id, created_at DESC); INDEX (user_id, status)
```

`order_items`:
```
id uuid PK
order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE
variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT
product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT
brand_name text NOT NULL
product_name text NOT NULL   -- snapshot (đổi tên sau này không ảnh hưởng đơn)
model text NOT NULL DEFAULT ''
image_url text NOT NULL DEFAULT ''
options jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(options) = 'array')
unit_price_vnd numeric NOT NULL CHECK (trunc, >0)
quantity numeric NOT NULL CHECK (trunc, >0)
line_total_vnd numeric NOT NULL CHECK (trunc, >=0)
INDEX (order_id)
```

Khóa ngoại dùng `ON DELETE RESTRICT` (khớp cart_items); sản phẩm/biến thể trong app chỉ soft-delete (`active=false`) nên không đụng tới đơn đã lưu. Đơn lưu snapshot đầy đủ (tên, ảnh, options, giá, địa chỉ) nên lịch sử ổn định (R2.7, R6.1–6.3, R9.1).

`sqlc.yaml`: thêm override `order_items.quantity` → `int64`; các cột tiền (subtotal/shipping_fee/total/unit_price/line_total) truy vấn qua `::text` như `price_vnd` (MoneyVND chuỗi).

### Query sqlc mới

`db/queries/addresses.sql` — ListAddressesByUser, GetAddressByID, CountAddressesByUser, InsertAddress, UpdateAddress, DeleteAddress, ClearDefaultAddresses, SetAddressDefault.

`db/queries/orders.sql` — quan trọng:
- `LockSubmittedCartItems :many` — `SELECT ci.*, v.product_id, p.active, v.active, v.price_vnd::text, p.name AS product_name … FROM cart_items ci JOIN product_variants v ON v.id=ci.variant_id JOIN products p ON p.id=v.product_id WHERE ci.user_id=$1 AND v.id = ANY($2) FOR UPDATE OF ci, v` (khóa dòng giỏ của các variant trong yêu cầu + biến thể — nền tảng chống bán quá R6.7; khóa theo variant ID bất kể `selected` để phân loại được cả dòng bị `ReconcileCart` bỏ chọn).
- `DecrementVariantStock :one` — `UPDATE product_variants SET stock_quantity = stock_quantity - $2, updated_at=now() WHERE id=$1 AND active AND stock_quantity >= $2 RETURNING id` (không trả dòng → `ErrOutOfStock`).
- `IncrementVariantStock :exec` — hoàn kho khi hủy ngay.
- `InsertOrder :one`, `InsertOrderItem :exec`, `RemoveSelectedCartItems :exec`.
- `GetOrderByID :one` (order + items), `ListOrdersByUser :many` (user_id, statuses `[]string` rỗng = tất cả; `status = ANY($2)`), `CountOrdersByStatus :many` (GROUP BY status), `LockOrderForUpdate :one` (id, user_id `FOR UPDATE`), `SetOrderStatus :exec` (id, status, confirmed_at, cancelled_at), `AutoConfirmDueOrders :exec` (`UPDATE orders SET status='confirmed', confirmed_at=now() WHERE status='pending_confirmation' AND created_at <= $1`).

### Giao dịch tạo đơn (OrderRepository.Create)

1. `Begin` → `LockUser`.
2. `LockSubmittedCartItems` (khóa dòng giỏ của các variant trong yêu cầu + biến thể, bất kể `selected`) — lấy dữ liệu DB hiện tại (tên, giá, active, stock, selected trước reconcile).
3. `ReconcileCart` → `RefreshCartSnapshots` (giữ giỏ hàng đồng bộ theo quy ước hiện có; chạy trong cùng tx trên dòng đã khóa của chính user; `ReconcileCart` chỉ hạ cờ `selected` của dòng không đủ hàng, không xóa).
4. Phân loại từng dòng yêu cầu (theo `variantId`) dựa trên dòng giỏ đã khóa:
   - Không tồn tại dòng giỏ → `ProductChangedError` (giỏ đã thay đổi — gồm cả double-submit sau khi dòng đã bị xóa ở lần đặt đầu).
   - `NOT active` (sản phẩm hoặc biến thể) hoặc `stock < quantity` → `ErrOutOfStock`/`ErrStockLimit` (R5.6); **không** rơi vào `product_changed`.
   - `selected = false` trong khi sản phẩm vẫn khả dụng → `ProductChangedError` (người dùng bỏ chọn/thay đổi ở tab khác — view cũ).
   - Lệch `quantity`, `productName` (= `products.name` hiện tại) hoặc `unitPriceVnd` (= `price_vnd` hiện tại) → `ProductChangedError` (thu thập tên sản phẩm lệch; R5.2).
   - Ngược lại (selected, khả dụng, khớp) → đưa vào đơn.
   Mọi lỗi → rollback.
5. `GetAddressByID(addressID, userID)` trong tx → snapshot giao hàng; thiếu → `ErrAddressNotFound`.
6. Tính `subtotal = Σ(unit*quantity)` (MoneyVND, giá DB hiện tại), `total = subtotal + shippingFeeVND`.
7. `InsertOrder` (status `pending_confirmation`, `cod`, snapshot giao hàng, số tiền) → `InsertOrderItem` từng dòng (dữ liệu hiện tại từ DB).
8. `DecrementVariantStock` từng dòng (guard `stock >= qty`; không trả dòng → `ErrOutOfStock`, rollback).
9. `RemoveSelectedCartItems` (chỉ dòng `selected`; dòng không đủ hàng đã bị bỏ chọn nằm lại trong giỏ như quy ước hiện có).
10. `Commit`; trả `Order` (từ dữ liệu trong tx). Mọi lỗi → `Rollback` (toàn vẹn R6.8).

Vì biến thể bị khóa `FOR UPDATE` từ bước 2 và trừ kho bằng guard, các đơn của những người khác nhau cùng mua một biến thể sẽ serialize trên khóa dòng → không bán quá (R6.7).

### Hủy / hoàn tác (OrderRepository.Cancel / UndoCancelRequest)

- `Cancel`: validate UUID → tx → `LockOrderForUpdate(id, user_id)` (thiếu → `ErrOrderNotFound`). Theo `status`:
  - `pending_confirmation` | `confirmed` → set `cancelled` + `cancelled_at`; `IncrementVariantStock` từng dòng (hoàn kho R7.3).
  - `preparing` → set `cancel_requested` (không hoàn kho R7.5).
  - `cancel_requested` → `ErrOrderNotCancellable` (R7.6).
  - `shipped`/`delivered`/`cancelled`/`returned` → `ErrOrderNotCancellable` (R7.9, R8.4).
  Commit; trả đơn mới.
- `UndoCancelRequest`: tx → `LockOrderForUpdate`; chỉ khi `status = cancel_requested` → set `preparing` (R7.7–7.8); khác → `ErrOrderNotCancelRequested`.

### Auto-confirm (OrderRepository.AutoConfirmDue + goroutine)

`cmd/server` khởi động goroutine trong `App.Run` (bên cạnh BootstrapAdmin): ticker 1 phút gọi `orderUC.AutoConfirmDue(now - cfg.OrderConfirmTimeout)` → query bulk `pending_confirmation` → `confirmed`. Goroutine chạy suốt vòng đời tiến trình (main dùng `context.Background()`, không có signal handling riêng). R8.5 được đảm bảo vì query chỉ chọn `status='pending_confirmation'` (đơn đã hủy/khác không bị chạm).

Do tick 1 phút, cửa sổ 30 phút (R7.1) là mềm: `Cancel` chỉ kiểm tra trạng thái, không kiểm tra thời gian — đơn `pending_confirmation` quá hạn nhưng scheduler chưa chạy vẫn hủy ngay được, tương đương `confirmed` chưa chuẩn bị (R8.2). `cancellableUntil` (created_at + timeout) chỉ là đếm ngược hiển thị, không phải điều kiện chặn phía server.

## Error Handling

Bổ sung vào `internal/domain/errors.go` và `internal/delivery/http/error.go` (theo envelope hiện có, message tiếng Việt):

| Domain error | HTTP | code | message (VN) |
|---|---|---|---|
| `ProductChangedError{Products}` | 409 | `product_changed` | "Sản phẩm X vừa được cập nhật. Vui lòng tải lại để xem thông tin mới nhất." (nhiều sản phẩm: "Các sản phẩm X, Y vừa được cập nhật...") |
| `ErrCartEmpty` | 409 | `cart_empty` | "Không có sản phẩm nào để đặt hàng" |
| `ErrAddressNotFound` | 404 | `address_not_found` | "Không tìm thấy địa chỉ" |
| `ErrOrderNotFound` | 404 | `order_not_found` | "Không tìm thấy đơn hàng" (cũng dùng cho đơn của người khác → không lộ tồn tại, R7.10/R9.2) |
| `ErrOrderNotCancellable` | 409 | `order_not_cancellable` | "Đơn hàng không thể hủy được nữa" |
| `ErrOrderNotCancelRequested` | 409 | `order_not_cancel_request` | "Đơn hàng không có yêu cầu hủy đang chờ" |
| `ValidationError` | 400 | `validation_error` | fields: recipient_name/phone/province_code/ward_code/detail_address/address_id/body... |

`product_changed`, `cart_empty`, `order_not_cancellable`, `order_not_cancel_request` là lỗi kinh doanh (không `fields`) theo chuẩn AGENTS. Lỗi tỉnh/xã không hợp lệ khi lưu địa chỉ → `ValidationError` với fields `province_code`/`ward_code` (đã xác thực qua `AreaRepository.Resolve`).

Lỗi 500 → `internal` mặc định (ghi log qua logger như error.go hiện có). Không log secret/token/DB URL.

## Testing Strategy

Backend (theo mẫu hiện có: usecase dùng fake repository, không cần PostgreSQL):

- **order usecase** (fake `OrderRepository`): tạo đơn — yêu cầu hợp lệ, thiếu dòng chọn, drift tên/giá/số lượng → `ProductChangedError`, hết hàng; cancel — từng trạng thái (pending/confirmed → hoàn kho + cancelled; preparing → cancel_requested không hoàn kho; cancel_requested/shipped/delivered/cancelled → lỗi; không chủ sở hữu → `ErrOrderNotFound`); undo — chỉ từ `cancel_requested`; auto-confirm — truyền đúng `cutoff`.
- **address usecase** (fake `AddressRepository` + `AreaRepository`): địa chỉ đầu tiên tự mặc định; đặt mặc định chỉ giữ 1; validate phone/tỉnh-xã; xóa mặc định không tự thăng cấp.
- **area usecase**: liệt kê tỉnh, lấy xã theo tỉnh, resolve không hợp lệ.
- **handler tests**: envelope cho `/orders`, `/addresses`, `/provinces`; auth required; 404 đơn không thuộc user; bucket mapping.
- **Giao dịch/tính đồng thời (R6.7, R6.8):** bảo đảm bởi thiết kế SQL (khóa `FOR UPDATE` + `DecrementVariantStock` có guard + rollback toàn bộ). Verify bằng `make gen` (diff sqlc), `make test`, `make vet`; không thêm hạ tầng PG mới cho suite hiện có.

Frontend (vitest, mock API modules):

- `CheckoutPage`: hiển thị dòng selected + tổng tiền + phí VC; empty state; tạo đơn thành công → điều hướng `/orders/:id`; `product_changed` → Dialog (Tải lại refetch / Thoát về `/cart`); quản lý địa chỉ (chọn/tạo/đặt mặc định), dropdown xã phụ thuộc tỉnh.
- `OrderHistoryPage`: tabs mapping đúng bucket, stats hiển thị, empty state.
- `OrderDetailPage`: nút theo từng trạng thái (Hủy đơn / Yêu cầu hủy / Hoàn tác yêu cầu hủy / không nút), đếm ngược `cancellableUntil`.
- `CartPage`: CTA đi `/checkout`, dòng phí vận chuyển từ `cart.shippingFeeVnd`.
- `Header`: link "Lịch sử mua hàng".

Verification bắt buộc: focused tests → `npm run lint` → `npm test` → `npm run build` (frontend); `go test ./...` + `go vet ./...` + `make gen` + Wire regen (backend).

## Requirement Traceability

| Requirement | Design Elements | Verification |
|---|---|---|
| 1.1–1.4 | CartPage CTA → `/checkout`; CheckoutPage empty state; login redirect mẫu có sẵn | CartPage/CheckoutPage tests |
| 2.1–2.7 | `addresses` table; AddressRepository/UC; area Resolve; tạo đầu tiên = mặc định; SetDefault 1 tx; Delete không thăng cấp; đơn lưu snapshot | address usecase/handler tests |
| 3.1–3.4 | Dataset nhúng + `GET /provinces`, `GET /provinces/:code/wards`; Select phụ thuộc tầng; loading/error UI | area usecase/handler; CheckoutPage tests |
| 4.1–4.6 | CheckoutPage từ `GET /cart` selected; shippingFeeVnd trong cart; COD cố định; chọn địa chỉ mặc định; yêu cầu chọn địa chỉ; dữ liệu mới nhất khi tải lại | CheckoutPage tests |
| 5.1–5.6 | `POST /orders` gửi `lines[]` snapshot; Create so khớp → `ProductChangedError`; modal Tải lại/Thoát; hết hàng → out_of_stock/stock_limit | order usecase; CheckoutPage tests |
| 6.1–6.8 | Giao dịch Create (snapshot, địa chỉ, phí, trừ kho, xóa dòng giỏ, trả đơn); khóa FOR UPDATE + guard trừ kho; rollback | order usecase; sqlc diff; code review concurrency |
| 7.1–7.10 | Cancel theo status (hủy ngay/hoàn kho; yêu cầu hủy không hoàn kho; undo); LockOrderForUpdate; ErrOrderNotFound cho không chủ sở hữu | order usecase/handler tests |
| 8.1–8.5 | `AutoConfirmDueOrders` + goroutine; cancel-request từ preparing; shipped/delivered chặn hủy; cancelled không auto-confirm | order usecase; scheduler wiring |
| 9.1–9.7 | `GET /orders/:id` + OrderDetailPage; `cancellableUntil`; nút theo trạng thái; 404 không lộ | order handler; OrderDetailPage tests |
| 10.1–10.6 | `GET /orders?status`, `GET /orders/stats`; tabs mapping (Chờ lấy hàng = confirmed+preparing+cancel_requested); stats 4 số; OrderHistoryPage | order handler; OrderHistoryPage tests |

## Existing System Integration

- **Downstream impact — `GET /cart`:** thêm `shippingFeeVnd` (additive). `CartPage` bỏ dòng "Phí vận chuyển: Miễn phí" cứng → hiển thị giá trị cấu hình; bỏ modal placeholder "Thông Báo Mua Hàng" → điều hướng `/checkout`. Không phá contract cũ (chỉ thêm trường).
- **Downstream impact — Header:** thêm link "Lịch sử mua hàng" cho người dùng đã đăng nhập.
- **Supporting dependencies:**
  - Giỏ hàng theo user (`cart_items.user_id`, selection, snapshot, reconcile) là nguồn dữ liệu gốc của đơn hàng — tái dùng trực tiếp (không tạo song song).
  - Tồn kho nằm ở `product_variants.stock_quantity`; `DecrementVariantStock`/`IncrementVariantStock` mới, còn `UpdateVariantStock` cũ giữ nguyên.
  - `LockUser`, `ReconcileCart`, `RefreshCartSnapshots`, `LockVariant`, MoneyVND, `writeSuccess`/`writeError`, `guard.AuthRequired`, `callerUserID`, Wire/Viper, envelope — tái dùng; không nhân đôi.
  - Dữ liệu tỉnh/phường-xã: dataset nhúng (nguồn `provinces.open-api.vn/api/v2`), không phụ thuộc API bên ngoài lúc chạy.
- **Migration & codegen:** migration mới `000009` (make db-up); `make gen` (sqlc) + inspect diff; Wire regen sau khi thêm provider (`provideOrderRepository`, `provideAddressRepository`, `provideAreaRepository`, các usecase; chuyển `ShippingFeeVND`/`OrderConfirmTimeout` vào dependency).
- **Compatibility:** mọi endpoint mới tuân Full Status Envelope; lỗi kinh doanh tiếng Việt; admin (frontend-admin) không bị ảnh hưởng (không thêm route admin trong feature này).