# Tài liệu thiết kế

## Tổng quan (Overview)

Thiết kế mở rộng hồ sơ người dùng trên bảng `users` (`display_name`, `phone`, `avatar_key`), bổ sung bounded context `account` tại backend (`/api/v1/account/*` và `/media/avatars/:avatarKey`), cập nhật `UserPublic` ở luồng xác thực (`/api/v1/auth/*`), đồng bộ ưu tiên `display_name` trong các truy vấn tên khách hàng hiện có (`posts.sql`, `chat.sql`, `live.sql`), nâng cấp `Header` trên Storefront (`frontend`) và xây dựng trang trung tâm tài khoản `/account` gồm 3 tab (`Hồ sơ cá nhân`, `Đổi mật khẩu`, `Sổ địa chỉ`).

Phạm vi theo yêu cầu: 1.1–1.4, 2.1–2.5, 3.1–3.5, 4.1–4.6, 5.1–5.4, 6.1–6.4, 7.1–7.4.

Các quyết định kỹ thuật chính:

| ID | Quyết định | Lựa chọn | Lý do | Phương án đã loại |
|---|---|---|---|---|
| TD-1 | Nơi lưu thông tin hồ sơ | Thêm cột `display_name`, `phone`, `avatar_key` trực tiếp vào bảng `users` | Quan hệ một-một với tài khoản; các truy vấn xác thực, bài viết, chat và livestream đều đã đọc `users` nên không cần join thêm bảng | Tạo bảng `user_profiles` riêng: phát sinh thêm join ở mọi truy vấn đọc tên/ảnh |
| TD-2 | Tách bounded context `account` | Package `internal/usecase/account` + interface `domain.AccountRepository` & `domain.AvatarStore` riêng | Tách nghiệp vụ cập nhật hồ sơ, avatar và đổi mật khẩu khỏi `auth.UseCase`; giữ nguyên chữ ký `domain.UserRepository` hiện có | Nhồi toàn bộ vào `auth.UseCase`: làm phình luồng xác thực công khai |
| TD-3 | Lưu trữ và phục vụ ảnh đại diện | Tái sử dụng `*chatmedia.Store` (bucket riêng tư `chat-media` với tiền tố `avatars/<uuid>.<ext>`); phục vụ tại route công khai `GET\|HEAD /media/avatars/:avatarKey` ngoài `/api/v1` | Dùng lại hạ tầng MinIO đã cấu hình; đặt ngoài `/api/v1` giống `/media/reviews/:mediaId` để `<img src>` tải trực tiếp có cache và không xung đột bộ lọc `/api/v1` của Vite proxy hay E2E contract mock | Tạo bucket MinIO mới hoặc đặt route nhị phân dưới `/api/v1`: tăng cấu hình hạ tầng không cần thiết |
| TD-4 | Định danh khóa avatar và xác thực tệp | Khóa `<uuid>.<ext>` (`jpg\|png\|webp`) sinh mới mỗi lần upload; kiểm tra byte đầu bằng `http.DetectContentType` và giới hạn 5 MB | Ngăn path traversal bằng regex chặt chẽ, ngăn giả mạo đuôi tệp và hỗ trợ header cache `immutable` nhờ URL đổi mỗi lần cập nhật | Ghi đè theo `<userId>` hoặc chỉ tin header `Content-Type`: dễ dính cache ảnh cũ hoặc tải lên tệp giả |
| TD-5 | Tính nguyên tử khi đổi mật khẩu | Một transaction trong `AccountRepository.ChangePasswordAndRotateSession`: cập nhật `password_hash`, thu hồi mọi `refresh_tokens` chưa thu hồi của `user_id`, và chèn `refresh_token` mới | Không có khoảng hở giữa thu hồi phiên cũ và cấp phiên mới; thiết bị khác mất quyền gia hạn ngay khi transaction commit | Thu hồi trong call riêng sau khi đổi mật khẩu: có thể lỗi nửa chừng để lại phiên cũ |
| TD-6 | Trạng thái lỗi khi sai mật khẩu hiện tại | Trả HTTP 400 `validation_error` với `error.fields.currentPassword` | Bộ chặn `client.ts` tự kích hoạt `/auth/refresh` khi gặp HTTP 401 ở các endpoint ngoài `/auth/*`; trả 400 gắn thẳng lỗi vào ô nhập liệu | Trả HTTP 401: khiến trình duyệt gọi refresh ngoài ý muốn hoặc tự đăng xuất khi nhập nhầm mật khẩu cũ |
| TD-7 | Tái sử dụng biểu mẫu địa chỉ | Trích xuất thành phần dùng chung `AddressFormDialog` (cùng validation và danh mục Tỉnh/Phường) giữa `CheckoutPage` và `AccountPage` | Một nguồn logic duy nhất cho tạo/sửa địa chỉ; không trùng lặp code giữa `/account?tab=addresses` và `/checkout` | Sao chép mã biểu mẫu sang `AccountPage`: nhân đôi code và dễ lệch hành vi |
| TD-8 | Cập nhật đồng bộ trên `Header` | Bổ sung `updateUser` và `applySession` tùy chọn vào `AuthContextType` đồng thời cập nhật `tokenStore` | Cập nhật tức thì tên hiển thị, avatar trên `Header` và phiên JWT mới sau khi đổi mật khẩu mà không cần reload hay gọi thêm API nền | Tạo context hồ sơ riêng hoặc ép gọi lại `/auth/me` trên mọi component |

