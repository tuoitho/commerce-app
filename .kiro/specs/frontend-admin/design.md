# Design Document

## Overview
This document outlines the technical design for the `frontend-admin` dashboard. The application will be a new, separate Vite-based React single-page application (SPA) using TypeScript, Tailwind CSS, and shadcn/ui. It satisfies requirements 1 through 7, focusing initially on authentication and product management. Requirement 7 introduces a cross-package catalog model change (brand as plain text, category as a structured taxonomy) that touches the backend schema, the API contract, the admin dashboard, and the existing customer-facing `frontend/`.

## Architecture
- **Location:** A new package directory `frontend-admin/` at the repository root, alongside `frontend/` and `backend/`.
- **Framework:** React 18+ via Vite.
- **Styling:** Tailwind CSS with shadcn/ui components.
- **Routing:** React Router DOM (v6+).
- **Data Fetching:** React Query (@tanstack/react-query) combined with a standard Axios or fetch API client.
- **Backend Integration:** Communicates with the backend services at `/api/v1`. The backend will be extended to support user roles (adding a `role` column to the `users` table), provision a bootstrap admin account from environment-configured credentials, and expose new administrative endpoints for catalog management (GET list/detail, POST, PUT, DELETE for `/api/v1/admin/products`). New and updated products are saved as `active` so they appear in the admin product list; product deletion is a soft delete (`active = false`).
- **Catalog Model Change (Req 7, cross-package):** A `brand` text column is added to `products`. The API `brand` field becomes a plain string (`"Xiaomi"`), and `category` remains `{ id, name }` sourced from the categories table. The seed data is restructured: the current brand-like category rows ("Apple", "Xiaomi", "Samsung") become `brand` text values on products, and categories become a structured danh mục taxonomy (e.g., "Điện thoại", "Máy tính", "Đồ công nghệ khác"). The customer-facing `frontend/` is updated to read `brand` as text and filter/navigate by `category` instead of treating `brand.id` as a category id.

## Components And Interfaces

### Application Shell
- **Sidebar Navigation:** For switching between dashboard modules (e.g., Dashboard, Products, Users).
- **Header:** For user profile, logout, and breadcrumbs.

### Key Pages
1. **Login Page (`/login`):** Admin authentication form.
2. **Dashboard Home (`/`):** Landing page after authentication.
3. **Product List (`/products`):** Uses shadcn/ui `DataTable` component with pagination and search. It hits `GET /api/v1/admin/products` using query parameters (`?q=`, `?page=`, `?limit=`).
4. **Product Form (`/products/new`, `/products/:id`):** React Hook Form integrated with Zod for schema validation.

### Admin Catalog Contract
All endpoints below are restricted to authenticated users whose role is `admin`; non-admins receive a Vietnamese business error (HTTP 403).

The public catalog queries (`ListProducts`, `GetProductByID` in `backend/db/queries/catalog.sql`) return only `active` products that have at least one `active` variant. Admin-created products in this MVP have no variants (`SaveProductRequest` omits option groups/variants), so they would never appear via the public endpoints. The admin therefore reads products through dedicated admin endpoints that do not require variants:

- **`GET /api/v1/admin/products`** — paginated list of `active` products for the admin, regardless of whether they have variants; supports `?q=`, `?page=`, `?limit=`. Responds `200` with `ProductSummary[]` and pagination meta in the Full Status Envelope.
- **`GET /api/v1/admin/products/:id`** — product detail for the admin edit form, regardless of variants. Responds `200` with `ProductDetail`. Returns HTTP 404 when the product does not exist.
- **`POST /api/v1/admin/products`** — accepts `SaveProductRequest`, persists a new product as `active = true`, responds `201` with the created `ProductDetail` in the Full Status Envelope.
- **`PUT /api/v1/admin/products/:id`** — accepts `SaveProductRequest`, updates the product and keeps it `active`, responds `200` with the updated `ProductDetail`. Returns HTTP 404 when the product does not exist.
- **`DELETE /api/v1/admin/products/:id`** — soft deletes by setting `active = false`; responds `204` with no body. Returns HTTP 404 when the product does not exist. Soft delete is required because `cart_items.variant_id` references `product_variants(id)` with `ON DELETE RESTRICT` (`backend/db/migrations/000003_phone_variants_cart.up.sql`), so hard delete would fail while a variant is in any cart. The admin list endpoint returns only `active` products, so a soft-deleted product disappears from the admin list without extra filtering.
- **Field validation errors** (HTTP 400) return `error.fields` mapping each invalid field to a message; the frontend maps these to form inputs via `err.isValidationError()`.

### Catalog Contract Migration (Req 7)
The `brand` field changes from `{ id, name }` to a plain string across `productSummaryResponse` and `productDetailResponse`. Consumers must be updated together with the backend so no deployment serves a mixed shape:

