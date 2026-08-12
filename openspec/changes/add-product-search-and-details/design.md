## Context

The repository already has a Go/Gin API, PostgreSQL migrations, sqlc-generated repository code, and a React/Vite/TypeScript SPA. Authentication is the only existing vertical slice, and the current router and frontend API client are the extension points for a public catalog. See `proposal.md` for the motivation and `specs/product-catalog/spec.md` for the externally observable contract.

## Goals / Non-Goals

**Goals:**

- Add catalog persistence and read-only use cases while preserving the existing clean-architecture dependency direction.
- Keep the public API contract explicit for collection filters, category options, detail responses, and errors.
- Make local development deterministic through idempotent sample data and tests that exercise every filter.
- Keep the first catalog UI usable on desktop and mobile with explicit loading, empty, error, and not-found states.

**Non-Goals:**

- Product creation, editing, deletion, inventory mutation, or admin authorization.
- Pagination, advanced sorting, cart, checkout, order management, recommendations, or product reviews.
- Changing the existing authentication/session behavior.

## Decisions

1. **Introduce a `product-catalog` bounded context using existing layers.** Add catalog domain models and repository interfaces, catalog use cases, SQL-backed repositories, and public Gin handlers. This follows the auth slice's established structure and avoids coupling handlers to sqlc. A separate service is rejected because the repository currently has one backend deployment and catalog reads do not require an independent scaling or ownership boundary.

2. **Use relational categories and products.** Add `categories`, `products`, and `product_images` tables with UUID identifiers, unique category names, product name/description, `numeric` price, ISO currency code, non-negative stock quantity, timestamps, and a stable primary-image relationship. A normalized category table is preferred over a free-text category column because the frontend needs authoritative filter options and category filtering must be exact.

3. **Represent monetary values as decimal strings in the API.** PostgreSQL `numeric` remains exact, while JSON decimal strings avoid floating-point ambiguity in Go and TypeScript. The contract uses major currency units and an ISO 4217 code; the initial seed uses one currency consistently. Returning integer minor units was considered, but would add a conversion rule not needed by this slice.

4. **Use one collection query with optional predicates.** The repository query will apply all supplied criteria with AND semantics, case-insensitive containment for `q`, inclusive price bounds, exact category ID, and stock quantity comparison. Results will have a deterministic order, chosen as product name ascending and identifier ascending as a tie-breaker. Pagination is deliberately absent from this contract, so a future change can add it explicitly.

5. **Keep catalog reads outside auth middleware.** `/api/v1/products`, `/api/v1/products/{id}`, and `/api/v1/categories` are registered without `AuthRequired`; the existing API client can still send credentials harmlessly. This preserves public storefront access and leaves authenticated personalization for a later change.

6. **Fetch category options from the backend.** The catalog page loads categories from `GET /api/v1/categories` rather than duplicating seeded values in the frontend. Filter state is represented in the URL query string where practical so reloads and shared catalog links preserve the active search criteria. A short debounce may be used for text input, but the API contract remains request-per-criteria and does not require a specific timing.

7. **Return catalog-specific not-found and filter errors through the existing envelope.** Extend the centralized error mapping with `product_not_found`, `invalid_product_id`, and `invalid_filter` while retaining existing auth mappings. Validation occurs before repository access for malformed IDs, decimal values, booleans, and reversed bounds.

8. **Make sample data idempotent and migration-owned.** Add a repeatable seed operation using stable identifiers or unique-name conflict handling, document how to run it after migrations, and include enough records to cover multiple categories, prices, and both stock states. Seed data is not a production product-management mechanism.

9. **Test at the contract boundaries.** Backend tests cover query/use-case filtering, validation, anonymous route access, response shapes, detail not-found behavior, and idempotent seed assumptions where the repository test setup supports it. Frontend tests cover API query construction, filter/reset behavior, navigation, and loading/empty/error/not-found states. Existing auth tests and build checks remain required.

## Risks / Trade-offs

- **Unbounded collection size** -> Keep pagination out of this change as specified, but use indexed category/stock fields and a name-search index appropriate to the chosen PostgreSQL query; record pagination as a follow-up before catalog data grows materially.
- **Numeric and currency formatting differences** -> Keep API values as decimal strings, validate non-negative input centrally, and use the declared currency code for display rather than parsing into binary floating point for comparisons.
- **Seed data colliding with user-created future records** -> Use clearly namespaced stable sample identifiers/names and idempotent conflict handling; do not make the seed operation delete or overwrite arbitrary products.
- **Stale results during rapid filter changes** -> Track the active request criteria and ignore or abort responses that no longer match the current URL/filter state; loading state must not present stale results as current.
- **Image URLs may be unavailable in offline development** -> Treat images as display data with a frontend fallback state; catalog and detail behavior must remain usable when an image fails to load.

## Migration Plan

1. Apply the catalog migration after the existing auth migration, then run the documented idempotent sample-data operation.
2. Deploy backend catalog routes and generated SQL code; existing auth routes and database tables remain unchanged.
3. Deploy the frontend catalog and detail routes, then verify anonymous collection/category/detail requests against the seeded database.
4. Roll back by removing the frontend catalog route and backend catalog code, then rolling back the catalog migration only if no catalog data needs to be retained. Do not roll back the existing auth migration.

## Open Questions

None. Currency, filter names, public access, seed scope, and excluded capabilities are defined by the proposal and delta spec.
