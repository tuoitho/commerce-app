# Runtime Integration Verification Report

## Scope

- Feature: `purchased-product-reviews`
- Task: `INT-01`
- Phase: `integration-runtime`
- Contract baseline: `PURCHASED-REVIEW-API@2`, `PURCHASED-REVIEW-MEDIA@1`
- Target Environment: Real PostgreSQL 16 (`:5432`), MinIO (`:9000`), Backend Server (`:8080`), Frontend Dev (`:5173`) & Headless Chromium Browser

## Executed Scenarios

| Scenario / Check | Requirement & AC | Contract Revision | Target Boundary | Result | Evidence |
|---|---|---|---|---|---|
| Anonymous Product Read | `REQ-REVIEW-05`, `AC-REVIEW-05-01`, `AC-REVIEW-05-03` | `PURCHASED-REVIEW-API@2` | `GET /api/v1/products/:id` | PASS | `reviewSummary: { averageRating, reviewCount }` correctly serialized in JSON |
| Customer Auth & Order Detail | `REQ-REVIEW-01`, `REQ-REVIEW-07`, `AC-REVIEW-01-01`, `AC-REVIEW-07-01` | `PURCHASED-REVIEW-API@2` | `GET /api/v1/orders/:id` | PASS | Delivered order item returns `reviewState: {"status":"eligible","reviewId":null,"canEdit":false,"remainingEdits":0}` |
| Multipart Upload & Create Review | `REQ-REVIEW-01`, `REQ-REVIEW-02`, `AC-REVIEW-01-01`, `AC-REVIEW-02-01`..`05` | `PURCHASED-REVIEW-API@2` | `POST /api/v1/orders/:id/items/:itemId/review` | PASS | PNG uploaded to MinIO bucket `product-reviews`, SHA-256 digest validated, MIME `image/png` sniffed, review record inserted in PostgreSQL with `UNIQUE(order_item_id)` |
| Media Proxy Delivery & Streaming | `REQ-REVIEW-08`, `AC-REVIEW-08-02` | `PURCHASED-REVIEW-MEDIA@1` | `GET /media/reviews/:mediaId` | PASS | Reference-first DB verification, full GET returns `200 OK` + `Content-Type: image/png` + `Accept-Ranges: bytes`, byte Range request returns `206 Partial Content` |
| Single Edit Execution | `REQ-REVIEW-04`, `AC-REVIEW-04-01` | `PURCHASED-REVIEW-API@2` | `PUT /api/v1/reviews/:reviewId` | PASS | 1st edit permitted, rating and comment updated, `edited_at` set, `viewer.remainingEdits` updated to `0` and `viewer.canEdit` to `false` |
| Second Edit Blocked | `REQ-REVIEW-04`, `AC-REVIEW-04-02` | `PURCHASED-REVIEW-API@2` | `PUT /api/v1/reviews/:reviewId` | PASS | 2nd edit returns `409 Conflict` with error code `review_edit_limit_reached` and message in Vietnamese |
| Foreign User Edit Blocked | `REQ-REVIEW-03`, `AC-REVIEW-03-02` | `PURCHASED-REVIEW-API@2` | `PUT /api/v1/reviews/:reviewId` | PASS | Non-owner user token returns `404 Not Found` with error code `review_not_found` |
| Aggregated Product Review Summary | `REQ-REVIEW-05`, `AC-REVIEW-05-01`, `AC-REVIEW-05-02` | `PURCHASED-REVIEW-API@2` | `GET /api/v1/products/:id` | PASS | Dynamic average rating recalculated and rounded to 1 decimal place |
| Public Product Reviews List | `REQ-REVIEW-06`, `AC-REVIEW-06-01`, `AC-REVIEW-06-02` | `PURCHASED-REVIEW-API@2` | `GET /api/v1/products/:id/reviews` | PASS | Paginated list returns `authorLabel: "Khách hàng đã mua hàng"`, `verifiedPurchase: true`, purchased variant options snapshot, and media URLs |
| Live Browser DOM Rendering | `REQ-REVIEW-05`, `REQ-REVIEW-06`, `AC-REVIEW-05-04`, `AC-REVIEW-06-01`..`03` | `PURCHASED-REVIEW-API@2` | Chromium via Chrome DevTools | PASS | Verified on `http://localhost:5173/products/:id`: Header rating badge, scroll target, reviews section with verified badge, purchased option pills, and formatted Vietnamese dates |

## Findings & Resolution

1. **Missing `ReviewState` in HTTP `toOrderResponse`:**
   - *Discovery:* Live runtime test against `GET /api/v1/orders/:id` returned `reviewState: null`.
   - *Resolution:* Added `orderItemReviewStateResponse` and connected `toOrderItemReviewStateResponse(item.ReviewState)` in `order_handler.go`. Verified with live API call.
2. **Missing `/media` Proxy in `frontend/vite.config.ts`:**
   - *Discovery:* Vite dev server only proxied `/api`, causing media thumbnail requests to fail in browser.
   - *Resolution:* Added `/media` route to Vite proxy configuration. Verified with live browser asset load.

## Verdict

**`PASS`** — 100% of runtime integration scenarios passed against live PostgreSQL, MinIO, Go HTTP backend, and Chromium browser. All spawned verification processes have been cleanly terminated.
