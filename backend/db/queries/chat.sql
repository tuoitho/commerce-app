-- name: GetConversationByID :one
SELECT id, user_id, customer_last_read_at, admin_last_read_at,
       customer_last_active_at, admin_last_active_at, last_message_at,
       created_at, updated_at
FROM chat_conversations
WHERE id = $1;

-- name: GetConversationByUserID :one
SELECT id, user_id, customer_last_read_at, admin_last_read_at,
       customer_last_active_at, admin_last_active_at, last_message_at,
       created_at, updated_at
FROM chat_conversations
WHERE user_id = $1;

-- name: CreateConversationForUser :one
INSERT INTO chat_conversations (
    user_id, customer_last_read_at, admin_last_read_at,
    customer_last_active_at, admin_last_active_at, last_message_at
)
VALUES (
    @user_id, now(), now(),
    now(), NULL, now()
)
ON CONFLICT (user_id) DO UPDATE
SET updated_at = now()
RETURNING id, user_id, customer_last_read_at, admin_last_read_at,
          customer_last_active_at, admin_last_active_at, last_message_at,
          created_at, updated_at;

-- name: ListAdminConversations :many
SELECT c.id, c.user_id, c.customer_last_read_at, c.admin_last_read_at,
       c.customer_last_active_at, c.admin_last_active_at, c.last_message_at,
       c.created_at, c.updated_at,
       u.email AS customer_email,
       (
           SELECT count(*)
           FROM chat_messages m
           WHERE m.conversation_id = c.id
             AND m.sender_role = 'customer'
             AND m.created_at > c.admin_last_read_at
       ) AS admin_unread_count
FROM chat_conversations c
JOIN users u ON u.id = c.user_id
WHERE (
      NOT sqlc.arg('unread_only')::boolean 
      OR (
          SELECT count(*)
          FROM chat_messages m
          WHERE m.conversation_id = c.id
            AND m.sender_role = 'customer'
            AND m.created_at > c.admin_last_read_at
      ) > 0
  )
ORDER BY c.last_message_at DESC
LIMIT sqlc.arg('limit_count')::int OFFSET sqlc.arg('offset_count')::int;

-- name: CountAdminConversations :one
SELECT count(*)
FROM chat_conversations c
WHERE (
      NOT sqlc.arg('unread_only')::boolean 
      OR (
          SELECT count(*)
          FROM chat_messages m
          WHERE m.conversation_id = c.id
            AND m.sender_role = 'customer'
            AND m.created_at > c.admin_last_read_at
      ) > 0
  );

-- name: InsertChatMessage :one
INSERT INTO chat_messages (
    conversation_id, sender_id, sender_role, message_type, order_id, content, created_at
)
VALUES (
    @conversation_id, @sender_id, @sender_role, @message_type, @order_id, @content, now()
)
RETURNING id, conversation_id, sender_id, sender_role, message_type, order_id, content, created_at;

-- name: ListRecentChatMessages :many
SELECT id, conversation_id, sender_id, sender_role, message_type, order_id, content, created_at
FROM (
    SELECT id, conversation_id, sender_id, sender_role, message_type, order_id, content, created_at
    FROM chat_messages
    WHERE conversation_id = $1
    ORDER BY created_at DESC
    LIMIT $2
) sub
ORDER BY created_at ASC;

-- name: ListChatMessagesBefore :many
SELECT id, conversation_id, sender_id, sender_role, message_type, order_id, content, created_at
FROM (
    SELECT id, conversation_id, sender_id, sender_role, message_type, order_id, content, created_at
    FROM chat_messages
    WHERE conversation_id = $1 AND created_at < $2
    ORDER BY created_at DESC
    LIMIT $3
) sub
ORDER BY created_at ASC;

-- name: CountChatMessagesBefore :one
SELECT count(*)
FROM chat_messages
WHERE conversation_id = $1 AND created_at < $2;

-- name: InsertChatMessageMedia :one
INSERT INTO chat_message_media (
    message_id, media_type, object_key, content_type, file_size, file_name, created_at
)
VALUES (
    @message_id, @media_type, @object_key, @content_type, @file_size, @file_name, now()
)
RETURNING id, message_id, media_type, object_key, content_type, file_size, file_name, created_at;

-- name: ListChatMessageMediaByMessageIDs :many
SELECT id, message_id, media_type, object_key, content_type, file_size, file_name, created_at
FROM chat_message_media
WHERE message_id = ANY(@message_ids::uuid[])
ORDER BY created_at ASC;

-- name: GetChatMessageMediaByID :one
SELECT id, message_id, media_type, object_key, content_type, file_size, file_name, created_at
FROM chat_message_media
WHERE id = $1;

-- name: UpdateCustomerLastRead :exec
UPDATE chat_conversations
SET customer_last_read_at = now(), updated_at = now()
WHERE id = $1;

-- name: UpdateAdminLastRead :exec
UPDATE chat_conversations
SET admin_last_read_at = now(), updated_at = now()
WHERE id = $1;

-- name: UpdateCustomerLastActive :exec
UPDATE chat_conversations
SET customer_last_active_at = now(), updated_at = now()
WHERE id = $1;

-- name: UpdateAdminLastActive :exec
UPDATE chat_conversations
SET admin_last_active_at = now(), updated_at = now()
WHERE id = $1;

-- name: UpdateConversationLastMessage :exec
UPDATE chat_conversations
SET last_message_at = now(), updated_at = now()
WHERE id = $1;

-- name: GetCustomerTotalUnreadCount :one
SELECT count(*)
FROM chat_messages m
JOIN chat_conversations c ON c.id = m.conversation_id
WHERE c.user_id = $1
  AND m.sender_role = 'admin'
  AND m.created_at > c.customer_last_read_at;

-- name: GetLastMessageByConversationID :one
SELECT id, conversation_id, sender_id, sender_role, message_type, order_id, content, created_at
FROM chat_messages
WHERE conversation_id = $1
ORDER BY created_at DESC
LIMIT 1;

-- name: GetOrderSummaryByID :one
SELECT o.id, o.status, o.total_vnd::bigint AS total_vnd, o.recipient_name, o.created_at,
       (SELECT count(*) FROM order_items oi WHERE oi.order_id = o.id)::bigint AS item_count,
       COALESCE((
           SELECT oi.product_name 
           FROM order_items oi 
           WHERE oi.order_id = o.id 
           LIMIT 1
       ), '')::text AS first_item_name
FROM orders o
WHERE o.id = $1;

-- name: CheckOrderOwnership :one
SELECT user_id
FROM orders
WHERE id = $1;
