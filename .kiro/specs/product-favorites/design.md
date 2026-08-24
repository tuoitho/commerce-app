# Product Favorites Design

Status: APPROVED  
Approved: 2026-08-24  
Reapproved: 2026-08-24  
Feature: `product-favorites`  
Requirements: `requirements.md` (APPROVED, 2026-08-24)

## Architecture Summary

Product favorites form a customer-owned bounded context backed by a user-product relationship. The backend owns persistence, authorization, product eligibility, and API response semantics. The customer frontend owns navigation, optimistic interaction state, accessible controls, and presentation.

Catalog domain objects remain intrinsic product data. Personalized favorite state is composed at the HTTP delivery boundary by consulting a batch favorite reader after catalog products have been loaded. This keeps the catalog use case independent of caller identity while preventing per-product favorite queries.

The administration frontend and administration catalog API do not participate in favorite behavior.

## Dependency Discovery

### Dependency signals

- Favorites relate existing customer identities to existing products.
- Product cards are consumed by Home and Catalog, while product detail has an independent product surface.
- Public catalog endpoints currently have no optional caller context.
- Products use soft deletion, while physical user and product deletion require referential cleanup.
- Frontend authentication already supports redirect-based login and one-time token refresh.
- Backend construction uses committed Google Wire output, and database access uses committed sqlc output.

### Downstream impacts

- Public product-list, featured-product, and product-detail response shapes gain additive viewer state.
- Catalog handlers gain optional customer identity semantics when an Authorization header is present.
- `ProductCard` changes affect both Home and Catalog without requiring separate page implementations.
- The customer route table, header, mobile menu, API types, and authentication-aware rendering gain favorites behavior.
- Backend router dependencies and Wire providers gain the favorites use case and repository.

### Supporting dependencies

- JWT parsing and the existing API client's refresh-on-401 behavior provide caller restoration.
- Catalog product data and active state determine whether a favorite can be added.
- Product images, prices, categories, and variants provide favorite-list presentation data.
- Full Status Envelope helpers provide response and error serialization.

### Existing capabilities that may be reused

- `AuthProvider`, `tokenStore`, `apiClient`, and login `redirect` handling.
- Catalog product response mapping and frontend product display types.
- `ProductCard`, shared Button/Badge/Skeleton primitives, ToastContext, and existing pagination styling patterns.
- Gin guards, JWT manager, domain error mapping, pgx repositories, sqlc, migrations, and Wire composition.

### Material unresolved decisions

None.

## Responsibility and Data Ownership

### Favorite persistence

A new `product_favorites` relation owns only customer-product membership and the first favorite timestamp. It references `users` and `products`, enforces one row per customer-product pair, and cascades on physical deletion. Product names, images, prices, variants, and active state remain owned by catalog tables and are not copied into favorites.

The migration adds:

- composite primary key `(user_id, product_id)`;
- `created_at` assigned by PostgreSQL;
- foreign keys to users and products with `ON DELETE CASCADE`;
- an index supporting newest-first customer pagination;
- a product-leading index supporting product deletion and batch relationship access.

Repeated add preserves the original `created_at`; it does not move an existing favorite to the front.

### Backend favorite repository

A repository implementing a domain-owned `FavoriteRepository` interface owns:

- atomic idempotent insertion for an active product;
- idempotent deletion scoped by customer and product;
- batch lookup of favorite product IDs for catalog response composition;
- newest-first paginated reads and total count;
- read projection of active and inactive catalog data needed by the favorites page.

The paginated read joins catalog tables without taking ownership of catalog writes. It returns a favorite projection containing favorite date, active state, and product summary data. Repository errors are translated into domain errors before delivery.

### Backend favorite use case

The favorite use case is the sole owner of add and remove state transitions. It validates customer and product identifiers, enforces active-product eligibility for add, preserves idempotency, and exposes batch viewer-state reads plus paginated favorites.

No catalog use-case method mutates or owns favorite state.

### HTTP delivery and caller context

