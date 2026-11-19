CREATE TABLE password_reset_otps (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    email       citext      NOT NULL,
    user_id     uuid        NULL REFERENCES users(id) ON DELETE CASCADE,
    otp_hash    text        NULL,
    attempts    smallint    NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 5),
    expires_at  timestamptz NOT NULL,
    consumed_at timestamptz NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX password_reset_otps_email_created_idx
    ON password_reset_otps (email, created_at DESC);

CREATE INDEX password_reset_otps_user_active_idx
    ON password_reset_otps (user_id)
    WHERE consumed_at IS NULL;
