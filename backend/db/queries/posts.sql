-- ============================================================================
-- POSTS QUERIES
-- ============================================================================

-- name: CreatePost :one
INSERT INTO posts (
    author_id,
    content
) VALUES (
    @author_id,
    @content
)
RETURNING id, author_id, content, created_at, updated_at;

-- name: GetPostByID :one
SELECT p.id,
       p.author_id,
       p.content,
       p.created_at,
       p.updated_at,
       u.email AS author_email,
       u.role AS author_role,
       (CASE
           WHEN u.role = 'admin' THEN 'Quản trị viên'
           ELSE COALESCE(
               NULLIF(TRIM((SELECT o.recipient_name FROM orders o WHERE o.user_id = u.id ORDER BY o.created_at DESC LIMIT 1)), ''),
               NULLIF(TRIM((SELECT a.recipient_name FROM addresses a WHERE a.user_id = u.id AND a.is_default LIMIT 1)), ''),
               NULLIF(TRIM(split_part(u.email::text, '@', 1)), ''),
               'Khách hàng'
           )
       END)::text AS author_name,
       (SELECT COUNT(*)::bigint FROM post_comments pc WHERE pc.post_id = p.id) AS comment_count
FROM posts p
JOIN users u ON u.id = p.author_id
WHERE p.id = @id;

-- name: GetPostByIDForUpdate :one
SELECT id, author_id, content, created_at, updated_at
FROM posts
WHERE id = @id
FOR UPDATE;

-- name: UpdatePost :one
UPDATE posts
SET content = @content,
    updated_at = now()
WHERE id = @id
RETURNING id, author_id, content, created_at, updated_at;

-- name: DeletePost :exec
DELETE FROM posts
WHERE id = @id;

-- name: ListPosts :many
SELECT p.id,
       p.author_id,
       p.content,
       p.created_at,
       p.updated_at,
       u.email AS author_email,
       u.role AS author_role,
       (CASE
           WHEN u.role = 'admin' THEN 'Quản trị viên'
           ELSE COALESCE(
               NULLIF(TRIM((SELECT o.recipient_name FROM orders o WHERE o.user_id = u.id ORDER BY o.created_at DESC LIMIT 1)), ''),
               NULLIF(TRIM((SELECT a.recipient_name FROM addresses a WHERE a.user_id = u.id AND a.is_default LIMIT 1)), ''),
               NULLIF(TRIM(split_part(u.email::text, '@', 1)), ''),
               'Khách hàng'
           )
       END)::text AS author_name,
       (SELECT COUNT(*)::bigint FROM post_comments pc WHERE pc.post_id = p.id) AS comment_count
FROM posts p
JOIN users u ON u.id = p.author_id
ORDER BY p.created_at DESC, p.id DESC
LIMIT @query_limit OFFSET @query_offset;

-- name: CountPosts :one
SELECT count(*)::bigint FROM posts;

-- ============================================================================
-- POST MEDIA QUERIES
-- ============================================================================

-- name: CreatePostMedia :one
INSERT INTO post_media (
    post_id,
    uploader_id,
    object_key,
    file_type,
    file_name,
    file_size,
    mime_type,
    position
) VALUES (
    @post_id,
    @uploader_id,
    @object_key,
    @file_type,
    @file_name,
    @file_size,
    @mime_type,
    @position
)
RETURNING id, post_id, uploader_id, object_key, file_type, file_name, file_size, mime_type, position, created_at;

-- name: GetPostMediaByID :one
SELECT id, post_id, uploader_id, object_key, file_type, file_name, file_size, mime_type, position, created_at
FROM post_media
WHERE id = @id;

-- name: ListPostMediaByIDs :many
SELECT id, post_id, uploader_id, object_key, file_type, file_name, file_size, mime_type, position, created_at
FROM post_media
WHERE id = ANY(@ids::uuid[]);

-- name: ListMediaByPostID :many
SELECT id, post_id, uploader_id, object_key, file_type, file_name, file_size, mime_type, position, created_at
FROM post_media
WHERE post_id = @post_id
ORDER BY position ASC, created_at ASC;

