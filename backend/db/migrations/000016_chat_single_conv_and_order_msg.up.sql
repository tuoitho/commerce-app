-- Drop old order-specific indexes on chat_conversations
DROP INDEX IF EXISTS chat_conversations_user_order_unique_idx;
DROP INDEX IF EXISTS chat_conversations_order_id_idx;

-- Ensure only one conversation per user exists before applying unique constraint
DELETE FROM chat_conversations c1
USING chat_conversations c2
WHERE c1.user_id = c2.user_id AND c1.id <> c2.id AND c1.last_message_at < c2.last_message_at;

-- Enforce single conversation per user
ALTER TABLE chat_conversations ADD CONSTRAINT chat_conversations_user_id_unique UNIQUE (user_id);
ALTER TABLE chat_conversations DROP COLUMN IF EXISTS order_id;

-- Add message_type and order_id columns to chat_messages
ALTER TABLE chat_messages ADD COLUMN message_type text NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'media', 'order'));
ALTER TABLE chat_messages ADD COLUMN order_id uuid NULL REFERENCES orders(id) ON DELETE SET NULL;

-- Indexes for order context and reverse pagination
CREATE INDEX chat_messages_order_id_idx ON chat_messages (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX chat_messages_conv_created_desc_idx ON chat_messages (conversation_id, created_at DESC);
