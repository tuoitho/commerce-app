CREATE TABLE chat_conversations (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_id                uuid NULL REFERENCES orders(id) ON DELETE SET NULL,
    customer_last_read_at   timestamptz NOT NULL DEFAULT now(),
    admin_last_read_at      timestamptz NOT NULL DEFAULT now(),
    customer_last_active_at timestamptz NOT NULL DEFAULT now(),
    admin_last_active_at    timestamptz NULL,
    last_message_at         timestamptz NOT NULL DEFAULT now(),
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX chat_conversations_user_order_unique_idx 
    ON chat_conversations (user_id, order_id) 
    WHERE order_id IS NOT NULL;

CREATE INDEX chat_conversations_user_last_msg_idx ON chat_conversations (user_id, last_message_at DESC);
CREATE INDEX chat_conversations_admin_last_msg_idx ON chat_conversations (last_message_at DESC);
CREATE INDEX chat_conversations_order_id_idx ON chat_conversations (order_id) WHERE order_id IS NOT NULL;

CREATE TABLE chat_messages (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    sender_id       uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    sender_role     text NOT NULL CHECK (sender_role IN ('customer', 'admin')),
    content         text NOT NULL DEFAULT '',
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX chat_messages_conv_created_idx ON chat_messages (conversation_id, created_at ASC);

CREATE TABLE chat_message_media (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id   uuid NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
    media_type   text NOT NULL CHECK (media_type IN ('image', 'video')),
    object_key   text NOT NULL,
    content_type text NOT NULL,
    file_size    bigint NOT NULL CHECK (file_size > 0),
    file_name    text NOT NULL DEFAULT '',
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX chat_message_media_message_id_idx ON chat_message_media (message_id);