-- name: ListMediaByPostIDs :many
SELECT id, post_id, uploader_id, object_key, file_type, file_name, file_size, mime_type, position, created_at
FROM post_media
WHERE post_id = ANY(@post_ids::uuid[])
ORDER BY post_id, position ASC, created_at ASC;

-- name: AttachMediaToPost :exec
UPDATE post_media
SET post_id = @post_id,
    position = @position
WHERE id = @id;

-- name: DetachMediaFromPostExcept :many
DELETE FROM post_media
WHERE post_id = @post_id AND NOT (id = ANY(@keep_ids::uuid[]))
RETURNING object_key;

-- name: DeletePostMediaByID :one
DELETE FROM post_media
WHERE id = @id
RETURNING object_key;

-- name: DeletePostMediaByPostID :many
DELETE FROM post_media
WHERE post_id = @post_id
RETURNING object_key;

-- ============================================================================
-- POST REFERRED PRODUCTS QUERIES
-- ============================================================================

-- name: InsertPostReferredProduct :exec
INSERT INTO post_referred_products (
    post_id,
    product_id,
    position
) VALUES (
    @post_id,
    @product_id,
    @position
)
ON CONFLICT (post_id, product_id) DO UPDATE
SET position = EXCLUDED.position;

-- name: DeletePostReferredProducts :exec
DELETE FROM post_referred_products
WHERE post_id = @post_id;

-- name: CountActiveProductsByIDs :one
SELECT count(*)::bigint
FROM products p
JOIN categories c ON c.id = p.category_id
WHERE p.id = ANY(@product_ids::uuid[])
  AND p.active
  AND EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.active);

-- name: ListReferredProductsByPostID :many
SELECT prp.post_id,
       prp.position,
       p.id AS product_id,
       p.name AS product_name,
       p.brand AS product_brand,
       COALESCE(
           (SELECT v.price_vnd::text FROM product_variants v WHERE v.product_id = p.id AND v.active ORDER BY v.price_vnd ASC LIMIT 1),
           p.price::text
       )::text AS price,
       p.currency,
       COALESCE(
           (SELECT pi.url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.position ASC, pi.id ASC LIMIT 1),
           ''
       )::text AS image_url,
       COALESCE(
           (SELECT bool_or(v.active AND v.stock_quantity > 0) FROM product_variants v WHERE v.product_id = p.id),
           p.stock_quantity > 0
       )::boolean AS in_stock,
       p.active
FROM post_referred_products prp
JOIN products p ON prp.product_id = p.id
WHERE prp.post_id = @post_id
ORDER BY prp.position ASC;

-- name: ListReferredProductsByPostIDs :many
SELECT prp.post_id,
       prp.position,
       p.id AS product_id,
       p.name AS product_name,
       p.brand AS product_brand,
       COALESCE(
           (SELECT v.price_vnd::text FROM product_variants v WHERE v.product_id = p.id AND v.active ORDER BY v.price_vnd ASC LIMIT 1),
           p.price::text
       )::text AS price,
       p.currency,
       COALESCE(
           (SELECT pi.url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.position ASC, pi.id ASC LIMIT 1),
           ''
       )::text AS image_url,
       COALESCE(
           (SELECT bool_or(v.active AND v.stock_quantity > 0) FROM product_variants v WHERE v.product_id = p.id),
           p.stock_quantity > 0
       )::boolean AS in_stock,
       p.active
FROM post_referred_products prp
JOIN products p ON prp.product_id = p.id
WHERE prp.post_id = ANY(@post_ids::uuid[])
ORDER BY prp.post_id, prp.position ASC;

-- ============================================================================
-- POST REACTIONS QUERIES
-- ============================================================================

-- name: UpsertPostReaction :one
INSERT INTO post_reactions (
    post_id,
    user_id,
    reaction_type,
    updated_at
) VALUES (
    @post_id,
    @user_id,
    @reaction_type,
    now()
)
ON CONFLICT (post_id, user_id) DO UPDATE
SET reaction_type = EXCLUDED.reaction_type,
    updated_at = now()
RETURNING id, post_id, user_id, reaction_type, created_at, updated_at;

