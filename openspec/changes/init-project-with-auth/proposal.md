## Why

The repository is currently empty (no application code). It needs a full-stack e-commerce project foundation with a backend using Go clean architecture + sqlc + PostgreSQL and a frontend using ReactJS + Vite + TypeScript. Authentication (register/login) is the first vertical slice and the foundation for all subsequent commerce capabilities.

## What Changes

- Scaffold a monorepo with `backend/` (Go + Gin + sqlc + PostgreSQL) and `frontend/` (ReactJS + Vite + TypeScript).
- Establish a clean architecture layout in the backend: `delivery` (HTTP handlers), `usecase` (application logic), `repository` (data access), `domain` (entities/models), and config/bootstrap wiring.
- Integrate sqlc for type-safe SQL queries against PostgreSQL, with a migration tool for database schema.
- Implement authentication as the first capability:
  - User registration (`POST /api/v1/auth/register`) with email/password, bcrypt password hashing, email uniqueness validation.
  - Login (`POST /api/v1/auth/login`) issuing a JWT access token (short-lived) + refresh token (long-lived, httpOnly cookie).
  - Refresh token rotation (`POST /api/v1/auth/refresh`).
  - Logout (`POST /api/v1/auth/logout`) revoking the refresh token.
  - Current user profile (`GET /api/v1/auth/me`) protected by access token.
  - Password validation (minimum length).
- Frontend: auth pages (login, register), API client for the backend, protected-route handling, and token refresh on 401.
- CI-style verification: backend unit/API tests for auth flows, frontend build passes.

## Capabilities

### New Capabilities

- `auth`: User registration, login with JWT access + refresh token, logout, token refresh, and retrieving the authenticated user's profile.

## Impact

- New `backend/` Go module with dependencies: Gin, pgx (or pg), sqlc, golang-migrate (or comparable), golang-jwt.
- New `frontend/` React+Vite+TS app with `fetch`-based API client.
- New PostgreSQL schema (migrations) for `users`, `refresh_tokens`, `sessions` (revocation tracking).
- New environment configuration (`.env.example`) for DB DSN, JWT secrets, token durations.
- Backward compatible: no existing contracts exist; all new.
- No commerce (catalog/cart/order) behavior in this change; those are future capabilities.