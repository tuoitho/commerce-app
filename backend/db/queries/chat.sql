-- name: CreateConversation :one
INSERT INTO conversations (
    user_id
)
VALUES (
    @user_id
)
ON CONFLICT (user_id) DO UPDATE
SET updated_at = conversations.updated_at
RETURNING id, user_id, last_message_at, customer_last_read_at, admin_last_read_at, created_at, updated_at;

-- name: GetConversationByID :one
SELECT c.id, c.user_id, c.last_message_at, c.customer_last_read_at, c.admin_last_read_at, c.created_at, c.updated_at,
       u.email::text AS customer_email,
       u.last_active_at AS customer_last_active,
       COALESCE(
           NULLIF(TRIM((SELECT o.recipient_name FROM orders o WHERE o.user_id = u.id ORDER BY o.created_at DESC LIMIT 1)), ''),
           NULLIF(TRIM((SELECT a.recipient_name FROM addresses a WHERE a.user_id = u.id AND a.is_default LIMIT 1)), ''),
           NULLIF(TRIM((SELECT a.recipient_name FROM addresses a WHERE a.user_id = u.id ORDER BY a.created_at DESC LIMIT 1)), ''),
           NULLIF(TRIM(split_part(u.email::text, '@', 1)), ''),
           'Khách hàng'
       )::text AS customer_name,
       COALESCE(
           (
               SELECT CASE
                   WHEN cm.content <> '' THEN cm.content
                   WHEN cm.attached_order_id IS NOT NULL THEN '[Đơn hàng]'
                   WHEN EXISTS (SELECT 1 FROM chat_attachments ca WHERE ca.message_id = cm.id AND ca.file_type = 'image') THEN '[Hình ảnh]'
                   WHEN EXISTS (SELECT 1 FROM chat_attachments ca WHERE ca.message_id = cm.id AND ca.file_type = 'video') THEN '[Video]'
                   ELSE ''
               END
               FROM chat_messages cm
               WHERE cm.conversation_id = c.id
               ORDER BY cm.created_at DESC
               LIMIT 1
           ),
           ''
       )::text AS last_message_snippet,
       (
           SELECT COUNT(*)::bigint
           FROM chat_messages cm
           WHERE cm.conversation_id = c.id
             AND cm.sender_role = 'customer'
             AND cm.created_at > c.admin_last_read_at
       ) AS unread_count_admin,
       (
           SELECT COUNT(*)::bigint
           FROM chat_messages cm
           WHERE cm.conversation_id = c.id
             AND cm.sender_role = 'admin'
             AND cm.created_at > c.customer_last_read_at
       ) AS unread_count_customer
FROM conversations c
JOIN users u ON u.id = c.user_id
WHERE c.id = @id;

-- name: GetConversationByUserID :one
SELECT c.id, c.user_id, c.last_message_at, c.customer_last_read_at, c.admin_last_read_at, c.created_at, c.updated_at,
       u.email::text AS customer_email,
       u.last_active_at AS customer_last_active,
       COALESCE(
           NULLIF(TRIM((SELECT o.recipient_name FROM orders o WHERE o.user_id = u.id ORDER BY o.created_at DESC LIMIT 1)), ''),
           NULLIF(TRIM((SELECT a.recipient_name FROM addresses a WHERE a.user_id = u.id AND a.is_default LIMIT 1)), ''),
           NULLIF(TRIM((SELECT a.recipient_name FROM addresses a WHERE a.user_id = u.id ORDER BY a.created_at DESC LIMIT 1)), ''),
           NULLIF(TRIM(split_part(u.email::text, '@', 1)), ''),
           'Khách hàng'
       )::text AS customer_name,
       COALESCE(
           (
               SELECT CASE
                   WHEN cm.content <> '' THEN cm.content
                   WHEN cm.attached_order_id IS NOT NULL THEN '[Đơn hàng]'
                   WHEN EXISTS (SELECT 1 FROM chat_attachments ca WHERE ca.message_id = cm.id AND ca.file_type = 'image') THEN '[Hình ảnh]'
                   WHEN EXISTS (SELECT 1 FROM chat_attachments ca WHERE ca.message_id = cm.id AND ca.file_type = 'video') THEN '[Video]'
                   ELSE ''
               END
               FROM chat_messages cm
               WHERE cm.conversation_id = c.id
               ORDER BY cm.created_at DESC
               LIMIT 1
           ),
           ''
       )::text AS last_message_snippet,
       (
           SELECT COUNT(*)::bigint
           FROM chat_messages cm
           WHERE cm.conversation_id = c.id
             AND cm.sender_role = 'admin'
             AND cm.created_at > c.customer_last_read_at
       ) AS unread_count_customer,
       (
           SELECT COUNT(*)::bigint
           FROM chat_messages cm
           WHERE cm.conversation_id = c.id
             AND cm.sender_role = 'customer'
             AND cm.created_at > c.admin_last_read_at
       ) AS unread_count_admin
