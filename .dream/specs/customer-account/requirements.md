# Tài liệu yêu cầu

## Giới thiệu

Khách hàng trên cửa hàng AuraPhone (`frontend`) hiện chỉ thấy email tĩnh kèm nút đăng xuất trên thanh đầu trang (`Header`). Bảng `users` mới chỉ lưu `email` và `password_hash`, chưa có tên hiển thị, số điện thoại cá nhân hay ảnh đại diện. Ngoài ra, để thêm, sửa hoặc đổi địa chỉ giao hàng mặc định, khách hàng buộc phải bỏ sản phẩm vào giỏ rồi đi tới trang thanh toán (`/checkout`), đồng thời chưa có chức năng tự đổi mật khẩu.

Tính năng `customer-account` xây dựng trung tâm quản lý tài khoản tập trung tại `/account` gồm 3 khu vực (`Hồ sơ cá nhân`, `Đổi mật khẩu`, `Sổ địa chỉ`), mở rộng dữ liệu hồ sơ trên `users`, nâng cấp khu vực tài khoản trên thanh đầu trang, và đồng bộ tên hiển thị mới sang các tính năng cộng đồng/hỗ trợ đang dùng tên suy đoán từ email.

Người dùng bị ảnh hưởng:

- **Khách hàng** (vai trò `customer`): xem và cập nhật tên hiển thị, số điện thoại, ảnh đại diện; đổi mật khẩu; quản lý sổ địa chỉ độc lập từ `/account`.
- **Khách vãng lai** (chưa đăng nhập): bị chuyển hướng tới trang đăng nhập khi mở `/account` và được đưa trở lại đúng đường dẫn `/account` (kèm tab) sau khi đăng nhập thành công.
- **Quản trị viên** (vai trò `admin`): không dùng trang Storefront `/account` (luồng quản trị vẫn tách biệt tại `frontend-admin`); tên khách hàng hiển thị ở hộp thư hỗ trợ và bình luận bài viết/livestream tự động ưu tiên tên hiển thị mới nếu khách hàng đã thiết lập.

Quy ước dùng chung cho toàn bộ tài liệu:

- **Tab hợp lệ trên `/account`:** `profile` (mặc định), `password`, `addresses`.
- **Định dạng số điện thoại Việt Nam:** chuỗi khớp `^0\d{9,10}$` (10 hoặc 11 chữ số, bắt đầu bằng `0`).
- **Định dạng ảnh đại diện hợp lệ:** JPEG (`image/jpeg`, chuẩn hóa `image/jpg` thành `image/jpeg`), PNG (`image/png`), WebP (`image/webp`), kích thước từ 1 byte đến tối đa 5.242.880 byte (5 MB).
- **Thông điệp và lỗi:** mọi thông báo hiển thị cho người dùng và mọi `error.message` của lỗi nghiệp vụ tuân theo chuẩn tiếng Việt và phong bì `/api/v1` hiện có.

## Quyết định sản phẩm

Các quyết định dưới đây chốt phạm vi và hành vi của tính năng, kèm lý do và phương án đã loại:

