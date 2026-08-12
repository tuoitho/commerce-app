## 1. Backend scaffold

- [x] 1.1 Initialize `backend/go.mod` (module `github.com/<org>/commerce-backend` or a local module name) and add dependencies: Gin, pgx/v5, golang-jwt/jwt/v5, golang-migrate CLI, google/uuid
- [x] 1.2 Create `backend/internal/config` loading: `APP_ENV`, `HTTP_PORT`, `DB_URL`, `JWT_ACCESS_SECRET`, `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL`, `COOKIE_SECURE`, with defaults and validation
- [x] 1.3 Create `backend/.env.example` documenting all config keys and create `backend/Makefile` with targets: `db-up`, `gen` (sqlc), `run`, `test`, `vet`
- [x] 1.4 Create `backend/cmd/server/main.go` that loads config, wires pgx pool (ping at startup, fail fast), and starts the Gin server on `HTTP_PORT`; empty route group `/api/v1` ready

## 2. Database schema and sqlc

- [x] 2.1 Write `backend/db/migrations/000001_create_users.up.sql` / `.down.sql`: `citext` extension, `users` table (uuid pk, email citext unique, password_hash, timestamps), `refresh_tokens` table (uuid pk, user_id fk on delete cascade, token_hash unique, expires_at, revoked_at, created_at), index on `token_hash`
- [x] 2.2 Write `backend/db/queries/` SQL files: `CreateUser`, `GetUserByEmail`, `GetUserByID`, `CreateRefreshToken`, `GetRefreshTokenByHash` (with user join), `RevokeRefreshTokenByID`, `RevokeRefreshTokensByUserID`
- [x] 2.3 Add `backend/sqlc.yaml` (engine postgresql, schema, queries, package `sqlc`, out `internal/repository/sqlc`, emit uuid strings), run `sqlc generate` and `make db-up` against a fresh Postgres; verify generated code compiles with `go build ./...`

## 3. Domain and use cases

- [x] 3.1 Create `backend/internal/domain`: `User` entity; error sentinel types mapping to HTTP statuses (validation, duplicate email, invalid credentials, invalid token, not found); repository interfaces (`UserRepository`, `SessionRepository`)
- [x] 3.2 Write `backend/internal/repository` implementation of the domain interfaces using generated sqlc code over pgx
- [x] 3.3 Create `backend/internal/security`: bcrypt `HashPassword`/`CheckPassword` and opaque refresh token generator (`GenerateRefreshToken` returning plaintext + SHA-256 hash)
- [x] 3.4 Create `backend/internal/security/jwt` manager: `GenerateAccessToken(userID, ttl)`, `ParseAccessToken(token)` validating signature/`exp`, returning `userID`; config for secret/issuer
- [x] 3.5 Implement `backend/internal/usecase/auth`: `Register`, `Login`, `Refresh`, `Logout`, `Me` orchestrated as described in design.md; enforces email format check, password min length 8, email uniqueness -> duplicate error, credential mismatch -> invalid-credentials error, rotation with revocation, expired/revoked reuse -> invalid-token error
- [x] 3.6 Unit-test `usecase/auth` with in-memory fakes for both repo interfaces covering every scenario in `specs/auth/spec.md` (register success/invalid email/short password/duplicate; login success/unknown email/bad password; refresh success/expired-revoked-unknown; logout revokes; me returns user) — run `go test ./...`

## 4. HTTP delivery

- [x] 4.1 Create `backend/internal/delivery/http` `auth_handler.go` handling register, login, refresh, logout, me with JSON request/response DTOs and the error-contract body `{"error":{"code","message","fields"}}`
- [x] 4.2 Create error mapping middleware/handler helper mapping domain errors -> HTTP status codes and validation -> `400` with `fields`
- [x] 4.3 Create auth guard middleware `AuthRequired` parsing the bearer access token and setting the caller user id in context
- [x] 4.4 Wire routes in Gin: `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me` (guarded); set/clear refresh cookie (`Path=/api/v1/auth`, `HttpOnly`, `Secure` per env, `SameSite=Lax`) in login/register/refresh/logout responses
- [x] 4.5 Handler tests (httptest + fake usecase or integration against the repository fakes) asserting status codes and cookie presence/absence per spec scenarios: register 201/400/409, login 200/401, refresh 200/401, logout 204, me 200/401, error body shape — run `go test ./...`

## 5. Backend verification

- [x] 5.1 Run `go vet ./...`, `go test ./...`, `sqlc generate` (no diff), and start the server against a local Postgres; exercise the full auth flow with curl: register -> login -> me -> refresh -> logout -> refresh-fails-with-401
- [x] 5.2 Write `backend/README.md` (or top-level section) covering setup: create DB, `make db-up`, `.env`, `make run`, `make test`

## 6. Frontend scaffold

- [x] 6.1 Scaffold `frontend/` with Vite + React + TypeScript (`npm create vite` template react-ts) with clean default layout; add `react-router-dom`
- [x] 6.2 Configure Vite dev proxy `/api -> http://localhost:<HTTP_PORT>` and `frontend/.env.example` with `VITE_API_BASE_URL=/api`
- [x] 6.3 Create base `frontend/src/api` fetch client: base URL, JSON handling, attaches bearer access token, throws structured errors matching backend error contract, sends credentials for cookies

## 7. Frontend auth experience

- [x] 7.1 Create `frontend/src/auth/AuthProvider` (context): state for `user` and `accessToken`, persisted access token in localStorage; actions `login(register)`, `logout`; on mount, restore session by calling refresh endpoint
- [x] 7.2 Add `refresh-on-401` logic in the API client: on `401` call `POST /auth/refresh` once, retry original request; if refresh fails, clear auth state
- [x] 7.3 Create `LoginPage` and `RegisterPage` with email/password forms, inline validation (email format, password >= 8 characters -- register only), submit to API, show API error messages, navigate to `/` on success
- [x] 7.4 Create `HomePage` (protected) showing logged-in user's email and a logout button that calls logout and returns to `/login`
- [x] 7.5 Create `ProtectedRoute` wrapper redirecting unauthenticated users to `/login`; wire all routes in the router
- [x] 7.6 Unit-test the validation helpers (email, password) and the session restore behavior of AuthProvider with mocked fetch — run `npm run test` (Vitest) or build-level check per tooling decision

## 8. Frontend verification

- [x] 8.1 Run `npm run build` (tsc must pass) and `npm run dev` smoke test wiring both servers through the Vite proxy: register -> login -> home displays email -> logout -> protected route redirects to login; no console errors

## 9. Repository-level integration

- [x] 9.1 Add root `.gitignore` (Go, Node, .env), root `Makefile` or `README.md` with both-server start instructions, and `.env.example` summary
- [x] 9.2 Final deterministic verification: run backend `go test ./...`, `go vet ./...`, `sqlc generate` no-diff, frontend `npm run build`; record evidence in the apply report