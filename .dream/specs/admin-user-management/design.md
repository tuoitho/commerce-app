# Tài liệu thiết kế

## Tổng quan (Overview)

Thiết kế bổ sung trạng thái tài khoản (`active` / `locked`) vào bảng `users`, một nhóm API quản trị mới `/api/v1/admin/users` (danh sách, chi tiết, khóa, mở khóa), và hai trang mới trong `frontend-admin` (`/users`, `/users/:id`) thay cho mục điều hướng "Người dùng" đang bị vô hiệu. Luồng xác thực hiện có được mở rộng để từ chối đăng nhập và gia hạn phiên của tài khoản bị khóa.

Phạm vi theo yêu cầu: 1.1–1.3, 2.1–2.7, 3.1–3.7, 4.1–4.6, 5.1–5.11, 6.1–6.5, 7.1–7.5, 8.1–8.6.

Các quyết định kỹ thuật chính:

| ID | Quyết định | Lựa chọn | Lý do | Phương án đã loại |
|---|---|---|---|---|
| TD-1 | Nơi lưu trạng thái khóa | Thêm cột `status`, `locked_at`, `lock_reason` vào `users` | Trạng thái là thuộc tính một-một của tài khoản; truy vấn đăng nhập và gia hạn phiên đã đọc `users` nên không cần join thêm | Bảng `user_locks` riêng: thêm join vào mọi truy vấn xác thực mà không có lợi ích vì không lưu lịch sử khóa |
| TD-2 | Bounded context mới | Use case `internal/usecase/usermgmt` + interface `domain.UserAdminRepository` riêng | Tách nghiệp vụ quản trị khỏi `auth`; không mở rộng `domain.UserRepository` nên các fake repository hiện có của `auth` không phải hiện thực thêm phương thức | Mở rộng `auth.UseCase`: trộn nghiệp vụ quản trị vào luồng xác thực công khai |
| TD-3 | Tính nguyên tử khi khóa | Một transaction: `UPDATE users ... WHERE id = $1 AND role = 'customer' AND status = 'active'` rồi thu hồi mọi refresh token của tài khoản | Điều kiện trong `WHERE` bảo đảm không khóa nhầm quản trị viên và không ghi đè lần khóa trước khi hai quản trị viên thao tác đồng thời (5.9) | Đọc rồi ghi không khóa dòng: hai yêu cầu đồng thời có thể cùng thành công |
| TD-4 | Chặn phiên đăng nhập tranh chấp với thao tác khóa | Gia hạn phiên kiểm tra trạng thái tài khoản ngoài việc kiểm tra token bị thu hồi; mở khóa thu hồi lại mọi refresh token của tài khoản trong cùng transaction | Một lần đăng nhập hoặc gia hạn chạy song song với thao tác khóa có thể tạo refresh token sau bước thu hồi. Kiểm tra trạng thái khi gia hạn khiến token đó vô dụng khi tài khoản còn bị khóa (5.4, 5.6), và thu hồi khi mở khóa bảo đảm token đó không "sống lại" sau khi mở khóa (6.3) | Chỉ dựa vào thu hồi khi khóa: refresh token tạo trong khoảng tranh chấp dùng lại được sau khi mở khóa |
| TD-5 | Tìm kiếm email | `strpos(lower(email::text), lower(search)) > 0`, không dùng `LIKE` | Ký tự `%` và `_` trong từ khóa được hiểu đúng nghĩa đen mà không cần escape; quét tuần tự 10.000 dòng nằm trong ngân sách 8.1 | Index `pg_trgm`: thêm extension không cần thiết ở quy mô 10.000 tài khoản |
| TD-6 | Số đơn trên danh sách | Subquery đếm theo `user_id` cho từng dòng của trang hiện tại, dùng index `orders_user_id_status_idx` hiện có | Chỉ đếm 20 dòng mỗi trang; không cần bảng tổng hợp | Cột đếm phi chuẩn hóa trên `users`: phải đồng bộ ở mọi luồng tạo đơn |
| TD-7 | Phản hồi của khóa / mở khóa | Trả về đầy đủ `AdminUserDetail` | Giao diện cập nhật trang chi tiết bằng chính phản hồi, không cần lời gọi thứ hai (5.2, 6.2) | Trả 204: giao diện phải gọi lại API chi tiết |
| TD-8 | Thông báo thành công trên giao diện | Vùng thông báo nội tuyến `role="status"` trên trang chi tiết | `frontend-admin` không có thư viện toast; thông báo nội tuyến truy cập được với trình đọc màn hình | `alert()` như một số trang cũ: chặn thao tác và khó kiểm thử |

## Kiến trúc (Architecture)

