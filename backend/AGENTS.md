# Backend Agent Instructions

## Architecture

- `cmd/server` is the composition root. Google Wire constructs the pgx pool, repositories, use cases, Gin router, and HTTP server at compile time; keep provider declarations in `wire.go` and commit `wire_gen.go` so normal builds do not require the Wire CLI.
- `internal/config` owns all Viper access, `.env` loading, defaults, parsing, and validation. Process environment values override `.env`; pass the resulting `*config.Config` to consumers instead of reading environment variables outside this package.
- Use the configured `log/slog` logger for application lifecycle, HTTP access, recovery, and internal errors. Development logs are text, production logs are JSON, and `LOG_LEVEL` accepts `debug`, `info`, `warn`, or `error`. Never log JWT secrets, passwords, access or refresh tokens, or the complete database URL.
- Routes are registered under `/api/v1` in `internal/delivery/http/router.go`.
- Keep dependency direction as `delivery -> usecase -> domain`; repository implementations satisfy interfaces owned by `internal/domain`.
- `internal/delivery/http/response.go` (`writeSuccess`, `writePaginatedSuccess`) and `internal/delivery/http/error.go` (`writeError`, `respondError`) own the public Full Status JSON Envelope (`ResponseEnvelope`) with direct payload in `data`, ISO 8601 UTC timestamp in `meta`, and domain-error-to-status mapping. Always use these helpers instead of ad-hoc `c.JSON()` calls.
- `internal/repository/sqlc/` is committed generated code; never edit it directly. Change `db/queries` or `db/migrations`, then run `make gen` (`sqlc generate`).

## Commands

Run these from `backend/`:

- Run all tests: `make test` (`go test ./...`). Existing tests use fake repositories and do not require PostgreSQL.
- Run one package: `go test ./internal/usecase/catalog`.
- Run one test: `go test ./internal/delivery/http -run '^TestCatalog_ListProductsWithoutAuth$'`.
- Static analysis: `make vet` (`go vet ./...`).
- Regenerate sqlc output: `make gen`; `sqlc` must be on `PATH`.
- After changing Wire providers or injector declarations, regenerate `cmd/server/wire_gen.go` with the backend Wire generation target and inspect the generated diff. Do not edit generated Wire code manually.
- Before finishing a backend behavior change, run focused tests, then `make test` and `make vet`. After SQL or migration changes, also run `make gen` and inspect the generated diff.

## Runtime And Database

- Both `make run` and `go run ./cmd/server` use the application-owned Viper loader. A local `.env` file is optional; process environment values take precedence.
- Startup requires PostgreSQL plus `DB_URL` and `JWT_ACCESS_SECRET` (at least 32 characters). `HTTP_PORT` defaults to `8080`, `LOG_LEVEL` defaults to `info`, and durations use Go syntax such as `15m` or `24h`.
- Database tasks use external CLIs: `make db-up` / `make db-down` require `migrate`; `make seed` requires `psql`. Run migrations before seeding.
- Migrations are numbered up/down pairs in `db/migrations`; sqlc reads the entire migration directory as its schema source.
- Whenever database schema, tables, columns, indexes, or constraints change:
  - Add a new numbered migration pair in `db/migrations/` (e.g. `00000X_name.up.sql` and `00000X_name.down.sql`).
  - Run `make db-up` to apply migrations to the local PostgreSQL database.
  - Run `make gen` to update sqlc generated models and queriers.
  - If seed data is affected, update `db/seed/catalog.sql` and run `make seed`.
- When checking out updated branches or setting up locally, always run `make db-up` before running the backend server or integration tests.

