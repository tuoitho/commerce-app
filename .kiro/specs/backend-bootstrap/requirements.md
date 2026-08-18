# Requirements Document

## Introduction

Tính năng này chuẩn hóa quá trình khởi động backend: nạp cấu hình từ biến môi trường và tệp `.env`, tạo dependency graph tại compile time, và phát structured log nhất quán. Thay đổi không làm thay đổi contract HTTP, nghiệp vụ hoặc mô hình dữ liệu hiện có.

## Requirements

### Requirement 1
**User Story:** Là lập trình viên backend, tôi muốn ứng dụng nạp cấu hình nhất quán từ môi trường chạy, để có thể khởi động cục bộ và triển khai mà không cần thay đổi mã nguồn.

#### Acceptance Criteria
1.1 WHEN backend khởi động THEN hệ thống SHALL nạp các khóa cấu hình hiện có từ biến môi trường và hỗ trợ tệp `.env` cho môi trường phát triển cục bộ.

1.2 WHEN một khóa đồng thời tồn tại trong biến môi trường hệ điều hành và tệp `.env` THEN hệ thống SHALL sử dụng giá trị từ biến môi trường hệ điều hành.

1.3 WHEN tệp `.env` không tồn tại THEN hệ thống SHALL tiếp tục nạp cấu hình từ biến môi trường hệ điều hành.

1.4 WHEN `DB_URL` hoặc `JWT_ACCESS_SECRET` bị thiếu THEN hệ thống SHALL dừng khởi động và trả về lỗi cấu hình xác định khóa bị thiếu.

1.5 WHEN một giá trị số, boolean, duration, log level hoặc ràng buộc độ dài secret không hợp lệ THEN hệ thống SHALL dừng khởi động và trả về lỗi xác định khóa không hợp lệ.

1.6 WHEN cấu hình tùy chọn không được cung cấp THEN hệ thống SHALL giữ nguyên các giá trị mặc định hiện hành cho `APP_ENV`, `HTTP_PORT`, token TTL và `COOKIE_SECURE`.

### Requirement 2
**User Story:** Là lập trình viên backend, tôi muốn dependency graph được kiểm tra tại compile time, để giảm lỗi khởi tạo thủ công khi thêm hoặc thay đổi dependency.

#### Acceptance Criteria
2.1 WHEN mã nguồn backend được generate và build THEN hệ thống SHALL tạo dependency graph bằng Google Wire mà không dùng runtime reflection hoặc service locator.

2.2 WHEN dependency graph thiếu provider hoặc có kiểu không tương thích THEN quá trình generate hoặc build SHALL thất bại trước khi chạy server.

2.3 WHEN backend khởi động với cấu hình và database hợp lệ THEN dependency graph SHALL cung cấp HTTP handler và các dependency hiện có với hành vi tương đương trước thay đổi.

2.4 WHEN mã Wire đã được generate THEN repository SHALL chứa mã generate cần thiết để `go build ./...` không phụ thuộc vào việc Wire CLI được cài đặt.

### Requirement 3
**User Story:** Là người vận hành backend, tôi muốn structured log nhất quán và có thể cấu hình mức độ, để quan sát hệ thống trong development và production.

#### Acceptance Criteria
3.1 WHEN `APP_ENV` là `production` THEN hệ thống SHALL ghi log JSON có timestamp, level và message.

3.2 WHEN `APP_ENV` khác `production` THEN hệ thống SHALL ghi log dạng text dễ đọc có timestamp, level và message.

3.3 WHEN `LOG_LEVEL` là `debug`, `info`, `warn` hoặc `error` THEN hệ thống SHALL chỉ phát các bản ghi ở mức đã chọn hoặc cao hơn.

3.4 WHEN `LOG_LEVEL` không được cung cấp THEN hệ thống SHALL dùng mức `info`.

3.5 WHEN server bắt đầu lắng nghe, quá trình bootstrap thất bại, hoặc xảy ra lỗi nội bộ khi xử lý HTTP THEN hệ thống SHALL ghi structured log với ngữ cảnh liên quan và không ghi secret, token, mật khẩu hoặc chuỗi kết nối database.

3.6 WHEN Gin xử lý request hoặc panic THEN hệ thống SHALL phát access log và recovery log qua logger đã cấu hình thay vì logger mặc định độc lập.

### Requirement 4
**User Story:** Là người duy trì API, tôi muốn nâng cấp bootstrap không ảnh hưởng hành vi hiện có, để frontend và client tiếp tục hoạt động bình thường.

#### Acceptance Criteria
4.1 WHEN các endpoint `/api/v1` được gọi sau thay đổi THEN hệ thống SHALL giữ nguyên route, HTTP status, Full Status Envelope và payload hiện có.

4.2 WHEN backend được test và static analysis THEN toàn bộ test hiện có SHALL vượt qua và `go vet ./...` SHALL không báo lỗi.

4.3 WHEN lập trình viên chạy backend bằng lệnh được tài liệu hóa THEN ứng dụng SHALL sử dụng cùng cơ chế nạp cấu hình bất kể `.env` được shell hoặc Make nạp trước hay chưa.
