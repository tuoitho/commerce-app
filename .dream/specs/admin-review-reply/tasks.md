# Implementation Plan

- [x] 1. Backend Data & Domain

- [x] 1.1 Update database schema and repository
  - **Produces:** Migration adding `admin_reply` and `admin_replied_at` persistence support (`000014_add_admin_reply_to_reviews` and normalized `review_replies` entity in `000015_create_review_replies_and_votes`), regenerated `sqlc` models, updated `Review` and `AdminReview` domain structs, and repository methods `GetAdminReviews` and `UpdateAdminReply`.
  - **Scope:** `backend/db/migrations`, `backend/db/queries/reviews.sql`, `backend/internal/domain/review.go`, `backend/internal/repository/sqlc`, `backend/internal/repository/review_repository.go`, `make -C backend gen`.
  - **Consumes:** Existing `product_reviews`, `order_items`, `orders`, and `users` tables.
  - **Contracts:** DB-REVIEW-REPLIES@1 (provider)
  - **Acceptance:** Migrations apply cleanly. `sqlc` generates updated models. Repository supports querying all reviews with newest-first ordering, pagination, rating (`1..5`) and `has_reply` (`yes`/`no`/all) filters, and creating/updating/deleting the admin reply without locking by admin user ID.
  - **Verification:** Repository integration tests in `backend/internal/repository` verify new queries, filters, pagination, and reply mutations.
  - _Requirements: 1.1, 1.3, 1.4, 2.2, 2.4, 2.5, 2.6_

- [x] 2. Backend APIs

- [x] 2.1 Implement Admin Review API
  - **Produces:** `AdminReviewHandler` providing `GET /api/v1/admin/reviews`, `PUT /api/v1/admin/reviews/:id/reply`, and `DELETE /api/v1/admin/reviews/:id/reply` behind `AuthRequired` and `RequireAdmin()`.
  - **Scope:** `backend/internal/usecase/review/review.go`, `backend/internal/delivery/http/admin_review_handler.go`, `backend/internal/delivery/http/router.go`, `backend/internal/delivery/http/admin_review_handler_test.go`.
  - **Consumes:** `DB-REVIEW-REPLIES@1` repository methods from Task 1.1, JWT `AuthRequired` and `RequireAdmin()` middleware, Full Status Envelope helpers.
  - **Contracts:** API-ADMIN-REVIEWS@1 (provider); DB-REVIEW-REPLIES@1 (consumer)
  - **Acceptance:** Endpoints enforce admin authentication/authorization (`401`/`403`), validate reply non-emptiness and `<= 1000` character limit (`400`), return `404` for missing reviews, allow any admin to create/update/delete replies, and return paginated `AdminReview[]` in Full Status Envelope.
  - **Verification:** UseCase and HTTP handler tests (`backend/internal/delivery/http/admin_review_handler_test.go`, `backend/internal/usecase/review/review_test.go`) covering `200`, `400`, `401`, `403`, and `404` scenarios.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

- [x] 2.2 Expose admin reply in Public API
  - **Produces:** Updated `GET /api/v1/products/:id/reviews` endpoint returning `adminReply` and `adminRepliedAt` inside the `PublicReview` payload without exposing internal admin identity.
  - **Scope:** `backend/internal/delivery/http/review_handler.go`, `backend/internal/repository/review_repository.go`, `backend/internal/delivery/http/review_handler_test.go`.
  - **Consumes:** `DB-REVIEW-REPLIES@1` and updated `PublicReview` domain struct.
  - **Contracts:** API-PUBLIC-REVIEWS@1 (provider); DB-REVIEW-REPLIES@1 (consumer)
  - **Acceptance:** Public product reviews payload includes `adminReply` and `adminRepliedAt` when a reply exists, omits them when absent or deleted, and never exposes internal admin ID or email.
  - **Verification:** HTTP handler and repository tests asserting mapped reply fields and absence of admin personal identifiers.
  - _Requirements: 3.1, 3.3, 3.4, 3.5_

- [x] 3. Frontend Implementation

