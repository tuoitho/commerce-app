-- name: InsertReview :one
INSERT INTO product_reviews (
    order_item_id, user_id, product_id, variant_id,
    rating, comment
)
VALUES (
    @order_item_id, @user_id, @product_id, @variant_id,
    @rating, @comment
)
RETURNING id, order_item_id, user_id, product_id, variant_id,
          rating, comment, created_at, updated_at, edited_at;

-- name: GetReviewByID :one
SELECT id, order_item_id, user_id, product_id, variant_id,
       rating, comment, created_at, updated_at, edited_at
FROM product_reviews
WHERE id = $1;

-- name: GetReviewByOrderItemID :one
SELECT id, order_item_id, user_id, product_id, variant_id,
       rating, comment, created_at, updated_at, edited_at
FROM product_reviews
WHERE order_item_id = $1;

-- name: LockReviewForUpdate :one
SELECT id, order_item_id, user_id, product_id, variant_id,
       rating, comment, created_at, updated_at, edited_at
FROM product_reviews
WHERE id = $1 AND user_id = $2
FOR UPDATE;

-- name: UpdateReviewConditional :one
UPDATE product_reviews
SET rating = @rating,
    comment = @comment,
    updated_at = now(),
    edited_at = now()
WHERE id = @id AND user_id = @user_id AND edited_at IS NULL
RETURNING id, order_item_id, user_id, product_id, variant_id,
          rating, comment, created_at, updated_at, edited_at;

-- name: InsertReviewMedia :one
INSERT INTO review_media (
    review_id, object_key, type, mime_type, size_bytes, position
)
VALUES (
    @review_id, @object_key, @type, @mime_type, @size_bytes::bigint, @position
)
RETURNING id, review_id, object_key, type, mime_type, size_bytes, position, created_at;

-- name: ListReviewMediaByReviewID :many
SELECT id, review_id, object_key, type, mime_type, size_bytes, position, created_at
FROM review_media
WHERE review_id = $1
ORDER BY position ASC;

-- name: ListReviewMediaByReviewIDs :many
SELECT id, review_id, object_key, type, mime_type, size_bytes, position, created_at
FROM review_media
WHERE review_id = ANY(@review_ids::uuid[])
ORDER BY review_id, position ASC;

-- name: DeleteReviewMediaByReviewID :exec
DELETE FROM review_media
WHERE review_id = $1;

-- name: DeleteReviewMediaByIDs :exec
DELETE FROM review_media
WHERE id = ANY(@ids::uuid[]);

-- name: GetReferencedReviewMediaByID :one
SELECT rm.id, rm.review_id, rm.object_key, rm.type, rm.mime_type, rm.size_bytes, rm.position, rm.created_at
FROM review_media rm
JOIN product_reviews pr ON pr.id = rm.review_id
WHERE rm.id = $1;

-- name: ListProductReviews :many
SELECT pr.id, pr.order_item_id, pr.user_id, pr.product_id, pr.variant_id,
       pr.rating, pr.comment, pr.created_at, pr.updated_at, pr.edited_at,
       oi.options::text AS purchased_options,
       rr.content AS response_content, rr.created_at AS response_created_at,
       rr.updated_at AS response_updated_at
FROM product_reviews pr
JOIN order_items oi ON oi.id = pr.order_item_id
LEFT JOIN review_responses rr ON rr.review_id = pr.id
WHERE pr.product_id = @product_id
ORDER BY pr.updated_at DESC, pr.id DESC
LIMIT @limit_count OFFSET @offset_count;

-- name: CountProductReviews :one
SELECT count(*)::bigint AS count
FROM product_reviews
WHERE product_id = $1;

-- name: GetProductReviewSummary :one
SELECT count(*)::bigint AS review_count,
       AVG(rating)::numeric(10,4) AS average_rating
FROM product_reviews
WHERE product_id = $1;

-- name: ListAllReferencedObjectKeys :many
SELECT object_key
FROM review_media;

-- name: IsObjectKeyReferenced :one
SELECT EXISTS (
    SELECT 1 FROM review_media WHERE object_key = $1
) AS is_referenced;

-- name: ListOwnerReviews :many
SELECT pr.id, pr.order_item_id, pr.user_id, pr.product_id, pr.variant_id,
       pr.rating, pr.comment, pr.created_at, pr.updated_at, pr.edited_at,
       oi.product_name AS purchased_product_name,
       oi.options::text AS purchased_options,
       rr.content AS response_content, rr.created_at AS response_created_at,
       rr.updated_at AS response_updated_at,
       EXISTS (
           SELECT 1 FROM products p
           WHERE p.id = pr.product_id
             AND p.active
             AND EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.active)
       ) AS is_product_public
FROM product_reviews pr
JOIN order_items oi ON oi.id = pr.order_item_id
LEFT JOIN review_responses rr ON rr.review_id = pr.id
WHERE pr.user_id = @user_id
ORDER BY pr.updated_at DESC, pr.id DESC
LIMIT @limit_count OFFSET @offset_count;

-- name: CountOwnerReviews :one
SELECT count(*)::bigint AS count
FROM product_reviews
WHERE user_id = $1;

-- name: GetReviewResponse :one
SELECT review_id, content, version, created_at, updated_at
FROM review_responses
WHERE review_id = $1;

-- name: InsertReviewResponse :one
INSERT INTO review_responses (review_id, content, created_by, updated_by)
SELECT pr.id, @content, @admin_id, @admin_id
FROM product_reviews pr
WHERE pr.id = @review_id
  AND NOT EXISTS (SELECT 1 FROM review_responses rr WHERE rr.review_id = pr.id)
RETURNING review_id, content, version, created_at, updated_at;

-- name: UpdateReviewResponse :one
UPDATE review_responses
SET content = @content, updated_by = @admin_id,
    version = version + 1, updated_at = now()
WHERE review_id = @review_id AND version = @version
RETURNING review_id, content, version, created_at, updated_at;

-- name: ReviewExists :one
SELECT EXISTS (SELECT 1 FROM product_reviews WHERE id = $1);

-- name: CountAdminReviews :one
SELECT count(*)::bigint FROM product_reviews;

-- name: ListAdminReviews :many
SELECT pr.id, pr.order_item_id, pr.product_id, pr.variant_id, pr.rating, pr.comment,
       pr.created_at, pr.updated_at, pr.edited_at,
       oi.product_name AS purchased_product_name, oi.options::text AS purchased_options,
       EXISTS (
           SELECT 1 FROM products p
           WHERE p.id = pr.product_id AND p.active
             AND EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.active)
       ) AS is_product_public,
       rr.content AS response_content, rr.created_at AS response_created_at,
       rr.updated_at AS response_updated_at, rr.version AS response_version
FROM product_reviews pr
JOIN order_items oi ON oi.id = pr.order_item_id
LEFT JOIN review_responses rr ON rr.review_id = pr.id
ORDER BY pr.updated_at DESC, pr.id DESC
LIMIT @limit_count OFFSET @offset_count;
