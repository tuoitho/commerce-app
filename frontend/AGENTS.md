# Frontend Agent Instructions

## Architecture

- `src/main.tsx` mounts `App.tsx`; `App.tsx` owns the router, `AuthProvider`, shared header, and route table.
- Keep endpoint-specific calls and wire types in `src/api/`. All requests must go through `src/api/client.ts` so credentials, bearer tokens, one-time 401 refresh, and `ApiError` handling remain consistent.
- The access token is persisted by `src/api/tokenStore.ts`; session restoration uses the httpOnly refresh cookie through `AuthProvider`.
- Catalog filters are URL search params (`q`, `category_id`, `min_price`, `max_price`, `in_stock`), not private component state. Product loading is debounced by `src/catalog/useCatalogProducts.ts`.
- Styling is centralized in `src/index.css`; preserve its existing responsive breakpoints when changing layouts.

## Commands

Run these from `frontend/`:

- Install exactly from the committed lockfile: `npm ci`.
- Start Vite: `npm run dev`. `/api` is proxied to `http://localhost:${HTTP_PORT:-8080}`.
- Run one test file: `npm test -- src/pages/CatalogPage.test.tsx`.
- Run tests once: `npm test` (`vitest run`, jsdom, setup in `src/test/setup.ts`). Tests are colocated as `*.test.ts` / `*.test.tsx`; no backend is required when fetch/API modules are mocked.
- Lint: `npm run lint` (Oxlint, not ESLint).
- Typecheck and production build: `npm run build` (`tsc -b && vite build`). This does not run lint or tests.
- Before finishing a frontend behavior change, run focused tests, then `npm run lint`, `npm test`, and `npm run build`.

## Runtime

- `VITE_API_BASE_URL` defaults in code to `/api/v1`; `.env.example` sets the same value. API wrappers therefore receive paths such as `/products`, not `/api/v1/products`.
- Vite's proxy target reads shell variable `HTTP_PORT`, not a Vite-prefixed variable. Keep it aligned with the backend port when it is not `8080`.
- This is a browser-routed SPA. New pages must be registered in `App.tsx`, and route tests should use `MemoryRouter` rather than requiring a running dev server.