| ID | Quyết định | Lý do | Phương án đã loại |
|---|---|---|---|
| PD-1 | Hợp nhất toàn bộ quản lý tài khoản khách hàng vào một trang `/account` với 3 tab (`profile`, `password`, `addresses`) đồng bộ trên query `?tab=...`. | Giữ điều hướng gọn, tránh phân mảnh nhiều route lẻ tẻ trên Storefront. | Tách thành 3 trang `/profile`, `/security`, `/addresses`: tăng số mục điều hướng không cần thiết. |
| PD-2 | Trường `email` trên trang hồ sơ hiển thị ở chế độ chỉ đọc, không cho phép đổi email. | Hệ thống hiện chưa có kênh gửi email xác thực; cho phép đổi email tự do dễ gây mất quyền truy cập hoặc giả mạo. | Cho đổi email trực tiếp không cần xác thực: rủi ro chiếm quyền tài khoản. |
| PD-3 | Tên hiển thị (`displayName`, tối đa 80 ký tự Unicode) và số điện thoại (`phone`) đều là trường tùy chọn; gửi chuỗi rỗng (sau khi bỏ khoảng trắng đầu/cuối) sẽ xóa giá trị về `null`. | Cho phép khách hàng tùy biến hồ sơ linh hoạt hoặc quay về trạng thái mặc định mà không ép buộc khi đăng ký. | Bắt buộc nhập họ tên & SĐT khi đăng ký hoặc lưu hồ sơ: tăng ma sát không cần thiết cho khách mới. |
| PD-4 | Mỗi lần tải ảnh đại diện mới sinh một khóa lưu trữ bất biến mới và phục vụ công khai (không cần bearer token) qua `GET\|HEAD /media/avatars/:avatarKey`; xóa ảnh cũ ở tầng lưu trữ theo cơ chế best-effort sau khi DB cập nhật thành công. | Khóa bất biến giúp `<img src>` dùng trực tiếp `Cache-Control: public, max-age=86400, immutable` mà không bị lỗi ảnh cũ lưu cache khi khách vừa đổi ảnh mới. | Dùng khóa cố định theo `userId`: trình duyệt giữ cache ảnh cũ dù đã cập nhật. |
| PD-5 | Đổi mật khẩu yêu cầu `currentPassword` và `newPassword` (8–72 byte UTF-8, khác `currentPassword`); khi đúng sẽ cập nhật hash mới, thu hồi toàn bộ `refresh_tokens` cũ trong cùng transaction, và cấp ngay cặp `accessToken` + cookie `refresh_token` HttpOnly mới cho trình duyệt hiện tại. Sai `currentPassword` trả HTTP 400 `validation_error` với `error.fields.currentPassword`. | Giữ trải nghiệm mượt trên thiết bị vừa thao tác trong khi vẫn vô hiệu hóa mọi phiên gia hạn trên các thiết bị khác; trả 400 thay vì 401 để không kích hoạt bộ chặn tự động refresh token trên `client.ts`. | Buộc đăng xuất cả trình duyệt hiện tại về `/login`, hoặc trả 401 khi sai mật khẩu cũ: gây gián đoạn hoặc kích hoạt vòng lặp refresh ở client. |
| PD-6 | `displayName` được ưu tiên cao nhất trong chuỗi hiển thị tên khách hàng ở Bài viết, Bình luận bài viết, Thông báo, Tin nhắn hỗ trợ và Bình luận livestream; khi chưa đặt `displayName` giữ nguyên chuỗi dự phòng hiện có (`orders.recipient_name` → `addresses.recipient_name` → tiền tố email → `"Khách hàng"`). Vai trò `admin` giữ nguyên nhãn vai trò hiện có; mặt nạ email ở Đánh giá sản phẩm công khai và hợp đồng `/api/v1/admin/users` không đổi. | Khắc phục trực tiếp hiện tượng tên hiển thị suy đoán sai trên các kênh tương tác mà không phá vỡ hợp đồng API đã khóa của đánh giá và quản trị người dùng. | Đổi luôn `PublicReviewer` hoặc `AdminUserDetail`: làm vỡ contract snapshot đã khóa ở các tính năng trước. |
| PD-7 | Sổ địa chỉ tại `/account?tab=addresses` tái sử dụng hoàn toàn API `/api/v1/addresses` và `/api/v1/provinces`, dùng chung logic biểu mẫu và toàn bộ quy tắc nghiệp vụ hiện có với `/checkout`. | Một nguồn sự thật duy nhất, bảo đảm địa chỉ sửa hoặc đặt mặc định ở `/account` có hiệu lực ngay khi thanh toán. | Tạo API địa chỉ riêng cho `/account`: trùng lặp logic và gây lệch dữ liệu với `/checkout`. |
| PD-8 | Thanh đầu trang (`Header`) đọc `displayName` và `avatarUrl` trực tiếp từ ngữ cảnh xác thực (`UserPublic` do `/auth/*` trả về) và không phát sinh lời gọi mạng phụ tới `/account/profile` khi tải các trang khác. | Bảo đảm hiệu năng tải trang và giữ tương thích hoàn toàn với các trang công khai và bộ kiểm thử hiện có. | Gọi thêm `GET /api/v1/account/profile` trên mọi màn hình có `Header`: dư thừa một request trên mỗi lần chuyển/tải trang. |

