# Design Document

## Overview

Thiết kế chuẩn hóa bootstrap backend theo Requirements 1-4 bằng Viper cho configuration loading, Google Wire cho compile-time dependency injection và `log/slog` cho structured logging. HTTP contract, domain flow, repository interfaces và database schema không thay đổi.

## Architecture

`cmd/server/main.go` tạo bootstrap logger, gọi bootstrap được sinh bởi Wire, rồi bootstrap đọc cấu hình, tạo application logger, database pool, dependency graph và HTTP server. `internal/config` là boundary duy nhất đọc configuration provider cho application; phần còn lại nhận `*config.Config` và `*slog.Logger` qua dependency injection.

```text
environment/.env
        |
      Viper -> Config validation
        |
  Wire injector -> logger, pool, repositories, use cases, router
        |
    HTTP server -> slog output
```

Viper phiên bản hỗ trợ dotenv sẽ đọc chính xác `.env` bằng explicit config file path, bỏ qua riêng lỗi file không tồn tại, giữ giá trị environment của process có độ ưu tiên cao hơn file, và không ghi ngược secret vào log. Mã Wire generated được commit để build không yêu cầu Wire CLI.

## Components And Interfaces

### Configuration

`internal/config.Load()` tiếp tục trả về `(*Config, error)` và giữ các field cấu hình hiện có, đồng thời bổ sung `LogLevel string`. Viper dùng key uppercase hiện tại: `APP_ENV`, `HTTP_PORT`, `DB_URL`, `JWT_ACCESS_SECRET`, `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL`, `COOKIE_SECURE`, `ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_PASSWORD`, `LOG_LEVEL`.

Defaults: `APP_ENV=development`, `HTTP_PORT=8080`, `ACCESS_TOKEN_TTL=15m`, `REFRESH_TOKEN_TTL=720h`, `LOG_LEVEL=info`; `COOKIE_SECURE` mặc định true khi production và false ở môi trường khác. `DB_URL` và `JWT_ACCESS_SECRET` bắt buộc; secret tối thiểu 32 ký tự.

### Logger

`internal/logger` cung cấp hai constructor cho hai giai đoạn bất biến. Bootstrap logger được tạo trước `config.Load()` từ raw `APP_ENV` và `LOG_LEVEL` đọc trực tiếp từ process environment, không đọc `.env`: dùng JSON khi raw environment là production, text ở trường hợp khác, và rơi về info nếu raw log level không hợp lệ. Logger này chỉ phát failure category cùng context an toàn, không phát raw error có thể chứa DSN hoặc secret. Sau khi config được validate, application logger nhận `*config.Config`; handler là `slog.TextHandler` ngoài production và `slog.JSONHandler` trong production, mức log map từ debug/info/warn/error. Application logger là dependency dùng cho server lifecycle, Gin access/recovery middleware và internal error logging.

Gin logger custom phải ghi method, path, status, latency và request context phù hợp qua `slog`; recovery middleware phải log panic qua cùng logger rồi giữ behavior recovery hiện có.

### Wire Composition

Wire provider set sở hữu các constructor hiện có cho pool, repositories, JWT manager, use cases, router và HTTP server. Injector tạo đúng graph một lần tại composition root. Provider không làm thay đổi interfaces trong `internal/domain` và không đưa dependency framework vào domain/usecase.

`cmd/server/wire.go` chứa injector declaration và bị loại khỏi build thường bằng build tag phù hợp; `cmd/server/wire_gen.go` là output generated được build. Makefile cung cấp target generate Wire trước khi build hoặc chạy thủ công.

### Environment Compatibility

`.env.example` được bổ sung `LOG_LEVEL`. Makefile export thêm key này nhưng ứng dụng vẫn tự đọc `.env`, để `go run ./cmd/server` và `make run` có cùng behavior.

## Data Models

Không có thay đổi database, migration, sqlc model hoặc HTTP response model. Config model bổ sung một scalar `LogLevel string`; logger output là runtime stream, không phải persisted data.

## Error Handling

Configuration load, parsing hoặc validation failure trả về error từ bootstrap trước khi mở database hoặc lắng nghe HTTP. `main` ghi các failure này bằng bootstrap logger với category/key an toàn rồi thoát khác 0. Database creation/ping và dependency construction tiếp tục fail fast; raw error vẫn được bọc để control flow chẩn đoán, nhưng logger chỉ phát operation/category đã allowlist, không serialize nguyên error có thể chứa connection string.

Log message và attributes không được chứa `JWT_ACCESS_SECRET`, `ADMIN_BOOTSTRAP_PASSWORD`, access/refresh token hoặc toàn bộ `DB_URL`. Internal HTTP errors tiếp tục trả Full Status Envelope hiện tại, nhưng diagnostic detail đi qua injected logger.

## Testing Strategy

- Config unit tests kiểm tra Viper defaults, process environment override `.env`, missing optional `.env`, required keys, invalid values và log level validation (Requirements 1.1-1.6).
- Logger unit tests kiểm tra bootstrap/application handler format, level filtering, fallback của raw log level và không xuất secret/DSN trong các bootstrap/error messages (Requirements 3.1-3.5).
- Composition/build verification chạy Wire generation rồi `go build ./...` (Requirements 2.1-2.4).
- HTTP tests kiểm tra router behavior và error logging dependency không làm thay đổi status/envelope/payload (Requirements 3.6, 4.1).
- Backend verification chạy `make test` và `make vet` (Requirement 4.2); startup equivalence được kiểm tra tại config boundary với environment từ shell và `.env`, không yêu cầu database thật (Requirement 4.3).

## Requirement Traceability

| Requirement | Design Elements | Verification |
|---|---|---|
| 1.1-1.3 | Viper config boundary and optional `.env` | Config unit tests |
| 1.4-1.6 | Config validation and defaults | Config unit tests |
| 2.1-2.4 | Wire injector and committed generated output | Wire generation and Go build |
| 3.1-3.4 | slog handler selection and level mapping | Logger unit tests |
| 3.5-3.6 | Secret-safe attributes and Gin adapters | Logger/HTTP tests |
| 4.1 | Preserved router and response contracts | Existing HTTP suite |
| 4.2 | Test and vet commands | `make test`, `make vet` |
| 4.3 | Application-owned Viper loading | Startup/config integration check |

## Alternatives Considered

`log/slog` được chọn thay cho Zap hoặc Logrus vì là standard library, đáp ứng structured logging và giảm dependency/runtime adapter. Viper được giới hạn trong config package để tránh làm rò rỉ global mutable configuration. Wire được chọn thay cho runtime DI để compile-time kiểm tra graph và phù hợp composition root hiện có.