## Kiến trúc (Architecture)

```text
Storefront (frontend)                                     Backend (Go / Gin)
Header.tsx (đọc user từ AuthContext)
  └─ liên kết /account ──► AccountPage.tsx (?tab=profile|password|addresses)
                             ├─ Tab profile:
                             │    GET  /api/v1/account/profile   ──► accountHandler ──► account.UseCase
                             │    PUT  /api/v1/account/profile   ──►   (guard.AuthRequired)  ├─► AccountRepository (sqlc)
                             │    POST /api/v1/account/avatar    ──►                         └─► AvatarStore (chat-media/avatars/*)
                             │    DELETE /api/v1/account/avatar  ──►
                             ├─ Tab password:
                             │    PUT  /api/v1/account/password  ──► ChangePasswordAndRotateSession (1 Tx: update hash + revoke old + insert new)
                             └─ Tab addresses (tái sử dụng):
                                  /api/v1/addresses, /api/v1/provinces ──► addressHandler (hiện có)

Browser <img src="/media/avatars/:avatarKey"> ──► GET|HEAD /media/avatars/:avatarKey (ngoài /api/v1) ──► AvatarStore

Downstream read queries & notification actor hydration:
  - posts.sql, chat.sql, live.sql: COALESCE(NULLIF(TRIM(u.display_name), ''), orders.recipient_name, addresses.recipient_name, split_part(email), 'Khách hàng')
  - post_repository.go: làm mới metadata.recentActors[].name qua GetUserDisplayNames khi đọc/gộp thông báo
```

Chiều phụ thuộc giữ nguyên `delivery -> usecase -> domain`; các repository hiện thực interface thuộc `internal/domain`. `cmd/server` khai báo Wire provider cho `AccountRepository` và `account.UseCase` và sinh lại `wire_gen.go`.

## Thành phần và giao diện (Components And Interfaces)

### Contract DB-USER-PROFILE (rev 1)

Migration `backend/db/migrations/000022_add_user_profile.up.sql` / `.down.sql`:

```sql
-- up
ALTER TABLE users
    ADD COLUMN display_name text NULL,
    ADD COLUMN phone        varchar(16) NULL,
    ADD COLUMN avatar_key   text NULL,
    ADD CONSTRAINT users_display_name_len_chk CHECK (display_name IS NULL OR (char_length(btrim(display_name)) >= 1 AND char_length(display_name) <= 80)),
    ADD CONSTRAINT users_phone_fmt_chk CHECK (phone IS NULL OR phone ~ '^0[0-9]{9,10}$'),
    ADD CONSTRAINT users_avatar_key_fmt_chk CHECK (avatar_key IS NULL OR avatar_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$');
```

- Mọi hàng hiện có trong `users` nhận giá trị `NULL` cho cả 3 cột; `down` migration xóa 3 ràng buộc và 3 cột theo đúng thứ tự.