FROM conversations c
JOIN users u ON u.id = c.user_id
WHERE c.user_id = @user_id;

-- name: ListConversationsForAdmin :many
SELECT c.id, c.user_id, c.last_message_at, c.customer_last_read_at, c.admin_last_read_at, c.created_at, c.updated_at,
       u.email::text AS customer_email,
       u.last_active_at AS customer_last_active,
       COALESCE(
           NULLIF(TRIM((SELECT o.recipient_name FROM orders o WHERE o.user_id = u.id ORDER BY o.created_at DESC LIMIT 1)), ''),
           NULLIF(TRIM((SELECT a.recipient_name FROM addresses a WHERE a.user_id = u.id AND a.is_default LIMIT 1)), ''),
           NULLIF(TRIM((SELECT a.recipient_name FROM addresses a WHERE a.user_id = u.id ORDER BY a.created_at DESC LIMIT 1)), ''),
           NULLIF(TRIM(split_part(u.email::text, '@', 1)), ''),
           'Khách hàng'
       )::text AS customer_name,
       COALESCE(
           (
               SELECT CASE
                   WHEN cm.content <> '' THEN cm.content
                   WHEN cm.attached_order_id IS NOT NULL THEN '[Đơn hàng]'
                   WHEN EXISTS (SELECT 1 FROM chat_attachments ca WHERE ca.message_id = cm.id AND ca.file_type = 'image') THEN '[Hình ảnh]'
                   WHEN EXISTS (SELECT 1 FROM chat_attachments ca WHERE ca.message_id = cm.id AND ca.file_type = 'video') THEN '[Video]'
                   ELSE ''
               END
               FROM chat_messages cm
               WHERE cm.conversation_id = c.id
               ORDER BY cm.created_at DESC
               LIMIT 1
           ),
           ''
       )::text AS last_message_snippet,
       (
           SELECT COUNT(*)::bigint
           FROM chat_messages cm
           WHERE cm.conversation_id = c.id
             AND cm.sender_role = 'customer'
             AND cm.created_at > c.admin_last_read_at
       ) AS unread_count
FROM conversations c
JOIN users u ON u.id = c.user_id
WHERE (
    @status::text = 'all' OR
    @status::text = '' OR
    (@status::text = 'unread' AND EXISTS (
        SELECT 1 FROM chat_messages cm
        WHERE cm.conversation_id = c.id
          AND cm.sender_role = 'customer'
          AND cm.created_at > c.admin_last_read_at
    ))
)
AND (
    @search::text = '' OR
    u.email::text ILIKE '%' || @search::text || '%' OR
    EXISTS (
        SELECT 1 FROM orders o
        WHERE o.user_id = c.user_id AND o.id::text ILIKE '%' || @search::text || '%'
    ) OR
    EXISTS (
        SELECT 1 FROM chat_messages cm
        WHERE cm.conversation_id = c.id AND cm.attached_order_id::text ILIKE '%' || @search::text || '%'
    )
)
ORDER BY c.last_message_at DESC
LIMIT @limit_count OFFSET @offset_count;

