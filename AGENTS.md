# Repository Agent Instructions

## Package Scope

- This commerce repository has three packages. Read and follow `frontend/AGENTS.md` for work under `frontend/`, `frontend-admin/AGENTS.md` for work under `frontend-admin/`, and `backend/AGENTS.md` for work under `backend/`; all apply to cross-package changes.
- Run package commands from their package directories. Root `make test` runs all package test suites; root `make build` runs backend `sqlc generate` and the frontend/admin production builds. Root `make db-up` applies database migrations via `golang-migrate` (`migrate`), and `make seed` loads sample catalog data.
- Prefer executable configuration over README prose. The root Makefile's frontend `:3000` comment is stale; Vite uses its default port (`5173`).
- Backend configuration is owned by Viper in `backend/internal/config`; process environment values override the optional `.env` file. Do not add direct environment reads to backend packages outside the config boundary.
- Backend dependency construction uses Google Wire at compile time. Wire-generated files are committed and must be regenerated after provider or injector changes; do not edit generated Wire output manually.
- Backend runtime logging uses Go `log/slog`: text outside production, JSON in production, and `LOG_LEVEL` values `debug`, `info`, `warn`, or `error`. Never log secrets, passwords, tokens, or the complete database URL.

## Governed Changes

- Local fixes and explicit behavior changes confined to one bounded context may proceed directly with focused tests. Any API/schema/event, compatibility, persistence/security boundary, cross-package, or materially ambiguous behavior change requires an approved Kiro specification first.
- Canonical governed artifacts are `.kiro/specs/<feature>/requirements.md`, `design.md`, and `tasks.md`; approve each stage and independently review the complete set before implementation. `tasks.md` is the implementation plan.
- If implementation contradicts an approved artifact, update and re-approve that artifact before continuing. Verify completed governed work against requirement IDs and acceptance criteria.
- Use the `question` tool for blocking product/architecture choices and approval gates that repository evidence cannot resolve.
- Whenever database schema, tables, columns, constraints, or queries are modified:
  - Add numbered migration files in `backend/db/migrations/` (`.up.sql` and `.down.sql`).
  - Run `make db-up` (or `golang-migrate` / `migrate`) to apply migrations to the database.
  - Run `make build` or `make -C backend gen` (`sqlc generate`) to regenerate sqlc models and queriers.

## API Contract Standards

- All `/api/v1` HTTP endpoints (except 204 No Content) follow the Full Status Envelope:
  - **Success (`200`, `201`):** `{"success": true, "message": string, "data": <T>, "error": null, "meta": {"timestamp": string, "pagination"?: PaginationMeta}}`.
  - **No Content (`204`):** `POST /api/v1/auth/logout` returns HTTP 204 with no body.
  - **Error (`4xx`, `5xx`):** `{"success": false, "message": string, "data": null, "error": {"code": string, "message": string, "fields"?: Record<string, string>}, "meta": {"timestamp": string}}`.
- **Direct Payload:** The `data` property carries the primary entity or collection directly (`Category[]`, `ProductSummary[]`, `ProductDetail`, `Cart`, `User`, `{user, accessToken}`).
- **Error Categorization:**
  - **Validation Errors (`HTTP 400`):** `error.code` describes the validation issue (`validation_error`, `invalid_filter`), `error.fields` maps invalid fields to messages.
  - **Business Logic Errors (`HTTP 401/404/409`):** `error.code` specifies the business violation (`out_of_stock`, `stock_limit`, `email_in_use`, `cart_item_unavailable`), `error.fields` is omitted.
  - **System Errors (`HTTP 500`):** `error.code` is `"internal"`, `error.fields` is omitted.
  - **Language Requirements:** All user-facing business error messages (don't need for validation errors) MUST be in Vietnamese.

## Process Safety

- Use systematic debugging and test-driven development for behavior fixes. Prefer one agent for coupled frontend/backend work; delegate only independent work after shared contracts are stable.
- Never run dev servers, watch tests, or other long-lived commands unbounded in the foreground. Use a background/session mechanism or an explicit timeout, verify readiness, capture logs/PID where applicable, and stop the process afterward.
