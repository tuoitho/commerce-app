-- name: CountAdminVouchers :one
SELECT COUNT(*)::bigint
FROM vouchers v
WHERE (
    COALESCE(sqlc.narg('query')::text, '') = ''
    OR strpos(lower(v.code), lower(sqlc.narg('query')::text)) > 0
    OR strpos(lower(v.title), lower(sqlc.narg('query')::text)) > 0
)
AND (
    COALESCE(sqlc.narg('status')::text, '') = ''
    OR (sqlc.narg('status')::text = 'inactive' AND NOT v.active)
    OR (sqlc.narg('status')::text = 'expired' AND v.active AND now() > v.ends_at)
    OR (sqlc.narg('status')::text = 'scheduled' AND v.active AND now() < v.starts_at)
    OR (sqlc.narg('status')::text = 'exhausted' AND v.active AND v.starts_at <= now() AND now() <= v.ends_at AND v.usage_limit IS NOT NULL AND v.used_count >= v.usage_limit)
    OR (sqlc.narg('status')::text = 'active' AND v.active AND v.starts_at <= now() AND now() <= v.ends_at AND (v.usage_limit IS NULL OR v.used_count < v.usage_limit))
);

-- name: ListAdminVouchers :many
SELECT v.id,
       v.code,
       v.title,
       v.description,
       v.voucher_type,
       v.scope_type,
       v.discount_value::text AS discount_value,
       COALESCE(v.max_discount_vnd::text, '')::text AS max_discount_vnd,
       v.min_order_vnd::text AS min_order_vnd,
       v.usage_limit,
       v.used_count,
       v.per_user_limit,
       v.starts_at,
       v.ends_at,
       v.active,
       v.created_at,
       v.updated_at
FROM vouchers v
WHERE (
    COALESCE(sqlc.narg('query')::text, '') = ''
    OR strpos(lower(v.code), lower(sqlc.narg('query')::text)) > 0
    OR strpos(lower(v.title), lower(sqlc.narg('query')::text)) > 0
)
AND (
    COALESCE(sqlc.narg('status')::text, '') = ''
    OR (sqlc.narg('status')::text = 'inactive' AND NOT v.active)
    OR (sqlc.narg('status')::text = 'expired' AND v.active AND now() > v.ends_at)
    OR (sqlc.narg('status')::text = 'scheduled' AND v.active AND now() < v.starts_at)
    OR (sqlc.narg('status')::text = 'exhausted' AND v.active AND v.starts_at <= now() AND now() <= v.ends_at AND v.usage_limit IS NOT NULL AND v.used_count >= v.usage_limit)
    OR (sqlc.narg('status')::text = 'active' AND v.active AND v.starts_at <= now() AND now() <= v.ends_at AND (v.usage_limit IS NULL OR v.used_count < v.usage_limit))
)
ORDER BY v.created_at DESC, v.id DESC
LIMIT @row_limit OFFSET @row_offset;

-- name: GetVoucherByID :one
SELECT id,
       code,
       title,
       description,
       voucher_type,
       scope_type,
       discount_value::text AS discount_value,
       COALESCE(max_discount_vnd::text, '')::text AS max_discount_vnd,
       min_order_vnd::text AS min_order_vnd,
       usage_limit,
       used_count,
       per_user_limit,
       starts_at,
       ends_at,
       active,
       created_at,
       updated_at
FROM vouchers
WHERE id = @id;

-- name: LockVoucherByID :one
SELECT id,
       code,
       title,
       description,
       voucher_type,
       scope_type,
       discount_value::text AS discount_value,
       COALESCE(max_discount_vnd::text, '')::text AS max_discount_vnd,
       min_order_vnd::text AS min_order_vnd,
       usage_limit,
       used_count,
       per_user_limit,
       starts_at,
       ends_at,
       active,
       created_at,
       updated_at
FROM vouchers
WHERE id = @id
FOR UPDATE;

-- name: GetVoucherByCode :one
SELECT id,
       code,
       title,
       description,
       voucher_type,
       scope_type,
       discount_value::text AS discount_value,
       COALESCE(max_discount_vnd::text, '')::text AS max_discount_vnd,
       min_order_vnd::text AS min_order_vnd,
       usage_limit,
       used_count,
       per_user_limit,
       starts_at,
       ends_at,
       active,
       created_at,
       updated_at
FROM vouchers
WHERE code = @code;

-- name: LockVoucherByCode :one
SELECT id,
       code,
       title,
       description,
       voucher_type,
       scope_type,
       discount_value::text AS discount_value,
       COALESCE(max_discount_vnd::text, '')::text AS max_discount_vnd,
       min_order_vnd::text AS min_order_vnd,
       usage_limit,
       used_count,
       per_user_limit,
       starts_at,
       ends_at,
       active,
       created_at,
       updated_at
FROM vouchers
WHERE code = @code
FOR UPDATE;

