# Product Review Helpfulness Workstream Tasks

## Contract baseline

| Contract | Revision | Status |
|---|---:|---|
| review-helpfulness-api | 1 | FROZEN |

## Workstream: backend-review

### BE-01 — Database migration and repository queries for review helpfulness, admin stats, and filtered sorting

```yaml
id: BE-01
owner: backend-review
outcome: Apply migration for review_helpful_votes table and implement sqlc/repository queries for vote upsert, vote deletion, vote count stats, GetAdminReviewStats query, aggregated ListProductReviews, and product-filtered dynamically-sorted ListAdminReviews
requirements:
  - REQ-VOTE-01
  - REQ-VOTE-02
  - REQ-VOTE-03
  - REQ-VOTE-04
  - REQ-VOTE-06
acceptance_criteria:
  - AC-VOTE-01-01
  - AC-VOTE-02-01
  - AC-VOTE-03-01
  - AC-VOTE-04-01
  - AC-VOTE-06-01
  - AC-VOTE-06-02
  - AC-VOTE-06-03
  - AC-VOTE-06-04
contracts: []
depends_on: []
risk: normal
verification:
  - type: integration-db
    scope: backend/internal/repository/review_repository_integration_test.go
status: completed
verified_against:
  review-helpfulness-api: 1
```

**Contract examples / acceptance checks:** `Example 1: Bỏ phiếu hữu ích lần đầu`, `Example 3: Hủy bỏ phiếu`, `Example 4: Admin lấy thống kê tổng quan`, `Example 5: Admin lọc đánh giá theo sản phẩm`, `Example 6: Admin sắp xếp theo độ hữu ích`

**Architectural constraints:**
- Numbered migration `000014_review_helpful_votes.up.sql` and `000014_review_helpful_votes.down.sql`.
- Compound primary key `PRIMARY KEY (review_id, user_id)` with foreign keys `ON DELETE CASCADE`.
- `ListProductReviews` aggregates `helpful_count`, `unhelpful_count`, and `viewer_vote` in a single query.
- `ListAdminReviews` aggregates `helpful_count`, `unhelpful_count`, supports filtering by `productId`, `search` and sorting by `latest`, `most_helpful`, `most_unhelpful`.
- `GetAdminReviewStats` computes `total_reviews`, `total_helpful`, `total_unhelpful`, and `unanswered_count`.

---

### BE-02 — Implement HTTP vote endpoints, storefront reviews, and admin stats & filtered review endpoints

```yaml
id: BE-02
owner: backend-review
outcome: Expose PUT /api/v1/reviews/:reviewId/vote, DELETE /api/v1/reviews/:reviewId/vote, extend GET /api/v1/products/:id/reviews, expose GET /api/v1/admin/reviews/stats, and support sort, productId, and search on GET /api/v1/admin/reviews
requirements:
  - REQ-VOTE-01
  - REQ-VOTE-02
  - REQ-VOTE-03
  - REQ-VOTE-04
  - REQ-VOTE-05
  - REQ-VOTE-06
acceptance_criteria:
  - AC-VOTE-01-01
  - AC-VOTE-01-02
  - AC-VOTE-02-01
  - AC-VOTE-02-02
  - AC-VOTE-03-01
  - AC-VOTE-03-02
  - AC-VOTE-04-01
  - AC-VOTE-04-02
  - AC-VOTE-04-03
  - AC-VOTE-05-02
  - AC-VOTE-05-03
  - AC-VOTE-06-01
  - AC-VOTE-06-02
  - AC-VOTE-06-03
  - AC-VOTE-06-04
contracts:
  - id: review-helpfulness-api
    revision: 1
    role: provider
depends_on:
  - BE-01
risk: normal
verification:
  - type: provider-contract
    scenario: review-helpfulness-api
    scope: backend/internal/delivery/http/review_handler_test.go
  - type: unit
    scope: backend/internal/usecase/review
status: completed
verified_against:
  review-helpfulness-api: 1
```

**Contract examples / acceptance checks:** `Example 1`, `Example 2`, `Example 3`, `Example 4`, `Example 5`, `Example 6`

**Architectural constraints:**
- Follow Full Status Envelope standard for HTTP responses.
- Enforce customer auth on vote mutations (`guard.RequireCustomerAuthForReviews`).
- Support optional auth on `GET /products/:id/reviews` (`guard.OptionalCustomerAuth`).
- Support admin auth, `sort`, `productId`, `search` on `GET /admin/reviews` and stats on `GET /admin/reviews/stats`.
- Return user-facing error messages in Vietnamese.

---

## Workstream: frontend-ui

### FE-01 — Client API methods and type definitions for review helpfulness (Storefront)

```yaml
id: FE-01
owner: frontend-ui
outcome: Define ReviewHelpfulness types, update Review and ReviewViewerState interfaces, and implement voteReview and unvoteReview client API functions
requirements:
  - REQ-VOTE-01
  - REQ-VOTE-02
  - REQ-VOTE-04
acceptance_criteria:
  - AC-VOTE-01-01
  - AC-VOTE-02-01
  - AC-VOTE-04-01
contracts:
  - id: review-helpfulness-api
    revision: 1
    role: consumer
depends_on: []
risk: normal
verification:
  - type: unit
    scope: frontend/src/api/reviews.test.ts
  - type: typecheck
    scope: npm run typecheck (frontend)
status: completed
verified_against:
  review-helpfulness-api: 1
```

