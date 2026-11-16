-- name: CreateRefreshToken :one
INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
VALUES ($1, $2, $3)
RETURNING id, user_id, token_hash, expires_at, revoked_at, created_at;

-- name: GetRefreshTokenByHash :one
SELECT rt.id, rt.token_hash, rt.expires_at, rt.revoked_at, rt.created_at,
       u.id AS user_id, u.email, u.password_hash, u.role AS user_role, u.status AS user_status,
       u.locked_at AS user_locked_at, u.lock_reason AS user_lock_reason,
       u.display_name AS user_display_name, u.phone AS user_phone, u.avatar_key AS user_avatar_key,
       u.created_at AS user_created_at, u.updated_at AS user_updated_at
FROM refresh_tokens rt
JOIN users u ON u.id = rt.user_id
WHERE rt.token_hash = $1;

-- name: RevokeRefreshTokenByID :exec
UPDATE refresh_tokens
SET revoked_at = now()
WHERE id = $1;

-- name: RevokeRefreshTokensByUserID :exec
UPDATE refresh_tokens
SET revoked_at = now()
WHERE user_id = $1
  AND revoked_at IS NULL;