## Yêu cầu

### Yêu cầu 1: Điều hướng và kiểm soát truy cập `/account`

**User Story:** Là khách hàng đã đăng nhập, tôi muốn mở trang tài khoản từ thanh đầu trang và chuyển đổi giữa các mục hồ sơ, đổi mật khẩu, sổ địa chỉ, để quản lý thông tin cá nhân tập trung.

#### Tiêu chí chấp nhận

1.1. WHEN khách hàng đã đăng nhập xem thanh đầu trang (`Header`) trên desktop hoặc ngăn kéo mobile THEN hệ thống SHALL hiển thị ảnh đại diện (hoặc chữ cái viết hoa đầu của tên hiển thị/email khi chưa có ảnh), tên hiển thị ưu tiên (`displayName` nếu không rỗng, ngược lại `email`) và liên kết dẫn trực tiếp tới `/account`. Các liên kết hiện có trên `Header` (`Sản phẩm yêu thích`, `Lịch sử mua hàng`, `Lịch sử đánh giá`, `Bài viết`, `Giỏ hàng`, chuông thông báo, nút `Đăng xuất`) SHALL vẫn hoạt động nguyên vẹn.

1.2. IF người dùng chưa đăng nhập truy cập `/account` (kể cả kèm query `?tab=...`) THEN hệ thống SHALL chuyển hướng tới `/login?redirect=<encoded_target>`, và sau khi đăng nhập thành công SHALL đưa khách hàng quay lại đúng đường dẫn `/account` (kèm query `tab` ban đầu).

1.3. IF lời gọi bất kỳ tới `/api/v1/account/*` không kèm bearer token hợp lệ THEN hệ thống SHALL trả về HTTP 401 (`unauthorized` hoặc `invalid_token`).

1.4. WHEN khách hàng mở `/account` không kèm `tab` hoặc kèm giá trị `tab` không thuộc `{profile, password, addresses}` THEN hệ thống SHALL hiển thị tab `profile`; WHEN khách hàng chọn tab `Hồ sơ cá nhân` (`profile`), `Đổi mật khẩu` (`password`) hoặc `Sổ địa chỉ` (`addresses`) THEN URL SHALL cập nhật `?tab=<tên_tab>` tương ứng và tải lại trình duyệt SHALL mở lại đúng tab đó.

### Yêu cầu 2: Xem và cập nhật hồ sơ cá nhân

**User Story:** Là khách hàng, tôi muốn xem thông tin tài khoản và cập nhật tên hiển thị cùng số điện thoại cá nhân, để thông tin của tôi chính xác và hiển thị đẹp mắt trên cửa hàng.

#### Tiêu chí chấp nhận

2.1. WHEN hệ thống trả thông tin người dùng hiện tại qua `GET /api/v1/account/profile` hoặc các endpoint xác thực (`POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`, `GET /api/v1/auth/me`) THEN đối tượng `user` (`UserPublic`) SHALL bao gồm đầy đủ các trường `id`, `email`, `role`, `displayName` (`string | null`), `phone` (`string | null`), và `avatarUrl` (`string | null`).

2.2. WHEN khách hàng mở `/account?tab=profile` THEN giao diện SHALL hiển thị email ở trạng thái chỉ đọc (không cho sửa) và biểu mẫu điền sẵn `Tên hiển thị` (`displayName`) và `Số điện thoại` (`phone`) hiện tại.

2.3. WHEN khách hàng gửi `PUT /api/v1/account/profile` với `displayName` và `phone` hợp lệ THEN hệ thống SHALL bỏ khoảng trắng đầu/cuối từng trường (chuỗi rỗng sau khi bỏ khoảng trắng được lưu thành `NULL`), cập nhật bảng `users`, trả về HTTP 200 kèm `UserPublic` mới; giao diện SHALL cập nhật ngay `AuthContext` (và tên trên `Header`) mà không cần tải lại trình duyệt và hiển thị thông báo thành công bằng tiếng Việt.