**Contract examples / acceptance checks:** `Example 1`, `Example 3`

**Architectural constraints:**
- Use `apiClient` / `apiClientWithMeta` adhering to envelope structure.
- Add `helpfulCount`, `unhelpfulCount`, `viewer.vote`, and `viewer.canVote` to frontend types.

---

### FE-02 — Interactive helpful and unhelpful voting component in ProductReviewsSection

```yaml
id: FE-02
owner: frontend-ui
outcome: Render helpful and unhelpful buttons with live counters, active states, optimistic updates with rollback, and guest login prompt in ProductReviewsSection
requirements:
  - REQ-VOTE-01
  - REQ-VOTE-02
  - REQ-VOTE-03
  - REQ-VOTE-04
  - REQ-VOTE-05
acceptance_criteria:
  - AC-VOTE-04-01
  - AC-VOTE-04-02
  - AC-VOTE-04-03
  - AC-VOTE-05-01
  - AC-VOTE-05-02
  - AC-VOTE-05-03
contracts:
  - id: review-helpfulness-api
    revision: 1
    role: consumer
depends_on:
  - FE-01
risk: normal
verification:
  - type: component
    scope: frontend/src/components/ProductReviewsSection.test.tsx
status: completed
verified_against:
  review-helpfulness-api: 1
```

**Contract examples / acceptance checks:** `Example 1`, `Example 2`, `Example 3`

**Architectural constraints:**
- Display `ThumbsUp` and `ThumbsDown` icons with counts.
- Immediate optimistic UI update with rollback on network or server error.
- Non-authenticated click triggers login prompt without mutation.

---

## Workstream: frontend-admin

### ADM-01 — Admin Review API client, Overview Metrics Cards, Product Filter, and Interactive Review Cards

```yaml
id: ADM-01
owner: frontend-admin
outcome: Implement getAdminReviewStats and getAdminReviews (with sort, productId, search) in API client, render 4 Overview Metrics Cards (total, helpful, unhelpful, unanswered), add Product Search/Filter bar with sort selector, render helpfulness badges on ReviewCard, and add Quick Filter By Product button
requirements:
  - REQ-VOTE-06
acceptance_criteria:
  - AC-VOTE-06-01
  - AC-VOTE-06-02
  - AC-VOTE-06-03
  - AC-VOTE-06-04
  - AC-VOTE-06-05
contracts:
  - id: review-helpfulness-api
    revision: 1
    role: consumer
depends_on: []
risk: normal
verification:
  - type: component
    scope: frontend-admin/src/pages/ReviewsPage.test.tsx
  - type: typecheck
    scope: npm run typecheck (frontend-admin)
status: completed
verified_against:
  review-helpfulness-api: 1
```

**Contract examples / acceptance checks:** `Example 4: Admin lấy thống kê tổng quan`, `Example 5: Admin lọc đánh giá theo sản phẩm`, `Example 6: Admin sắp xếp theo độ hữu ích`

**Architectural constraints:**
- Support `getAdminReviewStats()` in `frontend-admin/src/api/reviews.ts`.
- Support `sort`, `productId`, `search` params in `getAdminReviews()`.
- Update `AdminReview` type with `helpfulCount` and `unhelpfulCount`.
- Render 4 Overview Metrics Cards at top of ReviewsPage.
- Add Search & Filter Bar with product name search, sort dropdown, and active filter clear button.
- Render 👍/👎 badges on each `ReviewCard` and a "Lọc theo sản phẩm này" action button.

---

## Workstream: integration-verifier

### INT-01 — End-to-end runtime integration verification for review helpfulness voting and admin features

```yaml
id: INT-01
owner: integration-verifier
outcome: Execute runtime HTTP contract verification across provider and consumers for all storefront helpfulness, admin metrics, and product-filtered sorting scenarios
requirements:
  - REQ-VOTE-01
  - REQ-VOTE-02
  - REQ-VOTE-03
  - REQ-VOTE-04
  - REQ-VOTE-05
  - REQ-VOTE-06
acceptance_criteria:
  - AC-VOTE-01-01
  - AC-VOTE-01-02
  - AC-VOTE-02-01
  - AC-VOTE-02-02
  - AC-VOTE-03-01
  - AC-VOTE-03-02
  - AC-VOTE-04-01
  - AC-VOTE-04-02
  - AC-VOTE-04-03
  - AC-VOTE-05-01
  - AC-VOTE-05-02
  - AC-VOTE-05-03
  - AC-VOTE-06-01
  - AC-VOTE-06-02
  - AC-VOTE-06-03
  - AC-VOTE-06-04
  - AC-VOTE-06-05
contracts:
  - id: review-helpfulness-api
    revision: 1
    role: verifier
depends_on:
  - BE-02
  - FE-02
  - ADM-01
risk: normal
verification:
  - type: runtime-http
    scope: backend HTTP suite & frontend/admin builds
status: completed
verified_against:
  review-helpfulness-api: 1
```

**Contract examples / acceptance checks:** `Example 1`, `Example 2`, `Example 3`, `Example 4`, `Example 5`, `Example 6`
