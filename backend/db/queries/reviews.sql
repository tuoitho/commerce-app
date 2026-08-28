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
       oi.options::text AS purchased_options
FROM product_reviews pr
JOIN order_items oi ON oi.id = pr.order_item_id
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
