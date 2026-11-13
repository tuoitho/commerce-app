-- name: CreateLiveSession :one
INSERT INTO live_sessions (title, created_by)
VALUES (@title, @created_by)
RETURNING id, title, status, created_by, pinned_product_id, heart_count, peak_viewers,
          started_at, last_signal_at, ended_at, end_reason, created_at, updated_at;

-- name: GetLiveSession :one
SELECT id, title, status, created_by, pinned_product_id, heart_count, peak_viewers,
       started_at, last_signal_at, ended_at, end_reason, created_at, updated_at
FROM live_sessions
WHERE id = @id;

-- name: GetCurrentLiveSession :one
SELECT id, title, status, created_by, pinned_product_id, heart_count, peak_viewers,
       started_at, last_signal_at, ended_at, end_reason, created_at, updated_at
FROM live_sessions
WHERE status = 'live';

-- name: LockLiveSession :one
SELECT id, title, status, created_by, pinned_product_id, heart_count, peak_viewers,
       started_at, last_signal_at, ended_at, end_reason, created_at, updated_at
FROM live_sessions
WHERE id = @id
FOR UPDATE;

-- name: EndLiveSession :one
UPDATE live_sessions
SET status = 'ended',
    ended_at = now(),
    end_reason = @end_reason,
    updated_at = now()
WHERE id = @id AND status = 'live'
RETURNING id, title, status, created_by, pinned_product_id, heart_count, peak_viewers,
          started_at, last_signal_at, ended_at, end_reason, created_at, updated_at;

-- name: SetLivePinnedProduct :exec
UPDATE live_sessions
SET pinned_product_id = sqlc.narg(product_id)::uuid,
    updated_at = now()
WHERE id = @id;

-- name: AddLiveHearts :exec
UPDATE live_sessions
SET heart_count = heart_count + @delta::bigint
WHERE id = @id;

-- name: UpdateLivePeakViewers :exec
UPDATE live_sessions
SET peak_viewers = GREATEST(peak_viewers, @viewers::integer)
WHERE id = @id;

-- name: TouchLiveSignal :exec
UPDATE live_sessions
SET last_signal_at = @signal_at
WHERE id = @id AND status = 'live';

-- name: ListProductsForLiveValidation :many
SELECT id, active
FROM products
WHERE id = ANY(@product_ids::uuid[]);

-- name: ListVariantsForLiveValidation :many
SELECT id, product_id, active, price_vnd::text AS price_vnd
FROM product_variants
WHERE id = ANY(@variant_ids::uuid[]);

-- name: ListLiveVariantSold :many
SELECT variant_id, sold_quantity
FROM live_variant_prices
WHERE session_id = @session_id;

-- name: DeleteLiveSessionProductsExcept :exec
DELETE FROM live_session_products
WHERE session_id = @session_id
  AND NOT (product_id = ANY(@product_ids::uuid[]));

-- name: UpsertLiveSessionProduct :exec
INSERT INTO live_session_products (session_id, product_id, position)
VALUES (@session_id, @product_id, @position)
ON CONFLICT (session_id, product_id) DO UPDATE
SET position = EXCLUDED.position;

-- name: DeleteLiveVariantPricesExcept :exec
DELETE FROM live_variant_prices
WHERE session_id = @session_id
  AND NOT (variant_id = ANY(@variant_ids::uuid[]));

-- name: UpsertLiveVariantPrice :exec
INSERT INTO live_variant_prices (session_id, product_id, variant_id, live_price_vnd, quota)
VALUES (@session_id, @product_id, @variant_id, @live_price_vnd::numeric, sqlc.narg(quota)::integer)
ON CONFLICT (session_id, variant_id) DO UPDATE
SET live_price_vnd = EXCLUDED.live_price_vnd,
    quota = EXCLUDED.quota;

-- name: ListLiveSessionProducts :many
SELECT lsp.product_id, lsp.position, p.name, p.brand, p.active,
       COALESCE((SELECT pi.url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.position, pi.id LIMIT 1), '')::text AS image_url
FROM live_session_products lsp
JOIN products p ON p.id = lsp.product_id
WHERE lsp.session_id = @session_id
ORDER BY lsp.position, lsp.product_id;

