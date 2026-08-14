# Tài liệu thiết kế

## Tổng quan

Feature mở rộng cả backend Go/PostgreSQL và frontend React thành cửa hàng điện thoại end-to-end. Backend là nguồn sự thật cho hãng, điện thoại, nhóm phân loại động, biến thể, giá VND, tồn kho và giỏ hàng theo tài khoản. Frontend cung cấp trang chủ công khai, catalog, chi tiết chọn biến thể và giỏ được bảo vệ bởi đăng nhập.

Thiết kế bao phủ Yêu cầu 1 đến 10. Luồng auth, error envelope và base path `/api/v1` hiện có được giữ. Tạo đơn hàng, thanh toán, trừ tồn kho và giao diện quản trị không thuộc phạm vi.

### Quyết định chính

1. **Catalog và cart đều nằm trên backend:** loại bỏ dữ liệu catalog/giỏ giả lập ở frontend để backend có thể kiểm tra variant, giá và tồn kho trước mọi thay đổi.
2. **Category hiện có trở thành brand:** giữ bảng, route và khái niệm `category_id` để giảm migration; dữ liệu active ban đầu gồm Apple và Xiaomi.
3. **Biến thể chuẩn hóa theo nhóm tùy chọn động:** mỗi sản phẩm có tập group riêng; mỗi variant có đúng một value của từng group.
4. **Giỏ chỉ thuộc tài khoản:** mọi `/cart` route dùng middleware access token hiện có. Không tạo guest cart, cookie cart hoặc merge cart.
5. **Pessimistic cart updates:** frontend chỉ cập nhật state sau response thành công; lỗi giữ snapshot backend đã xác nhận gần nhất.
6. **Soft-delete catalog:** sản phẩm và variant ngừng bán được đặt `active=false`, không xóa vật lý. Nhờ đó cart vẫn giữ được nhận diện, đồng thời snapshot trên `cart_items` là fallback ổn định.
7. **Không giữ hàng khi thêm vào giỏ:** cart kiểm tra tồn kho hiện tại nhưng không trừ tồn; checkout tương lai phải kiểm tra và trừ tồn trong transaction riêng.

## Kiến trúc

### Backend

```text
Gin delivery
├── public catalog handlers
└── AuthRequired -> cart handlers
        ↓
usecase/catalog + usecase/cart
        ↓ domain-owned interfaces
repository/catalog + repository/cart
        ↓
PostgreSQL via sqlc
```

- `cmd/server/app.go` tạo repositories/use cases và truyền vào router.
- `internal/delivery/http/router.go` giữ catalog public, thêm group `/cart` có `AuthRequired`.
- `internal/domain` sở hữu model và repository interfaces; delivery không gọi repository trực tiếp.
- `db/migrations` định nghĩa schema/constraint; `db/queries` là đầu vào duy nhất cho sqlc; generated code không sửa tay.

### Frontend

```text
AuthProvider
└── CartProvider
    └── BrowserRouter
        ├── SiteHeader
        └── Routes
            ├── /                     HomePage (public)
            ├── /products             CatalogPage (public)
            ├── /products/:id         ProductDetailPage (public; add requires auth)
            ├── /cart                 ProtectedRoute -> CartPage
            ├── /login, /register     auth pages with return location
            └── *                     NotFoundPage
```

- Endpoint-specific wire types/calls ở `src/api/catalog.ts` và `src/api/cart.ts`; tất cả dùng `src/api/client.ts`.
- Catalog filters `q`, repeated `category_id`, `min_price`, `max_price`, `in_stock` tiếp tục thuộc URL; lựa chọn variant trên trang chi tiết cũng nằm trong URL để giữ nguyên khi đi qua đăng nhập.
- `CartProvider` sở hữu server snapshot, loading/error và async actions. Không dùng `localStorage` cho cart.
- `AuthProvider` luôn khôi phục cả token và user: nếu đã có access token khi mount thì gọi `/auth/me`; nếu chưa có token thì dùng refresh cookie như hiện tại. Auth chỉ hết `loading` sau khi nhánh tương ứng hoàn tất, nhờ đó reload có token vẫn tải được cart.