```text
frontend-admin                                          backend
AdminLayout: mục "Người dùng" → /users
UsersPage ──useQuery(['admin-users', search, role, status, page])──► GET  /api/v1/admin/users
  │  (bộ lọc trên URL ?search=&role=&status=&page=)                    │ guard.AuthRequired + RequireAdmin (401/403)
  └─ chọn dòng → /users/:id (state.from = location.search)             ▼
UserDetailPage ──useQuery(['admin-user', id])──────────────────► GET  /api/v1/admin/users/:id
  ├─ đơn gần nhất → /orders/:orderId (trang hiện có)              AdminUserHandler (delivery/http)
  ├─ LockUserDialog   ──useMutation──────────────────────────► POST /api/v1/admin/users/:id/lock
  └─ UnlockUserDialog ──useMutation──────────────────────────► POST /api/v1/admin/users/:id/unlock
                                                                       │
                                                                       ▼
                                                               usermgmt.UseCase (usecase/usermgmt)
                                                                       │ kiểm tra tham số, phân loại lỗi
                                                                       ▼
                                                               domain.UserAdminRepository
                                                                       ▼
                                                               repository.UserAdminRepository → sqlc (db/queries/user_admin.sql
                                                                                                + RevokeRefreshTokensByUserID)

frontend / frontend-admin LoginPage ──► POST /api/v1/auth/login ──► auth.UseCase.Login: mật khẩu đúng + locked → 403 account_locked
client.ts refresh                   ──► POST /api/v1/auth/refresh ──► auth.UseCase.Refresh: user locked → 401 invalid_token
```

Chiều phụ thuộc giữ nguyên `delivery -> usecase -> domain`; repository hiện thực interface do `internal/domain` sở hữu. Wire được mở rộng bằng provider cho repository và use case mới.

## Thành phần và giao diện (Components And Interfaces)

### Contract API-ADMIN-USERS (rev 1)

Mọi route đăng ký trong nhóm `admin` hiện có của `router.go` (`guard.AuthRequired`, `guard.RequireAdmin()`). Thiếu hoặc sai token trả 401 (`unauthorized` / `invalid_token`); người gọi không phải `admin` trả 403 `forbidden`. Cả hai đi qua middleware hiện có, không đọc hay ghi dữ liệu. Mọi phản hồi theo Full Status Envelope; thời điểm là chuỗi RFC 3339 UTC; số tiền là chuỗi số nguyên thập phân; số đếm là number.

**Kiểu dùng chung**

```jsonc
// AdminUserSummary
{
  "id": "7b0c…",                       // uuid
  "email": "khach@example.com",
  "role": "customer",                  // "customer" | "admin"
  "status": "active",                  // "active" | "locked"
  "orderCount": 3,                     // số đơn mọi trạng thái, >= 0
  "createdAt": "2026-11-01T02:03:04Z"
}

// AdminUserDetail
{
  "id": "7b0c…",
  "email": "khach@example.com",
  "role": "customer",
  "status": "locked",
  "createdAt": "2026-11-01T02:03:04Z",
  "lockedAt": "2026-11-12T08:00:00Z",  // null khi status = "active"
  "lockReason": "Spam đánh giá",       // null khi active hoặc khi khóa không kèm lý do
  "orderSummary": {
    "totalOrders": 3,                  // mọi trạng thái
    "deliveredOrders": 1,              // status ∈ delivered, partially_returned, returned
    "deliveredTotalVnd": "25990000",   // tổng total_vnd của đơn đã giao, "0" khi không có
    "lastOrderAt": "2026-11-10T05:00:00Z" // null khi chưa có đơn
  },
  "recentOrders": [                    // tối đa 5, created_at giảm dần rồi id giảm dần; [] khi chưa có đơn
    { "id": "…", "status": "delivered", "totalVnd": "25990000", "createdAt": "2026-11-10T05:00:00Z" }
  ]
}
```

`recentOrders[].status` dùng đúng tập giá trị trạng thái đơn hàng hiện có (`OrderStatus`).

**`GET /api/v1/admin/users`**

- Query: `search` (chuỗi, bỏ khoảng trắng đầu và cuối, rỗng = không lọc, tối đa 100 ký tự sau khi bỏ khoảng trắng), `role` (`customer` | `admin` | rỗng), `status` (`active` | `locked` | rỗng), `page` (mặc định 1), `limit` (mặc định 20, 1–100).
- Thứ tự kiểm tra: lỗi `page`, `limit`, `search` gom chung thành HTTP 400 `validation_error` với `error.fields.{page|limit|search}`. Nếu không có lỗi đó, `role` / `status` sai trả HTTP 400 `invalid_filter` với `error.fields.{role|status}` = `"Giá trị lọc không hợp lệ"` (qua `domain.FilterValidationError`). `error.message` là thông điệp chung hiện có của `invalid_filter` ("Tiêu chí lọc sản phẩm không hợp lệ"); đây là lỗi validation nên không thuộc quy tắc thông điệp nghiệp vụ, và giao diện không hiển thị thông điệp này vì chỉ gửi giá trị lọc hợp lệ. Thông tin chẩn đoán nằm ở `error.fields`.
- Thành công: HTTP 200, `message = "Users retrieved successfully"`, `data` = `AdminUserSummary[]` (mảng rỗng khi không có kết quả hoặc `page` vượt số trang), `meta.pagination` = `{page, limit, total, totalPages, hasNext, hasPrev}` theo `PaginationMeta` hiện có (`totalPages = 0` khi `total = 0`).
- Thứ tự: `created_at` giảm dần, rồi `id` giảm dần.