- **Backend:** add `brand text NOT NULL DEFAULT ''` to `products` (migration), populate it from seed, and return it as a string in both product responses. The domain `Product.Brand` becomes a string.
- **Customer frontend (`frontend/`):** update `ProductSummary`/`ProductDetail` types (`brand: string`), replace `brand.id`-based filters/navigation with `category` (e.g., `ProductDetailPage.tsx` links using `product.brand.id` switch to `product.category.id`), and render `brand` as text (e.g., `ProductCard.tsx`, `HomePage.tsx` brand tabs filter by category).
- **Seed:** replace brand-like category rows with a danh mục taxonomy (e.g., "Điện thoại", "Máy tính", "Đồ công nghệ khác"); assign each product's existing category-as-brand value to its new `brand` text column.

### API Client
An HTTP client wrapper configured to include authentication tokens (e.g., Bearer tokens in headers or cookies) automatically on every request to `/api/v1`. It will intercept 401 Unauthorized responses to trigger a logout/redirect to `/login`.

## Data Models
The `frontend-admin` will consume existing backend models. Based on the requirements, the primary data shapes are:

```typescript
// Product Contract (from Backend productSummaryResponse)
interface Product {
  id: string;
  name: string;
  model: string;
  brand: string;
  category: { id: string; name: string };
  minPriceVnd: string;
  maxPriceVnd: string;
  price: string;
  currency: string;
  primaryImageUrl: string;
  inStock: boolean;
}

// Product Detail Contract (for Edit form initialization)
interface ProductDetail extends Product {
  description: string;
  imageUrls: string[];
  stockQuantity: number;
  featured: boolean;
  // Omitted complex nested types (OptionGroups, Variants) for MVP simplicity unless required
  createdAt: string;
  updatedAt: string;
}

// Create/Update Product Request
interface SaveProductRequest {
  name: string;
  model: string;
  brand: string;
  description: string;
  categoryId: string;
  price: string;
  currency: string;
  stockQuantity: number;
  featured: boolean;
  imageUrls: string[];
}
```

> Note: `brand` is a plain text field on the product (e.g., "Xiaomi"); there is no separate
> brand entity or brand id. `category` is a structured value sourced from the categories
> table (danh mục). The product form provides a free-text brand input and a category select.

```typescript

// Full Status Envelope (as per AGENTS.md)
interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T | null;
  error: ApiError | null;
  meta: {
    timestamp: string;
    pagination?: PaginationMeta;
  };
}

interface ApiError {
  code: string;
  message: string;
  fields?: Record<string, string>;
}
```

## Error Handling
1. **Global/Network Errors:** Handled by the HTTP client interceptor and displayed using shadcn/ui `Toast` components (in Vietnamese).
2. **Validation Errors (HTTP 400):** Extracted from `error.fields` and mapped to the corresponding React Hook Form fields to display adjacent error messages in Vietnamese.
3. **Business Logic Errors (HTTP 401, 403, 404, 409):** Displayed via `Toast` or dedicated error states (e.g., "Access Denied" page). 401 errors will trigger a redirect to the login page.
4. **Unexpected UI Errors:** Caught by a global React Error Boundary to prevent a white screen of death.

## Testing Strategy
- **Unit Testing:** Vitest and React Testing Library (RTL).
- **Test Coverage:**
  - Rendering and functionality of `DataTable` for products.
  - Validation logic in the Product Form.
  - Authentication flow (simulated login success and failure).
  - API error handling (mocking 400 and 500 responses).

## Requirement Traceability
| Requirement | Design Elements | Verification |
|---|---|---|
| 1.1, 1.2 (Project Setup) | New `frontend-admin` Vite project, Tailwind, shadcn/ui | Verify directory structure, dev server startup, and UI rendering |
| 1.3, 2.3 (Roles) | Backend `role` column on `users`, admin-only guard on `/api/v1/admin/*` | Go tests verifying non-admins are denied; RTL test for non-admin login denial |
| 2.1, 2.2, 2.3 (Auth) | Login page, HTTP interceptor (401), Protected Routes | Integration tests mocking 401 and 200 auth responses |
| 6.1, 6.2 (Bootstrap Admin) | Seed/bootstrap admin from environment-configured credentials; role returned by auth endpoints | Go tests verifying bootstrap provisioning and no duplicates |
| 3.1, 3.2 (Product List) | `/products` route, shadcn/ui `DataTable`, React Query against `GET /api/v1/admin/products`; brand column renders text | Render tests verifying columns (incl. brand) and pagination controls |
| 3.3 (Product Search) | Search input bound to admin API query parameters | Test search input triggers new API request with term |
| 4.1, 4.2 (Create Product) | Product Form, Zod validation, POST API call | Test valid submission and invalid submission (showing VN errors) |
| 4.3 (Update Product) | Product Form initialized from `GET /api/v1/admin/products/:id`, PUT/PATCH API call | Test form initialization and valid submission |
| 5.1, 5.2 (Delete Product) | shadcn/ui `AlertDialog`, DELETE API call, cache invalidation | Test delete confirmation flow and table update |
| 7.1, 7.2 (Brand as text) | `products.brand` text column, string `brand` in responses, seed restructure | Go tests asserting string `brand`; RTL tests rendering brand text and category select |
| 7.3 (Customer compatibility) | `frontend/` type and filter/navigation updates | RTL tests in `frontend/` for brand display and category filtering |