### Luồng thêm vào giỏ

1. Trang chi tiết tải product và suy ra variant từ các option query params.
2. Nếu thiếu option, frontend chỉ ra group còn thiếu. Nếu variant không hợp lệ/hết hàng, frontend không gửi request.
3. Nếu chưa đăng nhập, frontend điều hướng tới `/login` với `location` nội bộ hiện tại trong router state.
4. Login thành công điều hướng về nguyên pathname/search. Frontend không tự thêm; người dùng bấm lại để xác nhận.
5. `POST /cart/items` chỉ nhận `variantId`. Backend lấy toàn bộ dữ liệu còn lại từ catalog, khóa variant, và atomically insert/increment cart line.
6. Response trả toàn bộ cart đã reconcile; `CartProvider` thay snapshot và header/page render cùng dữ liệu.

### Luồng reconcile catalog với cart

Mọi lần đọc hay thay đổi cart chạy reconcile trong transaction trước khi tạo response:

- Product/variant inactive: `availability=unavailable`, persist `selected=false`.
- Stock bằng 0: `availability=out_of_stock`, persist `selected=false`.
- Quantity lớn hơn stock dương: `availability=insufficient_stock`, persist `selected=false`.
- Các trường hợp khác: `availability=available`; reconcile không tự chọn lại.

Không tự xóa hoặc tự giảm quantity. Summary chỉ tính line `available && selected`.

## Thành phần và giao diện

### Backend domain models

```go
type Category struct {
    ID   string
    Name string
}

type OptionValue struct {
    ID    string
    Label string
}

type OptionGroup struct {
    ID       string
    Label    string
    Position int
    Values   []OptionValue
}

type ProductVariant struct {
    ID             string
    OptionValueIDs map[string]string // group ID -> value ID
    PriceVND       MoneyVND
    StockQuantity  int64
    Active         bool
}

type Product struct {
    ID          string
    Name        string
    Model       string
    Description string
    Category    Category
    ImageURLs   []string
    Featured    bool
    Active      bool
    OptionGroups []OptionGroup
    Variants    []ProductVariant
    CreatedAt   time.Time
    UpdatedAt   time.Time
}

type ProductFilter struct {
    Query       string
    CategoryIDs []string
    MinPriceVND *MoneyVND
    MaxPriceVND *MoneyVND
    InStock     *bool
}

type CatalogRepository interface {
    ListCategories(context.Context) ([]Category, error)
    ListProducts(context.Context, ProductFilter) ([]Product, error)
    ListFeaturedProducts(context.Context) ([]Product, error)
    GetProductByID(context.Context, string) (*Product, error)
}
```

List responses chỉ cần summary projection nhưng repository trả domain product có variants tối thiểu để use case suy ra min/max price và availability. Detail trả đầy đủ option groups/values/variants. Chỉ product active xuất hiện trong catalog public; detail inactive trả `product_not_found`. `ListCategories` chỉ trả category có ít nhất một product active, nên category legacy không xuất hiện như brand.

### Catalog HTTP contract

Các endpoint public:

```http
GET /api/v1/categories
GET /api/v1/products?q=iphone&category_id=<apple>&category_id=<xiaomi>&min_price=10000000&max_price=40000000&in_stock=true
GET /api/v1/products/featured
GET /api/v1/products/:id
```

`GET /products` đọc `QueryArray("category_id")`. UUID sai định dạng trả `400 invalid_filter`; UUID đúng định dạng nhưng không tồn tại bị bỏ qua. OR áp dụng giữa category IDs hợp lệ; AND áp dụng với `q`. `q` được trim và so khớp case-insensitive trên category name, product name, model. `min_price`/`max_price` là canonical non-negative decimal integer strings dài tối đa 38 chữ số: `0` hoặc một chữ số `1-9` theo sau bởi các chữ số; không chấp nhận dấu, số 0 đứng đầu, separator hay phần thập phân; `min <= max`. Product khớp khi tồn tại một active variant có giá trong khoảng. `in_stock=true` khớp khi có ít nhất một active variant stock dương; `false` khớp khi không có active variant stock dương. Các query params và error code cũ được giữ.