**`GET /api/v1/admin/users/:id`**

- Thành công: HTTP 200, `message = "User retrieved successfully"`, `data` = `AdminUserDetail`.
- `:id` không phải uuid hợp lệ hoặc không tồn tại: HTTP 404 `user_not_found`, `error.message = "Không tìm thấy người dùng"`.

**`POST /api/v1/admin/users/:id/lock`**

- Body (JSON, có thể bỏ trống hoặc `{}`): `{"reason"?: string | null}`. Lý do được bỏ khoảng trắng đầu và cuối; chuỗi rỗng sau khi bỏ khoảng trắng được lưu là `null`. Dài hơn 500 ký tự (đếm theo ký tự Unicode) sau khi bỏ khoảng trắng: HTTP 400 `validation_error`, `error.fields.reason = "Lý do khóa tối đa 500 ký tự"`. JSON sai định dạng: HTTP 400 `validation_error`, `error.fields.body = "Định dạng không hợp lệ"`.
- Thành công: HTTP 200, `message = "User locked successfully"`, `data` = `AdminUserDetail` sau khi khóa.
- Lỗi nghiệp vụ, kiểm tra theo thứ tự: không tồn tại → 404 `user_not_found`; `role = admin` → 409 `cannot_lock_admin` ("Không thể khóa tài khoản quản trị viên"); đã `locked` → 409 `user_already_locked` ("Tài khoản đã bị khóa trước đó"). Lỗi validation `reason` được kiểm tra trước các lỗi nghiệp vụ.

**`POST /api/v1/admin/users/:id/unlock`**

- Không có body.
- Thành công: HTTP 200, `message = "User unlocked successfully"`, `data` = `AdminUserDetail` sau khi mở khóa (`lockedAt = null`, `lockReason = null`).
- Lỗi: không tồn tại → 404 `user_not_found`; không ở `locked` (gồm mọi tài khoản `admin`) → 409 `user_not_locked` ("Tài khoản không ở trạng thái bị khóa").

### Contract API-AUTH-LOCKED (rev 1)

Mở rộng hành vi của các endpoint xác thực hiện có; hình dạng phản hồi thành công không đổi (7.3).

- `POST /api/v1/auth/login`: khi email tồn tại, mật khẩu đúng và `status = locked` → HTTP 403, `error.code = "account_locked"`, `error.message = "Tài khoản của bạn đã bị khóa. Vui lòng liên hệ bộ phận hỗ trợ."`, không đặt cookie refresh token, không tạo refresh token. Mật khẩu sai → giữ nguyên 401 `invalid_credentials`.
- `POST /api/v1/auth/refresh`: khi token hợp lệ nhưng tài khoản `locked` → giữ nguyên phản hồi token không hợp lệ hiện có (401 `invalid_token`); token không bị thay thế.
- `POST /api/v1/auth/register`, `/logout`, `/me`: không đổi. `UserPublic` (`{id, email, role}`) không thêm trường.

### Backend

- **Domain (`internal/domain`)**
  - `User` thêm `Status string`, `LockedAt *time.Time`, `LockReason *string`; hằng `UserStatusActive = "active"`, `UserStatusLocked = "locked"`. `User.Public()` không đổi.
  - Lỗi mới: `ErrAccountLocked`, `ErrUserNotFound`, `ErrCannotLockAdmin`, `ErrUserAlreadyLocked`, `ErrUserNotLocked`, ánh xạ trong `writeError` theo bảng ở mục Xử lý lỗi.
  - `UserAdminRepository` (file mới), các kiểu dữ liệu `UserListFilter`, `UserListItem`, `UserAdminDetail` (gồm thông tin tài khoản, tóm tắt đơn và tối đa 5 đơn gần nhất). Interface cung cấp: liệt kê có lọc và phân trang kèm tổng số; lấy chi tiết theo id (trả `ErrUserNotFound` khi không có); khóa có điều kiện (trả về đã khóa hay chưa, thu hồi refresh token trong cùng transaction); mở khóa có điều kiện (trả về đã mở hay chưa). Tên phương thức do người hiện thực chọn.
