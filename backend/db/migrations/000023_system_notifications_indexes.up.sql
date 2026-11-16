ALTER TABLE notifications
    ADD CONSTRAINT notifications_category_chk
    CHECK (category IN ('post', 'order', 'return', 'review', 'live'));

CREATE INDEX idx_notifications_recipient_category_updated
    ON notifications (recipient_id, category, updated_at DESC, id DESC);