-- name: CreateVoucher :one
INSERT INTO vouchers (
    code, title, description, voucher_type, scope_type, discount_value,
    max_discount_vnd, min_order_vnd, usage_limit, per_user_limit,
    starts_at, ends_at, active
)
VALUES (
    @code, @title, @description, @voucher_type, @scope_type, @discount_value::numeric,
    sqlc.narg(max_discount_vnd)::numeric, @min_order_vnd::numeric,
    sqlc.narg(usage_limit)::integer, @per_user_limit::integer,
    @starts_at, @ends_at, @active
)
RETURNING id,
          code,
          title,
          description,
          voucher_type,
          scope_type,
          discount_value::text AS discount_value,
          COALESCE(max_discount_vnd::text, '')::text AS max_discount_vnd,
          min_order_vnd::text AS min_order_vnd,
          usage_limit,
          used_count,
          per_user_limit,
          starts_at,
          ends_at,
          active,
          created_at,
          updated_at;

-- name: UpdateVoucher :one
UPDATE vouchers
SET code = @code,
    title = @title,
    description = @description,
    voucher_type = @voucher_type,
    scope_type = @scope_type,
    discount_value = @discount_value::numeric,
    max_discount_vnd = sqlc.narg(max_discount_vnd)::numeric,
    min_order_vnd = @min_order_vnd::numeric,
    usage_limit = sqlc.narg(usage_limit)::integer,
    per_user_limit = @per_user_limit::integer,
    starts_at = @starts_at,
    ends_at = @ends_at,
    active = @active,
    updated_at = now()
WHERE id = @id
RETURNING id,
          code,
          title,
          description,
          voucher_type,
          scope_type,
          discount_value::text AS discount_value,
          COALESCE(max_discount_vnd::text, '')::text AS max_discount_vnd,
          min_order_vnd::text AS min_order_vnd,
          usage_limit,
          used_count,
          per_user_limit,
          starts_at,
          ends_at,
          active,
          created_at,
          updated_at;

-- name: DeleteVoucher :execrows
DELETE FROM vouchers
WHERE id = @id;

-- name: DeleteVoucherCategories :exec
DELETE FROM voucher_categories
WHERE voucher_id = @voucher_id;

-- name: InsertVoucherCategory :exec
INSERT INTO voucher_categories (voucher_id, category_id)
VALUES (@voucher_id, @category_id)
ON CONFLICT (voucher_id, category_id) DO NOTHING;

-- name: DeleteVoucherProducts :exec
DELETE FROM voucher_products
WHERE voucher_id = @voucher_id;

-- name: InsertVoucherProduct :exec
INSERT INTO voucher_products (voucher_id, product_id)
VALUES (@voucher_id, @product_id)
ON CONFLICT (voucher_id, product_id) DO NOTHING;

-- name: CountExistingCategoriesByIDs :one
SELECT COUNT(*)::bigint
FROM categories
WHERE id = ANY(@ids::uuid[]);

-- name: CountExistingProductsByIDs :one
SELECT COUNT(*)::bigint
FROM products
WHERE id = ANY(@ids::uuid[]);

-- name: ListVoucherCategoriesByVoucherIDs :many
SELECT vc.voucher_id,
       c.id AS category_id,
       c.name AS category_name
FROM voucher_categories vc
JOIN categories c ON c.id = vc.category_id
WHERE vc.voucher_id = ANY(@voucher_ids::uuid[])
ORDER BY c.name ASC, c.id ASC;

-- name: ListVoucherProductsByVoucherIDs :many
SELECT vp.voucher_id,
       p.id AS product_id,
       p.name AS product_name
FROM voucher_products vp
JOIN products p ON p.id = vp.product_id
WHERE vp.voucher_id = ANY(@voucher_ids::uuid[])
ORDER BY p.name ASC, p.id ASC;

-- name: ListVoucherCategoryIDs :many
SELECT category_id
FROM voucher_categories
WHERE voucher_id = @voucher_id;

-- name: ListVoucherProductIDs :many
SELECT product_id
FROM voucher_products
WHERE voucher_id = @voucher_id;

-- name: ClaimUserVoucher :exec
INSERT INTO user_vouchers (user_id, voucher_id)
VALUES (@user_id, @voucher_id)
ON CONFLICT (user_id, voucher_id) DO NOTHING;

-- name: GetUserVoucher :one
SELECT uv.id,
       uv.user_id,
       uv.voucher_id,
       uv.claimed_at
FROM user_vouchers uv
WHERE uv.user_id = @user_id
  AND uv.voucher_id = @voucher_id;

-- name: HasUserClaimedVoucher :one
SELECT EXISTS (
    SELECT 1
    FROM user_vouchers
    WHERE user_id = @user_id
      AND voucher_id = @voucher_id
)::boolean AS claimed;

-- name: CountUserActiveVoucherUsages :one
SELECT COUNT(*)::bigint AS count
FROM voucher_usages
WHERE voucher_id = @voucher_id
  AND user_id = @user_id
  AND status = 'applied';

-- name: ConsumeVoucherUsage :one
UPDATE vouchers
SET used_count = used_count + 1,
    updated_at = now()