- **Repository (`internal/repository/user_admin_repository.go`)** dùng sqlc từ `db/queries/user_admin.sql` mới:
  - Danh sách: lọc `search` theo TD-5, `role`, `status`; `ORDER BY created_at DESC, id DESC`; `LIMIT/OFFSET`; `orderCount` theo TD-6. Đếm tổng bằng một query cùng điều kiện lọc.
  - Chi tiết: một query tài khoản, một query tóm tắt (`COUNT(*)`, `COUNT(*) FILTER (WHERE status IN (...))`, `COALESCE(SUM(total_vnd) FILTER (...), 0)`, `MAX(created_at)`), một query 5 đơn gần nhất.
  - Khóa: transaction theo TD-3, gọi lại `RevokeRefreshTokensByUserID` hiện có trong cùng transaction.
  - Mở khóa: trong một transaction, `UPDATE users SET status = 'active', locked_at = NULL, lock_reason = NULL, updated_at = now() WHERE id = $1 AND status = 'locked'`; nếu cập nhật được dòng, gọi lại `RevokeRefreshTokensByUserID` (TD-4).
- **Use case (`internal/usecase/usermgmt`)**
  - Kiểm tra `search`, `role`, `status`, `reason` theo API-ADMIN-USERS@1; nhận `page`/`limit` đã được handler phân tích.
  - `:id` không phải uuid (`github.com/google/uuid`) → `ErrUserNotFound`, không gọi repository.
  - Khi khóa / mở khóa không cập nhật được dòng nào: đọc lại tài khoản để phân loại lỗi theo thứ tự đã nêu trong contract. Sau khi thành công, đọc chi tiết để trả về.
- **Auth (`internal/usecase/auth`)**
  - `Login`: sau khi mật khẩu đúng, nếu `user.Status == locked` trả `ErrAccountLocked` trước `issueSession`.
  - `Refresh` (qua `validRefreshToken`): nếu tài khoản `locked` trả `ErrInvalidToken`. `Logout` của tài khoản bị khóa vẫn trả thành công (204) như hiện tại vì `ErrInvalidToken` được bỏ qua; nó không cần thu hồi gì thêm vì refresh token của tài khoản đã bị thu hồi khi khóa, và token phát sinh trong khoảng tranh chấp bị thu hồi khi mở khóa (TD-4).
  - Fake `fakerepos.Users` không cần phương thức mới; user tạo bởi fake mặc định `Status = active`.
- **SQL hiện có cần chọn thêm cột trạng thái:** `CreateUser`, `GetUserByEmail`, `GetUserByID` (`users.sql`) và `GetRefreshTokenByHash` (`refresh_tokens.sql`) trả thêm `status` (và với `users.sql`, `locked_at`, `lock_reason`); `UserRepository` và `SessionRepository` ánh xạ sang `domain.User`.
- **Handler (`internal/delivery/http/admin_user_handler.go`)**
  - Phân tích `page`/`limit` theo đúng quy tắc và thông điệp `fields` của `AdminOrderHandler.List`.
  - Ánh xạ sang JSON camelCase của API-ADMIN-USERS@1 qua `writeSuccess` / `writePaginatedSuccess` / `writeError`.
  - Sau khi khóa / mở khóa thành công, ghi log `slog` mức `info`: `msg = "admin user locked"` / `"admin user unlocked"`, thuộc tính `admin_id` (`callerUserID`), `user_id`. Không log email, lý do, token (8.6).
  - Router thêm trường `UserMgmt *usermgmtuc.UseCase` vào `Dependencies`; nhóm `admin.Group("/users")` chỉ đăng ký khi trường khác `nil` (cùng mẫu với `Dashboard`).
- **Wire (`cmd/server`)**: `provideUserAdminRepository`, `provideUserMgmtUseCase`, thêm tham số vào `provideGinRouter`; sinh lại `wire_gen.go`.

### Frontend-admin

- **`src/api/users.ts`**: kiểu `AdminUserSummary`, `AdminUserDetail`, `UserRole`, `UserStatus`, `ListAdminUsersParams`; hàm `listAdminUsers(params)` (trả `ApiResponseWithMeta<AdminUserSummary[]>`), `getAdminUser(id)`, `lockAdminUser(id, reason)`, `unlockAdminUser(id)`. Mọi lời gọi qua `client.ts`. Nhãn hiển thị `USER_ROLE_LABELS`, `USER_STATUS_LABELS`.
- **Định dạng thời gian:** mọi thời điểm hiển thị theo giờ Việt Nam bất kể múi giờ của trình duyệt. `HH:mm dd/MM/yyyy` dùng `formatVietnamDateTime` hiện có trong `src/components/dashboard/formatters.ts` (cố định `Asia/Ho_Chi_Minh`). `dd/MM/yyyy` dùng hàm mới `formatVietnamDate` trong cùng module, cố định `Asia/Ho_Chi_Minh`. Không dùng `formatDateTime` của `src/lib/utils.ts` (phụ thuộc múi giờ trình duyệt).
- **Focus của hộp thoại (8.3):** mở rộng `AlertDialogContent` dùng chung trong `src/components/ui/alert-dialog.tsx`: khi mở, focus vào thẻ hộp thoại (`tabIndex=-1`) hoặc phần tử có `autoFocus` bên trong; khi đóng, trả focus về phần tử đang có focus trước khi mở. Hành vi Escape / nhấn lớp phủ giữ nguyên, nên các trang đang dùng `AlertDialog` không đổi hành vi nào khác.
- **`src/pages/UsersPage.tsx`** (route `users`):
  - Đọc / ghi `search`, `role`, `status`, `page` trên URL; giá trị sai → mặc định (3.5). Bỏ tham số mặc định khỏi URL.
  - Form tìm kiếm (`maxLength=100`, nút "Tìm", submit bằng Enter), hai `Select` bộ lọc, bảng, phân trang 20 dòng.
  - Trạng thái: đang tải, lỗi kèm "Thử lại", rỗng (2.4, 2.5).
  - Email là `Link` tới `/users/:id` với `state = { from: location.search }` (2.6, 4.5).
  - Bảng đặt trong vùng `overflow-x-auto` (8.2).
