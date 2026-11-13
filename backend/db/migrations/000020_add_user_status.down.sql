DROP INDEX IF EXISTS users_created_at_id_idx;

ALTER TABLE users
    DROP CONSTRAINT IF EXISTS users_lock_reason_len_chk,
    DROP CONSTRAINT IF EXISTS users_lock_state_chk,
    DROP CONSTRAINT IF EXISTS users_status_chk,
    DROP COLUMN IF EXISTS lock_reason,
    DROP COLUMN IF EXISTS locked_at,
    DROP COLUMN IF EXISTS status;