The guard gains reusable customer-aware authentication paths:

- required customer authentication for favorites endpoints;
- optional customer authentication for public catalog endpoints;
- missing Authorization on optional authentication continues anonymously;
- a supplied malformed, invalid, or expired bearer token returns 401;
- a valid non-customer role cannot access customer favorite endpoints and contributes no customer viewer state.

Feature-facing authentication and business error messages are Vietnamese. Existing unrelated guarded routes retain their current behavior.

The catalog handler receives a read-only favorite-status dependency. It loads products through the existing catalog use case, performs one batch lookup for an authenticated customer, and maps `viewer.isFavorite` into HTTP responses. Anonymous mapping performs no favorite query and returns `false`.

The favorites handler owns request parsing and Full Status Envelope mapping for list, add, and remove operations. It does not query repositories directly.

### Frontend API and session state

A favorites API module owns endpoint calls and wire types. `FavoritesProvider` owns only session-level optimistic overrides, mutation pending state, and add/remove actions; it does not preload every favorite ID. Server-provided `viewer.isFavorite` remains the initial authority for product surfaces.

The provider:

- resolves a displayed state from the latest optimistic override or server state;
- prevents duplicate in-flight mutation for a product;
- rolls back the override on failure;
- clears customer-specific overrides when the authenticated customer changes or logs out.

Pages retain ownership of their loaded collections and pagination. Removing an item on the favorites page updates the provider and refetches or deterministically updates the current page so pagination metadata remains authoritative.

### Frontend presentation

A reusable favorite control is consumed by `ProductCard` and Product Detail. It owns button accessibility, icon state, pending feedback, login redirect, and propagation prevention inside linked card surfaces.

The favorites page owns protected-route rendering after authentication restoration, newest-first pagination with a fixed page size of 12, loading/empty/error/retry states, out-of-range recovery, and inactive-product presentation. An out-of-range response causes replace-navigation to `max(totalPages, 1)` followed by a reload; page 1 renders the empty state when total pages is zero. It reuses product presentation without enabling detail navigation for inactive products.

Header desktop and mobile navigation expose the favorites route only to authenticated customers.

## Data Flows

### Catalog viewer state

1. Optional customer authentication resolves no customer, a valid customer ID, or an authentication error.
2. The catalog handler loads intrinsic products through the existing catalog use case.
3. For a customer, the handler sends all returned product IDs to one favorite-status read; for an anonymous caller it skips the read.
4. The response mapper adds viewer state without changing product filtering, ordering, availability, or pagination.

### Add favorite

1. Required customer authentication supplies the customer ID.
2. Delivery validates the path value and calls the favorite use case.
3. Persistence atomically establishes the relationship only when the product is active and ignores an existing identical relationship.
4. The use case distinguishes an ineligible/missing product from an idempotent existing favorite.
5. Delivery returns confirmed favorite state in the Full Status Envelope.

### Remove favorite

1. Required customer authentication supplies the customer ID.
2. Delivery validates the path value and calls the favorite use case.
3. Persistence deletes the scoped relationship without requiring the product to be active or the relationship to exist.
4. Delivery returns confirmed non-favorite state.

### List favorites

1. Required customer authentication supplies the customer ID.
2. Delivery validates a positive integer page and accepts only the fixed limit 12 when limit is explicitly supplied, then calls the favorite use case.
3. Persistence counts and reads the customer's relationships ordered by `created_at DESC` with product ID as a stable tie-breaker.
4. The catalog read projection includes inactive products and current stored product presentation data.
5. Delivery returns the direct collection and pagination metadata.

### Anonymous login return

1. The favorite control detects that authentication restoration is complete and no customer is authenticated.
2. It constructs the current pathname, search, and hash as a local redirect target and navigates to login.
3. Existing login behavior returns to that local route after success.
4. No pending favorite intent is stored or replayed.

## Consistency, Transactions, and Concurrency