- **`src/pages/UserDetailPage.tsx`** (route `users/:id`):
  - Thông tin tài khoản, tóm tắt mua hàng, đơn gần nhất (dùng `ORDER_STATUS_LABELS`, `formatVND`, `formatVietnamDateTime` hiện có, link `/orders/:orderId`).
  - Liên kết "Quay lại danh sách" về `/users` + `state.from` khi có (4.5).
  - Trạng thái 404 (`ApiError.code === 'user_not_found'`) và lỗi khác kèm "Thử lại" (4.4, 4.6).
  - Nút "Khóa tài khoản" chỉ khi `role = customer` và `status = active`; nút "Mở khóa tài khoản" chỉ khi `status = locked`.
  - Hộp thoại dùng `AlertDialog` hiện có. Khóa có `Textarea` "Lý do khóa" (`maxLength=500`, có `label`), hiển thị `err.fields.reason` tại ô khi API trả `validation_error`.
  - Mutation thành công: `setQueryData(['admin-user', id], data)`, `invalidateQueries({queryKey: ['admin-users']})`, đóng hộp thoại, hiển thị thông báo nội tuyến `role="status"` ("Đã khóa tài khoản" / "Đã mở khóa tài khoản").
  - Lỗi 409 (`user_already_locked`, `user_not_locked`, `cannot_lock_admin`): đóng hộp thoại, hiển thị `err.message` trong vùng thông báo `role="alert"`, gọi `refetch` chi tiết.
  - Nút xác nhận bị vô hiệu khi mutation đang chạy (8.4).
- **`src/components/layout/AdminLayout.tsx`**: mục "Người dùng" đổi thành `{ to: '/users', icon: Users, label: 'Người dùng' }` (bỏ `disabled`, `title`). Mục "Cài đặt" giữ nguyên.
- **`src/App.tsx`**: thêm route `users` và `users/:id` trong layout được bảo vệ.

### Frontend (cửa hàng)

Không cần thay đổi mã: `LoginPage` hiện hiển thị `err.message` cho mọi lỗi API khác `invalid_credentials`, và `client.ts` không thử refresh cho route xác thực. Bổ sung component test chứng minh thông điệp `account_locked` hiển thị (5.5).

## Mô hình dữ liệu (Data Models)

#### Contract DB-USER-STATUS (rev 1)

Migration `backend/db/migrations/000020_add_user_status.up.sql`:

```sql
ALTER TABLE users
    ADD COLUMN status      varchar(16) NOT NULL DEFAULT 'active',
    ADD COLUMN locked_at   timestamptz NULL,
    ADD COLUMN lock_reason text        NULL,
    ADD CONSTRAINT users_status_chk CHECK (status IN ('active', 'locked')),
    ADD CONSTRAINT users_lock_state_chk CHECK (
        (status = 'locked' AND locked_at IS NOT NULL)
        OR (status = 'active' AND locked_at IS NULL AND lock_reason IS NULL)
    ),
    ADD CONSTRAINT users_lock_reason_len_chk CHECK (lock_reason IS NULL OR char_length(lock_reason) <= 500);

CREATE INDEX users_created_at_id_idx ON users (created_at DESC, id DESC);
```

`.down.sql` xóa index, ba constraint và ba cột theo thứ tự ngược lại.

Bất biến:

- Tài khoản hiện có nhận `status = 'active'` qua `DEFAULT` (7.1). `CreateUser` không truyền `status` nên tài khoản đăng ký và bootstrap là `active` (7.2, 7.4).
- Chỉ luồng khóa của `usermgmt` ghi `status = 'locked'`, và chỉ với `role = 'customer'`.
- `lock_reason` được lưu sau khi bỏ khoảng trắng; không lưu chuỗi rỗng.
- Thu hồi refresh token dùng cột `refresh_tokens.revoked_at` hiện có; không thêm bảng.

