DROP INDEX IF EXISTS idx_notifications_unread_group;
DROP INDEX IF EXISTS idx_notifications_recipient_updated;

ALTER TABLE notifications
    DROP COLUMN IF EXISTS updated_at,
    DROP COLUMN IF EXISTS actor_count,
    DROP COLUMN IF EXISTS group_key;