- Database uniqueness is the final concurrency boundary for duplicate adds.
- Add uses one database statement or one repository transaction that evaluates product eligibility and insertion without exposing a duplicate-key failure.
- Remove is a single scoped delete and is idempotent.
- Favorite-list count and rows are read through one repository operation. Normal read-committed concurrency may cause later requests to move items between pages; no cross-request snapshot guarantee is provided.
- Optimistic UI state is provisional until the mutation response succeeds and is rolled back on any failure.
- Batch status lookup is scoped to one customer ID and the product IDs already visible to the catalog caller.

## Security and Failure Boundaries

- Caller identity comes only from verified JWT claims; request bodies and query parameters never provide a customer ID.
- Customer role enforcement occurs before favorite handlers.
- Repository queries include customer ID in every relationship predicate.
- Invalid identifiers and pagination parameters fail before persistence access where practical.
- Inactive and missing products share `product_not_found` on add so private catalog history is not exposed.
- Internal errors are logged through the configured `slog` boundary without tokens, secrets, or complete database URLs and return only `internal` publicly.
- Client redirects accept only local application routes constructed by the favorite control; login must not turn an arbitrary external URL into navigation.

## Components and Repository Impact

### Backend

- numbered migration pair after the current latest migration;
- `db/queries/favorites.sql` and regenerated committed sqlc output;
- favorite domain projection, repository interface, and domain errors;
- pgx favorite repository;
- favorite use case and tests;
- favorite HTTP handler, customer-aware guard behavior, response mapping, routes, and tests;
- catalog response viewer mapping and tests;
- Wire providers and regenerated `wire_gen.go`.

### Customer frontend

- favorites API functions and wire types;
- `FavoritesProvider` and reusable favorite control;
- product summary/detail viewer types;
- `ProductCard`, Product Detail, Header, App provider tree, and route table integration;
- favorites page and focused tests;
- affected CSS only when existing Tailwind utilities and components are insufficient.

### Administration frontend

No change.

## Contract Boundaries

### BND-FAV-API

- **Producer / provider:** backend favorites delivery and use case
- **Consumers:** customer frontend favorites API, provider, and favorites page
- **Purpose:** list, add, and remove the authenticated customer's favorite relationships
- **Authentication / caller context:** valid customer access token required; customer ID comes from JWT context
- **Material state or failure semantics:** newest-first pagination, active-only add, inactive removal, idempotent add/remove, validation, isolation, Vietnamese business errors
- **Contract artifact required:** OpenAPI operations plus stateful scenarios
- **Requirement IDs:** REQ-FAV-01, REQ-FAV-03, REQ-FAV-04, REQ-FAV-05, REQ-FAV-06, REQ-FAV-08, REQ-FAV-09

### BND-CATALOG-VIEWER

- **Producer / provider:** backend catalog delivery with favorite-status reader
- **Consumers:** customer Home, Catalog, Product Detail, ProductCard, and FavoritesProvider
- **Purpose:** expose personalized favorite state without changing intrinsic catalog data
- **Authentication / caller context:** anonymous when no token is supplied; verified customer context when supplied; invalid supplied token fails with 401
- **Material state or failure semantics:** additive viewer state, batch lookup, anonymous false, customer isolation, existing catalog behavior preservation
- **Contract artifact required:** additive OpenAPI schemas plus anonymous/authenticated/invalid-token scenarios
- **Requirement IDs:** REQ-FAV-02, REQ-FAV-07, REQ-FAV-09, REQ-FAV-10

### BND-FAV-AUTH-REDIRECT

- **Producer / provider:** customer favorite control and existing authentication flow
- **Consumers:** anonymous customer interactions on ProductCard and Product Detail
- **Purpose:** preserve the local route through login without replaying a favorite mutation
- **Authentication / caller context:** anonymous customer transitioning to an authenticated customer
- **Material state or failure semantics:** wait for session restoration, local redirect only, no stored mutation intent
- **Contract artifact required:** frontend behavioral scenarios
- **Requirement IDs:** REQ-FAV-01, REQ-FAV-07

### BND-FAV-SESSION-STATE

