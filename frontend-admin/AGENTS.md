# Frontend Admin Agent Instructions

## Architecture

* `src/main.tsx` mounts `App.tsx`; `App.tsx` owns the layout shell and routing structure.
* Keep endpoint-specific calls and wire types in `src/api/`. Domain API service modules return direct payloads or status envelope responses.
* All requests must go through `src/api/client.ts` with credentials, bearer tokens, 401 handling, and `ApiError` mapping.
* Handle errors via `ApiError`: use `err.isValidationError()` to bind `err.fields` to form inputs, and user-facing Vietnamese messages for toasts/alerts.
* Styling is centralized in `src/index.css`.

## UI Stack

Use Tailwind CSS and shadcn/ui as the primary UI foundation.

Preferred supporting libraries:
* `lucide-react` for icons.
* `@tanstack/react-query` for data fetching & server state caching.
* `clsx`, `tailwind-merge`, `class-variance-authority` for styling primitives.

## Commands

Run these from `frontend-admin/`:
* Install dependencies: `npm install` (or `npm ci`).
* Start Vite dev server: `npm run dev` (configured on port 15174, proxies `/api` to `http://localhost:${HTTP_PORT:-18080}`).
* Run tests: `npm test` (`vitest run`).
* Lint: `npm run lint` (`oxlint`).
* Typecheck and production build: `npm run build` (`tsc -b && vite build`).
