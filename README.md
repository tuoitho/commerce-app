# Commerce Monorepo

Full-stack e-commerce foundation. The `auth` capability (register / login /
refresh / logout / me) is the first vertical slice.

```
backend/   Go API — Gin clean architecture + PostgreSQL + sqlc + golang-jwt
frontend/  React + Vite + TypeScript SPA — auth pages, fetch API client
```

## Quick start

1. **Database**

   ```sql
   CREATE ROLE commerce LOGIN PASSWORD 'commerce' CREATEDB;
   CREATE DATABASE commerce OWNER commerce;
   ```

   Apply migrations from `backend/`:

   ```sh
   make db-up
   make seed
   ```

2. **Backend** — from `backend/`: copy `.env.example` to `.env`, set `DB_URL`
   and `JWT_ACCESS_SECRET` (≥ 32 chars), then `make run`. Listens on
   `HTTP_PORT` (default `18080`). Routes under `/api/v1`.

3. **Frontend** — from `frontend/`: `npm install`, copy `.env.example` to
   `.env`, then `npm run dev`. Vite dev proxy forwards `/api` to the backend,
   so no CORS in development. SPA on `http://localhost:15173`.

## Environment variables

- Backend: `APP_ENV`, `HTTP_PORT`, `DB_URL`, `JWT_ACCESS_SECRET`,
  `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL`, `COOKIE_SECURE` — see
  `backend/.env.example`.
- Frontend: `VITE_API_BASE_URL` (default `/api`) — see `frontend/.env.example`.

## Tests & verification

```sh
make test            # backend go test + frontend vitest
make build           # backend sqlc generate + frontend tsc/vite build
```

Backend verification additionally runs `go vet ./...` and checks that
`sqlc generate` produces no diff against the committed generated code.

## Auth flow

- `POST /api/v1/auth/register` — create account, returns session (201)
- `POST /api/v1/auth/login` — exchange credentials for session (200)
- `POST /api/v1/auth/refresh` — rotate refresh token via httpOnly cookie (200)
- `POST /api/v1/auth/logout` — revoke presented refresh token (204)
- `GET  /api/v1/auth/me` — current profile, requires bearer access token (200)

## Product catalog

- `GET /api/v1/categories` — public category filter options
- `GET /api/v1/products` — public product search and filters: `q`, `category_id`, `min_price`, `max_price`, `in_stock`
- `GET /api/v1/products/:id` — public product detail

Run `make seed` from the repository root after `make db-up` to load repeatable sample catalog data.