Sau migration: `make db-up`, `make gen` (sqlc sinh lại `models.go` và các querier bị ảnh hưởng).

## Xử lý lỗi (Error Handling)

| Tình huống | Phản hồi |
|---|---|
| Thiếu hoặc sai token | 401, middleware hiện có |
| Không phải admin | 403 `forbidden`, middleware hiện có |
| `page` / `limit` / `search` sai | 400 `validation_error`, `error.fields` theo tham số |
| `role` / `status` sai | 400 `invalid_filter`, `error.fields.{role\|status}` |
| `reason` quá 500 ký tự / JSON sai | 400 `validation_error`, `error.fields.reason` / `error.fields.body` |
| Tài khoản không tồn tại hoặc id sai định dạng | 404 `user_not_found`, "Không tìm thấy người dùng" |
| Khóa tài khoản admin | 409 `cannot_lock_admin`, "Không thể khóa tài khoản quản trị viên" |
| Khóa tài khoản đã khóa | 409 `user_already_locked`, "Tài khoản đã bị khóa trước đó" |
| Mở khóa tài khoản không bị khóa | 409 `user_not_locked`, "Tài khoản không ở trạng thái bị khóa" |
| Đăng nhập đúng mật khẩu, tài khoản bị khóa | 403 `account_locked`, "Tài khoản của bạn đã bị khóa. Vui lòng liên hệ bộ phận hỗ trợ." |
| Gia hạn phiên của tài khoản bị khóa | 401 `invalid_token` (thông điệp hiện có) |
| Lỗi DB hoặc lỗi không mong đợi | 500 `internal` qua `writeError` (log mức error hiện có) |
| Frontend: 401 | Theo `client.ts` hiện có (refresh hoặc chuyển về đăng nhập) |

## Chiến lược kiểm thử (Testing Strategy)

### Backend

- **Use case unit test (`internal/usecase/usermgmt`)** với repository giả: kiểm tra `search` (bỏ khoảng trắng, đúng 100 / 101 ký tự), `role`, `status`; `reason` (bỏ khoảng trắng, rỗng → `nil`, đúng 500 / 501 ký tự Unicode); id sai định dạng → `ErrUserNotFound`; phân loại lỗi khi khóa / mở khóa không cập nhật được (không tồn tại, admin, đã khóa, chưa khóa).
- **Auth unit test (`internal/usecase/auth`)**: đăng nhập tài khoản bị khóa đúng mật khẩu → `ErrAccountLocked` và không tạo refresh token; sai mật khẩu → `ErrInvalidCredentials`; refresh của tài khoản bị khóa với token chưa thu hồi → `ErrInvalidToken`; tài khoản `active` giữ hành vi cũ (test hiện có vẫn pass).
- **Repository integration test (`internal/repository/user_admin_repository_integration_test.go`, build tag `integration`, PostgreSQL)**:
  - Lọc theo từ khóa (không phân biệt hoa thường, `%` và `_` theo nghĩa đen), vai trò, trạng thái, kết hợp; thứ tự và phân trang ổn định; `orderCount`; tổng số.
  - Chi tiết: tóm tắt đơn với đơn ở mọi trạng thái, tài khoản không có đơn (0, `"0"`, `null`, `[]`), giới hạn 5 đơn gần nhất.
  - Khóa: chuyển trạng thái, thu hồi mọi refresh token trong cùng transaction; không khóa `admin`; không ghi đè lần khóa trước; constraint `users_lock_state_chk`.
  - Mở khóa: xóa `locked_at`, `lock_reason`; thu hồi refresh token còn hiệu lực của tài khoản (TD-4); không tác động tài khoản `active`.
  - Đăng nhập / phiên: `GetUserByEmail` và `GetRefreshTokenByHash` trả đúng `status`.
  - Hiệu năng (8.1): seed 10.000 tài khoản và 50.000 đơn; danh sách (không lọc, có từ khóa, có bộ lọc) và chi tiết mỗi lần dưới 1 giây.
- **Handler test + contract snapshot (`internal/delivery/http/admin_user_handler_test.go`, `auth_handler_test.go`)**: 401, 403 cho cả bốn route; 400 `validation_error` (`page`, `limit`, `search`, `reason`, `body`); 400 `invalid_filter`; 404; ba lỗi 409; 200 cho danh sách (có `meta.pagination`), chi tiết, khóa, mở khóa; log `info` khi khóa / mở khóa không chứa email hay lý do; đăng nhập tài khoản bị khóa trả 403 `account_locked`. Ghi golden snapshot API-ADMIN-USERS@1 và API-AUTH-LOCKED@1 vào `.dream/specs/admin-user-management/contract-snapshots.json` qua `assertOrRecordContractSnapshot` (khóa 401 dùng đúng tên `unauthenticated_401`).

### Frontend-admin (Vitest + Testing Library)

