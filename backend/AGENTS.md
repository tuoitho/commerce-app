# Backend Agent Instructions

## Architecture

- `cmd/server/app.go` is the composition root: it loads config, opens the pgx pool, wires repositories/use cases, and constructs the Gin router. Routes are registered under `/api/v1` in `internal/delivery/http/router.go`.
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
- Before finishing a backend behavior change, run focused tests, then `make test` and `make vet`. After SQL or migration changes, also run `make gen` and inspect the generated diff.

## Runtime And Database

- Use `make run` for local startup because the backend Makefile includes and exports `.env`; direct `go run ./cmd/server` does not load `.env` itself.
- Startup requires PostgreSQL plus `DB_URL` and `JWT_ACCESS_SECRET` (at least 32 characters). `HTTP_PORT` defaults to `8080`; durations use Go syntax such as `15m` or `24h`.
- Database tasks use external CLIs: `make db-up` / `make db-down` require `migrate`; `make seed` requires `psql`. Run migrations before seeding.
- Migrations are numbered up/down pairs in `db/migrations`; sqlc reads the entire migration directory as its schema source.
- Whenever database schema, tables, columns, indexes, or constraints change:
  - Add a new numbered migration pair in `db/migrations/` (e.g. `00000X_name.up.sql` and `00000X_name.down.sql`).
  - Run `make db-up` to apply migrations to the local PostgreSQL database.
  - Run `make gen` to update sqlc generated models and queriers.
  - If seed data is affected, update `db/seed/catalog.sql` and run `make seed`.
- When checking out updated branches or setting up locally, always run `make db-up` before running the backend server or integration tests.

