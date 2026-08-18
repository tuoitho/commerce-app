# Implementation Plan

- [x] 1. Chuẩn hóa runtime configuration

- [x] 1.1 Thay config loader hiện có bằng Viper với validation tương thích
  - **Produces:** `internal/config.Load()` nạp environment và `.env` theo precedence đã duyệt, giữ defaults hiện hành và validate toàn bộ input kể cả `LOG_LEVEL`.
  - **Scope:** config package, dependency Viper, `.env.example`, Makefile environment export và focused tests; loại bỏ parser `.env` thủ công khỏi composition root.
  - **Consumes:** configuration keys, defaults và failure semantics trong design.
  - **Acceptance:** environment ghi đè `.env`; thiếu `.env` không lỗi; required/invalid values fail fast với key rõ ràng; `go run` và `make run` dùng cùng loader.
  - **Verification:** config unit tests dùng isolated temp `.env`/environment và test defaults, precedence, missing file, required keys, parse/validation errors.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 4.3_

- [x] 2. Thiết lập structured logging

- [x] 2.1 Cung cấp bootstrap và application logger slog theo environment và log level
  - **Produces:** bootstrap logger an toàn trước config load và application logger dùng text handler ngoài production, JSON handler trong production, lọc `debug|info|warn|error`.
  - **Scope:** logger package và focused tests; không đưa config provider trực tiếp vào domain/usecase.
  - **Consumes:** `Config.AppEnv` và `Config.LogLevel` từ task 1.1.
  - **Acceptance:** output có timestamp/level/message đúng format; default level là info; raw log level không hợp lệ rơi về info ở bootstrap; bootstrap failure chỉ ghi category/context allowlist; giá trị nhạy cảm và DSN không xuất hiện trong startup/error logging.
  - **Verification:** logger unit tests capture output cho bootstrap/application format, threshold, fallback và secret-safety scenarios.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 2.2 Tích hợp slog vào Gin access, recovery và HTTP internal errors
  - **Produces:** request, panic và internal application errors đi qua cùng injected `*slog.Logger` mà không đổi HTTP response contract.
  - **Scope:** Gin middleware/router dependencies, HTTP error handling và focused HTTP tests; composition root wiring thuộc task 3.1.
  - **Consumes:** logger contract từ task 2.1 và Full Status Envelope hiện có.
  - **Acceptance:** access log có method/path/status/latency; panic được recovery và log; lỗi nội bộ vẫn trả status/envelope/message hiện hành; diagnostic log không chứa credentials/token.
  - **Verification:** middleware/error tests capture slog output và assert response regression cases.
  - _Requirements: 3.5, 3.6, 4.1_

- [x] 3. Chuyển composition root sang compile-time DI

- [x] 3.1 Xây Wire provider graph cho backend server
  - **Produces:** Wire injector và committed generated graph tạo pool, repositories, security services, use cases, Gin router và HTTP server; startup lifecycle dùng logger đã cấu hình.
  - **Scope:** `cmd/server`, constructor adapters cần thiết, Wire dependency, generated output và Makefile generation target.
  - **Consumes:** config loader từ task 1.1, logger/middleware contracts từ tasks 2.1-2.2 và constructor hiện có.
  - **Acceptance:** Wire generation và build kiểm tra graph ở compile time; build thường không cần Wire CLI; server startup/bootstrap admin giữ behavior hiện có; pre-config và database bootstrap failures được log bằng category/context an toàn; không dùng reflection/service locator.
  - **Verification:** chạy Wire generation, kiểm tra generated diff, `go build ./...` và focused composition tests khả thi mà không cần PostgreSQL thật.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.5_

- [x] 4. Xác nhận tương thích backend

- [x] 4.1 Kiểm tra hồi quy toàn bộ runtime bootstrap
  - **Produces:** bằng chứng tích hợp rằng config, logging, Wire graph và HTTP behavior hoạt động cùng nhau mà không đổi API/data contract.
  - **Scope:** bounded integration assertions cần thiết cho bootstrap và regression verification toàn backend; chỉ sửa lỗi trực tiếp do feature tạo ra.
  - **Consumes:** các deliverable của tasks 1.1, 2.1, 2.2 và 3.1.
  - **Acceptance:** mọi test hiện có và test mới vượt qua; static analysis sạch; HTTP routes/status/envelopes/payloads không đổi.
  - **Verification:** `go test ./...`, `go vet ./...`, `go build ./...` và deterministic environment/`.env` equivalence checks tại config boundary, không chạy server dài hạn hoặc yêu cầu database thật.
  - _Requirements: 2.3, 4.1, 4.2, 4.3_

