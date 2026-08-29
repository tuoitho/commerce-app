# Implementation Plan

- [x] 1. Backend Data & Domain

- [x] 1.1 Update database schema and repository
  - **Produces:** Migration adding `admin_reply` and `admin_replied_at` to `product_reviews`, regenerated `sqlc` models, updated `Review` domain struct, and repository methods for admin review management.
  - **Scope:** `db/migrations`, `internal/domain/review.go`, `internal/repository/sqlc/reviews.sql`, `internal/repository/review_repository.go`, `make -C backend gen`.
  - **Consumes:** Existing `product_reviews` table.
  - **Acceptance:** Migration applies cleanly. `sqlc` generates updated models. Repository supports querying all reviews with pagination/filters and updating the admin reply fields.
  - **Verification:** Repository integration tests verify new queries and updates.
  - _Requirements: 1.1, 1.4, 2.2, 2.5_

- [x] 2. Backend APIs

- [x] 2.1 Implement Admin Review API
  - **Produces:** `AdminReviewHandler` providing `GET /api/v1/admin/reviews`, `PUT /api/v1/admin/reviews/:id/reply`, and `DELETE /api/v1/admin/reviews/:id/reply`.
  - **Scope:** `internal/usecase/review`, `internal/delivery/http/admin_review_handler.go`, `router.go`.
  - **Consumes:** Repository methods from Task 1.1, `RequireAdmin` middleware.
  - **Acceptance:** Endpoints enforce admin auth, validate reply length/emptiness, update/delete replies, and return paginated reviews.
  - **Verification:** HTTP handler tests for success and validation failure scenarios (400, 401, 403, 404).
  - _Requirements: 1.1, 1.2, 1.3, 1.5, 2.1, 2.3, 2.4, 2.6, 2.7_

- [x] 2.2 Expose admin reply in Public API
  - **Produces:** Updated `GET /api/v1/products/:id/reviews` endpoint returning `adminReply` and `adminRepliedAt` inside the `PublicReview` payload.
  - **Scope:** `internal/delivery/http/review_handler.go` mapping, `internal/repository/review_repository.go` mapping if necessary.
  - **Consumes:** Updated `Review` domain struct.
  - **Acceptance:** Public product reviews payload correctly includes the `adminReply` fields if present.
  - **Verification:** HTTP handler tests asserting the mapped fields in the response.
  - _Requirements: 3.1, 3.3, 3.4_

- [x] 3. Frontend Implementation

- [x] 3.1 Admin Review Management UI
  - **Produces:** "Quản lý đánh giá" page in `frontend-admin` at `/reviews`, including API client integration, data table, filters, and reply modal.
  - **Scope:** `frontend-admin/src/api/reviews.ts`, `frontend-admin/src/pages/reviews`, routing.
  - **Consumes:** Admin APIs from Task 2.1.
  - **Acceptance:** Admin can view paginated reviews, filter by rating/replied status, and submit/edit/delete replies via UI without page reload.
  - **Verification:** Component tests verifying render, filtering, and mutation interactions.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.4, 2.5_

- [x] 3.2 Public Product Page UI
  - **Produces:** Updated `ProductReviewsSection.tsx` rendering the admin reply when present.
  - **Scope:** `frontend/src/api/types.ts`, `frontend/src/components/ProductReviewsSection.tsx`.
  - **Consumes:** Public API payload from Task 2.2.
  - **Acceptance:** Admin replies are distinctly displayed below customer reviews. No admin personal data is leaked. Unreplied reviews render exactly as before.
  - **Verification:** Component tests rendering reviews with and without replies.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
