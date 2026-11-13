ALTER TABLE users
    ADD COLUMN status      varchar(16) NOT NULL DEFAULT 'active',
    ADD COLUMN locked_at   timestamptz NULL,
    ADD COLUMN lock_reason text        NULL,
    ADD CONSTRAINT users_status_chk CHECK (status IN ('active', 'locked')),
    ADD CONSTRAINT users_lock_state_chk CHECK (
        (status = 'locked' AND locked_at IS NOT NULL)
        OR (status = 'active' AND locked_at IS NULL AND lock_reason IS NULL)
    ),
    ADD CONSTRAINT users_lock_reason_len_chk CHECK (lock_reason IS NULL OR char_length(lock_reason) <= 500);

CREATE INDEX users_created_at_id_idx ON users (created_at DESC, id DESC);
