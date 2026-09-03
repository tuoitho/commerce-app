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
SELECT pr.id, pr.order_item_id, pr.rating, pr.comment, pr.edit_count, pr.created_at, pr.updated_at,
       rr.id AS admin_reply_id, rr.content AS admin_reply, rr.updated_at AS admin_replied_at
FROM product_reviews pr
LEFT JOIN review_replies rr ON rr.review_id = pr.id
WHERE pr.id = $1;

-- name: LockReviewByID :one
SELECT pr.id, pr.order_item_id, pr.rating, pr.comment, pr.edit_count, pr.created_at, pr.updated_at,
       rr.id AS admin_reply_id, rr.content AS admin_reply, rr.updated_at AS admin_replied_at
FROM product_reviews pr
LEFT JOIN review_replies rr ON rr.review_id = pr.id
WHERE pr.id = $1
FOR UPDATE OF pr;

-- name: GetReviewByOrderItemID :one
SELECT pr.id, pr.order_item_id, pr.rating, pr.comment, pr.edit_count, pr.created_at, pr.updated_at,
       rr.id AS admin_reply_id, rr.content AS admin_reply, rr.updated_at AS admin_replied_at
FROM product_reviews pr
LEFT JOIN review_replies rr ON rr.review_id = pr.id
WHERE pr.order_item_id = $1;

-- name: LockReviewByOrderItemID :one
SELECT pr.id, pr.order_item_id, pr.rating, pr.comment, pr.edit_count, pr.created_at, pr.updated_at,
       rr.id AS admin_reply_id, rr.content AS admin_reply, rr.updated_at AS admin_replied_at
FROM product_reviews pr
LEFT JOIN review_replies rr ON rr.review_id = pr.id
WHERE pr.order_item_id = $1
FOR UPDATE OF pr;

-- name: ListReviewsByOrderItemIDs :many
SELECT pr.id, pr.order_item_id, pr.rating, pr.comment, pr.edit_count, pr.created_at, pr.updated_at,
       rr.id AS admin_reply_id, rr.content AS admin_reply, rr.updated_at AS admin_replied_at
FROM product_reviews pr
LEFT JOIN review_replies rr ON rr.review_id = pr.id
WHERE pr.order_item_id = ANY(@order_item_ids::uuid[])
ORDER BY pr.created_at DESC, pr.id DESC;

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
       rr.id AS admin_reply_id, rr.content AS admin_reply, rr.updated_at AS admin_replied_at,
       u.email AS reviewer_email,
       oi.model AS model,
       oi.options::text AS options
FROM product_reviews pr
JOIN order_items oi ON oi.id = pr.order_item_id
JOIN orders o ON o.id = oi.order_id
JOIN users u ON u.id = o.user_id
LEFT JOIN review_replies rr ON rr.review_id = pr.id
WHERE oi.product_id = @product_id
ORDER BY pr.created_at DESC, pr.id DESC
LIMIT @limit_count OFFSET @offset_count;

-- name: CountUserReviews :one
SELECT COUNT(*)::bigint
FROM product_reviews pr
JOIN order_items oi ON oi.id = pr.order_item_id
JOIN orders o ON o.id = oi.order_id
WHERE o.user_id = $1
  AND ($2::smallint = 0 OR pr.rating = $2::smallint);

-- name: ListUserReviews :many
SELECT pr.id, pr.order_item_id, pr.rating, pr.comment, pr.edit_count, pr.created_at, pr.updated_at,
       rr.id AS admin_reply_id, rr.content AS admin_reply, rr.updated_at AS admin_replied_at,
       o.id AS order_id, o.created_at AS order_created_at,
       oi.product_id, oi.brand_name, oi.product_name, oi.model, oi.image_url, oi.options::text AS options,
       oi.unit_price_vnd, oi.quantity, oi.line_total_vnd
FROM product_reviews pr
JOIN order_items oi ON oi.id = pr.order_item_id
JOIN orders o ON o.id = oi.order_id
LEFT JOIN review_replies rr ON rr.review_id = pr.id
WHERE o.user_id = @user_id
  AND (@rating_filter::smallint = 0 OR pr.rating = @rating_filter::smallint)
ORDER BY pr.created_at DESC, pr.id DESC
LIMIT @limit_count OFFSET @offset_count;

-- name: CountAdminReviews :one
SELECT COUNT(*)::bigint
FROM product_reviews pr
LEFT JOIN review_replies rr ON rr.review_id = pr.id
WHERE (@rating_filter::smallint = 0 OR pr.rating = @rating_filter::smallint)
  AND (@has_reply_filter::text = '' 
       OR (@has_reply_filter::text = 'yes' AND rr.id IS NOT NULL)
       OR (@has_reply_filter::text = 'no' AND rr.id IS NULL));