-- name: DeletePostReaction :exec
DELETE FROM post_reactions
WHERE post_id = @post_id AND user_id = @user_id;

-- name: GetPostReactionCounts :many
SELECT reaction_type, count(*)::bigint AS count
FROM post_reactions
WHERE post_id = @post_id
GROUP BY reaction_type;

-- name: GetBatchPostReactionCounts :many
SELECT post_id, reaction_type, count(*)::bigint AS count
FROM post_reactions
WHERE post_id = ANY(@post_ids::uuid[])
GROUP BY post_id, reaction_type;

-- name: GetUserPostReaction :one
SELECT reaction_type
FROM post_reactions
WHERE post_id = @post_id AND user_id = @user_id;

-- name: GetBatchUserPostReactions :many
SELECT post_id, reaction_type
FROM post_reactions
WHERE post_id = ANY(@post_ids::uuid[]) AND user_id = @user_id;

-- ============================================================================
-- POST COMMENTS QUERIES
-- ============================================================================

-- name: CreatePostComment :one
INSERT INTO post_comments (
    post_id,
    author_id,
    parent_id,
    reply_to_user_id,
    content
) VALUES (
    @post_id,
    @author_id,
    @parent_id,
    @reply_to_user_id,
    @content
)
RETURNING id, post_id, author_id, parent_id, reply_to_user_id, content, created_at, updated_at;

-- name: GetPostCommentByID :one
SELECT c.id,
       c.post_id,
       c.author_id,
       c.parent_id,
       c.reply_to_user_id,
       c.content,
       c.created_at,
       c.updated_at,
       u.email AS author_email,
       u.role AS author_role,
       (CASE
           WHEN u.role = 'admin' THEN 'Quản trị viên'
           ELSE COALESCE(
               NULLIF(TRIM((SELECT o.recipient_name FROM orders o WHERE o.user_id = u.id ORDER BY o.created_at DESC LIMIT 1)), ''),
               NULLIF(TRIM((SELECT a.recipient_name FROM addresses a WHERE a.user_id = u.id AND a.is_default LIMIT 1)), ''),
               NULLIF(TRIM(split_part(u.email::text, '@', 1)), ''),
               'Khách hàng'
           )
       END)::text AS author_name,
       ru.email AS reply_to_user_email,
       ru.role AS reply_to_user_role,
       COALESCE((CASE
           WHEN ru.id IS NULL THEN ''
           WHEN ru.role = 'admin' THEN 'Quản trị viên'
           ELSE COALESCE(
               NULLIF(TRIM((SELECT o.recipient_name FROM orders o WHERE o.user_id = ru.id ORDER BY o.created_at DESC LIMIT 1)), ''),
               NULLIF(TRIM((SELECT a.recipient_name FROM addresses a WHERE a.user_id = ru.id AND a.is_default LIMIT 1)), ''),
               NULLIF(TRIM(split_part(ru.email::text, '@', 1)), ''),
               'Khách hàng'
           )
       END)::text, '')::text AS reply_to_user_name
FROM post_comments c
JOIN users u ON u.id = c.author_id
LEFT JOIN users ru ON ru.id = c.reply_to_user_id
WHERE c.id = @id;

-- name: GetPostCommentByIDForUpdate :one
SELECT id, post_id, author_id, parent_id, reply_to_user_id, content, created_at, updated_at
FROM post_comments
WHERE id = @id
FOR UPDATE;

-- name: DeletePostComment :exec
DELETE FROM post_comments
WHERE id = @id;