2.4. IF `displayName` sau khi bỏ khoảng trắng dài hơn 80 ký tự Unicode, hoặc `phone` sau khi bỏ khoảng trắng khác rỗng và không khớp `^0\d{9,10}$` THEN API SHALL trả về HTTP 400 `validation_error` với `error.fields.displayName` và/hoặc `error.fields.phone` bằng tiếng Việt, không thay đổi dữ liệu cũ; giao diện SHALL hiển thị thông báo lỗi tương ứng ngay dưới ô nhập.

2.5. IF thân yêu cầu gửi tới `PUT /api/v1/account/profile` không phải JSON hợp lệ THEN API SHALL trả về HTTP 400 `validation_error` với `error.fields.body`.

### Yêu cầu 3: Quản lý ảnh đại diện

**User Story:** Là khách hàng, tôi muốn tải lên hoặc xóa ảnh đại diện, để cá nhân hóa tài khoản và hiển thị ảnh đại diện trên thanh đầu trang.

#### Tiêu chí chấp nhận

3.1. WHEN khách hàng tải lên tệp ảnh hợp lệ (JPEG, PNG hoặc WebP; dung lượng 1 byte – 5.242.880 byte; khớp chữ ký byte nội dung ảnh) qua `POST /api/v1/account/avatar` với trường multipart `avatar` THEN hệ thống SHALL lưu đối tượng ảnh với khóa bất biến mới, cập nhật `avatar_key` trên `users`, xóa đối tượng ảnh cũ (best-effort), trả về HTTP 200 với `UserPublic` chứa `avatarUrl = "/media/avatars/<avatarKey>"`; giao diện SHALL cập nhật ngay ảnh đại diện ở `/account` và `Header`.

3.2. IF yêu cầu `POST /api/v1/account/avatar` thiếu trường `avatar`, tệp có kích thước 0 byte hoặc lớn hơn 5.242.880 byte, hoặc kiểu tệp/nội dung thực tế không phải JPEG/PNG/WebP THEN API SHALL trả về HTTP 400 `validation_error` với `error.fields.avatar` bằng tiếng Việt và không thay đổi `avatar_key` hiện tại; giao diện SHALL giữ nguyên ảnh hiện tại và hiển thị thông báo lỗi rõ ràng.

3.3. WHEN khách hàng nhấn xóa ảnh đại diện (`DELETE /api/v1/account/avatar`) THEN hệ thống SHALL đặt `avatar_key = NULL`, xóa đối tượng lưu trữ cũ (best-effort), trả về HTTP 200 với `UserPublic` có `avatarUrl = null`; giao diện SHALL trở về hiển thị chữ cái viết tắt mặc định trên `/account` và `Header`. Thao tác xóa khi chưa có ảnh đại diện SHALL vẫn trả về HTTP 200 với `avatarUrl = null`.

3.4. WHEN trình duyệt gọi `GET` hoặc `HEAD /media/avatars/:avatarKey` với khóa hợp lệ đang tồn tại THEN máy chủ SHALL trả HTTP 200 kèm đúng `Content-Type`, `Content-Length`, `X-Content-Type-Options: nosniff` và `Cache-Control: public, max-age=86400, immutable`; IF `:avatarKey` sai định dạng hoặc không tồn tại THEN máy chủ SHALL trả HTTP 404 với `error.code = "avatar_not_found"`.

3.5. IF ảnh tại `avatarUrl` không tải được trên trình duyệt (`onError`) THEN thành phần hiển thị avatar trên `/account` và `Header` SHALL tự động rơi về chữ cái viết tắt dự phòng mà không hiển thị biểu tượng ảnh vỡ.

### Yêu cầu 4: Đổi mật khẩu và thu hồi phiên cũ

**User Story:** Là khách hàng, tôi muốn đổi mật khẩu tài khoản và vô hiệu hóa các phiên đăng nhập ở thiết bị khác, để bảo vệ an toàn tài khoản của mình.

#### Tiêu chí chấp nhận