- [x] 3.1 Admin Review Management UI
  - **Produces:** Admin review management page (`ReviewsPage`) in `frontend-admin` at `/reviews`, sidebar navigation link in `AdminLayout.tsx`, API client module `frontend-admin/src/api/reviews.ts`, data table, rating & reply-status filters, pagination controls, and reply create/edit/delete dialogs.
  - **Scope:** `frontend-admin/src/api/reviews.ts`, `frontend-admin/src/pages/ReviewsPage.tsx`, `frontend-admin/src/components/layout/AdminLayout.tsx`, `frontend-admin/src/App.tsx`, `frontend-admin/src/api/reviews.test.ts`, `frontend-admin/src/pages/ReviewsPage.test.tsx`.
  - **Consumes:** `API-ADMIN-REVIEWS@1`, `ProtectedRoute`, and `apiClientWithMeta`.
  - **Contracts:** API-ADMIN-REVIEWS@1 (consumer)
  - **Acceptance:** Unauthenticated or non-admin users cannot access `/reviews`. Admin can view newest-first paginated reviews with reviewer email, rating, comment, timestamp, and reply status badge; filter by rating (`1..5`) and reply status (`yes`/`no`); and create, edit, or delete replies (with empty/1000-char validation) without full page reload.
  - **Verification:** Vitest unit and component tests (`frontend-admin/src/api/reviews.test.ts`, `frontend-admin/src/pages/ReviewsPage.test.tsx`) plus `npm run lint` and `npm run build` in `frontend-admin/`.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 3.2 Public Product Page UI
  - **Produces:** Updated `ProductReviewsSection.tsx` and wire types in `frontend` rendering the store reply block beneath customer reviews when `adminReply` is present.
  - **Scope:** `frontend/src/api/types.ts`, `frontend/src/components/ProductReviewsSection.tsx`, `frontend/src/components/ProductReviewsSection.test.tsx`.
  - **Consumes:** `API-PUBLIC-REVIEWS@1` payload from `GET /api/v1/products/:id/reviews`.
  - **Contracts:** API-PUBLIC-REVIEWS@1 (consumer)
  - **Acceptance:** Admin replies are visually distinguished with the `"Phản hồi từ người bán"` badge beneath the customer review. No admin personal data is rendered. Unreplied reviews do not render the reply block. Reloading reflects updated or deleted replies.
  - **Verification:** Vitest component tests (`frontend/src/components/ProductReviewsSection.test.tsx`) rendering reviews with and without replies, plus `npm run lint` and `npm run build` in `frontend/`.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 4. End-to-End Verification

- [x] 4.1 Verify Admin Review Reply end-to-end with Playwright and generate visual evidence report
  - **Produces:** End-to-end Playwright test suite covering the full Admin Review Reply lifecycle across `frontend-admin` (`:15174`), `frontend` (`:15173`), and `backend` (`:18080`), step-by-step screenshots saved under `.dream/specs/admin-review-reply/imgs/`, and a verification summary report at `.dream/specs/admin-review-reply/report.md`.
  - **Scope:** Load `e2e-testing` skill; create/update Playwright E2E spec and configuration (e.g., `frontend/e2e/admin-review-reply.spec.ts` or `frontend-admin/e2e/admin-review-reply.spec.ts`), execute against the live stack with real authentication, capture visual evidence at desktop (`1440x900`) and mobile (`375x812`) viewports in `.dream/specs/admin-review-reply/imgs/`, and write `.dream/specs/admin-review-reply/report.md`. If the E2E run exposes any integration defect within the approved spec, fix the root cause, re-run affected unit/integration tests and the E2E suite, and refresh `imgs/` and `report.md`; if it exposes a broken or incomplete approved contract, stop and invoke `managing-contract-changes`.
  - **Consumes:** `API-ADMIN-REVIEWS@1`, `API-PUBLIC-REVIEWS@1`, `DB-REVIEW-REPLIES@1`, `ReviewsPage` (`frontend-admin`), and `ProductReviewsSection` (`frontend`).
  - **Contracts:** API-ADMIN-REVIEWS@1 (verifier); API-PUBLIC-REVIEWS@1 (verifier); DB-REVIEW-REPLIES@1 (verifier)
  - **Acceptance:**
    - Non-admin / unauthenticated access to `/reviews` and `/api/v1/admin/reviews*` is rejected (`Req 1.5, 2.7`).
    - Admin logs in with real credentials, views the review list at `/reviews` with email, rating, comment, timestamp, and reply status, and filters by star rating and reply status (`Req 1.1, 1.2, 1.3, 1.4`).
    - Admin opens the reply dialog, verifies empty/whitespace validation error handling, and submits a valid reply (`PUT /api/v1/admin/reviews/:id/reply` -> `200 OK`), updating the table badge to `"Đã phản hồi"` (`Req 2.1, 2.2, 2.3`).
    - Storefront product detail page (`/products/:id`) displays the admin reply beneath the customer review with `"Phản hồi từ người bán"` badge, no internal admin ID/email, and clean layout at both desktop (`1440x900`) and mobile (`375x812`) viewports (`Req 3.1, 3.2, 3.3, 3.4`).
    - Admin edits the reply and deletes the reply (`DELETE /api/v1/admin/reviews/:id/reply` -> `200 OK`), and the storefront product detail page reflects the edited content and subsequent removal upon reload (`Req 2.4, 2.5, 2.6, 3.5`).
    - All screenshots exist in `.dream/specs/admin-review-reply/imgs/` and are embedded/referenced in `.dream/specs/admin-review-reply/report.md`.
  - **Verification:** Run Playwright E2E suite against the running backend (`:18080`), storefront (`:15173`), and admin portal (`:15174`), verify all tests pass, and verify `.dream/specs/admin-review-reply/imgs/*.png` and `.dream/specs/admin-review-reply/report.md` are generated and complete.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.1, 3.2, 3.3, 3.4, 3.5_