-- name: ListCommentsByPostID :many
SELECT c.id,
       c.post_id,
       c.author_id,
       c.parent_id,
       c.reply_to_user_id,
       c.content,
       c.created_at,
       c.updated_at,
       u.email AS author_email,
       u.role AS author_role,
       (CASE
           WHEN u.role = 'admin' THEN 'Quản trị viên'
           ELSE COALESCE(
               NULLIF(TRIM((SELECT o.recipient_name FROM orders o WHERE o.user_id = u.id ORDER BY o.created_at DESC LIMIT 1)), ''),
               NULLIF(TRIM((SELECT a.recipient_name FROM addresses a WHERE a.user_id = u.id AND a.is_default LIMIT 1)), ''),
               NULLIF(TRIM(split_part(u.email::text, '@', 1)), ''),
               'Khách hàng'
           )
       END)::text AS author_name,
       ru.email AS reply_to_user_email,
       ru.role AS reply_to_user_role,
       COALESCE((CASE
           WHEN ru.id IS NULL THEN ''
           WHEN ru.role = 'admin' THEN 'Quản trị viên'
           ELSE COALESCE(
               NULLIF(TRIM((SELECT o.recipient_name FROM orders o WHERE o.user_id = ru.id ORDER BY o.created_at DESC LIMIT 1)), ''),
               NULLIF(TRIM((SELECT a.recipient_name FROM addresses a WHERE a.user_id = ru.id AND a.is_default LIMIT 1)), ''),
               NULLIF(TRIM(split_part(ru.email::text, '@', 1)), ''),
               'Khách hàng'
           )
       END)::text, '')::text AS reply_to_user_name
FROM post_comments c
JOIN users u ON u.id = c.author_id
LEFT JOIN users ru ON ru.id = c.reply_to_user_id
WHERE c.post_id = @post_id
ORDER BY c.created_at ASC, c.id ASC;

-- name: CountCommentsByPostID :one
SELECT count(*)::bigint
FROM post_comments
WHERE post_id = @post_id;

-- ============================================================================
-- POST COMMENT REACTIONS QUERIES
-- ============================================================================

-- name: UpsertCommentReaction :one
INSERT INTO post_comment_reactions (
    comment_id,
    user_id,
    reaction_type,
    updated_at
) VALUES (
    @comment_id,
    @user_id,
    @reaction_type,
    now()
)
ON CONFLICT (comment_id, user_id) DO UPDATE
SET reaction_type = EXCLUDED.reaction_type,
    updated_at = now()
RETURNING id, comment_id, user_id, reaction_type, created_at, updated_at;

-- name: DeleteCommentReaction :exec
DELETE FROM post_comment_reactions
WHERE comment_id = @comment_id AND user_id = @user_id;

-- name: GetCommentReactionCounts :many
SELECT reaction_type, count(*)::bigint AS count
FROM post_comment_reactions
WHERE comment_id = @comment_id
GROUP BY reaction_type;

-- name: GetBatchCommentReactionCounts :many
SELECT comment_id, reaction_type, count(*)::bigint AS count
FROM post_comment_reactions
WHERE comment_id = ANY(@comment_ids::uuid[])
GROUP BY comment_id, reaction_type;

-- name: GetUserCommentReaction :one
SELECT reaction_type
FROM post_comment_reactions
WHERE comment_id = @comment_id AND user_id = @user_id;

-- name: GetBatchUserCommentReactions :many
SELECT comment_id, reaction_type
FROM post_comment_reactions
WHERE comment_id = ANY(@comment_ids::uuid[]) AND user_id = @user_id;

-- ============================================================================
-- NOTIFICATIONS QUERIES
-- ============================================================================

-- name: CreateNotification :one
INSERT INTO notifications (
    recipient_id,
    actor_id,
    group_key,
    actor_count,
    category,
    notification_type,
    post_id,
    comment_id,
    reaction_type,
    excerpt,
    metadata,
    updated_at
) VALUES (
    @recipient_id,
    @actor_id,
    @group_key,
    @actor_count,
    @category,
    @notification_type,
    @post_id,
    @comment_id,
    @reaction_type,
    @excerpt,
    @metadata,
    now()
)
RETURNING id, recipient_id, actor_id, group_key, actor_count, category, notification_type, post_id, comment_id, reaction_type, excerpt, metadata, is_read, created_at, updated_at;

