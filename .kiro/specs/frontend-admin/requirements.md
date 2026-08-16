# Requirements Document

## Introduction
The `frontend-admin` project provides a web-based administrative dashboard for managing the e-commerce system. It will be built as a separate application (React + TypeScript + Tailwind + shadcn/ui) running alongside the existing `frontend` and `backend` services. The initial focus is on fundamental administrative capabilities, specifically Product Management.

## Requirements

### Requirement 1: Project Setup and Architecture
**User Story:** As an administrator, I want a dedicated, secure, and modern web application to manage the platform without affecting the customer-facing frontend.

#### Acceptance Criteria
1.1 WHEN the system is deployed, THEN there SHALL be a standalone `frontend-admin` application running independently from the customer-facing frontend.
1.2 IF a user accesses the `frontend-admin` application, THEN they SHALL be presented with a responsive UI built with React, TypeScript, Tailwind CSS, and shadcn/ui components.
1.3 WHEN the backend is deployed, THEN it SHALL support distinct user roles (e.g., `admin` and `customer`), and administrative APIs for catalog management SHALL be exposed and restricted to `admin` users.

### Requirement 2: Authentication and Authorization
**User Story:** As an administrator, I want to securely log in to the admin dashboard so that only authorized personnel can access management features.

#### Acceptance Criteria
2.1 WHEN an unauthenticated user attempts to access any dashboard route, THEN the system SHALL redirect them to a login screen.
2.2 IF an administrator provides valid credentials, THEN the system SHALL authenticate them and redirect to the dashboard home page.
2.3 IF a non-admin user attempts to authenticate to the admin dashboard, THEN the system SHALL deny access and display an appropriate Vietnamese error message.

### Requirement 3: Product List View
**User Story:** As an administrator, I want to view a list of all products so that I can monitor the current inventory and catalog.

#### Acceptance Criteria
3.1 WHEN an administrator navigates to the products page, THEN the system SHALL display a paginated list of products in a data table.
3.2 IF the products list is displayed, THEN each row SHALL include at minimum the product's image (if any), name, brand (plain text), price, stock status, and category.
3.3 WHEN an administrator searches for a product by name, THEN the system SHALL filter the list to show only matching products.

### Requirement 4: Create and Update Product
**User Story:** As an administrator, I want to add new products and edit existing ones to keep the catalog up-to-date.

#### Acceptance Criteria
4.1 WHEN an administrator submits a valid "Create Product" form, THEN the system SHALL save the new product and display it in the product list.
4.2 IF an administrator submits a product form with invalid or missing required fields, THEN the system SHALL display specific validation errors in Vietnamese adjacent to the invalid fields.
4.3 WHEN an administrator edits an existing product and saves, THEN the system SHALL update the product details and reflect the changes in the product list.

### Requirement 5: Delete Product
**User Story:** As an administrator, I want to remove products from the catalog that are no longer sold.

#### Acceptance Criteria
5.1 WHEN an administrator initiates the deletion of a product, THEN the system SHALL prompt for confirmation before proceeding.
5.2 IF the administrator confirms the deletion, THEN the system SHALL remove the product from the product list and update the list to reflect its absence.

### Requirement 6: Bootstrap Administrator Provisioning
**User Story:** As a system operator, I want an initial administrator account so that the admin dashboard can be accessed after deployment.

#### Acceptance Criteria
6.1 IF the backend is deployed AND bootstrap administrator credentials are configured, THEN the system SHALL provision an administrator account with those credentials when no administrator account exists.
6.2 IF the bootstrap credentials are configured on a deployment where an administrator account already exists, THEN the system SHALL NOT create a duplicate administrator account.

### Requirement 7: Brand as Plain Text, Category as Taxonomy
**User Story:** As a system operator, I want each product to carry a free-text brand (e.g., "Xiaomi") and to be classified under a structured category (danh mục, e.g., "Điện thoại", "Máy tính"), so the catalog is organized consistently across the admin dashboard and the customer-facing frontend.

#### Acceptance Criteria
7.1 WHEN a product is created or updated, THEN the system SHALL store the brand as a plain text attribute rather than a reference to a separate brand entity.
7.2 IF a product is listed or detailed, THEN the system SHALL return `brand` as a string (e.g., `"Xiaomi"`) and `category` as a structured category (`{ id, name }`) drawn from the categories table.
7.3 IF the customer-facing frontend renders a product, THEN it SHALL display the brand text and remain able to filter/navigate the catalog without regressions caused by the brand type change.
