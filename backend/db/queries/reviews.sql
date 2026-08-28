-- name: InsertReview :one
INSERT INTO product_reviews (
    order_item_id, rating, comment
)
VALUES (
    $1, $2, $3
)
RETURNING id, order_item_id, rating, comment, edit_count, created_at, updated_at;

-- name: InsertReviewMedia :one
INSERT INTO review_media (
    review_id, media_type, mime_type, object_key, size_bytes, position
)
VALUES (
    $1, $2, $3, $4, $5, $6
)
RETURNING id, review_id, media_type, mime_type, object_key, size_bytes, position, created_at;

-- name: UpdateReview :one
UPDATE product_reviews
SET rating = $2,
    comment = $3,
    edit_count = edit_count + 1,
    updated_at = now()
WHERE id = $1 AND edit_count = 0
RETURNING id, order_item_id, rating, comment, edit_count, created_at, updated_at;

-- name: GetReviewByID :one
SELECT id, order_item_id, rating, comment, edit_count, created_at, updated_at
FROM product_reviews
WHERE id = $1;

-- name: LockReviewByID :one
SELECT id, order_item_id, rating, comment, edit_count, created_at, updated_at
FROM product_reviews
WHERE id = $1
FOR UPDATE;

-- name: GetReviewByOrderItemID :one
SELECT id, order_item_id, rating, comment, edit_count, created_at, updated_at
FROM product_reviews
WHERE order_item_id = $1;

-- name: LockReviewByOrderItemID :one
SELECT id, order_item_id, rating, comment, edit_count, created_at, updated_at
FROM product_reviews
WHERE order_item_id = $1
FOR UPDATE;

-- name: ListReviewsByOrderItemIDs :many
SELECT id, order_item_id, rating, comment, edit_count, created_at, updated_at
FROM product_reviews
WHERE order_item_id = ANY(@order_item_ids::uuid[])
ORDER BY created_at DESC, id DESC;

-- name: GetReviewMediaByID :one
SELECT id, review_id, media_type, mime_type, object_key, size_bytes, position, created_at
FROM review_media
WHERE id = $1;

-- name: ListReviewMediaByReviewID :many
SELECT id, review_id, media_type, mime_type, object_key, size_bytes, position, created_at
FROM review_media
WHERE review_id = $1
ORDER BY media_type ASC, position ASC, id ASC;

-- name: ListReviewMediaByReviewIDs :many
SELECT id, review_id, media_type, mime_type, object_key, size_bytes, position, created_at
FROM review_media
WHERE review_id = ANY(@review_ids::uuid[])
ORDER BY review_id, media_type ASC, position ASC, id ASC;

-- name: DeleteReviewMediaByReviewID :exec
DELETE FROM review_media
WHERE review_id = $1;

-- name: DeleteReviewMediaNotInIDs :many
DELETE FROM review_media
WHERE review_id = @review_id
  AND NOT (id = ANY(@retained_ids::uuid[]))
RETURNING id, object_key;

-- name: GetReviewSummaryByProductID :one
SELECT COUNT(*)::bigint AS total_reviews,
       COALESCE(ROUND(AVG(pr.rating), 1)::text, '0.0')::text AS average_rating
FROM product_reviews pr
JOIN order_items oi ON oi.id = pr.order_item_id
WHERE oi.product_id = $1;

-- name: GetRatingCountsByProductID :many
SELECT pr.rating, COUNT(*)::bigint AS count
FROM product_reviews pr
JOIN order_items oi ON oi.id = pr.order_item_id
WHERE oi.product_id = $1
GROUP BY pr.rating;

-- name: ListPublicReviewsByProductID :many
SELECT pr.id, pr.rating, pr.comment, pr.edit_count, pr.created_at, pr.updated_at,
       u.email AS reviewer_email,
       oi.model AS model,
       oi.options::text AS options
FROM product_reviews pr
JOIN order_items oi ON oi.id = pr.order_item_id
JOIN orders o ON o.id = oi.order_id
JOIN users u ON u.id = o.user_id
WHERE oi.product_id = @product_id
ORDER BY pr.created_at DESC, pr.id DESC
LIMIT @limit_count OFFSET @offset_count;
