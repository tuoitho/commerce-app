## Purpose

Enable storefront visitors to discover available products through public search and filters and to inspect the complete information for a selected product.

## ADDED Requirements

### Requirement: Public product catalog access
The system SHALL allow unauthenticated visitors to access the product collection and product detail interfaces without presenting an access token.

#### Scenario: Anonymous visitor opens the catalog
- **WHEN** a visitor who is not signed in requests the product collection
- **THEN** the system returns the catalog response without an authentication error

#### Scenario: Anonymous visitor opens product details
- **WHEN** a visitor who is not signed in requests an existing product by identifier
- **THEN** the system returns that product's detail response without an authentication error

### Requirement: Product collection response
The system SHALL expose `GET /api/v1/products` and return a JSON object containing a `products` array. Each product summary MUST include its identifier, name, category identifier and name, price as a decimal string in major currency units, ISO 4217 currency code, primary image URL, and whether it is in stock.

#### Scenario: Retrieve all products with no filters
- **WHEN** a client requests `GET /api/v1/products` without query parameters
- **THEN** the system returns HTTP 200 with all seeded products in a stable order

#### Scenario: No products match
- **WHEN** valid search and filter criteria match no products
- **THEN** the system returns HTTP 200 with an empty `products` array

### Requirement: Product category options
The system SHALL expose `GET /api/v1/categories` without authentication and return a JSON object containing a `categories` array. Each category MUST include its identifier and name, and the array MUST use a stable name-based order.

#### Scenario: Retrieve category filter options
- **WHEN** a visitor opens the catalog filter controls
- **THEN** the frontend can retrieve all seeded category identifiers and names from `GET /api/v1/categories`

### Requirement: Product name search
The system SHALL accept a `q` query parameter on `GET /api/v1/products` and match products whose names contain the trimmed search text without regard to letter case.

#### Scenario: Partial case-insensitive name match
- **WHEN** a client searches with `q` containing a partial product name in different letter case
- **THEN** the response contains products whose names include that text regardless of case

#### Scenario: Blank search text
- **WHEN** the `q` parameter is empty or contains only whitespace
- **THEN** the system treats the request as having no name-search criterion

### Requirement: Product collection filters
The system SHALL support filtering `GET /api/v1/products` by exact category identifier using `category_id`, inclusive minimum price using `min_price`, inclusive maximum price using `max_price`, and stock availability using `in_stock`. Price query values MUST use non-negative decimal major currency units, and `in_stock` MUST be either `true` or `false`.

#### Scenario: Filter by category
- **WHEN** a client supplies a valid `category_id`
- **THEN** every returned product belongs to that category

#### Scenario: Filter by inclusive price range
- **WHEN** a client supplies valid `min_price` and `max_price` values
- **THEN** every returned product has a price greater than or equal to `min_price` and less than or equal to `max_price`

#### Scenario: Filter by in-stock products
- **WHEN** a client supplies `in_stock=true`
- **THEN** every returned product has stock available

#### Scenario: Filter by out-of-stock products
- **WHEN** a client supplies `in_stock=false`
- **THEN** every returned product has no stock available

#### Scenario: Combine search and filters
- **WHEN** a client supplies more than one supported search or filter parameter
- **THEN** the system returns only products satisfying all supplied criteria

### Requirement: Invalid product collection criteria
The system MUST reject malformed or inconsistent product collection criteria with HTTP 400 and the existing API error envelope `{"error":{"code":"...","message":"...","fields":[...]}}`.

#### Scenario: Invalid category identifier
- **WHEN** `category_id` is not a valid product category identifier
- **THEN** the system returns HTTP 400 with error code `invalid_filter` and identifies the `category_id` field

#### Scenario: Invalid price value
- **WHEN** `min_price` or `max_price` is not a non-negative decimal value
- **THEN** the system returns HTTP 400 with error code `invalid_filter` and identifies the invalid price field

#### Scenario: Reversed price range
- **WHEN** both price bounds are supplied and `min_price` is greater than `max_price`
- **THEN** the system returns HTTP 400 with error code `invalid_filter` and identifies the price range fields

#### Scenario: Invalid stock value
- **WHEN** `in_stock` is supplied with a value other than `true` or `false`
- **THEN** the system returns HTTP 400 with error code `invalid_filter` and identifies the `in_stock` field

### Requirement: Product detail response
The system SHALL expose `GET /api/v1/products/{id}`. For an existing product, the response MUST include its identifier, name, description, category identifier and name, price as a decimal string in major currency units, ISO 4217 currency code, image URLs, stock quantity, in-stock status, creation timestamp, and update timestamp.

#### Scenario: Retrieve existing product details
- **WHEN** a client requests a valid identifier for an existing product
- **THEN** the system returns HTTP 200 with the complete product detail response

#### Scenario: Product is out of stock
- **WHEN** a client requests an existing product whose stock quantity is zero
- **THEN** the response reports a stock quantity of zero and `in_stock` as false

### Requirement: Missing product handling
The system MUST use the existing API error envelope when a product detail request cannot identify an existing product.

#### Scenario: Well-formed identifier does not exist
- **WHEN** a client requests a well-formed product identifier that does not exist
- **THEN** the system returns HTTP 404 with error code `product_not_found`

#### Scenario: Malformed product identifier
- **WHEN** a client requests a malformed product identifier
- **THEN** the system returns HTTP 400 with error code `invalid_product_id`

### Requirement: Storefront catalog experience
The frontend SHALL provide a catalog route that displays product summaries, accepts name, category, price-range, and stock filters, and keeps the displayed results consistent with the active criteria. The frontend SHALL also provide a route for viewing product details and navigation from each product summary to its detail route.

#### Scenario: Visitor searches and filters products
- **WHEN** a visitor changes the search text or any supported filter
- **THEN** the catalog displays only products returned for the active criteria and exposes a clear way to reset all criteria

#### Scenario: Catalog request is pending
- **WHEN** the catalog request has not completed
- **THEN** the catalog displays a loading state without showing stale results as current

#### Scenario: Catalog has no matching products
- **WHEN** the catalog API returns an empty collection
- **THEN** the catalog displays a no-results state that preserves the active criteria

#### Scenario: Catalog request fails
- **WHEN** the catalog API request fails
- **THEN** the catalog displays an error state with a retry action

#### Scenario: Visitor selects a product
- **WHEN** a visitor activates a product summary
- **THEN** the frontend navigates to that product's detail route and displays the detail response

#### Scenario: Product detail does not exist
- **WHEN** the product detail API returns `product_not_found`
- **THEN** the frontend displays a product-not-found state with navigation back to the catalog

### Requirement: Deterministic sample catalog data
The repository SHALL provide repeatable sample catalog data for local development and verification, including multiple categories, products across different price points, and both in-stock and out-of-stock products.

#### Scenario: Seed data is applied repeatedly
- **WHEN** the documented sample-data operation is run more than once against the same migrated database
- **THEN** it completes without creating duplicate categories or products

#### Scenario: Seed data exercises all filters
- **WHEN** the sample catalog is loaded
- **THEN** it contains data that can demonstrate name search, category filtering, price filtering, and both stock availability values
