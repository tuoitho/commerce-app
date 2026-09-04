-- Cập nhật cột last_active_at cho users
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at timestamptz NULL;

-- Bảng cuộc hội thoại (1 conversation cho mỗi khách hàng)
CREATE TABLE conversations (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    last_message_at        timestamptz NOT NULL DEFAULT now(),
    customer_last_read_at  timestamptz NOT NULL DEFAULT now(),
    admin_last_read_at     timestamptz NOT NULL DEFAULT now(),
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversations_last_message_at ON conversations (last_message_at DESC);
CREATE INDEX idx_conversations_user_id ON conversations (user_id);

-- Bảng tin nhắn
CREATE TABLE chat_messages (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id    uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id          uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    sender_role        text NOT NULL CHECK (sender_role IN ('customer', 'admin')),
    content            text NOT NULL DEFAULT '' CHECK (char_length(content) <= 2000),
    attached_order_id  uuid NULL REFERENCES orders(id) ON DELETE SET NULL,
    created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_messages_conv_created ON chat_messages (conversation_id, created_at ASC);
CREATE INDEX idx_chat_messages_attached_order ON chat_messages (attached_order_id) WHERE attached_order_id IS NOT NULL;

-- Bảng tệp đính kèm hình ảnh / video
CREATE TABLE chat_attachments (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id  uuid NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
    uploader_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    object_key  text NOT NULL UNIQUE,
    file_type   text NOT NULL CHECK (file_type IN ('image', 'video')),
    file_name   text NOT NULL,
    file_size   bigint NOT NULL CHECK (file_size > 0),
    mime_type   text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_attachments_message_id ON chat_attachments (message_id);
CREATE INDEX idx_chat_attachments_uploader ON chat_attachments (uploader_id);
