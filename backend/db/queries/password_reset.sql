-- name: AcquireEmailPasswordResetLock :exec
SELECT pg_advisory_xact_lock(hashtext(lower($1)));

-- name: CountRecentPasswordResetOTPsByEmail :one
SELECT COUNT(*)
FROM password_reset_otps
WHERE email = $1
  AND created_at >= $2;

-- name: InvalidateUserPasswordResetOTPs :exec
UPDATE password_reset_otps
SET consumed_at = now()
WHERE user_id = $1
  AND consumed_at IS NULL;

-- name: CreatePasswordResetOTP :one
INSERT INTO password_reset_otps (email, user_id, otp_hash, expires_at)
VALUES ($1, sqlc.narg(user_id)::uuid, sqlc.narg(otp_hash)::text, $2)
RETURNING id, email, user_id, otp_hash, attempts, expires_at, consumed_at, created_at;

-- name: DeletePasswordResetOTPByID :exec
DELETE FROM password_reset_otps
WHERE id = $1;

-- name: GetLatestPasswordResetOTPForUpdate :one
SELECT id, email, user_id, otp_hash, attempts, expires_at, consumed_at, created_at
FROM password_reset_otps
WHERE email = $1
ORDER BY created_at DESC, id DESC
LIMIT 1
FOR UPDATE;

-- name: IncrementPasswordResetOTPAttempt :one
UPDATE password_reset_otps
SET attempts = attempts + 1,
    consumed_at = CASE WHEN attempts + 1 >= $2 THEN now() ELSE consumed_at END
WHERE id = $1
  AND consumed_at IS NULL
  AND attempts < $2
RETURNING id, attempts, consumed_at;

-- name: ConsumePasswordResetOTP :exec
UPDATE password_reset_otps
SET consumed_at = now()
WHERE id = $1
  AND consumed_at IS NULL;