Summary response:

```json
{
  "products": [{
    "id": "uuid",
    "name": "iPhone 16 Pro",
    "model": "A3294",
    "brand": { "id": "uuid", "name": "Apple" },
    "minPriceVnd": "28990000",
    "maxPriceVnd": "40990000",
    "primaryImageUrl": "https://...",
    "inStock": true
  }]
}
```

Detail response thêm `description`, `imageUrls`, `optionGroups`, `variants`, `featured`, `createdAt`, `updatedAt`. Mỗi variant có `id`, `optionValueIds`, `priceVnd`, `stockQuantity`, không expose inactive variant. Mọi trường tiền (`minPriceVnd`, `maxPriceVnd`, `priceVnd`) là chuỗi decimal integer trên JSON để không mất chính xác; frontend parse bằng `BigInt` chỉ cho phép tính/format tiền.

Catalog list/detail chỉ trả product active có ít nhất một active variant. Nếu variant active cuối cùng bị ngừng bán, product tự biến mất khỏi list/featured và detail public trả `product_not_found`; cart vẫn reconcile các dòng cũ thành `unavailable` qua soft-deleted records.

### Cart domain và repository

```go
type CartAvailability string

const (
    CartAvailable         CartAvailability = "available"
    CartUnavailable       CartAvailability = "unavailable"
    CartOutOfStock        CartAvailability = "out_of_stock"
    CartInsufficientStock CartAvailability = "insufficient_stock"
)

type CartOption struct {
    GroupLabel string
    ValueLabel string
}

// MoneyVND is a canonical base-10, non-negative integer string with no sign,
// leading zero (except "0"), grouping separator, or decimal separator. Product
// prices are positive; zero is permitted only for filter bounds and aggregates.
type MoneyVND string

type CartItem struct {
    ID             string
    VariantID      string
    ProductID      string
    BrandName      string
    ProductName    string
    Model          string
    ImageURL       string
    Options        []CartOption
    UnitPriceVND   *MoneyVND
    StockQuantity  int64
    Quantity       int64
    Selected       bool
    Availability   CartAvailability
}

type Cart struct {
    Items            []CartItem
    TotalUnits       int64
    SelectedLineCount int
    SelectedTotalVND MoneyVND
}

type CartRepository interface {
    Get(context.Context, userID string) (*Cart, error)
    AddVariant(context.Context, userID, variantID string) (*Cart, error)
    SetQuantity(context.Context, userID, itemID string, quantity int64) (*Cart, error)
    SetSelected(context.Context, userID, itemID string, selected bool) (*Cart, error)
    SetAllSelected(context.Context, userID string, selected bool) (*Cart, error)
    Remove(context.Context, userID, itemID string) (*Cart, error)
}
```

Repository methods là transaction boundaries vì atomicity phụ thuộc row locks và constraints. Use case chịu trách nhiệm UUID/body validation, ownership-neutral error mapping và chỉ gọi method với `userID` từ token. Repository atomically reconcile, thực hiện mutation, load cart và commit. Nó trả domain sentinel errors, không trả pgx errors ra delivery.

### Cart HTTP contract

Mọi endpoint sau yêu cầu Bearer access token:

```http
GET    /api/v1/cart
POST   /api/v1/cart/items
PUT    /api/v1/cart/items/:itemId
PATCH  /api/v1/cart/items/:itemId/selection
PUT    /api/v1/cart/selection
DELETE /api/v1/cart/items/:itemId
```

Request bodies:

```json
POST  /cart/items                  { "variantId": "uuid" }
 PUT   /cart/items/:itemId          { "quantity": 2 }
PATCH /cart/items/:itemId/selection { "selected": true }
PUT   /cart/selection              { "selected": true }
```