- **`src/api/users.test.ts`**: URL và query string, method, body của khóa, trả về payload và `meta`.
- **`src/pages/UsersPage.test.tsx`**: cột và nhãn; đọc / ghi URL; giá trị URL sai → mặc định; đổi bộ lọc về trang 1; tìm bằng Enter và nút "Tìm"; phân trang và nút bị vô hiệu ở biên; rỗng; lỗi kèm "Thử lại"; link chi tiết mang `state.from`.
- **`src/pages/UserDetailPage.test.tsx`**: thông tin và tóm tắt; "Chưa có đơn hàng" / "Tài khoản chưa có đơn hàng"; link đơn; "Không có lý do"; 404; lỗi khác kèm "Thử lại"; nút khóa chỉ cho customer active, nút mở khóa chỉ khi locked; hộp thoại: hủy không gọi API, xác nhận gửi lý do, nút xác nhận bị vô hiệu khi đang gửi, lỗi `fields.reason` tại ô, 409 hiển thị thông điệp và tải lại; thông báo thành công; focus vào hộp thoại khi mở và trở về nút khi đóng; "Quay lại danh sách" về đúng URL có bộ lọc.
- **`src/components/layout/AdminLayout.test.tsx`**: mục "Người dùng" là link tới `/users`, không còn "Sắp ra mắt" trên mục này.
- **`src/components/ui/alert-dialog.test.tsx`**: focus vào hộp thoại khi mở, trả focus về phần tử kích hoạt khi đóng; Escape và lớp phủ vẫn đóng.
- **`src/components/dashboard/formatters.test.ts`** (hoặc test hiện có của module): `formatVietnamDate` trả `dd/MM/yyyy` theo giờ Việt Nam, kể cả thời điểm 17:30Z (sang ngày hôm sau ở UTC+7).
- **`src/pages/LoginPage.test.tsx`**: lỗi 403 `account_locked` hiển thị thông điệp tiếng Việt.

### Frontend cửa hàng (Vitest)

- **`src/pages/LoginPage.test.tsx`**: lỗi 403 `account_locked` hiển thị thông điệp tiếng Việt.

### E2E

Chế độ thực thi: **`Mode 2: Shape-Locked Mock E2E`**. Chỉ tiêu chí 8.2 cần trình duyệt (bố cục responsive), nên suite chỉ thu bằng chứng `visual`. Mọi route `/api/v1` được khai báo trong một lần gọi `mountContractRoutes` của `frontend/e2e/fixtures/contract.ts`, nạp từ `.dream/specs/admin-user-management/contract-snapshots.json`. Suite nằm tại `frontend/e2e/admin-user-management.spec.ts` vì `frontend/playwright.config.ts` là cấu hình Playwright duy nhất và đã khởi động dev server admin `:15174`. Lệnh chạy (từ `frontend/`): `npx playwright test e2e/admin-user-management.spec.ts`.

- `visual`: ảnh trang danh sách và trang chi tiết ở `1440x900` và `375x812`, assert `scrollWidth <= clientWidth` của trang ở `375x812`; ảnh lưu `.dream/specs/admin-user-management/imgs/`, báo cáo `.dream/specs/admin-user-management/report.md`.

## Truy vết yêu cầu (Requirement Traceability)