-- name: CountConversationsForAdmin :one
SELECT COUNT(*)::bigint
FROM conversations c
JOIN users u ON u.id = c.user_id
WHERE (
    @status::text = 'all' OR
    @status::text = '' OR
    (@status::text = 'unread' AND EXISTS (
        SELECT 1 FROM chat_messages cm
        WHERE cm.conversation_id = c.id
          AND cm.sender_role = 'customer'
          AND cm.created_at > c.admin_last_read_at
    ))
)
AND (
    @search::text = '' OR
    u.email::text ILIKE '%' || @search::text || '%' OR
    EXISTS (
        SELECT 1 FROM orders o
        WHERE o.user_id = c.user_id AND o.id::text ILIKE '%' || @search::text || '%'
    ) OR
    EXISTS (
        SELECT 1 FROM chat_messages cm
        WHERE cm.conversation_id = c.id AND cm.attached_order_id::text ILIKE '%' || @search::text || '%'
    )
);

-- name: UpdateConversationLastMessageAt :exec
UPDATE conversations
SET last_message_at = @last_message_at,
    updated_at = now()
WHERE id = @id;

-- name: MarkCustomerConversationRead :exec
UPDATE conversations
SET customer_last_read_at = @customer_last_read_at,
    updated_at = now()
WHERE id = @id;

-- name: MarkAdminConversationRead :exec
UPDATE conversations
SET admin_last_read_at = @admin_last_read_at,
    updated_at = now()
WHERE id = @id;

-- name: InsertChatMessage :one
INSERT INTO chat_messages (
    conversation_id,
    sender_id,
    sender_role,
    content,
    attached_order_id
)
VALUES (
    @conversation_id,
    @sender_id,
    @sender_role,
    @content,
    @attached_order_id
)
RETURNING id, conversation_id, sender_id, sender_role, content, attached_order_id, created_at;

-- name: GetMessageByID :one
SELECT m.id, m.conversation_id, m.sender_id, m.sender_role, m.content,
       m.attached_order_id, m.created_at,
       CASE
           WHEN m.sender_role = 'admin' THEN 'Hỗ trợ viên'
           ELSE COALESCE(
               NULLIF(TRIM((SELECT o.recipient_name FROM orders o WHERE o.user_id = c.user_id ORDER BY o.created_at DESC LIMIT 1)), ''),
               NULLIF(TRIM((SELECT a.recipient_name FROM addresses a WHERE a.user_id = c.user_id AND a.is_default LIMIT 1)), ''),
               NULLIF(TRIM((SELECT a.recipient_name FROM addresses a WHERE a.user_id = c.user_id ORDER BY a.created_at DESC LIMIT 1)), ''),
               NULLIF(TRIM(split_part(u.email::text, '@', 1)), ''),
               'Khách hàng'
           )
       END::text AS sender_name,
       CASE
           WHEN m.sender_role = 'admin' THEN m.created_at <= c.customer_last_read_at
           WHEN m.sender_role = 'customer' THEN m.created_at <= c.admin_last_read_at
           ELSE false
       END AS is_read
FROM chat_messages m
JOIN conversations c ON c.id = m.conversation_id
JOIN users u ON u.id = c.user_id
WHERE m.id = @id;