- **Producer / provider:** customer `FavoritesProvider`
- **Consumers:** reusable favorite control, ProductCard, Product Detail, and Favorites page
- **Purpose:** coordinate optimistic favorite state and mutation pending state during one authenticated session
- **Authentication / caller context:** current AuthProvider customer identity
- **Material state or failure semantics:** server state initialization, optimistic override, duplicate activation prevention, rollback, account-change cleanup
- **Contract artifact required:** typed provider interface plus component scenarios
- **Requirement IDs:** REQ-FAV-07

### BND-FAV-PERSISTENCE

- **Producer / provider:** PostgreSQL migration, sqlc queries, and pgx favorite repository
- **Consumers:** backend favorite use case and catalog favorite-status reader
- **Purpose:** persist unique customer-product membership and provide inactive-capable favorite reads
- **Authentication / caller context:** trusted backend customer ID only
- **Material state or failure semantics:** uniqueness, first-added timestamp, cascade cleanup, active eligibility, idempotency, newest-first ordering
- **Contract artifact required:** migration/schema assertions and repository scenarios
- **Requirement IDs:** REQ-FAV-03, REQ-FAV-04, REQ-FAV-05, REQ-FAV-06, REQ-FAV-08

### BND-FAVORITE-UI

- **Producer / provider:** customer favorites page, favorite control, ProductCard, Product Detail, Header, and route integration
- **Consumers:** customer browser interactions on desktop and mobile
- **Purpose:** present every required favorite surface, page state, inactive-product restriction, and accessible interaction
- **Authentication / caller context:** anonymous, restoring, and authenticated customer states supplied by AuthProvider
- **Material state or failure semantics:** fixed 12-item pagination, loading/empty/error/retry/populated/out-of-range states, replace-navigation to the last available page, inactive navigation and purchase restrictions, removal availability, keyboard behavior, accessible names, focus, and non-color state cues
- **Contract artifact required:** typed UI state contract plus browser/component scenarios
- **Requirement IDs:** REQ-FAV-01, REQ-FAV-05, REQ-FAV-06, REQ-FAV-07

## Requirement Ownership and Traceability

| Requirement | Owning component | Contract boundaries |
| --- | --- | --- |
| REQ-FAV-01 | frontend authentication integration; backend customer guard | BND-FAV-API, BND-FAV-AUTH-REDIRECT, BND-FAVORITE-UI |
| REQ-FAV-02 | backend catalog response composition | BND-CATALOG-VIEWER |
| REQ-FAV-03 | backend favorite use case and persistence | BND-FAV-API, BND-FAV-PERSISTENCE |
| REQ-FAV-04 | backend favorite use case and persistence | BND-FAV-API, BND-FAV-PERSISTENCE |
| REQ-FAV-05 | backend favorites list; frontend favorites page | BND-FAV-API, BND-FAV-PERSISTENCE, BND-FAVORITE-UI |
| REQ-FAV-06 | favorite persistence/list projection; frontend inactive presentation | BND-FAV-API, BND-FAV-PERSISTENCE, BND-FAVORITE-UI |
| REQ-FAV-07 | customer FavoritesProvider and favorite UI | BND-FAV-AUTH-REDIRECT, BND-FAV-SESSION-STATE, BND-FAVORITE-UI |
| REQ-FAV-08 | database and favorite repository | BND-FAV-PERSISTENCE |
| REQ-FAV-09 | backend guard, validation, error mapping, and response helpers | BND-FAV-API, BND-CATALOG-VIEWER |
| REQ-FAV-10 | catalog delivery and regression gates | BND-CATALOG-VIEWER |

## Design Gate

- Every approved requirement has an owning component and at least one boundary.
- The backend favorite use case is the only owner of favorite state transitions.
- Catalog product data remains intrinsic; viewer state is composed separately.
- Authentication, validation, business failure, and system failure semantics have explicit owners.
- Backend and frontend owners can implement independently after the API and behavioral contracts are frozen.
- No material product or architecture decisions remain unresolved.