4.1. WHEN khách hàng mở `/account?tab=password` THEN hệ thống SHALL hiển thị biểu mẫu gồm 3 trường bắt buộc: `Mật khẩu hiện tại`, `Mật khẩu mới`, `Xác nhận mật khẩu mới`; IF `Mật khẩu mới` và `Xác nhận mật khẩu mới` không khớp khi gửi THEN giao diện SHALL báo lỗi ngay tại ô xác nhận và không gọi API.

4.2. WHEN khách hàng gửi `PUT /api/v1/account/password` với `currentPassword` khớp mật khẩu hiện tại và `newPassword` dài từ 8 đến 72 byte UTF-8 và khác `currentPassword` THEN hệ thống SHALL cập nhật `password_hash` mới, thu hồi toàn bộ `refresh_tokens` chưa thu hồi trước đó của tài khoản trong cùng transaction, phát hành cặp `accessToken` và cookie `refresh_token` HttpOnly mới, và trả về HTTP 200 `{ user, accessToken }`. Giao diện SHALL cập nhật phiên mới trong `AuthContext`/`tokenStore` để giữ người dùng tiếp tục đăng nhập trên trình duyệt hiện tại, xóa trắng các ô mật khẩu và hiển thị thông báo thành công.

4.3. AFTER mật khẩu được đổi thành công THEN mọi `refresh_token` được cấp trước thời điểm đổi mật khẩu SHALL bị từ chối với HTTP 401 `invalid_token` khi gọi `POST /api/v1/auth/refresh`, trong khi cookie `refresh_token` mới trả về từ `PUT /api/v1/account/password` SHALL làm mới phiên bình thường.

4.4. IF `currentPassword` bỏ trống hoặc không khớp mật khẩu đang lưu THEN API SHALL trả về HTTP 400 `validation_error` với `error.fields.currentPassword = "Mật khẩu hiện tại không chính xác"` (hoặc thông báo bắt buộc nhập nếu rỗng), giữ nguyên mật khẩu và không thu hồi các phiên hiện có.

4.5. IF `newPassword` ngắn hơn 8 byte, vượt quá 72 byte UTF-8, hoặc trùng `currentPassword` THEN API SHALL trả về HTTP 400 `validation_error` với `error.fields.newPassword` mô tả rõ ràng bằng tiếng Việt.

4.6. Phản hồi HTTP và nhật ký ứng dụng (`slog`) của thao tác đổi mật khẩu SHALL không bao giờ ghi mật khẩu thô, mật khẩu băm, `accessToken`, hoặc `refreshToken`; thao tác thành công SHALL ghi log mức `info` với `user_id`.

### Yêu cầu 5: Sổ địa chỉ độc lập và đồng bộ Checkout

**User Story:** Là khách hàng, tôi muốn thêm, sửa, xóa và chọn địa chỉ mặc định trực tiếp tại trang tài khoản mà không cần đặt hàng trước, để tiết kiệm thời gian khi mua sắm.

#### Tiêu chí chấp nhận

5.1. WHEN khách hàng mở `/account?tab=addresses` THEN hệ thống SHALL tải danh sách địa chỉ từ `/api/v1/addresses`, hiển thị địa chỉ mặc định nổi bật với nhãn `Mặc định`; IF danh sách rỗng THEN giao diện SHALL hiển thị trạng thái rỗng rõ ràng kèm nút `Thêm địa chỉ mới`.

5.2. WHEN khách hàng thêm mới hoặc chỉnh sửa địa chỉ tại `/account?tab=addresses` THEN giao diện SHALL dùng biểu mẫu gồm `Họ và tên người nhận`, `Số điện thoại`, `Tỉnh / Thành phố` (`/api/v1/provinces`), `Phường / Xã` (`/api/v1/provinces/:code/wards`), `Địa chỉ chi tiết` và tùy chọn `Đặt làm địa chỉ mặc định`; khi gửi thành công SHALL cập nhật ngay danh sách và gắn lỗi theo từng trường khi API trả 400 `validation_error`.

