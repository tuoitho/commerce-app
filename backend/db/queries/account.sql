-- name: GetUserAvatarKeyForUpdate :one
SELECT avatar_key
FROM users
WHERE id = $1
FOR UPDATE;

-- name: UpdateUserProfile :one
UPDATE users
SET display_name = sqlc.narg(display_name)::text,
    phone = sqlc.narg(phone)::varchar(16),
    updated_at = now()
WHERE id = $1
RETURNING id, email, password_hash, role, status, locked_at, lock_reason, display_name, phone, avatar_key, created_at, updated_at;

-- name: UpdateUserAvatar :one
UPDATE users
SET avatar_key = sqlc.narg(avatar_key)::text,
    updated_at = now()
WHERE id = $1
RETURNING id, email, password_hash, role, status, locked_at, lock_reason, display_name, phone, avatar_key, created_at, updated_at;

-- name: UpdateUserPassword :one
UPDATE users
SET password_hash = $2,
    updated_at = now()
WHERE id = $1
RETURNING id, email, password_hash, role, status, locked_at, lock_reason, display_name, phone, avatar_key, created_at, updated_at;
