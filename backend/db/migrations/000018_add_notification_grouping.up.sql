ALTER TABLE notifications
    ADD COLUMN group_key   text NOT NULL DEFAULT '',
    ADD COLUMN actor_count integer NOT NULL DEFAULT 1 CHECK (actor_count >= 1),
    ADD COLUMN updated_at  timestamptz NOT NULL DEFAULT now();

CREATE INDEX idx_notifications_recipient_updated ON notifications (recipient_id, updated_at DESC, id DESC);
CREATE UNIQUE INDEX idx_notifications_unread_group
    ON notifications (recipient_id, group_key)
    WHERE is_read = false AND group_key <> '';