-- name: ListMessagesByConversationID :many
SELECT m.id, m.conversation_id, m.sender_id, m.sender_role, m.content,
       m.attached_order_id, m.created_at,
       CASE
           WHEN m.sender_role = 'admin' THEN 'Hỗ trợ viên'
           ELSE COALESCE(
               NULLIF(TRIM((SELECT o.recipient_name FROM orders o WHERE o.user_id = c.user_id ORDER BY o.created_at DESC LIMIT 1)), ''),
               NULLIF(TRIM((SELECT a.recipient_name FROM addresses a WHERE a.user_id = c.user_id AND a.is_default LIMIT 1)), ''),
               NULLIF(TRIM((SELECT a.recipient_name FROM addresses a WHERE a.user_id = c.user_id ORDER BY a.created_at DESC LIMIT 1)), ''),
               NULLIF(TRIM(split_part(u.email::text, '@', 1)), ''),
               'Khách hàng'
           )
       END::text AS sender_name,
       CASE
           WHEN m.sender_role = 'admin' THEN m.created_at <= c.customer_last_read_at
           WHEN m.sender_role = 'customer' THEN m.created_at <= c.admin_last_read_at
           ELSE false
       END AS is_read
FROM chat_messages m
JOIN conversations c ON c.id = m.conversation_id
JOIN users u ON u.id = c.user_id
WHERE m.conversation_id = @conversation_id
ORDER BY m.created_at ASC
LIMIT @limit_count OFFSET @offset_count;

-- name: CountMessagesByConversationID :one
SELECT COUNT(*)::bigint
FROM chat_messages
WHERE conversation_id = @conversation_id;

-- name: CreatePendingAttachment :one
INSERT INTO chat_attachments (
    uploader_id,
    object_key,
    file_type,
    file_name,
    file_size,
    mime_type
)
VALUES (
    @uploader_id,
    @object_key,
    @file_type,
    @file_name,
    @file_size,
    @mime_type
)
RETURNING id, message_id, uploader_id, object_key, file_type, file_name, file_size, mime_type, created_at;

-- name: GetAttachmentByID :one
SELECT id, message_id, uploader_id, object_key, file_type, file_name, file_size, mime_type, created_at
FROM chat_attachments
WHERE id = @id;

-- name: GetAttachmentsByIDs :many
SELECT id, message_id, uploader_id, object_key, file_type, file_name, file_size, mime_type, created_at
FROM chat_attachments
WHERE id = ANY(@ids::uuid[]);

-- name: AttachFilesToMessage :exec
UPDATE chat_attachments
SET message_id = @message_id
WHERE id = ANY(@attachment_ids::uuid[])
  AND uploader_id = @uploader_id
  AND message_id IS NULL;

-- name: ListAttachmentsByMessageID :many
SELECT id, message_id, uploader_id, object_key, file_type, file_name, file_size, mime_type, created_at
FROM chat_attachments
WHERE message_id = @message_id
ORDER BY created_at ASC;

-- name: ListAttachmentsByMessageIDs :many
SELECT id, message_id, uploader_id, object_key, file_type, file_name, file_size, mime_type, created_at
FROM chat_attachments
WHERE message_id = ANY(@message_ids::uuid[])
ORDER BY created_at ASC;

-- name: UpdateUserLastActive :exec
UPDATE users
SET last_active_at = @last_active_at
WHERE id = @id;

-- name: GetUserLastActive :one
SELECT id, last_active_at
FROM users
WHERE id = @id;

-- name: GetOrderForChatCard :one
SELECT id, user_id, status, total_vnd::text AS total_vnd, created_at
FROM orders
WHERE id = @id;

-- name: ListRecentOrdersForChatPicker :many
SELECT id, status, total_vnd::text AS total_vnd, created_at
FROM orders
WHERE user_id = @user_id
ORDER BY created_at DESC
LIMIT @limit_count;

-- name: CountOrderItemsForChat :one
SELECT COUNT(*)::bigint
FROM order_items
WHERE order_id = @order_id;

-- name: ListOrderItemsSummaryForChat :many
SELECT id, order_id, product_name, quantity, unit_price_vnd::text AS unit_price_vnd, image_url
FROM order_items
WHERE order_id = @order_id
ORDER BY id ASC;

-- name: ListOrderItemsSummaryByOrderIDs :many
SELECT id, order_id, product_name, quantity, unit_price_vnd::text AS unit_price_vnd, image_url
FROM order_items
WHERE order_id = ANY(@order_ids::uuid[])
ORDER BY order_id, id ASC;