5.3. WHEN khách hàng đặt một địa chỉ khác làm mặc định hoặc xóa một địa chỉ (sau khi xác nhận trong hộp thoại xác nhận) THEN hệ thống SHALL bảo toàn toàn bộ quy tắc hiện có: địa chỉ đầu tiên tự động là mặc định, chỉ có tối đa một địa chỉ mặc định tại mỗi thời điểm, và xóa địa chỉ mặc định không tự động nâng địa chỉ còn lại thành mặc định.

5.4. WHEN khách hàng thêm, sửa, xóa hoặc đặt mặc định địa chỉ tại `/account?tab=addresses` rồi mở `/checkout` THEN trang thanh toán SHALL phản ánh đúng danh sách và địa chỉ mặc định vừa cập nhật.

### Yêu cầu 6: Đồng bộ tên hiển thị sang phân hệ liên quan và tương thích ngược

**User Story:** Là khách hàng và chủ cửa hàng, tôi muốn tên hiển thị mới xuất hiện nhất quán trong các cuộc trò chuyện, bình luận và thông báo mà không làm hỏng dữ liệu hay hợp đồng API cũ.

#### Tiêu chí chấp nhận

6.1. WHEN một khách hàng có `display_name` khác rỗng THEN các truy vấn đọc tên hiển thị khách hàng ở Bài viết (`posts`), Bình luận bài viết (`post_comments`), Thông báo (`notifications`, kể cả danh sách `recentActors`), Tin nhắn hỗ trợ (`conversations` và `chat_messages`) và Bình luận livestream (`live_comments`) SHALL ưu tiên trả về `display_name` của người dùng đó; WHEN `display_name` là `NULL` hoặc rỗng THEN hệ thống SHALL giữ nguyên chuỗi dự phòng hiện tại (`orders.recipient_name` → `addresses.recipient_name` → tiền tố email → `"Khách hàng"`).

6.2. WHILE người thực hiện là tài khoản `admin` THEN nhãn vai trò hiển thị ở Bài viết/Bình luận/Thông báo (`Quản trị viên`), Tin nhắn hỗ trợ (`Hỗ trợ viên`) và Bình luận livestream (`Chủ shop`) SHALL giữ nguyên như hiện tại.

6.3. Hình dạng và nội dung của `PublicReviewer.MaskedEmail` trên đánh giá công khai và hợp đồng `/api/v1/admin/users`, `/api/v1/admin/users/:id` SHALL không thay đổi.

6.4. WHEN áp dụng migration mới lên cơ sở dữ liệu đã có tài khoản THEN mọi tài khoản hiện có SHALL nhận `display_name = NULL`, `phone = NULL`, `avatar_key = NULL` và mọi luồng xác thực hiện có (`register`, `login`, `refresh`, `logout`, `me`) SHALL tiếp tục hoạt động bình thường.

### Yêu cầu 7: Ràng buộc phi chức năng

**User Story:** Là khách hàng, tôi muốn trang tài khoản dễ thao tác trên cả máy tính lẫn điện thoại và an toàn trước các thao tác gửi trùng.

#### Tiêu chí chấp nhận

7.1. WHEN trang `/account` (ở cả 3 tab `profile`, `password`, `addresses`) hiển thị ở chiều rộng `1440px` và `375px` THEN trang SHALL hiển thị đầy đủ bố cục rõ ràng và không phát sinh thanh cuộn ngang (`scrollWidth <= clientWidth`).

7.2. Mọi điều khiển tương tác trên `/account` (thanh chuyển tab `role="tablist"`/`role="tab"`, ô nhập có nhãn liên kết, nút upload/xóa ảnh, nút hành động địa chỉ và hộp thoại xác nhận) SHALL thao tác được bằng bàn phím và có tên truy cập được (`aria-label` cho nút chỉ có icon).

7.3. WHILE một yêu cầu cập nhật hồ sơ, tải/xóa ảnh đại diện, đổi mật khẩu hoặc lưu/xóa địa chỉ đang được xử lý THEN nút gửi tương ứng SHALL ở trạng thái vô hiệu để ngăn gửi trùng lặp.

7.4. Mọi nhãn giao diện, thông báo thành công và thông điệp lỗi người dùng trong tính năng SHALL viết bằng tiếng Việt.