### Contract TYPE-USER-PUBLIC (rev 1)

Kiểu JSON chuẩn cho `user` trả về từ `/api/v1/auth/{register,login,refresh,me}` và các endpoint `/api/v1/account/*`:

```jsonc
{
  "id": "11111111-1111-1111-1111-111111111111",
  "email": "khach@example.com",
  "role": "customer",
  "displayName": "Nguyễn Minh Anh",        // string | null
  "phone": "0912345678",                   // string | null
  "avatarUrl": "/media/avatars/550e8400-e29b-41d4-a716-446655440000.webp" // string | null
}
```

- Khi cột `avatar_key` là `NULL` hoặc chuỗi rỗng, `avatarUrl` là `null`; khi có khóa `<avatarKey>`, `avatarUrl` là `"/media/avatars/" + avatarKey`.

### Contract API-ACCOUNT (rev 1)

Mọi endpoint `/api/v1/account/*` nằm trong nhóm `/api/v1` có middleware `guard.AuthRequired` (không Token hoặc token sai/hết hạn trả HTTP 401 `unauthorized` / `invalid_token`). Mọi phản hồi JSON tuân theo Full Status Envelope hiện có.

- **`GET /api/v1/account/profile`**
  - Thành công: HTTP `200`, `message = "Lấy thông tin tài khoản thành công"`, `data` = `UserPublic` (`TYPE-USER-PUBLIC@1`).
- **`PUT /api/v1/account/profile`**
  - Body JSON: `{"displayName": string | null, "phone": string | null}`.
  - Kiểm tra hợp lệ:
    - JSON sai định dạng → HTTP `400` `validation_error`, `error.fields.body`.
    - Bỏ khoảng trắng đầu/cuối `displayName` và `phone`. Chuỗi rỗng chuyển thành `null`.
    - `displayName != null` và dài hơn 80 ký tự Unicode (`utf8.RuneCountInString > 80`) → `error.fields.displayName = "Tên hiển thị tối đa 80 ký tự"`.
    - `phone != null` và không khớp `^0\d{9,10}$` → `error.fields.phone = "Số điện thoại không hợp lệ (10-11 chữ số, bắt đầu bằng 0)"`.
    - Trả HTTP `400` `validation_error` nếu có bất kỳ lỗi trường nào.
  - Thành công: HTTP `200`, `message = "Cập nhật hồ sơ thành công"`, `data` = `UserPublic` đã cập nhật.
- **`POST /api/v1/account/avatar`**
  - Multipart form-data chứa trường tệp `avatar`. Giới hạn tối đa phần thân request 6 MB (`MaxBytesReader`), kích thước tệp tối đa `5.242.880` byte (5 MB).
  - Kiểm tra theo thứ tự:
    - Request không phải multipart hợp lệ / vượt quá kích thước / thiếu `avatar` / tệp `<= 0` byte / `> 5.242.880` byte → HTTP `400` `validation_error`, `error.fields.avatar`.
    - Kiểm tra `http.DetectContentType` trên tối đa 512 byte đầu và header `Content-Type` (nếu có và khác `application/octet-stream`): chỉ chấp nhận `image/jpeg` (chuẩn hóa `image/jpg`), `image/png`, `image/webp`. Sai định dạng → HTTP `400` `validation_error`, `error.fields.avatar = "Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP"`.
  - Lưu vào `AvatarStore` tại object key `"avatars/" + newAvatarKey`, cập nhật `avatar_key = newAvatarKey` trong DB. Nếu trước đó người dùng đã có `oldAvatarKey`, xóa `"avatars/" + oldAvatarKey` theo cơ chế best-effort (ghi log `warn` nếu thất bại). Nếu cập nhật DB lỗi sau khi put object mới, xóa object vừa tải lên theo cơ chế best-effort.
  - Thành công: HTTP `200`, `message = "Cập nhật ảnh đại diện thành công"`, `data` = `UserPublic` mới.
- **`DELETE /api/v1/account/avatar`**
  - Đặt `avatar_key = NULL`, lấy `oldAvatarKey` nếu có để xóa khỏi `AvatarStore` (best-effort). Nếu chưa có avatar vẫn trả thành công idempotent.
  - Thành công: HTTP `200`, `message = "Đã xóa ảnh đại diện"`, `data` = `UserPublic` với `avatarUrl = null`.