-- name: ListAdminReviews :many
SELECT pr.id, pr.order_item_id, pr.rating, pr.comment, pr.edit_count, pr.created_at, pr.updated_at,
       rr.id AS admin_reply_id, rr.content AS admin_reply, rr.updated_at AS admin_replied_at,
       u.email AS reviewer_email,
       oi.product_id, oi.brand_name, oi.product_name, oi.model, oi.image_url, oi.options::text AS options
FROM product_reviews pr
JOIN order_items oi ON oi.id = pr.order_item_id
JOIN orders o ON o.id = oi.order_id
JOIN users u ON u.id = o.user_id
LEFT JOIN review_replies rr ON rr.review_id = pr.id
WHERE (@rating_filter::smallint = 0 OR pr.rating = @rating_filter::smallint)
  AND (@has_reply_filter::text = '' 
       OR (@has_reply_filter::text = 'yes' AND rr.id IS NOT NULL)
       OR (@has_reply_filter::text = 'no' AND rr.id IS NULL))
ORDER BY pr.created_at DESC, pr.id DESC
LIMIT @limit_count OFFSET @offset_count;

-- name: GetReviewReplyByReviewID :one
SELECT id, review_id, content, created_at, updated_at
FROM review_replies
WHERE review_id = $1;

-- name: LockReviewReplyByReviewID :one
SELECT id, review_id, content, created_at, updated_at
FROM review_replies
WHERE review_id = $1
FOR UPDATE;

-- name: LockReviewReplyByID :one
SELECT id, review_id, content, created_at, updated_at
FROM review_replies
WHERE id = $1
FOR UPDATE;

-- name: InsertReviewReply :one
INSERT INTO review_replies (
    review_id, content
)
VALUES (
    $1, $2
)
RETURNING id, review_id, content, created_at, updated_at;

-- name: UpdateReviewReply :one
UPDATE review_replies
SET content = $2,
    updated_at = now()
WHERE id = $1
RETURNING id, review_id, content, created_at, updated_at;

-- name: DeleteReviewReply :exec
DELETE FROM review_replies
WHERE id = $1;

-- name: DeleteReviewReplyByReviewID :exec
DELETE FROM review_replies
WHERE review_id = $1;

-- name: GetReviewHelpfulnessCountsByReviewIDs :many
SELECT review_id,
       COUNT(*) FILTER (WHERE vote = 'helpful')::bigint AS helpful_count,
       COUNT(*) FILTER (WHERE vote = 'unhelpful')::bigint AS unhelpful_count
FROM review_helpfulness_votes
WHERE review_id = ANY(@review_ids::uuid[])
GROUP BY review_id;

-- name: GetReviewReplyHelpfulnessCountsByReplyIDs :many
SELECT reply_id,
       COUNT(*) FILTER (WHERE vote = 'helpful')::bigint AS helpful_count,
       COUNT(*) FILTER (WHERE vote = 'unhelpful')::bigint AS unhelpful_count
FROM review_helpfulness_votes
WHERE reply_id = ANY(@reply_ids::uuid[])
GROUP BY reply_id;

-- name: GetUserReviewVotesByReviewIDs :many
SELECT review_id, vote
FROM review_helpfulness_votes
WHERE user_id = @user_id
  AND review_id = ANY(@review_ids::uuid[]);

-- name: GetUserReplyVotesByReplyIDs :many
SELECT reply_id, vote
FROM review_helpfulness_votes
WHERE user_id = @user_id
  AND reply_id = ANY(@reply_ids::uuid[]);

-- name: UpsertReviewVote :exec
INSERT INTO review_helpfulness_votes (
    user_id, review_id, vote
)
VALUES (
    $1, $2, $3
)
ON CONFLICT (user_id, review_id)
DO UPDATE SET
    vote = EXCLUDED.vote,
    updated_at = now();

-- name: DeleteReviewVote :exec
DELETE FROM review_helpfulness_votes
WHERE user_id = $1 AND review_id = $2;

-- name: GetReviewHelpfulnessCountsByID :one
SELECT COUNT(*) FILTER (WHERE vote = 'helpful')::bigint AS helpful_count,
       COUNT(*) FILTER (WHERE vote = 'unhelpful')::bigint AS unhelpful_count
FROM review_helpfulness_votes
WHERE review_id = $1;

-- name: UpsertReviewReplyVote :exec
INSERT INTO review_helpfulness_votes (
    user_id, reply_id, vote
)
VALUES (
    $1, $2, $3
)
ON CONFLICT (user_id, reply_id)
DO UPDATE SET
    vote = EXCLUDED.vote,
    updated_at = now();

-- name: DeleteReviewReplyVote :exec
DELETE FROM review_helpfulness_votes
WHERE user_id = $1 AND reply_id = $2;

-- name: GetReviewReplyHelpfulnessCountsByID :one
SELECT COUNT(*) FILTER (WHERE vote = 'helpful')::bigint AS helpful_count,
       COUNT(*) FILTER (WHERE vote = 'unhelpful')::bigint AS unhelpful_count
FROM review_helpfulness_votes
WHERE reply_id = $1;


