# Design Document: Admin Review Reply

## Overview
This design covers the implementation of the Admin Review Reply feature, addressing requirement IDs 1.1 - 1.5, 2.1 - 2.7, and 3.1 - 3.5.
The feature allows administrators to view a list of all customer product reviews, filter them, and add, edit, or remove official store replies. These replies are then displayed publicly on the product detail page beneath the respective reviews.

## Architecture
The system extends the existing Product Reviews domain:
- **Database**: Adds `admin_reply` and `admin_replied_at` columns to the `product_reviews` table.
- **Backend**: Introduces a new `AdminReviewHandler` and extends the `ReviewUseCase` and `ReviewRepository` to support querying all reviews (with filters) and mutating the admin reply fields.
- **Frontend Admin**: Introduces a new "Quản lý đánh giá" (Review Management) page with a list/table of reviews, filters, and a modal/form to submit replies.
- **Frontend Public**: Updates the `ProductReviewsSection` to render `adminReply` if present.

## Components And Interfaces

### Backend (Admin API - New)
- **`GET /api/v1/admin/reviews`**:
  - Query Params: `page` (int), `limit` (int), `rating` (int, optional), `has_reply` (boolean, optional).
  - Response: Paginated list of reviews, including user email, product snapshot, review content, media, and admin reply status.
- **`PUT /api/v1/admin/reviews/:id/reply`**:
  - Request: `{"reply": "Nội dung phản hồi"}` (String, max 1000 chars, not empty).
  - Response: `{"success": true, ...}`
- **`DELETE /api/v1/admin/reviews/:id/reply`**:
  - Response: `{"success": true, ...}`

### Frontend Public (API Extension)
- The existing `GET /api/v1/products/:id/reviews` endpoint will be updated to include `adminReply` (string, nullable) and `adminRepliedAt` (timestamp, nullable) in the `PublicReview` payload. The backend `GetProductReviews` repository query will just map these new columns.

### Frontend Admin (UI Components)
- `ReviewManagementPage`: Displays the data table.
- `ReviewFilters`: Controls for rating and has_reply.
- `AdminReplyDialog`: A modal to create, edit, or confirm deletion of a reply.

## Data Models

### Database Schema Changes
Add a new migration `db/migrations/0000X_add_admin_reply_to_reviews.up.sql`:
```sql
ALTER TABLE product_reviews
ADD COLUMN admin_reply text DEFAULT NULL CHECK (char_length(admin_reply) <= 1000),
ADD COLUMN admin_replied_at timestamptz DEFAULT NULL;
```

### Application Models
`Review` domain entity updated:
```go
type Review struct {
    // ... existing fields ...
    AdminReply     *string
    AdminRepliedAt *time.Time
}
```

## Error Handling
- **Validation Errors (400)**: Returned if `reply` exceeds 1000 characters or is empty (whitespace only).
- **Not Found (404)**: Returned if the `id` in the URL does not exist.
- **Unauthorized/Forbidden (401/403)**: Handled by the existing `RequireAuth` and `RequireAdmin` middlewares for the `/api/v1/admin/*` group.

## Testing Strategy
- **1.1 - 1.4 (Admin List)**: Repository tests for `GetAdminReviews` with various filters. HTTP tests for `GET /api/v1/admin/reviews` asserting pagination and filtering logic.
- **1.5 & 2.7 (Auth)**: HTTP tests asserting 401/403 when a non-admin attempts to access admin review APIs.
- **2.1 - 2.6 (Reply Mutation)**: Use case tests for adding, updating, and removing replies. HTTP tests asserting max length limits and successful updates. Repository tests for the update queries.
- **3.1 - 3.5 (Public Display)**: HTTP tests for `GET /api/v1/products/:id/reviews` to ensure `adminReply` is correctly mapped and exposed. Frontend unit tests for `ProductReviewsSection` rendering the reply visually without exposing internal IDs.

## Requirement Traceability
| Requirement | Design Elements | Verification |
|---|---|---|
| 1.1, 1.2, 1.3, 1.4 | `GET /api/v1/admin/reviews`, `ReviewManagementPage` | HTTP tests for listing with filters & pagination; React Testing Library tests for UI |
| 1.5, 2.7 | Backend Middlewares `RequireAdmin` | HTTP tests asserting 403 for non-admin users |
| 2.1, 2.2, 2.3, 2.4 | `PUT /api/v1/admin/reviews/:id/reply`, schema limits | Use case tests for reply validation, HTTP tests for 400 |
| 2.5 | `DELETE /api/v1/admin/reviews/:id/reply` | Use case tests for clearing reply fields |
| 2.6 | Handled inherently (no user lock on reply) | Test allowing any admin token to update |
| 3.1, 3.2, 3.3, 3.4 | API `GetProductReviews` mapping, `ProductReviewsSection` | Frontend tests rendering `adminReply` correctly |
| 3.5 | API fetching latest DB state | HTTP test creating reply and fetching public endpoint |

## Existing System Integration
- The public `ProductReviewsSection` UI must be updated to conditionally render `adminReply`.
- Existing reviews in the database will have `NULL` for `admin_reply`, which cleanly maps to "chưa phản hồi" (unreplied) without requiring data backfill.