- **`PUT /api/v1/account/password`**
  - Body JSON: `{"currentPassword": string, "newPassword": string}`.
  - Kiểm tra:
    - JSON sai định dạng → HTTP `400` `validation_error`, `error.fields.body`.
    - `currentPassword == ""` → `fields.currentPassword = "Vui lòng nhập mật khẩu hiện tại"`.
    - `len(newPassword) < 8` (tính theo byte UTF-8) → `fields.newPassword = "Mật khẩu mới phải có ít nhất 8 byte"`; `len(newPassword) > 72` → `fields.newPassword = "Mật khẩu mới tối đa 72 byte"`.
    - Nếu không có lỗi cú pháp: đọc user, kiểm tra `checkPassword(currentPassword, user.PasswordHash)`. Sai → HTTP `400` `validation_error`, `error.fields.currentPassword = "Mật khẩu hiện tại không chính xác"`.
    - Nếu `newPassword == currentPassword` → HTTP `400` `validation_error`, `error.fields.newPassword = "Mật khẩu mới phải khác mật khẩu hiện tại"`.
  - Thực hiện transaction `ChangePasswordAndRotateSession`, sinh `accessToken` mới và đặt cookie `refresh_token` HttpOnly mới (`Path=/api/v1/auth`, `HttpOnly=true`, `SameSite=Lax`, `Secure=cookieSecure`).
  - Thành công: HTTP `200`, `message = "Đổi mật khẩu thành công"`, `data` = `{"user": UserPublic, "accessToken": string}`.
- **`GET /media/avatars/:avatarKey` và `HEAD /media/avatars/:avatarKey`** (đăng ký trực tiếp trên root `router`, ngoài `/api/v1`, công khai)
  - `:avatarKey` phải khớp `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$`. Sai định dạng hoặc không tìm thấy trong `AvatarStore` → HTTP `404` với `error.code = "avatar_not_found"`, `error.message = "Không tìm thấy ảnh đại diện"`.
  - Tìm thấy → `Content-Type` tương ứng đuôi (`image/jpeg` / `image/png` / `image/webp`), `Content-Length`, `X-Content-Type-Options: nosniff`, `Cache-Control: public, max-age=86400, immutable`, `Content-Disposition: inline`. `HEAD` không trả body; `GET` stream nội dung ảnh.

### Contract API-ADDRESSES (rev 1)

Hợp đồng hiện có do `addressHandler` cung cấp (`GET /api/v1/addresses`, `POST /api/v1/addresses`, `PUT /api/v1/addresses/:id`, `PATCH /api/v1/addresses/:id/default`, `DELETE /api/v1/addresses/:id`, cùng `GET /api/v1/provinces` và `GET /api/v1/provinces/:code/wards`) được tái sử dụng nguyên vẹn bởi `/account?tab=addresses`. Các bản ghi response mẫu từ `addressHandler` được lưu vào `.dream/specs/customer-account/contract-snapshots.json` để khóa hình dạng kiểm thử Mode 2 E2E liên màn hình với `/checkout`.

### Backend

- **`internal/domain/user.go`**: Mở rộng `User` với `DisplayName *string`, `Phone *string`, `AvatarKey *string`; mở rộng `UserPublic` theo `TYPE-USER-PUBLIC@1`.
- **`internal/domain/account.go`**: Định nghĩa `UpdateProfileInput`, `UpdatePasswordInput`, `AccountSession`, `AccountRepository`, `AvatarStore`, cùng các hằng kích thước/regex validation.
- **`internal/domain/errors.go` & `internal/delivery/http/error.go`**: Thêm `ErrAvatarNotFound` ánh xạ HTTP `404` `avatar_not_found` (`"Không tìm thấy ảnh đại diện"`).
- **`db/queries/users.sql`, `db/queries/refresh_tokens.sql`, `db/queries/account.sql`**:
  - `users.sql` và `refresh_tokens.sql` trả thêm `display_name`, `phone`, `avatar_key`; cập nhật `UserRepository` và `SessionRepository` ánh xạ đầy đủ vào `domain.User`.
  - `account.sql` gồm `UpdateUserProfile`, `UpdateUserAvatar`, `UpdateUserPassword`.