Mọi success trả `200 OK` với cùng shape `{ "cart": CartResponse }`; `POST` cũng dùng 200 vì có thể tạo hoặc increment. `CartResponse.items` dùng camelCase tương ứng domain fields và thêm nullable `lineTotalVnd`; summary gồm `totalUnits`, `selectedLineCount`, `selectedTotalVnd`. `unitPriceVnd`, `lineTotalVnd`, `selectedTotalVnd` là canonical `MoneyVND` decimal strings; hai trường line là JSON `null` cho `out_of_stock`/`unavailable`. Repository scan PostgreSQL `numeric` aggregates trực tiếp thành string hoặc use case dùng `math/big.Int`; domain, mapper và wire không thu hẹp tổng về `int64`. Frontend dùng `BigInt`, không `Number`.

Stable errors trong error envelope hiện có:

| HTTP | Code | Khi nào |
|---|---|---|
| 400 | `validation_error` | JSON/UUID/quantity không hợp lệ |
| 401 | `unauthorized` / `invalid_token` | Thiếu token hoặc token hỏng/hết hạn |
| 404 | `cart_item_not_found` | Item không tồn tại hoặc thuộc user khác |
| 404 | `variant_not_found` | Variant không tồn tại |
| 409 | `variant_unavailable` | Product/variant inactive |
| 409 | `out_of_stock` | Stock bằng 0 |
| 409 | `stock_limit` | Add/increment/set quantity vượt stock |
| 409 | `cart_item_unavailable` | Mutation không được phép với line lỗi |
| 500 | `internal` | Lỗi không dự kiến, log server-side |

Không trả thông tin ownership trong error. Response lỗi không chứa SQL hoặc dữ liệu nội bộ.

### Frontend API types

`src/api/catalog.ts` thay wire types cũ bằng `Brand`, `ProductSummary`, `ProductDetail`, `OptionGroup`, `ProductVariant`; `fetchProducts` append từng `category_id` và giữ `min_price`/`max_price`/`in_stock`. `src/api/cart.ts` định nghĩa `Cart`, `CartItem`, `CartAvailability` và sáu wrapper đúng HTTP contract. `src/api/client.ts` bổ sung `put`, `patch`, `delete`; cơ chế credentials, bearer và one-time 401 refresh giữ nguyên.

### ProductCard, HomePage và CatalogPage

`ProductCard` nhận summary, hiển thị brand/name/model, ảnh, giá đơn hoặc khoảng giá VND, stock và link detail. Không thêm trực tiếp vì option bắt buộc.

`HomePage` công khai, tải `/products/featured`, hiển thị hero/CTA cùng loading, empty, error/retry. `CatalogPage` giữ `q`, repeated `category_id`, `min_price`, `max_price`, `in_stock` trong URL, tải brand từ `/categories`, hiển thị tổng kết quả, loading thay kết quả cũ, reset/no-results và retry.

### VariantSelector và ProductDetailPage

```ts
type VariantSelection = Record<string, string>

interface VariantSelectorProps {
  optionGroups: OptionGroup[]
  variants: ProductVariant[]
  selection: VariantSelection
  onChange(groupId: string, valueId: string): void
}
```

Selection được lưu bằng repeated query params `option=<groupId>:<valueId>`; chỉ UUID group/value thuộc product hiện tại được khôi phục. Một value chưa chọn enabled khi có ít nhất một variant chứa value đó và khớp lựa chọn ở các group khác. Value đang chọn luôn thao tác được; chọn lại nó sẽ xóa lựa chọn của group. Người dùng vì vậy có thể bỏ lựa chọn xung đột rồi chuyển sang nhánh variant khác mà không bị mắc kẹt. Value không tương thích vẫn disabled và không được submit. Không chọn mặc định.

Khi đã match đúng một variant, trang hiển thị giá/tồn kho và nút add. Nếu chưa login, click add chuyển `/login` với router `state.from` là location nội bộ đầy đủ; sau login/register quay lại location đó và không tự gửi add. Nếu đã login, gọi `CartProvider.addVariant` và thông báo success/error bằng `aria-live`.

### CartProvider và CartPage

```ts
interface CartContextValue {
  cart: Cart | null
  loading: boolean
  error: string | null
  reload(): Promise<void>
  addVariant(variantId: string): Promise<void>
  setQuantity(itemId: string, quantity: number): Promise<void>
  setSelected(itemId: string, selected: boolean): Promise<void>
  setAllSelected(selected: boolean): Promise<void>
  remove(itemId: string): Promise<void>
}
```

