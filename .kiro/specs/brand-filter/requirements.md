# Requirements Document

## Introduction

The customer-facing catalog page (`/products`) lets shoppers filter by search text, category, price range, and stock availability. The product brand is stored as plain text and rendered only as a static badge; it cannot be used as a clickable filter. This feature makes brands selectable in the catalog: shoppers can pick brands from a "Thương hiệu" filter section to narrow the product list, the selection is reflected in the URL so it is deep-linkable, and the backend exposes the list of selectable brands together with a brand filter on the product search endpoint. The brand remains a plain-text attribute on the product; this feature does not introduce a separate brand entity.

## Requirements

### Requirement 1: Brand options listing
**User Story:** As a shopper, I want to see the brands that currently have products in the catalog, so that I can narrow my search by brand.

#### Acceptance Criteria
1.1 WHEN a shopper opens the catalog page, THEN the system SHALL display a "Thương hiệu" filter section listing the distinct brand values of the products currently visible in the catalog.
1.2 A brand value SHALL count as visible only if it belongs to at least one active product that has at least one active variant.
1.3 IF there is no visible product with a brand value, THEN the system SHALL show the brand filter section as empty (or hide it).
1.4 The brand options SHALL display the canonical stored spelling (e.g., `Apple`, `Xiaomi`, `Samsung`), not a normalized or translated value.

### Requirement 2: Filter by brand
**User Story:** As a shopper, I want to select one or more brands to narrow the product list.

#### Acceptance Criteria
2.1 WHEN a shopper selects one or more brands in the brand filter, THEN the system SHALL show only products whose brand matches at least one selected brand.
2.2 IF multiple brands are selected, THEN the system SHALL include a product when it matches any of the selected brands.
2.3 IF other filters (search text, category, price range, in-stock) are combined with brand selection, THEN the system SHALL apply all of them together.
2.4 WHEN a shopper deselects all brands, THEN the system SHALL show products matching the remaining filters without brand restriction.
2.5 Brand matching SHALL be case-insensitive (for example, `apple` matches `Apple`).

### Requirement 3: URL state and deep linking
**User Story:** As a shopper, I want brand selection to be part of the page URL so that I can share or bookmark filtered views.

#### Acceptance Criteria
3.1 WHEN a shopper selects or deselects a brand, THEN the system SHALL update the URL `brand` query parameter accordingly without a full page reload.
3.2 IF multiple brands are selected, THEN the URL SHALL contain one `brand` parameter per selected brand.
3.3 WHEN a shopper opens a catalog URL containing `brand` parameters, THEN the system SHALL apply those selections and render the matching products and pagination.
3.4 IF the `brand` parameter values match no visible product, THEN the system SHALL show the empty-results state consistent with other filters.

### Requirement 4: Pagination consistency
**User Story:** As a shopper, I want filtered pages to show correct counts and start from the first page when I change the brand selection.

#### Acceptance Criteria
4.1 WHEN a shopper changes the brand selection, THEN the system SHALL reset the result list to the first page.
4.2 The pagination counts (total results, total pages) SHALL reflect the brand selection combined with all other active filters.

### Requirement 5: Catalog brand listing API
**User Story:** As a system, I want a catalog endpoint that returns the selectable brands so that the catalog page can render the brand filter.

#### Acceptance Criteria
5.1 WHEN the system receives a request for the catalog brand list, THEN it SHALL return the distinct brand values as an array of strings in the standard API envelope `data` field.
5.2 The brand list SHALL include only brands that belong to at least one active product with an active variant.
5.3 The brand list SHALL be ordered deterministically, for example alphabetically.

### Requirement 6: Product search API brand parameter
**User Story:** As a system, I want the product search endpoint to accept brand filters so the catalog can fetch filtered results.

#### Acceptance Criteria
6.1 WHEN the product search endpoint receives one or more `brand` query parameters, THEN it SHALL return only products whose brand matches at least one provided value, combined with any other filters.
6.2 IF a `brand` parameter value is empty, THEN the system SHALL ignore it.
6.3 IF a `brand` parameter value is provided and the product list is paginated, THEN the total counts SHALL reflect the brand filter before pagination is applied.

### Requirement 7: Accessibility and failure states
**User Story:** As a shopper using assistive technology, I want the brand filter to be usable and robust.

#### Acceptance Criteria
7.1 The brand filter options SHALL be keyboard-accessible and carry accessible labels.
7.2 The selection state of a brand option SHALL not be conveyed by color alone.
7.3 IF the brand list is loading, THEN the system SHALL indicate the loading state.
7.4 IF loading the brand list fails, THEN the catalog product list SHALL still render and the brand filter section SHALL provide a retry affordance.