-- name: UpsertUnreadNotification :one
INSERT INTO notifications (
    recipient_id,
    actor_id,
    group_key,
    actor_count,
    category,
    notification_type,
    post_id,
    comment_id,
    reaction_type,
    excerpt,
    metadata,
    updated_at
) VALUES (
    @recipient_id,
    @actor_id,
    @group_key,
    @actor_count,
    @category,
    @notification_type,
    @post_id,
    @comment_id,
    @reaction_type,
    @excerpt,
    @metadata,
    now()
)
ON CONFLICT (recipient_id, group_key) WHERE is_read = false AND group_key <> ''
DO UPDATE SET
    actor_id = EXCLUDED.actor_id,
    actor_count = EXCLUDED.actor_count,
    notification_type = EXCLUDED.notification_type,
    post_id = EXCLUDED.post_id,
    comment_id = EXCLUDED.comment_id,
    reaction_type = EXCLUDED.reaction_type,
    excerpt = EXCLUDED.excerpt,
    metadata = EXCLUDED.metadata,
    updated_at = now()
RETURNING id, recipient_id, actor_id, group_key, actor_count, category, notification_type, post_id, comment_id, reaction_type, excerpt, metadata, is_read, created_at, updated_at;

-- name: GetUnreadNotificationByGroupKey :one
SELECT id, recipient_id, actor_id, group_key, actor_count, category, notification_type, post_id, comment_id, reaction_type, excerpt, metadata, is_read, created_at, updated_at
FROM notifications
WHERE recipient_id = @recipient_id AND group_key = @group_key AND is_read = false AND group_key <> '';

-- name: GetUnreadNotificationByGroupKeyForUpdate :one
SELECT id, recipient_id, actor_id, group_key, actor_count, category, notification_type, post_id, comment_id, reaction_type, excerpt, metadata, is_read, created_at, updated_at
FROM notifications
WHERE recipient_id = @recipient_id AND group_key = @group_key AND is_read = false AND group_key <> ''
FOR UPDATE;

-- name: UpdateUnreadNotificationRollup :one
UPDATE notifications
SET actor_id = @actor_id,
    actor_count = @actor_count,
    notification_type = @notification_type,
    post_id = @post_id,
    comment_id = @comment_id,
    reaction_type = @reaction_type,
    excerpt = @excerpt,
    metadata = @metadata,
    updated_at = now()
WHERE id = @id
RETURNING id, recipient_id, actor_id, group_key, actor_count, category, notification_type, post_id, comment_id, reaction_type, excerpt, metadata, is_read, created_at, updated_at;

-- name: DeleteUnreadNotificationByGroupKey :exec
DELETE FROM notifications
WHERE recipient_id = @recipient_id AND group_key = @group_key AND is_read = false AND group_key <> '';

-- name: GetNotificationByID :one
SELECT n.id,
       n.recipient_id,
       n.actor_id,
       n.group_key,
       n.actor_count,
       n.category,
       n.notification_type,
       n.post_id,
       n.comment_id,
       n.reaction_type,
       n.excerpt,
       n.metadata,
       n.is_read,
       n.created_at,
       n.updated_at,
       u.email AS actor_email,
       u.role AS actor_role,
       COALESCE((CASE
           WHEN u.id IS NULL THEN ''
           WHEN u.role = 'admin' THEN 'Quản trị viên'
           ELSE COALESCE(
               NULLIF(TRIM((SELECT o.recipient_name FROM orders o WHERE o.user_id = u.id ORDER BY o.created_at DESC LIMIT 1)), ''),
               NULLIF(TRIM((SELECT a.recipient_name FROM addresses a WHERE a.user_id = u.id AND a.is_default LIMIT 1)), ''),
               NULLIF(TRIM(split_part(u.email::text, '@', 1)), ''),
               'Khách hàng'
           )
       END)::text, '')::text AS actor_name
FROM notifications n
LEFT JOIN users u ON u.id = n.actor_id
WHERE n.id = @id;

-- name: ListNotificationsByRecipient :many
SELECT n.id,
       n.recipient_id,
       n.actor_id,
       n.group_key,
       n.actor_count,
       n.category,
       n.notification_type,
       n.post_id,
       n.comment_id,
       n.reaction_type,
       n.excerpt,
       n.metadata,
       n.is_read,
       n.created_at,
       n.updated_at,
       u.email AS actor_email,
       u.role AS actor_role,
       COALESCE((CASE
           WHEN u.id IS NULL THEN ''
           WHEN u.role = 'admin' THEN 'Quản trị viên'
           ELSE COALESCE(
               NULLIF(TRIM((SELECT o.recipient_name FROM orders o WHERE o.user_id = u.id ORDER BY o.created_at DESC LIMIT 1)), ''),
               NULLIF(TRIM((SELECT a.recipient_name FROM addresses a WHERE a.user_id = u.id AND a.is_default LIMIT 1)), ''),
               NULLIF(TRIM(split_part(u.email::text, '@', 1)), ''),
               'Khách hàng'
           )
       END)::text, '')::text AS actor_name