- **`internal/repository/account_repository.go`**: Hiện thực `AccountRepository`; phương thức `ChangePasswordAndRotateSession` thực thi cập nhật mật khẩu, thu hồi token cũ (`RevokeRefreshTokensByUserID`) và tạo token mới (`CreateRefreshToken`) trong cùng `pgx.Tx`.
- **`internal/repository/post_repository.go`**: Cập nhật `ListNotifications`, `CreateNotification` (bao gồm cả nhánh gộp `existingRecent`) và `MarkNotificationRead` để làm mới `metadata.recentActors[].name` từ `q.GetUserDisplayNames` theo `display_name` hiện tại.
- **`internal/usecase/account`**: Xử lý validation, kiểm tra magic bytes ảnh, quản lý vòng đời đối tượng avatar cũ/mới và xoay vòng phiên mật khẩu.
- **`internal/delivery/http/account_handler.go`**: Xử lý 5 endpoint `/api/v1/account/*` và `GET|HEAD /media/avatars/:avatarKey`; ghi log `slog.Info("account password changed", "user_id", userID)` khi đổi mật khẩu thành công (không log mật khẩu hay token).

### Frontend (Storefront)

- **`frontend/src/api/types.ts`**: Mở rộng `User` thêm `displayName?: string | null`, `phone?: string | null`, `avatarUrl?: string | null`.
- **`frontend/src/api/account.ts`**: Gọi `getProfile`, `updateProfile`, `uploadAvatar`, `deleteAvatar`, `changePassword` qua `apiClient`.
- **`frontend/src/context/AuthContext.tsx`**: Thêm `updateUser?: (user: User) => void` và `applySession?: (session: SessionResponse) => void` trên `AuthContextType` (cung cấp bởi `AuthProvider`, cập nhật đồng thời React state và `tokenStore`).
- **`frontend/src/components/AvatarDisplay.tsx`**: Thành phần hiển thị ảnh đại diện gọn nhẹ hỗ trợ fallback sang chữ cái đầu viết hoa khi chưa có `avatarUrl` hoặc khi tải ảnh lỗi (`onError`, reset lỗi khi `avatarUrl` thay đổi).
- **`frontend/src/components/Header.tsx`**:
  - Desktop & Mobile account pill hiển thị `AvatarDisplay` + tên ưu tiên (`user.displayName || user.email`) và liên kết tới `/account` (`data-testid="header-account-link"` trên desktop, `data-testid="mobile-account-link"` trong ngăn kéo mobile).
  - Giữ nguyên toàn bộ liên kết điều hướng hiện có (`Sản phẩm yêu thích`, `Lịch sử mua hàng`, `Lịch sử đánh giá`, `Bài viết`, `Giỏ hàng`, chuông thông báo, nút `Đăng xuất`).
- **`frontend/src/components/addresses/AddressFormDialog.tsx`**: Thành phần hộp thoại thêm/sửa địa chỉ dùng chung giữa `AccountPage` và `CheckoutPage` (quản lý state tỉnh/phường, validation client và ánh xạ `ApiError.fields`).
- **`frontend/src/pages/AccountPage.tsx` & `frontend/src/App.tsx`**:
  - Đăng ký route `/account`. Chuyển hướng về `/login?redirect=${encodeURIComponent(location.pathname + location.search)}` khi chưa đăng nhập.
  - Bố cục editorial tinh gọn: khối tóm tắt thông tin tài khoản + thanh tab (`role="tablist"` với 3 tab `profile`, `password`, `addresses`) đồng bộ `?tab=` trên URL.
  - Tab `profile`: khu vực đổi/xóa ảnh đại diện (kèm input file ẩn `accept="image/jpeg,image/png,image/webp"`) và form `Email` (chỉ đọc), `Tên hiển thị`, `Số điện thoại`.
  - Tab `password`: form 3 trường `Mật khẩu hiện tại`, `Mật khẩu mới`, `Xác nhận mật khẩu mới` với ẩn/hiện mật khẩu hoặc nhãn rõ ràng; gọi `applySession` khi thành công và xóa trắng form.
  - Tab `addresses`: tải `/api/v1/addresses`, danh sách thẻ địa chỉ (nhãn `Mặc định`, nút `Đặt mặc định`, `Sửa`, `Xóa` kèm hộp thoại xác nhận xóa `Dialog`), nút `Thêm địa chỉ mới` dùng `AddressFormDialog`, trạng thái tải/lỗi/rỗng.

