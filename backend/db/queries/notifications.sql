-- name: ListNotificationsByRecipientFiltered :many
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
               NULLIF(TRIM(u.display_name), ''),
               NULLIF(TRIM((SELECT o.recipient_name FROM orders o WHERE o.user_id = u.id ORDER BY o.created_at DESC LIMIT 1)), ''),
               NULLIF(TRIM((SELECT a.recipient_name FROM addresses a WHERE a.user_id = u.id AND a.is_default LIMIT 1)), ''),
               NULLIF(TRIM(split_part(u.email::text, '@', 1)), ''),
               'Khách hàng'
           )
       END)::text, '')::text AS actor_name
FROM notifications n
LEFT JOIN users u ON u.id = n.actor_id
WHERE n.recipient_id = @recipient_id
  AND (@category::text = '' OR n.category = @category::text)
ORDER BY n.updated_at DESC, n.id DESC
LIMIT @query_limit OFFSET @query_offset;

-- name: ListActiveAdminIDs :many
SELECT id
FROM users
WHERE role = 'admin' AND status = 'active'
ORDER BY created_at ASC, id ASC;

-- name: BatchCreateCustomerLiveNotifications :many
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
)
SELECT u.id,
       NULL::uuid,
       '',
       1,
       'live',
       'livestream_started',
       NULL::uuid,
       NULL::uuid,
       NULL::text,
       @excerpt,
       @metadata::jsonb,
       now()
FROM users u
WHERE u.role = 'customer' AND u.status = 'active'
RETURNING id, recipient_id, actor_id, group_key, actor_count, category, notification_type, post_id, comment_id, reaction_type, excerpt, metadata, is_read, created_at, updated_at;

-- name: GetReviewNotificationContext :one
SELECT pr.id AS review_id,
       o.user_id AS customer_id,
       o.id AS order_id,
       oi.product_id,
       oi.product_name
FROM product_reviews pr
JOIN order_items oi ON oi.id = pr.order_item_id
JOIN orders o ON o.id = oi.order_id
WHERE pr.id = @review_id;
