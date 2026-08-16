# Implementation Plan

- [ ] 1. Backend Foundation for Admin

- [ ] 1.1 Support User Roles
  - **Produces:** A database migration adding a `role` column to the `users` table (default `customer`), updated authentication logic that returns the role, an admin-only guard for `/api/v1/admin/*` endpoints, and bootstrap provisioning of an admin account from environment-configured credentials.
  - **Scope:** `backend/db/migrations/`, sqlc generation, `backend/internal/domain/user.go`, auth use case, guard/middleware, and `/api/v1/auth/me` endpoints.
  - **Consumes:** Architecture decisions from design.md.
  - **Acceptance:** `users` table has a `role` column (e.g. `admin` vs `customer`). The auth endpoint returns the user's role. Non-admins are denied on `/api/v1/admin/*`. When `ADMIN_BOOTSTRAP_EMAIL`/`ADMIN_BOOTSTRAP_PASSWORD` (or equivalent env config) are set and no admin exists, one admin account is provisioned with those credentials; re-running the same config does not create a duplicate.
  - **Verification:** Go tests verifying role parsing/return, bootstrap provisioning idempotency, and non-admin denial on admin endpoints.
  - _Requirements: 1.3, 2.3, 6.1, 6.2_

- [ ] 1.2 Catalog Model Change: Brand as Plain Text (Cross-package)
  - **Produces:** A migration adding `brand text NOT NULL DEFAULT ''` to `products`, seed restructure (brand text values; categories become a danh mục taxonomy), and `brand` returned as a string in `productSummaryResponse`/`productDetailResponse`.
  - **Scope:** `backend/db/migrations/`, sqlc generation, `backend/internal/domain/catalog.go`, `backend/internal/repository/catalog_repository.go`, `backend/db/seed/catalog.sql`, and the customer-facing `frontend/` (types, product card, detail navigation, home brand tabs).
  - **Consumes:** The catalog contract migration in design.md (Req 7).
  - **Acceptance:** Products expose `brand` as a string; categories are a structured taxonomy; the customer frontend displays brand text and filters/navigates by category without regressions.
  - **Verification:** Go tests asserting string `brand`; `frontend/` RTL tests for brand rendering and category filtering/navigation.
  - _Requirements: 7.1, 7.2, 7.3_

- [ ] 1.3 Administrative Product APIs
  - **Produces:** GET (list + detail), POST, PUT, DELETE endpoints for products at `/api/v1/admin/products`, matching the Admin Catalog Contract in design.md. GET endpoints return active products regardless of variants; POST/PUT persist `active = true`; DELETE is a soft delete (`active = false`) returning `204`.
  - **Scope:** `backend/internal/delivery/http/admin_catalog_handler.go`, use cases, and SQL repository methods for reading and mutating products.
  - **Consumes:** The `Product` domain entity with string `brand` (from Task 1.2) and the catalog contract in design.md.
  - **Acceptance:** Admins can list, create, update, and delete products, including products that have no variants. Create/update save products as `active = true`. Delete is a soft delete (`active = false`) and returns `204`; a deleted product no longer appears in `GET /api/v1/admin/products`. Proper domain validations apply.
  - **Verification:** HTTP integration tests in Go ensuring only admins can use these endpoints, and data mutates correctly (including soft-delete behavior, variant-less product listing, and validation errors).
  - _Requirements: 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 5.1, 5.2, 7.1_

- [ ] 2. Project Setup and Authentication Foundation (Frontend)

- [ ] 2.1 Initialize `frontend-admin` project
  - **Produces:** A runnable Vite + React + TypeScript + Tailwind project with shadcn/ui configured in `frontend-admin/`.
  - **Scope:** Root directory structure, package configuration, Vite config, Tailwind config, and base React rendering.
  - **Consumes:** Architecture decisions from design.md.
  - **Acceptance:** `npm run dev` successfully serves the basic app at its configured port, and a basic shadcn/ui component renders correctly.
  - **Verification:** Vitest setup and a basic rendering test for the app shell.
  - _Requirements: 1.1, 1.2_

- [ ] 2.2 Implement HTTP client and Authentication Flow
  - **Produces:** Configured API client, React Router setup with protected routes, and a Login page.
  - **Scope:** Authentication state, routing logic, login form UI, and error handling for 401s/403s.
  - **Consumes:** The `Full Status Envelope` contract from `backend/` and `design.md`.
  - **Acceptance:** Unauthenticated users are redirected to `/login`. Admins logging in redirect to `/`. Non-admins see Vietnamese access denied errors.
  - **Verification:** RTL integration tests mocking auth success/failure and 401 interceptor behavior.
  - _Requirements: 2.1, 2.2, 2.3_

- [ ] 3. Product Management (Frontend)

- [ ] 3.1 Implement Product List View
  - **Produces:** `/products` page with a shadcn/ui `DataTable` displaying products, with pagination and search.
  - **Scope:** `ProductList` component, React Query fetching logic, API client integration for GET `/api/v1/admin/products`.
  - **Consumes:** Approved `Product` data model (brand as string, category as `{ id, name }`) from design.md and query parameters (`?q=`, `?page=`, `?limit=`).
  - **Acceptance:** Table renders correctly according to the backend data shape, including the brand text column and category. Search filters results by hitting the admin API with a search query.
  - **Verification:** Component tests asserting table rendering (incl. brand column), pagination control existence, and search API calls.
  - _Requirements: 3.1, 3.2, 3.3_

- [ ] 3.2 Implement Product Create and Update Forms
  - **Produces:** Product form page, validation logic, and POST/PUT integration.
  - **Scope:** React Hook Form + Zod for the Product model, UI form components (free-text brand input, category select from categories), submit handlers.
  - **Consumes:** `SaveProductRequest` (brand text + categoryId) and validation error shape from design.md, Backend Task 1.3 APIs, and `GET /api/v1/admin/products/:id` for edit initialization.
  - **Acceptance:** Valid form saves data and updates list. Edit form initializes from the admin product detail. Invalid form blocks submission and displays specific Vietnamese validation errors adjacent to fields.
  - **Verification:** RTL tests covering form validation (error messages), edit initialization, and successful submission payloads (asserting payload matches `SaveProductRequest`).
  - _Requirements: 4.1, 4.2, 4.3, 7.1_

- [ ] 3.3 Implement Product Deletion
  - **Produces:** Delete action integrated into the Product List, with a confirmation dialog.
  - **Scope:** shadcn/ui `AlertDialog`, DELETE API integration, React Query cache invalidation.
  - **Consumes:** Backend Task 1.3 APIs (soft-delete semantics per design.md).
  - **Acceptance:** Clicking delete prompts for confirmation. Confirming soft-deletes the product (per design.md) and refreshes the table so the product is absent.
  - **Verification:** Test verifying the confirmation dialog appears and the correct API call is made upon confirmation.
  - _Requirements: 5.1, 5.2_