WHERE id = @id
  AND (usage_limit IS NULL OR used_count < usage_limit)
RETURNING used_count;

-- name: InsertVoucherUsage :exec
INSERT INTO voucher_usages (
    voucher_id, user_id, order_id, discount_vnd, status
)
VALUES (
    @voucher_id, @user_id, @order_id, @discount_vnd::numeric, 'applied'
);

-- name: RestoreVoucherUsageByOrderID :one
UPDATE voucher_usages
SET status = 'restored',
    restored_at = now()
WHERE order_id = @order_id
  AND status = 'applied'
RETURNING voucher_id;

-- name: DecrementVoucherUsedCount :exec
UPDATE vouchers
SET used_count = GREATEST(used_count - 1, 0)::integer,
    updated_at = now()
WHERE id = @id;

-- name: DecrementVoucherUsedCountBy :exec
UPDATE vouchers
SET used_count = GREATEST(used_count - @delta::integer, 0)::integer,
    updated_at = now()
WHERE id = @id;

-- name: ListDiscoverVouchersForUser :many
SELECT v.id,
       v.code,
       v.title,
       v.description,
       v.voucher_type,
       v.scope_type,
       v.discount_value::text AS discount_value,
       COALESCE(v.max_discount_vnd::text, '')::text AS max_discount_vnd,
       v.min_order_vnd::text AS min_order_vnd,
       v.usage_limit,
       v.used_count,
       v.per_user_limit,
       v.starts_at,
       v.ends_at,
       GREATEST(v.per_user_limit - COALESCE(u.used_by_user, 0), 0)::integer AS user_remaining_uses,
       (uv.id IS NOT NULL)::boolean AS claimed,
       uv.claimed_at
FROM vouchers v
LEFT JOIN user_vouchers uv
       ON uv.voucher_id = v.id
      AND uv.user_id = @user_id
LEFT JOIN (
    SELECT vu.voucher_id, COUNT(*)::integer AS used_by_user
    FROM voucher_usages vu
    WHERE vu.user_id = @user_id
      AND vu.status = 'applied'
    GROUP BY vu.voucher_id
) u ON u.voucher_id = v.id
WHERE v.active = true
  AND v.starts_at <= @now::timestamptz
  AND @now::timestamptz <= v.ends_at
  AND (v.usage_limit IS NULL OR v.used_count < v.usage_limit)
ORDER BY (uv.id IS NOT NULL) ASC, v.ends_at ASC, v.created_at DESC, v.id ASC;

-- name: ListWalletVouchersForUser :many
SELECT v.id,
       v.code,
       v.title,
       v.description,
       v.voucher_type,
       v.scope_type,
       v.discount_value::text AS discount_value,
       COALESCE(v.max_discount_vnd::text, '')::text AS max_discount_vnd,
       v.min_order_vnd::text AS min_order_vnd,
       v.usage_limit,
       v.used_count,
       v.per_user_limit,
       v.starts_at,
       v.ends_at,
       v.active,
       GREATEST(v.per_user_limit - COALESCE(u.used_by_user, 0), 0)::integer AS user_remaining_uses,
       uv.claimed_at
FROM user_vouchers uv
JOIN vouchers v ON v.id = uv.voucher_id
LEFT JOIN (
    SELECT vu.voucher_id, COUNT(*)::integer AS used_by_user
    FROM voucher_usages vu
    WHERE vu.user_id = @user_id
      AND vu.status = 'applied'
    GROUP BY vu.voucher_id
) u ON u.voucher_id = v.id
WHERE uv.user_id = @user_id
ORDER BY uv.claimed_at DESC, uv.id DESC;

-- name: ListAvailableVouchersForUser :many
SELECT v.id,
       v.code,
       v.title,
       v.description,
       v.voucher_type,
       v.scope_type,
       v.discount_value::text AS discount_value,
       COALESCE(v.max_discount_vnd::text, '')::text AS max_discount_vnd,
       v.min_order_vnd::text AS min_order_vnd,
       v.usage_limit,
       v.used_count,
       v.per_user_limit,
       v.starts_at,
       v.ends_at,
       GREATEST(v.per_user_limit - COALESCE(u.used_by_user, 0), 0)::integer AS user_remaining_uses,
       uv.claimed_at
FROM user_vouchers uv
JOIN vouchers v ON v.id = uv.voucher_id
LEFT JOIN (
    SELECT vu.voucher_id, COUNT(*)::integer AS used_by_user
    FROM voucher_usages vu
    WHERE vu.user_id = @user_id
      AND vu.status = 'applied'
    GROUP BY vu.voucher_id
) u ON u.voucher_id = v.id
WHERE uv.user_id = @user_id
  AND v.active = true
  AND v.starts_at <= @now::timestamptz
  AND @now::timestamptz <= v.ends_at
  AND (v.usage_limit IS NULL OR v.used_count < v.usage_limit)
  AND COALESCE(u.used_by_user, 0) < v.per_user_limit
ORDER BY v.ends_at ASC, uv.claimed_at DESC, v.id ASC;