FROM notifications n
LEFT JOIN users u ON u.id = n.actor_id
WHERE n.recipient_id = @recipient_id
ORDER BY n.updated_at DESC, n.id DESC
LIMIT @query_limit OFFSET @query_offset;

-- name: CountUnreadNotifications :one
SELECT count(*)::bigint
FROM notifications
WHERE recipient_id = @recipient_id AND is_read = false;

-- name: MarkNotificationAsRead :one
UPDATE notifications
SET is_read = true
WHERE id = @id AND recipient_id = @recipient_id
RETURNING id, recipient_id, actor_id, group_key, actor_count, category, notification_type, post_id, comment_id, reaction_type, excerpt, metadata, is_read, created_at, updated_at;

-- name: MarkAllNotificationsAsRead :exec
UPDATE notifications
SET is_read = true
WHERE recipient_id = @recipient_id AND is_read = false;

-- name: GetDistinctPostReactionActors :many
SELECT r.user_id,
       r.reaction_type,
       r.updated_at,
       u.email,
       u.role,
       (CASE
           WHEN u.role = 'admin' THEN 'Quản trị viên'
           ELSE COALESCE(
               NULLIF(TRIM((SELECT o.recipient_name FROM orders o WHERE o.user_id = u.id ORDER BY o.created_at DESC LIMIT 1)), ''),
               NULLIF(TRIM((SELECT a.recipient_name FROM addresses a WHERE a.user_id = u.id AND a.is_default LIMIT 1)), ''),
               NULLIF(TRIM(split_part(u.email::text, '@', 1)), ''),
               'Khách hàng'
           )
       END)::text AS display_name
FROM post_reactions r
JOIN users u ON u.id = r.user_id
WHERE r.post_id = @post_id AND r.user_id <> @recipient_id
ORDER BY r.updated_at DESC, r.created_at DESC, r.id DESC;

-- name: GetDistinctCommentReactionActors :many
SELECT r.user_id,
       r.reaction_type,
       r.updated_at,
       u.email,
       u.role,
       (CASE
           WHEN u.role = 'admin' THEN 'Quản trị viên'
           ELSE COALESCE(
               NULLIF(TRIM((SELECT o.recipient_name FROM orders o WHERE o.user_id = u.id ORDER BY o.created_at DESC LIMIT 1)), ''),
               NULLIF(TRIM((SELECT a.recipient_name FROM addresses a WHERE a.user_id = u.id AND a.is_default LIMIT 1)), ''),
               NULLIF(TRIM(split_part(u.email::text, '@', 1)), ''),
               'Khách hàng'
           )
       END)::text AS display_name
FROM post_comment_reactions r
JOIN users u ON u.id = r.user_id
WHERE r.comment_id = @comment_id AND r.user_id <> @recipient_id
ORDER BY r.updated_at DESC, r.created_at DESC, r.id DESC;

-- name: GetUserDisplayNames :many
SELECT u.id,
       u.email,
       u.role,
       (CASE
           WHEN u.role = 'admin' THEN 'Quản trị viên'
           ELSE COALESCE(
               NULLIF(TRIM((SELECT o.recipient_name FROM orders o WHERE o.user_id = u.id ORDER BY o.created_at DESC LIMIT 1)), ''),
               NULLIF(TRIM((SELECT a.recipient_name FROM addresses a WHERE a.user_id = u.id AND a.is_default LIMIT 1)), ''),
               NULLIF(TRIM(split_part(u.email::text, '@', 1)), ''),
               'Khách hàng'
           )
       END)::text AS display_name
FROM users u
WHERE u.id = ANY(@user_ids::uuid[]);
