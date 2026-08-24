# Product Favorites Requirements

Status: APPROVED  
Approved: 2026-08-24  
Reapproved: 2026-08-24  
Feature: `product-favorites`

## Scope

Product favorites let authenticated customer accounts persist products for later reference. The customer application exposes favorite controls on existing product surfaces and a dedicated favorites page. The administration application is outside this feature.

## Terms

- **Active product:** A product available through the public catalog.
- **Inactive product:** A soft-deleted or otherwise discontinued product that is not available through the public catalog.
- **Viewer state:** Product data derived from the current authenticated customer rather than intrinsic product data.
- **Favorite date:** The time at which a customer first added a product to favorites.

## Requirements

### REQ-FAV-01 — Authentication and navigation

1. Only authenticated customer accounts can read or mutate their favorites.
2. When an anonymous visitor activates a favorite control, the customer application shall navigate to login with the complete current customer route encoded in the `redirect` query parameter.
3. After successful login, the customer application shall return to that route without automatically adding the product to favorites.
4. The favorites page shall wait for session restoration before deciding whether to render content or redirect to login.
5. Authentication and authorization failures shall not disclose favorite state belonging to another account.

### REQ-FAV-02 — Product viewer state

1. Public product list, featured-product, and product-detail responses shall expose `viewer.isFavorite` for every returned product.
2. When no bearer token is supplied, `viewer.isFavorite` shall be `false`.
3. When a valid customer bearer token is supplied, `viewer.isFavorite` shall reflect that customer's persisted favorite state.
4. When a bearer token is supplied but is invalid or expired, the API shall return HTTP 401 so the existing client refresh flow can run.
5. Viewer state shall not change intrinsic catalog availability, pricing, filtering, or ordering behavior.

### REQ-FAV-03 — Add an active product

1. An authenticated customer can add an active product to favorites by product ID.
2. A successful add shall persist across browser reloads and later authenticated sessions.
3. Adding the same product repeatedly or concurrently shall be idempotent and shall create at most one favorite for the customer-product pair.
4. A successful add shall return the direct state `{ productId, isFavorite: true }` in the Full Status Envelope.
5. Adding a nonexistent or inactive product shall return HTTP 404 with error code `product_not_found` and a Vietnamese user-facing message.
6. An invalid product ID format shall return HTTP 400 with error code `validation_error` and a `productId` field error.

### REQ-FAV-04 — Remove a favorite

1. An authenticated customer can remove a favorite by product ID, including when the product is inactive.
2. Removing a favorite that does not exist shall be idempotent and successful.
3. A successful remove shall return the direct state `{ productId, isFavorite: false }` in the Full Status Envelope.
4. An invalid product ID format shall return HTTP 400 with error code `validation_error` and a `productId` field error.
5. Removing one customer's favorite shall not affect any other customer.

### REQ-FAV-05 — List favorites

1. An authenticated customer can retrieve only their own favorites.
2. Favorites shall be ordered by favorite date descending, with a deterministic tie-breaker.
3. The list endpoint shall support page-based pagination, defaulting to page 1 and using a fixed limit of 12 products per page.
4. The customer favorites page shall request and display 12 products per page.
5. A page beyond the available range shall return an empty direct collection with valid pagination metadata.
6. When the customer application receives an out-of-range page, it shall replace the current route with the last available page and reload it; when no page exists, it shall replace with page 1 and render the first-page empty state.
7. Each list item shall include the product summary needed to render its name, image, latest stored price, availability, and favorite date without additional per-product requests.
8. The list response shall use the Full Status Envelope with the product collection directly in `data` and pagination in `meta.pagination`.

### REQ-FAV-06 — Inactive products

1. Inactivating a product shall preserve existing favorite relationships.
2. An inactive favorite shall remain visible in the customer's favorites list with its name, primary image, latest stored price, and an explicit discontinued status.
3. The customer application shall disable product-detail navigation and purchasing affordances for an inactive favorite.
4. The customer application shall continue to allow removal of an inactive favorite.
5. If the product becomes active again, the preserved relationship shall produce `viewer.isFavorite: true` and the item shall regain normal active-product behavior.

### REQ-FAV-07 — Customer interface

1. Every existing customer-facing `ProductCard` and the product-detail page shall provide an accessible favorite toggle.
2. The authenticated customer header and mobile menu shall provide navigation to the favorites page.
3. Favorite state shall remain consistent between product cards, product detail, and favorites data loaded during the same application session.
4. A mutation in progress shall prevent duplicate activation of the same favorite control.
5. The interface shall update favorite state optimistically, restore the confirmed state when a mutation fails, and show Vietnamese feedback for the failure.
6. The favorites page shall provide loading, empty, error with retry, populated, inactive-product, and pagination states.
7. Favorite controls shall be keyboard operable, expose an accessible name that describes the current action, retain visible focus, and communicate state with more than color alone.

### REQ-FAV-08 — Persistence and integrity

1. Favorite persistence shall enforce uniqueness of each customer-product pair at the database boundary.
2. Deleting a customer or physically deleting a product shall remove its favorite relationships through referential integrity.
3. Favorite creation, removal, lookup, and listing shall always be scoped by the authenticated customer ID.
4. Favorite date shall be assigned by the backend persistence boundary.

### REQ-FAV-09 — API errors and envelopes

1. All feature endpoints shall follow the repository Full Status Envelope standard.
2. Validation failures shall use HTTP 400 with field-level errors.
3. Authentication failures shall use HTTP 401.
4. Business failures shall use the defined HTTP status and stable error code with Vietnamese user-facing messages.
5. Unexpected failures shall use HTTP 500 with error code `internal` and shall not expose database or implementation details.
6. Page validation shall reject non-integer or non-positive values, and an explicitly supplied limit shall reject every value other than the integer 12, with field-level validation errors.

### REQ-FAV-10 — Compatibility

1. The catalog viewer-state addition shall be additive to existing product payloads.
2. Existing anonymous catalog access shall continue without requiring authentication.
3. Existing catalog filters, pagination, product detail, cart, checkout, and administration behavior shall remain available unless explicitly governed by another requirement in this document.
4. The administration frontend shall require no favorites-specific UI or API behavior.

## Acceptance Coverage

The approved design and executable contracts shall cover at least these scenarios:

- anonymous favorite activation and post-login return without mutation;
- authenticated add, repeated add, remove, and repeated remove;
- viewer state for anonymous, authenticated, and invalid-token callers;
- two-account favorite isolation;
- newest-first pagination with 12 items per customer page;
- inactive favorite display and removal;
- rejection when adding an inactive or nonexistent product;
- mutation rollback and user feedback after an API failure;
- loading, empty, error, populated, and out-of-range page states;
- database uniqueness, referential cleanup, migration up/down, and runtime persistence.