Provider không fetch khi auth đang restore hoặc user null; khi user đổi, hủy/ignore response cũ, reset snapshot rồi fetch cart. AuthProvider gọi `/auth/me` nếu mount với persisted access token và dùng refresh restore nếu không có token, nên `user` không bị bỏ trống sau reload. Provider xếp mọi mutation cart của user vào một Promise queue và disable toàn bộ cart controls trong lúc queue có việc; chỉ response theo đúng thứ tự enqueue được thay vào snapshot. Backend đồng thời khóa user row làm per-cart mutex trước reconcile/mutation/load, nên full-cart response luôn phản ánh mọi transaction cart đã commit trước đó của user. Lỗi tạm thời giữ snapshot và dừng operation đó; provider reload cart trước khi tiếp tục queue/retry. Refresh hoặc `/auth/me` thất bại làm AuthProvider xóa user/token; provider xóa cart, ProtectedRoute đưa về login.

`CartPage` hiển thị theo `availability`:

- `available`: tăng/giảm trong range, chọn, xóa.
- `insufficient_stock`: checkbox disabled; chỉ cho set quantity từ 1 đến `stockQuantity` hoặc xóa.
- `out_of_stock`, `unavailable`: checkbox và quantity controls disabled; chỉ cho xóa; hiển thị availability text thay đơn giá/thành tiền.

Chọn tất cả gọi API backend, không tự map local. CTA tiếp tục mua disabled nếu `selectedLineCount=0`; click enabled chỉ thông báo checkout chưa có.

### Auth return location và routes

`ProtectedRoute` tiếp tục đặt `state.from=location`. Login/Register chỉ sử dụng `Location` object do router tạo và fallback `/`; không nhận URL ngoài origin, tránh open redirect. Link chuyển giữa login/register giữ `from`. Trang chủ bỏ `ProtectedRoute`; `/cart` dùng nó; route `*` hiển thị `NotFoundPage`.

### Accessibility và responsive

Style tiếp tục tập trung trong `src/index.css`, giữ breakpoint 900/600 px. Product grid co về một cột; cart chuyển từ row sang stacked layout dưới 600 px; header wrap nhưng không ẩn ba link chính. Mọi control có accessible name, `:focus-visible`; status dùng text và `role=alert`/`aria-live`, không chỉ màu. `ProductImage` fallback giữ tên và action.

## Mô hình dữ liệu

### Migration `000003_phone_variants_cart`

Migration up:

1. Thêm `model text NOT NULL DEFAULT ''`, `featured boolean NOT NULL DEFAULT false`, `active boolean NOT NULL DEFAULT false` vào `products`; existing generic products giữ inactive.
2. Giữ các cột legacy `price`, `currency`, `stock_quantity` để rollback không mất dữ liệu hiện hữu. Catalog API mới không đọc các cột này; seed phone vẫn ghi giá variant thấp nhất, `VND` và tổng stock vào chúng để schema legacy luôn hợp lệ cho rollback.
3. Tạo `product_option_groups(id, product_id, label, position)` với unique `(product_id, label)` và `(product_id, id)`.
4. Tạo `product_option_values(id, product_id, group_id, label, position)` với composite FK bảo đảm value thuộc group/product, unique `(group_id, label)` và `(product_id, group_id, id)`.
5. Tạo `product_variants(id, product_id, price_vnd numeric(38, 0), stock_quantity numeric, active boolean, created_at, updated_at)` với `price_vnd > 0`, `stock_quantity = trunc(stock_quantity)` và `stock_quantity BETWEEN 0 AND 9223372036854775807`, unique `(product_id, id)`. SQLC column overrides, domain, repository và JSON wire dùng `int64`; giá vẫn dùng canonical decimal string.
6. Tạo `variant_option_values(variant_id, product_id, group_id, option_value_id)` với composite FKs tới đúng variant/product và value/product/group; primary key `(variant_id, group_id)`.
7. Constraint trigger deferred tới commit kiểm tra mỗi variant có đúng toàn bộ groups của product và không variant nào trong cùng product có tổ hợp value trùng nhau.
8. Tạo `cart_items(id, user_id, variant_id, quantity numeric, selected, snapshot_brand_name, snapshot_product_name, snapshot_model, snapshot_image_url, snapshot_options jsonb, created_at, updated_at)`. FK user cascade; FK variant restrict để catalog dùng soft-delete; unique `(user_id, variant_id)`; quantity `= trunc(quantity)` và `BETWEEN 1 AND 9223372036854775807`; SQLC/domain/repository dùng `int64`; snapshot options phải là JSON array.
9. Tạo indexes cho category/product, group/value, variant/product, cart/user và các query search/join.

