# Requirements Document

## Introduction
The `admin-product-variants` feature enhances the product management capabilities within the admin dashboard (`frontend-admin`) by enabling administrators to define option groups (such as "Màu sắc", "Dung lượng") and manage product variants with individual pricing, stock quantities, and availability statuses. It also updates backend administrative APIs to support saving and querying variant option matrices while preserving complete compatibility with the customer storefront and cart systems.

## Requirements

### Requirement 1: Option Groups and Values Configuration
**User Story:** As an administrator, I want to define option groups (attributes) and their respective option values for a product, so that customers can choose specific configurations.

#### Acceptance Criteria
1.1 WHEN an administrator configures a product with multiple variations, THEN the system SHALL allow defining one or more option groups with custom labels (e.g., "Dung lượng", "Màu sắc").
1.2 WHEN an administrator creates an option group, THEN the system SHALL require at least one option value label (e.g., "128GB", "256GB") within that group.
1.3 IF an administrator adds, modifies, or removes option values in an option group, THEN the system SHALL dynamically update the list of selectable product variants.
1.4 IF an administrator attempts to save an option group with an empty label or duplicate value labels within the same group, THEN the system SHALL reject the submission and display a Vietnamese validation error message.

### Requirement 2: Variant Matrix Management and Pricing
**User Story:** As an administrator, I want to configure individual prices, stock quantities, and active statuses for each product variant, so that different versions of a product can have distinct pricing and inventory levels.

#### Acceptance Criteria
2.1 WHEN option groups and values are configured, THEN the system SHALL generate all combinations of option values into a variant matrix table.
2.2 FOR EACH variant in the matrix, the system SHALL allow the administrator to set an individual price in VND (non-negative integer) and stock quantity (non-negative integer).
2.3 FOR EACH variant in the matrix, the system SHALL allow toggling its active status (`active: true/false`) to enable or disable purchasing that specific combination.
2.4 IF an administrator enters an invalid price (negative or non-numeric) or invalid stock quantity for any variant, THEN the system SHALL display inline validation errors in Vietnamese adjacent to the invalid input.
2.5 WHEN a product with variants is saved, THEN the system SHALL automatically compute the overall product price range (`minPriceVND` - `maxPriceVND`) and total stock quantity from its active variants.

### Requirement 3: Admin Product Form Mode Switching
**User Story:** As an administrator, I want to choose whether a product is a simple single-variant item or a multi-variant item, so that I can manage both accessories and configurable electronics efficiently.

#### Acceptance Criteria
3.1 WHEN an administrator creates or edits a product, THEN the system SHALL provide a clear toggle between "Sản phẩm đơn giản" (single price/stock) and "Sản phẩm có biến thể" (variant matrix).
3.2 IF "Sản phẩm đơn giản" is selected, THEN the system SHALL require direct input for product price and stock quantity, hiding the variant matrix.
3.3 IF "Sản phẩm có biến thể" is selected, THEN the system SHALL require defining at least one option group and valid variant matrix entries, using the matrix values for pricing and inventory.
3.4 WHEN an administrator edits an existing product that already possesses option groups and variants, THEN the system SHALL load and display the existing option groups, values, and variant matrix in the edit form.

### Requirement 4: Administrative Variant APIs and Data Integrity
**User Story:** As a system operator, I want administrative APIs to atomically persist and return product option groups and variants, ensuring data consistency and role-based access control.

#### Acceptance Criteria
4.1 WHEN an administrator sends a `POST /api/v1/admin/products` or `PUT /api/v1/admin/products/:id` request containing option groups and variants, THEN the backend SHALL persist the product, option groups, option values, product variants, and variant option links atomically in a single database transaction.
4.2 WHEN `GET /api/v1/admin/products/:id` is called by an administrator, THEN the system SHALL return the product detail including all option groups, option values, and product variants with their associated prices and stock quantities.
4.3 IF a non-admin user or unauthenticated request calls administrative product variant endpoints, THEN the system SHALL reject the request with HTTP 401 Unauthorized or HTTP 403 Forbidden with a Vietnamese error message in the Full Status Envelope.

### Requirement 5: Storefront and Cart Compatibility
**User Story:** As a customer, I want to select options and purchase available variants on the storefront without regressions or data inconsistencies.

#### Acceptance Criteria
5.1 WHEN a product with variants is viewed on the customer storefront (`frontend`), THEN the system SHALL display the option selectors (e.g. Storage, Color) and update the price and in-stock badge based on the selected variant.
5.2 IF all active variants of a product have zero stock quantity, THEN the storefront and admin product list SHALL display "Hết hàng" (out of stock).
5.3 IF at least one active variant has a stock quantity greater than zero, THEN the storefront and admin product list SHALL display "Còn hàng" (in stock).
5.4 WHEN a customer adds a specific variant to their cart, THEN the system SHALL validate the variant's active status and available stock without regressions.
