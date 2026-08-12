## Context

Empty repository (see proposal.md - Why). This change scaffolds a full-stack e-commerce monorepo (Go backend + React frontend) and implements the `auth` capability as the first vertical slice. Architecture choices were confirmed with the user: PostgreSQL, Gin, JWT access + refresh tokens. Clean architecture, sqlc, and Vite+React+TS are repo-level requirements.

## Goals / Non-Goals

**Goals:**
- A runnable monorepo skeleton (`backend/` + `frontend/`) with standard tooling wiring (migrations, sqlc, env config) that future commerce capabilities can extend without restructuring.
- The `auth` capability fully implemented end-to-end per `specs/auth/spec.md`.

**Non-Goals:**
- No commerce behavior (catalog, cart, order, payment, admin) — those are future capabilities.
- No email verification, password reset, social/OAuth login.
- No multi-tenant concerns, rate limiting, or production-grade observability (structured logging for local dev only).

## Decisions

1. **Repository layout (monorepo).** `backend/` = Go module, `frontend/` = Vite app, `.env.example` per side. Root `README.md` documents startup. Alternative considered: separate repos — rejected; commerce features span both sides and change together.

2. **Clean architecture layers (backend).** Go packages under `backend/internal/`:
   - `domain/` — entities (`User`), domain errors (stable error→HTTP mapping), plain interfaces for repositories/providers.
   - `usecase/` — application logic (register, login, refresh, logout, me), depends only on `domain` interfaces.
   - `repository/` — sqlc-generated implementations of the domain interfaces.
   - `delivery/http/` — Gin handlers, route wiring, and middleware (auth guard).
   - `config/` — env loading; `bootstrap/` or `cmd/server` composes dependencies.
   Dependency rule: delivery → usecase → repository/domain; no upward dependencies. This keeps future catalog/order use cases consistent.

3. **Database access with sqlc + pgx.** `backend/sqlc.yaml` reads SQL from `backend/db/queries/`, schema from `backend/db/migrations/`, and generates Go into `backend/internal/repository/sqlc`. Generated code is committed. Handlers/usecases never touch SQL.

4. **Schema migrations with golang-migrate.** Numbered SQL files in `backend/db/migrations/`, run via `make db-up` / `golang-migrate up`. Seed not needed for auth.

5. **Schema.** `users(id uuid pk default gen_random_uuid(), email citext unique not null, password_hash text not null, created_at, updated_at)` and `refresh_tokens(id uuid pk, user_id uuid fk, token_hash text unique not null, expires_at timestamptz not null, revoked_at timestamptz null, created_at)`. `citext` makes email uniqueness case-insensitive; index on `refresh_tokens(token_hash)`. Alternative considered: `email text` with lowercasing in app — rejected, `citext` is simpler and safer.

6. **Token strategy (HTTPS API).** Access token = signed JWT (HS256, `golang-jwt/v5`) carrying `sub` (user id), `iat`, `exp`, short TTL (default 15m, env-configurable). Refresh token = 32-byte random opaque string, delivered only as an `httpOnly` cookie (`Path=/api/v1/auth`, `SameSite=Lax`, `Secure` when `APP_ENV=production`), stored server-side as its SHA-256 hash. Rotation: on refresh, the presented token is revoked and a new one issued. Alternative considered: stateless JWT refresh token — rejected because revoking on logout/rotation is impossible without keeping a deny-list, which defeats the point; opaque hashed tokens are cleanly revocable (see decision 7).

7. **Revocation storage.** `revoked_at` on `refresh_tokens` implements logout and rotation reuse detection. A rotated/expired/revoked token returns `401`. No background cleanup in this change (table grows slowly; note in tasks as optional follow-up).

8. **Password handling.** bcrypt (`golang.org/x/crypto/bcrypt`, default cost) for `password_hash`. Validation: email RFC-format check, password min length 8.

9. **API contract.** JSON body; error shape exactly `{"error":{"code":"...","message":"...","fields":[...]}}`. Domain error → status mapping is centralized:
   - validation → `400`
   - duplicate email → `409` (`email_in_use`)
   - bad credentials → `401` (`invalid_credentials`)
   - token missing/expired/revoked → `401` (`unauthorized`/`invalid_token`)
   - not found → `404`
   Success/error payload and cookie behavior follow `specs/auth/spec.md`.

10. **Frontend structure.** Vite + React + TS. `react-router` for routing (`/login`, `/register`, protected `/`). An `AuthProvider` (React context) owns session state: access token in memory + `localStorage` for reload restoration, refresh cookie handled browser-side. A small fetch-based `api client` attaches the bearer token; on `401` it calls `POST /api/v1/auth/refresh` once and retries the original request, then forces logout if refresh fails. `ProtectedRoute` redirects anonymous users to `/login`. Vite dev proxy forwards `/api` to the Go server, avoiding CORS in development.

11. **Config.** Environment-driven with sensible defaults in code and documented in `.env.example`: `APP_ENV`, `HTTP_PORT`, `DB_URL`, `JWT_ACCESS_SECRET`, `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL`. Secrets are never logged or returned.

## Risks / Trade-offs

- **sqlc/Go version drift and codegen vs. migration mismatch** → pin documented versions in tasks; `sqlc generate` and `make db-up` are explicit steps of the apply workflow with a CI-style verification command.
- **PostgreSQL `citext` extension availability** → extension is standard on managed Postgres; migration creates it, so failure surfaces at migrate time, not runtime.
- **Refresh cookie path scoping** → cookie `Path=/api/v1/auth` means it is only sent to auth endpoints; login/register/refresh/logout all live under that prefix by contract.
- **Token rotation race (double-submit of same refresh token)** → second use hits a revoked token and fails with `401`, which is also the reuse-detection signal; acceptable for this stage. Full fingerprinting/PUB is out of scope.
- **LocalStorage for access token is XSS-exposed** → accepted common SPA trade-off; the long-lived credential (refresh token) stays in `httpOnly` cookie, and access TTL is short so the exposure window is small.

## Migration Plan

Greenfield: apply migrations on a fresh database (`make db-up`), then start both servers for local development. Rollback strategy = drop the schema; no data migration exists yet.

## Open Questions

None that block the approach defined above. Deployment specifics (Docker, hosting, domain) are deferred and can be answered later without changing specs or tasks.