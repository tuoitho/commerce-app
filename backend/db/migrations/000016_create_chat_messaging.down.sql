DROP TABLE IF EXISTS chat_attachments;
DROP TABLE IF EXISTS chat_messages;
DROP TABLE IF EXISTS conversations;
ALTER TABLE users DROP COLUMN IF EXISTS last_active_at;
