-- Revert indexes and columns on chat_messages
DROP INDEX IF EXISTS chat_messages_conv_created_desc_idx;
DROP INDEX IF EXISTS chat_messages_order_id_idx;
ALTER TABLE chat_messages DROP COLUMN IF EXISTS order_id;
ALTER TABLE chat_messages DROP COLUMN IF EXISTS message_type;

-- Revert chat_conversations user_id unique constraint and re-add order_id
ALTER TABLE chat_conversations DROP CONSTRAINT IF EXISTS chat_conversations_user_id_unique;
ALTER TABLE chat_conversations ADD COLUMN order_id uuid NULL REFERENCES orders(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX chat_conversations_user_order_unique_idx 
    ON chat_conversations (user_id, order_id) 
    WHERE order_id IS NOT NULL;
CREATE INDEX chat_conversations_order_id_idx ON chat_conversations (order_id) WHERE order_id IS NOT NULL;