| Yêu cầu | Thành phần thiết kế | Kiểm chứng |
|---|---|---|
| 1.1 | `AdminLayout` mục "Người dùng", route `users` trong `App.tsx` | `component` |
| 1.2 | `ProtectedRoute` hiện có bao các route mới | `component` |
| 1.3 | Nhóm `admin` với `AuthRequired` + `RequireAdmin` | `handler` |
| 2.1 | API danh sách (`AdminUserSummary`), `UsersPage` | `handler`, `component` |
| 2.2 | `ORDER BY created_at DESC, id DESC` | `integration-db` |
| 2.3 | `meta.pagination`, phân trang `UsersPage` | `handler`, `component` |
| 2.4, 2.5 | Trạng thái rỗng / đang tải / lỗi của `UsersPage` | `component` |
| 2.6 | Link email `/users/:id` | `component` |
| 2.7 | Phân tích `page`/`limit` trong handler; trang vượt số trang trả `[]` | `handler`, `integration-db` |
| 3.1–3.4 | Lọc `search`/`role`/`status` trong query; form và bộ lọc `UsersPage` | `integration-db`, `component` |
| 3.5 | Đồng bộ URL trong `UsersPage` | `component` |
| 3.6, 3.7 | Kiểm tra tham số trong use case / handler; `maxLength=100` | `unit`, `handler`, `component` |
| 4.1–4.3 | API chi tiết (`AdminUserDetail`), `UserDetailPage` | `integration-db`, `handler`, `component` |
| 4.4 | `ErrUserNotFound` (cả id sai định dạng), trạng thái 404 của trang | `unit`, `handler`, `component` |
| 4.5 | `state.from` từ danh sách tới chi tiết | `component` |
| 4.6 | Trạng thái lỗi của `UserDetailPage` | `component` |
| 5.1, 5.3 | Nút và hộp thoại khóa | `component` |
| 5.2 | Repository khóa có điều kiện; mutation cập nhật cache | `integration-db`, `handler`, `component` |
| 5.4 | Thu hồi refresh token trong transaction khóa; kiểm tra trạng thái khi refresh (TD-4) | `integration-db`, `unit` |
| 5.5 | API-AUTH-LOCKED@1, `LoginPage` của cả hai ứng dụng | `unit`, `handler`, `component` |
| 5.6 | Không thay đổi middleware xác thực (PD-4) | `unit` (refresh bị từ chối sau khi khóa) |
| 5.7 | Không có thay đổi nào với bảng và luồng nghiệp vụ khác; khóa chỉ ghi `users` và `refresh_tokens` | `integration-db` |
| 5.8–5.11 | Thứ tự phân loại lỗi trong use case; ẩn nút khóa với admin | `unit`, `handler`, `component` |
| 6.1, 6.2 | Nút / hộp thoại mở khóa; repository mở khóa có điều kiện | `component`, `integration-db`, `handler` |
| 6.3 | Đăng nhập sau khi mở khóa đi theo luồng `active`; mở khóa thu hồi mọi refresh token còn hiệu lực (TD-4) | `unit`, `integration-db` |
| 6.4, 6.5 | Phân loại lỗi mở khóa | `unit`, `handler`, `component` |
| 7.1, 7.2, 7.4 | `DEFAULT 'active'` trong DB-USER-STATUS@1 | `integration-db` |
| 7.3 | `UserPublic` không đổi; test xác thực hiện có | `unit`, `handler` |
| 7.5 | Không sửa handler / query quản trị khác | `handler` (test hiện có vẫn pass) |
| 8.1 | Index `users_created_at_id_idx`, TD-5, TD-6 | `integration-db` |
| 8.2 | Vùng cuộn bảng, bố cục responsive | `visual` |
| 8.3 | `AlertDialog` mở rộng quản lý focus, `label` cho mọi điều khiển | `component` |
| 8.4 | Vô hiệu nút xác nhận khi `isPending` | `component` |
| 8.5 | Thông điệp tiếng Việt trong `writeError` và giao diện | `handler`, `component` |
| 8.6 | Log `info` trong handler | `handler` |

## Tích hợp hệ thống hiện có (Existing System Integration)

- **Xác thực (`auth.UseCase`, `users.sql`, `refresh_tokens.sql`)**: nguồn duy nhất của trạng thái tài khoản là cột `users.status`. Đăng nhập và gia hạn phiên đọc trạng thái qua các query hiện có được mở rộng thêm cột, không thêm truy vấn mới. Đăng ký, đăng xuất, `me` và hình dạng `UserPublic` giữ nguyên (7.3). `BootstrapAdmin` không đổi (7.4).
- **Phiên đăng nhập**: thu hồi dùng lại `RevokeRefreshTokensByUserID` hiện có. Middleware `AuthRequired` / `OptionalAuth` / `MediaAuthRequired` và WebSocket chat không đổi: access token đã cấp còn hiệu lực tới khi hết hạn theo PD-4 (5.6).
- **Đơn hàng**: chỉ đọc `orders` (`user_id`, `status`, `total_vnd`, `created_at`) qua query mới thuộc `user_admin.sql`; dùng index `orders_user_id_created_at_idx` và `orders_user_id_status_idx` hiện có. Trang chi tiết đơn quản trị `/orders/:id` hiện có là đích của liên kết đơn gần nhất. Định nghĩa "đơn đã giao" trùng với trang tổng quan quản trị.
- **Ứng dụng quản trị**: `client.ts`, `ApiError`, `Select`, `Table`, `Badge`, `formatVND`, `formatVietnamDateTime`, `ORDER_STATUS_LABELS` được dùng lại. `AlertDialog` được dùng lại và mở rộng quản lý focus; các trang đang dùng nó (sản phẩm, danh mục, đánh giá, bài viết, đơn hàng, đổi trả) chỉ nhận thêm hành vi focus, test hiện có của chúng phải tiếp tục pass. Mục điều hướng "Cài đặt" vẫn bị vô hiệu.
- **Đánh số migration**: `000020` là số tiếp theo trên nhánh hiện tại. Spec chưa triển khai khác dự kiến cùng số phải đổi sang số kế tiếp khi được triển khai sau.
- **Cửa hàng**: không đổi mã; `LoginPage` đã hiển thị `err.message` của lỗi `account_locked`.
- **Dữ liệu khác của khách hàng** (đổi trả, đánh giá, chat, bài viết, thông báo, giỏ hàng, yêu thích, địa chỉ): không đọc, không ghi (5.7, 7.5).
- **Seed**: `db/seed/catalog.sql` không cần đổi vì cột mới có giá trị mặc định.