Migration down chỉ xóa cart/variant/option tables và ba product metadata columns mới. Vì các legacy price/currency/stock columns không bị drop và seed phone luôn điền aggregate hợp lệ, rollback giữ nguyên dữ liệu generic lẫn phone ở shape cũ mà không cần suy diễn dữ liệu đã mất.

### Seed

Seed idempotent thay catalog generic active bằng dữ liệu phone deterministic:

- Brand tối thiểu Apple, Xiaomi.
- Nhiều phone với model, mô tả, ảnh và featured flag.
- Ít nhất một phone có groups `Dung lượng` + `Màu sắc`; một phone có thêm `Phiên bản mạng` để chứng minh group động.
- Giá integer VND, variants còn hàng/hết hàng, và ít nhất một tổ hợp option không tồn tại.

Seed insert toàn bộ product/groups/values/variants/links trong transaction để deferred constraints kiểm tra ở commit. Existing generic rows không bị xóa nhưng inactive và không xuất hiện qua API.

### Snapshot và availability

Khi add variant, backend ghi snapshot nhãn/ảnh/options vào cart item. Khi catalog còn active, cart response dùng dữ liệu live và refresh snapshot trong cùng transaction. Khi product/variant inactive, response dùng snapshot. `unitPriceVnd`/`lineTotalVnd` lấy từ live variant cho `available` và `insufficient_stock`; với `out_of_stock` hoặc `unavailable`, cả hai trả null và line không tham gia summary.

`snapshot_options` được decode vào typed struct, không đưa trực tiếp thành HTML. Cart không lưu email, token hoặc dữ liệu cá nhân ngoài FK `user_id`.

### Concurrency

- `AddVariant` transaction khóa variant row `FOR UPDATE`, sau đó dùng unique `(user_id, variant_id)` và `INSERT ... ON CONFLICT ... DO UPDATE quantity = cart_items.quantity + 1` với điều kiện quantity mới không vượt stock.
- `SetQuantity` khóa cart row và variant row; mọi query lọc đồng thời `item_id` và `user_id`.
- Selection/remove khóa cart row; select-all update theo `user_id` sau reconcile.
- Mọi cart transaction khóa user row `FOR UPDATE` trước các row khác để tuần tự hóa toàn bộ mutation/get-reconcile của một tài khoản và tránh deadlock do lock order khác nhau.
- Nếu mutation bị từ chối sau reconcile vì `unavailable`, `out_of_stock` hoặc `insufficient_stock`, repository vẫn commit phần reconcile, trả typed result chứa full reconciled cart cùng domain error. Handler trả stable 409 error và không kèm cart; frontend nhận lỗi thì gọi GET `/cart` để lấy trạng thái vừa commit trước khi cho retry. Lỗi database bất ngờ vẫn rollback toàn transaction.
- Nếu conditional upsert/update không trả row, repository phân biệt stock/status/not-found trong cùng transaction và trả sentinel error ổn định.
- Cart không decrement inventory nên concurrent carts có thể cùng chứa stock hiện tại; đây là hành vi dự kiến trước checkout.

## Xử lý lỗi

### Backend

- Delivery validate JSON và gọi `writeError`; bổ sung mapping sentinel cart/variant nhưng giữ envelope `{error:{code,message,fields?}}`.
- UUID malformed/quantity ngoài miền trả 400 trước repository.
- Lỗi hạ tầng/database rollback toàn transaction. Lỗi nghiệp vụ phát hiện sau reconcile commit phần `selected=false` bắt buộc rồi trả stable error; frontend reload để nhận cart đã reconcile.
- Constraint/serialization lỗi dự kiến được map thành domain error; lỗi bất ngờ log server-side và trả `internal`.
- Product/variant inactive, zero stock và insufficient stock là trạng thái nghiệp vụ, không bị che thành 500.
- Query item của user khác trả cùng `cart_item_not_found` như ID không tồn tại.