## Mô hình dữ liệu (Data Models)

Mở rộng thực thể `users` hiện có:

- `users.display_name`: `text NULL`, độ dài sau `btrim` từ 1 đến 80 ký tự.
- `users.phone`: `varchar(16) NULL`, khớp `^0[0-9]{9,10}$`.
- `users.avatar_key`: `text NULL`, khớp UUIDv4 + đuôi `.(jpg|png|webp)`.

Không có thay đổi bảng `addresses`, `orders`, `posts`, `chat_messages`, hay `live_comments`.

## Xử lý lỗi (Error Handling)

| Tình huống | Mã HTTP | `error.code` | `error.fields` / Thông điệp |
|---|---|---|---|
| Thiếu/sai bearer token trên `/api/v1/account/*` | `401` | `unauthorized` / `invalid_token` | Middleware `guard.AuthRequired` hiện có |
| Body JSON sai định dạng | `400` | `validation_error` | `body: "Dữ liệu không hợp lệ"` |
| `displayName` > 80 ký tự Unicode | `400` | `validation_error` | `displayName: "Tên hiển thị tối đa 80 ký tự"` |
| `phone` sai định dạng `^0\d{9,10}$` | `400` | `validation_error` | `phone: "Số điện thoại không hợp lệ (10-11 chữ số, bắt đầu bằng 0)"` |
| Upload avatar thiếu tệp hoặc kích thước 0 / > 5 MB | `400` | `validation_error` | `avatar: "Ảnh đại diện không hợp lệ hoặc vượt quá 5MB"` |
| Upload avatar sai định dạng ảnh | `400` | `validation_error` | `avatar: "Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP"` |
| Mật khẩu hiện tại rỗng / không khớp | `400` | `validation_error` | `currentPassword: "Mật khẩu hiện tại không chính xác"` (hoặc `"Vui lòng nhập mật khẩu hiện tại"`) |
| Mật khẩu mới < 8 byte UTF-8 / > 72 byte UTF-8 / trùng mật khẩu cũ | `400` | `validation_error` | `newPassword: ...` (tiếng Việt) |
| `:avatarKey` sai định dạng hoặc không tồn tại | `404` | `avatar_not_found` | `"Không tìm thấy ảnh đại diện"` |

Lỗi hệ thống không mong đợi đi qua `writeError` mặc định (`500 internal`). Lỗi khi xóa tệp avatar cũ trong MinIO không làm thất bại phản hồi cho khách hàng mà được ghi log mức `warn`.

## Chiến lược kiểm thử (Testing Strategy)

Tính năng khóa chế độ E2E **`Mode 2: Shape-Locked Mock E2E`** (theo chuẩn `e2e-testing`). Các mức kiểm thử gán cho từng tiêu chí là mức thấp nhất đủ để chứng minh hành vi:

- **`unit`**: Logic validation và luồng nghiệp vụ trong `internal/usecase/account`, xoay vòng session khi đổi mật khẩu trong `usecase/account` & `usecase/auth`, và làm mới `metadata.recentActors` trong `internal/repository/post_repository_test.go`.
- **`integration-db`**: Migration `000022` (up/down, ràng buộc CHECK trên `users`), truy vấn `account.sql`, `users.sql`, `refresh_tokens.sql`, transaction `ChangePasswordAndRotateSession`, và kiểm chứng ưu tiên `display_name` trên `posts.sql`, `chat.sql`, `live.sql` trong `internal/repository/account_repository_integration_test.go`.
- **`handler`**: Handler `account_handler_test.go`, `auth_handler_test.go`, `address_handler_test.go` ghi/kiểm tra golden snapshots vào `.dream/specs/customer-account/contract-snapshots.json` cho `API-ACCOUNT@1`, `TYPE-USER-PUBLIC@1` (`auth_login_200`, `auth_me_200` trong `auth_handler_test.go`), và `API-ADDRESSES@1` (trong `address_handler_test.go`), đồng thời kiểm tra không rò rỉ mật khẩu/token trong response và log.
- **`component`**: Vitest + Testing Library cho `account.ts`, `AuthContext.test.tsx`, `Header.test.tsx`, `AccountPage.test.tsx`, `CheckoutPage.test.tsx`.
- **`mock-e2e`**: Playwright chạy với Vite (`:15173`) qua `mountContractRoutes` dùng `.dream/specs/customer-account/contract-snapshots.json` cho các hành vi đòi hỏi trình duyệt thật: chuyển hướng `/account?tab=addresses` → `/login` → quay lại đúng tab, tải lại giữ tab, cập nhật hồ sơ đồng bộ tức thì lên `Header`, upload/xóa avatar, đổi mật khẩu giữ đăng nhập, và thêm/sửa/đặt mặc định địa chỉ tại `/account` phản ánh sang `/checkout`.
- **`visual`**: Chụp ảnh màn hình trong bộ Playwright Mode 2 tại `1440x900` và `375x812` vào `.dream/specs/customer-account/imgs/` và kiểm tra bố cục không tràn ngang (`7.1`).

## Truy vết yêu cầu (Requirement Traceability)

| Yêu cầu | Thành phần thiết kế | Mức kiểm chứng |
|---|---|---|
| 1.1 | `Header.tsx`, `AvatarDisplay.tsx`, `UserPublic` | `component`, `mock-e2e` |
| 1.2 | `AccountPage.tsx` (redirect chưa đăng nhập), `LoginPage.tsx` | `component`, `mock-e2e` |
| 1.3 | `router.go` (`guard.AuthRequired`), `account_handler.go` | `handler` |
| 1.4 | `AccountPage.tsx` (`?tab=profile\|password\|addresses`) | `component`, `mock-e2e` |
| 2.1 | `DB-USER-PROFILE@1`, `TYPE-USER-PUBLIC@1`, `auth_handler.go`, `account_handler.go` | `integration-db`, `handler` |
| 2.2 | `AccountPage.tsx` (tab `profile`) | `component` |
| 2.3 | `account.UseCase.UpdateProfile`, `AccountRepository`, `AuthContext.updateUser`, `Header.tsx` | `unit`, `integration-db`, `handler`, `component`, `mock-e2e` |
| 2.4 | `account.UseCase.UpdateProfile`, `AccountPage.tsx` (`validation_error`) | `unit`, `handler`, `component` |
| 2.5 | `account_handler.go` (`ShouldBindJSON`) | `handler` |
| 3.1 | `account.UseCase.UploadAvatar`, `AvatarStore`, `AccountPage.tsx`, `Header.tsx` | `unit`, `integration-db`, `handler`, `component`, `mock-e2e` |
| 3.2 | `account.UseCase.UploadAvatar`, `account_handler.go`, `AccountPage.tsx` | `unit`, `handler`, `component` |
| 3.3 | `account.UseCase.DeleteAvatar`, `AccountPage.tsx`, `Header.tsx` | `unit`, `integration-db`, `handler`, `component`, `mock-e2e` |
| 3.4 | `account_handler.go` (`GET\|HEAD /media/avatars/:avatarKey`) | `handler` |
| 3.5 | `AvatarDisplay.tsx` (`onError` fallback) | `component` |
| 4.1 | `AccountPage.tsx` (tab `password` + `confirmNewPassword`) | `component` |
| 4.2 | `account.UseCase.ChangePassword`, `ChangePasswordAndRotateSession`, `AuthContext.applySession` | `unit`, `integration-db`, `handler`, `component`, `mock-e2e` |
| 4.3 | `ChangePasswordAndRotateSession`, `auth.UseCase.Refresh` | `integration-db`, `handler` |
| 4.4 | `account.UseCase.ChangePassword` (HTTP 400 `currentPassword`), `AccountPage.tsx` | `unit`, `handler`, `component` |
| 4.5 | `account.UseCase.ChangePassword` (`newPassword` length & difference) | `unit`, `handler` |
| 4.6 | `account_handler.go` (slog redaction + HTTP response check) | `handler` |
| 5.1 | `AccountPage.tsx` (tab `addresses`), `addressesApi.listAddresses` | `component` |
| 5.2 | `AddressFormDialog.tsx`, `AccountPage.tsx`, `API-ADDRESSES@1` | `component`, `handler` |
| 5.3 | `address.UseCase`, `AddressRepository`, `AccountPage.tsx` (confirm delete) | `unit`, `integration-db`, `component` |
| 5.4 | `AccountPage.tsx`, `CheckoutPage.tsx`, `API-ADDRESSES@1` | `mock-e2e` |
| 6.1 | `posts.sql`, `chat.sql`, `live.sql` (COALESCE `u.display_name` đầu tiên), `post_repository.go` (làm mới `metadata.recentActors` qua `GetUserDisplayNames`) | `integration-db`, `unit` |
| 6.2 | `posts.sql`, `chat.sql`, `live.sql` (giữ nhánh `CASE WHEN role = 'admin'`) | `integration-db` |
| 6.3 | `reviews.sql`, `review_repository.go`, `user_admin_repository.go` (không đổi) | `handler` |
| 6.4 | Migration `000022`, `users.sql`, `refresh_tokens.sql`, `auth_handler_test.go` | `integration-db`, `handler` |
| 7.1 | `AccountPage.tsx` (responsive desktop `1440px` & mobile `375px`) | `visual` |
| 7.2 | `AccountPage.tsx`, `AddressFormDialog.tsx` (`tablist`/`tab`, `aria-label`, focus) | `component` |
| 7.3 | `AccountPage.tsx`, `AddressFormDialog.tsx` (disabled submit while pending) | `component` |
| 7.4 | `AccountPage.tsx`, `AddressFormDialog.tsx`, `account_handler.go` | `handler`, `component` |