-- name: ListLiveSessionVariants :many
SELECT v.id AS variant_id,
       v.product_id,
       v.active,
       v.stock_quantity,
       v.price_vnd::text AS regular_price_vnd,
       (lvp.variant_id IS NOT NULL)::boolean AS has_live_price,
       COALESCE(lvp.live_price_vnd, 0)::text AS live_price_vnd,
       (lvp.quota IS NOT NULL)::boolean AS has_quota,
       COALESCE(lvp.quota, 0)::integer AS quota,
       COALESCE(lvp.sold_quantity, 0)::integer AS sold_quantity,
       (lap.variant_id IS NOT NULL)::boolean AS live_active,
       COALESCE((SELECT string_agg(ov.label, ' / ' ORDER BY g.position, g.id)
                 FROM variant_option_values vov
                 JOIN product_option_groups g ON g.id = vov.group_id
                 JOIN product_option_values ov ON ov.id = vov.option_value_id
                 WHERE vov.variant_id = v.id), '')::text AS option_label
FROM live_session_products lsp
JOIN product_variants v ON v.product_id = lsp.product_id
LEFT JOIN live_variant_prices lvp ON lvp.session_id = lsp.session_id AND lvp.variant_id = v.id
LEFT JOIN live_active_variant_prices lap ON lap.session_id = lsp.session_id AND lap.variant_id = v.id
WHERE lsp.session_id = @session_id
ORDER BY v.product_id, v.price_vnd, v.id;

-- name: InsertLiveComment :one
INSERT INTO live_comments (session_id, user_id, content)
VALUES (@session_id, @user_id, @content)
RETURNING id;

-- name: GetLiveComment :one
SELECT lc.id, lc.session_id, lc.user_id, lc.content, lc.hidden_at, lc.created_at,
       u.role AS author_role,
       (CASE
           WHEN u.role = 'admin' THEN 'Chủ shop'
           ELSE COALESCE(
               NULLIF(TRIM((SELECT o.recipient_name FROM orders o WHERE o.user_id = u.id ORDER BY o.created_at DESC LIMIT 1)), ''),
               NULLIF(TRIM((SELECT a.recipient_name FROM addresses a WHERE a.user_id = u.id AND a.is_default LIMIT 1)), ''),
               NULLIF(TRIM(split_part(u.email::text, '@', 1)), ''),
               'Khách hàng'
           )
       END)::text AS author_name
FROM live_comments lc
JOIN users u ON u.id = lc.user_id
WHERE lc.id = @id;

-- name: ListRecentLiveComments :many
SELECT lc.id, lc.session_id, lc.user_id, lc.content, lc.hidden_at, lc.created_at,
       u.role AS author_role,
       (CASE
           WHEN u.role = 'admin' THEN 'Chủ shop'
           ELSE COALESCE(
               NULLIF(TRIM((SELECT o.recipient_name FROM orders o WHERE o.user_id = u.id ORDER BY o.created_at DESC LIMIT 1)), ''),
               NULLIF(TRIM((SELECT a.recipient_name FROM addresses a WHERE a.user_id = u.id AND a.is_default LIMIT 1)), ''),
               NULLIF(TRIM(split_part(u.email::text, '@', 1)), ''),
               'Khách hàng'
           )
       END)::text AS author_name
FROM live_comments lc
JOIN users u ON u.id = lc.user_id
WHERE lc.session_id = @session_id
  AND (@include_hidden::boolean OR lc.hidden_at IS NULL)
ORDER BY lc.created_at DESC, lc.id DESC
LIMIT @row_limit;

-- name: HideLiveComment :one
UPDATE live_comments
SET hidden_at = COALESCE(hidden_at, now())
WHERE id = @id
RETURNING id;

-- name: LastLiveCommentAtByUser :one
SELECT created_at
FROM live_comments
WHERE session_id = @session_id AND user_id = @user_id
ORDER BY created_at DESC
LIMIT 1;

-- name: CountLiveComments :one
SELECT COUNT(*)::bigint
FROM live_comments
WHERE session_id = @session_id;

-- name: ConsumeLiveQuota :one
UPDATE live_variant_prices
SET sold_quantity = sold_quantity + @quantity::integer
WHERE session_id = @session_id
  AND variant_id = @variant_id
  AND (quota IS NULL OR sold_quantity + @quantity::integer <= quota)
RETURNING sold_quantity;

-- name: GetLiveQuotaRemaining :one
SELECT COALESCE(quota - sold_quantity, 0)::integer AS remaining
FROM live_variant_prices
WHERE session_id = @session_id AND variant_id = @variant_id;

-- name: RestoreLiveQuotaForOrder :exec
UPDATE live_variant_prices lvp
SET sold_quantity = GREATEST(lvp.sold_quantity - oi.quantity, 0)::integer
FROM order_items oi
JOIN live_sessions s ON s.id = oi.live_session_id AND s.status = 'live'
WHERE oi.order_id = @order_id
  AND lvp.session_id = oi.live_session_id
  AND lvp.variant_id = oi.variant_id;