### Frontend

- Catalog pending thay kết quả cũ; reject hiển thị alert/retry.
- Cart mutation reject không optimistic rollback; provider reload cart để nhận reconcile đã commit rồi hiển thị message theo stable code.
- 401 đi qua one-time refresh hiện có. Nếu refresh thất bại, auth/cart state bị xóa và route protected trở về login.
- Unknown product hiển thị not-found; ảnh lỗi dùng fallback.
- Invalid option query params bị bỏ qua; UI yêu cầu chọn lại thay vì tự chọn variant.

## Chiến lược kiểm thử

### Backend domain/use case

- Catalog filter validation, trim/case behavior, repeated valid/nonexistent category IDs, integer VND range, in-stock semantics, featured/detail/not-found (3.1-3.14, 8.1-8.8, 10.4-10.6).
- Cart UUID/body validation, add/set/select/remove orchestration và domain error propagation bằng fake repository (4.9-4.10, 9.1-9.16).

### Backend repository/SQL

- Tạo integration suite có build tag `integration`, dùng `testcontainers-go` khởi tạo image `postgres:17.6-alpine`, apply toàn bộ up migrations và tự cleanup. Thêm target `test-integration` vào `backend/Makefile` chạy suite này và yêu cầu Docker; đây là quality gate bắt buộc, không được thay bằng sqlc compilation.
- Kiểm tra migration up/down/up và seed idempotent; variant thiếu group, value sai group, duplicate combination, VND upper/lower bound, stock checks và brand endpoint không lộ category legacy (3.9, 7.1, 8.8, 10.1-10.3).
- Transaction tests: concurrent add cùng user/variant không duplicate/lost update/vượt stock; concurrent mutations khác dòng được serialize và response sau chứa cả hai thay đổi; rejected mutation vẫn commit reconcile; ownership isolation; inactive/zero/reduced stock; nullable unavailable price; snapshot; live price; arbitrary-precision line/summary (5.6, 5.9-5.12, 9.1-9.16).

### Backend handlers

- Public catalog không token, multi-category query và exact response fields.
- Mỗi cart route: unauthorized/invalid token, malformed body, success, stable 404/409/error envelope; fake repository xác nhận caller user ID từ token (1.6, 3.13, 4.8-4.10, 9.1-9.7).

### Frontend unit/component

- BigInt VND formatter/totals; variant compatibility; URL option serialization; cart API methods/types (7.1, 8.1-8.5).
- `MemoryRouter` tests cho header/routes/public home/catalog/not-found, URL `q`, repeated category, min/max/in-stock, loading/empty/error/retry (1.1-2.4, 3.1-3.14).
- Detail tests cho dynamic options, invalid combinations, price/stock, unauthenticated return-through-login và authenticated add/error (4.1-4.4, 4.6-4.10, 8.1-8.6).
- AuthProvider/CartProvider tests cho persisted-token `/auth/me` restore, refresh-cookie restore, user lifecycle, load/reload, serialized mutation queue, pessimistic success/failure/reconcile reload, refresh failure và stale response cancellation (4.5, 5.2, 5.6-5.8, 10.4).
- Integration test frontend/API tạo hai client storage/session độc lập, đăng nhập cùng tài khoản, thay đổi content và selection ở client thứ nhất, rồi reload ở client thứ hai để xác nhận backend trả cùng cart; không chia sẻ provider memory hoặc browser storage (5.6).
- CartPage tests cho four availability states, allowed controls, select/select-all, summary, empty và checkout-placeholder (5.1-5.12, 6.1-6.6, 9.11-9.16).
- Role/name/live region/image fallback tests cho accessibility; keyboard test dùng `Tab`/`Shift+Tab`, `Enter`/`Space` để đi theo thứ tự DOM và kích hoạt navigation, search/filter, từng variant control, quantity, row/select-all checkboxes, remove và cart CTA; mỗi focus stop phải có computed visible focus indicator (7.2-7.4).

