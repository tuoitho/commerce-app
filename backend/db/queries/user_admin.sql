-- name: ListAdminUsers :many
-- strpos keeps % and _ in the search term literal, unlike LIKE.
SELECT u.id, u.email, u.role, u.status, u.created_at,
       (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id)::bigint AS order_count
FROM users u
WHERE (sqlc.arg(search)::text = '' OR strpos(lower(u.email::text), lower(sqlc.arg(search)::text)) > 0)
  AND (sqlc.arg(role)::text = '' OR u.role = sqlc.arg(role)::text)
  AND (sqlc.arg(status)::text = '' OR u.status = sqlc.arg(status)::text)
ORDER BY u.created_at DESC, u.id DESC
LIMIT sqlc.arg(row_limit)::int OFFSET sqlc.arg(row_offset)::bigint;

-- name: CountAdminUsers :one
SELECT COUNT(*)::bigint
FROM users u
WHERE (sqlc.arg(search)::text = '' OR strpos(lower(u.email::text), lower(sqlc.arg(search)::text)) > 0)
  AND (sqlc.arg(role)::text = '' OR u.role = sqlc.arg(role)::text)
  AND (sqlc.arg(status)::text = '' OR u.status = sqlc.arg(status)::text);

-- name: GetAdminUserOrderSummary :one
SELECT COUNT(*)::bigint AS total_orders,
       COUNT(*) FILTER (WHERE status IN ('delivered', 'partially_returned', 'returned'))::bigint AS delivered_orders,
       COALESCE(SUM(total_vnd) FILTER (WHERE status IN ('delivered', 'partially_returned', 'returned')), 0)::text AS delivered_total_vnd
FROM orders
WHERE user_id = $1;

-- name: ListAdminUserRecentOrders :many
SELECT id, status, total_vnd::text AS total_vnd, created_at
FROM orders
WHERE user_id = $1
ORDER BY created_at DESC, id DESC
LIMIT 5;

-- name: LockCustomerUser :execrows
UPDATE users
SET status = 'locked', locked_at = now(), lock_reason = sqlc.narg(lock_reason)::text, updated_at = now()
WHERE id = sqlc.arg(id) AND role = 'customer' AND status = 'active';

-- name: UnlockUser :execrows
UPDATE users
SET status = 'active', locked_at = NULL, lock_reason = NULL, updated_at = now()
WHERE id = $1 AND status = 'locked';
