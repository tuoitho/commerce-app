DROP INDEX IF EXISTS idx_notifications_recipient_category_updated;

ALTER TABLE notifications
    DROP CONSTRAINT IF EXISTS notifications_category_chk;