### Automated responsive smoke tests

- Thêm Playwright config, script `test:e2e` trong `frontend/package.json` và Chromium smoke suite chạy production preview tại 320, 600, 900 và 1180 px bằng API fixtures/interception deterministic.
- Suite mở home/catalog/detail/cart/login/not-found, thao tác navigation, filters, option selection, login return, add cart, selection và quantity; assert không có horizontal document overflow, controls chính visible/actionable và không có page/console errors. Tại viewport desktop và mobile, suite dùng keyboard-only `Tab`/`Shift+Tab` cùng `Enter`/`Space` để xác nhận thứ tự focus DOM hợp lý, visible focus indicator và activation cho navigation, search/filter, variant, quantity, checkbox, remove và cart CTA.

### Verification commands

- Backend focused tests, `make gen`, `make test`, `make test-integration`, `make vet` trong `backend/`; inspect generated diff sau sqlc.
- Frontend focused tests, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e` trong `frontend/`.
- Root `make test` và `make build` cho cross-package verification.

## Truy vết yêu cầu

| Yêu cầu | Thành phần thiết kế | Xác minh |
|---|---|---|
| 1.1-1.5 | Routes, `SiteHeader`, cart summary, responsive CSS, `NotFoundPage` | Route/header tests, viewport checks |
| 1.6 | Protected `/cart`, auth return location | Unauthenticated cart/login-return test |
| 2.1-2.4 | Public `HomePage`, featured endpoint, `ProductCard` | Home content/empty/error tests |
| 3.1-3.8 | Catalog API/use case/page, URL `q`, async states | Filter/result/loading/retry tests |
| 3.9-3.14 | Active-phone categories as brands, repeated `category_id`, price/stock URL filters, public routes | Multi-brand/range/stock/direct URL/no-auth tests |
| 4.1-4.4 | Variant selector, `POST /cart/items`, stock checks | Add/dedupe/out-of-stock/limit tests |
| 4.5 | Backend cart persistence and provider reload | Remount/second-session tests |
| 4.6-4.8 | Required options, variant ID key, auth return query | Missing/distinct variant/login-return tests |
| 4.9-4.10 | Server-side variant lookup and stable errors | Tampered/missing/inactive variant tests |
| 5.1-5.8 | Cart response/page, protected API, pessimistic mutations | Render/mutation/error and two-independent-session tests |
| 5.9-5.12 | Reconcile statuses and restricted controls | Deleted/zero/reduced/repaired stock tests |
| 6.1-6.6 | Persisted selection, valid-only summary and CTA | Row/all selection and totals tests |
| 7.1 | `price_vnd numeric(38,0)`, `MoneyVND` domain/wire, BigInt formatter/aggregate | Boundary formatter/line/summary tests |
| 7.2-7.4 | Semantic controls, fallback, alert/live regions | Accessibility component tests |
| 7.5 | Central responsive CSS and Playwright viewport matrix | Automated overflow/focus/route interaction smoke |
| 8.1-8.6 | Detail API/page and dynamic `VariantSelector` | Detail/combination/not-found tests |
| 8.7-8.8 | Normalized option/variant schema and detail mapper | Contract and constraint tests |
| 9.1-9.7 | Protected cart handlers, ownership queries, error mapping | Handler/use case/repository tests |
| 9.8 | Unique key, locks, conditional upsert | Concurrent repository test |
| 9.9-9.10 | Live catalog joins, snapshot refresh, response summary | Live data/price update tests |
| 9.11-9.16 | Reconcile transaction, availability enum, valid-only selection | Catalog-change cart tests |
| 10.1-10.3 | Migration constraints, deferred integrity trigger, seed | Mandatory testcontainers migration/seed integration tests |
| 10.4 | Existing auth/client/error boundaries | Existing regression suites and full build |
| 10.5-10.6 | Catalog SQL filtering and ID validation | Search/multi-ID/nonexistent-ID tests |