## Tích hợp hệ thống hiện có (Existing System Integration)

- **Các truy vấn tên hiển thị (`posts.sql`, `chat.sql`, `live.sql`, `post_repository.go`):** Bổ sung `NULLIF(TRIM(u.display_name), '')` làm ứng viên đầu tiên trong toàn bộ biểu thức `COALESCE(...)` suy luận tên khách hàng (11 chỗ trong `posts.sql`, 5 chỗ trong `chat.sql`, 2 chỗ trong `live.sql`). Tài khoản chưa thiết lập `display_name` vẫn rơi về chuỗi cũ nguyên vẹn. Riêng `admin` vẫn đi qua nhánh `WHEN u.role = 'admin'` hiện có. Ngoài ra, vì `PostRepository` (`backend/internal/repository/post_repository.go`) lưu bản sao `recentActors` bên trong `notifications.metadata`, các phương thức `ListNotifications`, `CreateNotification` (kể cả khi gộp `existingRecent`) và `MarkNotificationRead` làm mới trường `name` của từng phần tử `recentActors` theo `q.GetUserDisplayNames` để thông báo cũ hoặc thông báo gộp luôn phản ánh `display_name` mới nhất của khách hàng.
- **Đánh giá sản phẩm & Quản trị người dùng:** Không sửa `PublicReviewer` (`MaskedEmail`), `AdminUserSummary`, `AdminUserDetail`, hay `admin_user_handler.go`, bảo toàn tuyệt đối các contract snapshot hiện có của `review-history` và `admin-user-management`.
- **AuthContext & các test hiện tại:** Giữ nguyên các thuộc tính hiện tại của `AuthContextType` và khai báo `updateUser?`, `applySession?` là tùy chọn trên type (luôn được cung cấp ở runtime bởi `AuthProvider`) để không làm gãy các test component hiện có đang mock `useAuth`.
- **CheckoutPage (`frontend/src/pages/CheckoutPage.tsx`):** Rút gọn phần hộp thoại thêm/sửa địa chỉ sang dùng `AddressFormDialog` chung, bảo toàn toàn bộ hành vi và `CheckoutPage.test.tsx` hiện có.
- **Tái sử dụng kho MinIO:** `provideAccountUseCase` nhận `*chatmedia.Store` (bucket `chat-media`) hiện có để lưu các đối tượng `avatars/<uuid>.<ext>`.
