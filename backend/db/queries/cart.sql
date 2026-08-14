-- name: LockUser :one
SELECT id FROM users WHERE id = $1 FOR UPDATE;

-- name: LockVariant :one
SELECT v.id, v.product_id, v.price_vnd::text AS price_vnd, v.stock_quantity, v.active,
       p.active AS product_active, c.name AS brand_name, p.name AS product_name, p.model,
       COALESCE((SELECT pi.url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.position, pi.id LIMIT 1), '')::text AS image_url,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('groupLabel', g.label, 'valueLabel', ov.label) ORDER BY g.position, g.id)
                 FROM variant_option_values vov JOIN product_option_groups g ON g.id = vov.group_id
                 JOIN product_option_values ov ON ov.id = vov.option_value_id
                 WHERE vov.variant_id = v.id), '[]'::jsonb)::text AS options
FROM product_variants v JOIN products p ON p.id = v.product_id JOIN categories c ON c.id = p.category_id
WHERE v.id = $1 FOR UPDATE;

-- name: ReconcileCart :exec
UPDATE cart_items ci SET selected = false, updated_at = now()
FROM product_variants v JOIN products p ON p.id = v.product_id
WHERE ci.user_id = $1 AND ci.variant_id = v.id
  AND (NOT p.active OR NOT v.active OR v.stock_quantity = 0 OR ci.quantity > v.stock_quantity)
  AND ci.selected;

-- name: RefreshCartSnapshots :exec
UPDATE cart_items ci SET snapshot_brand_name = c.name, snapshot_product_name = p.name, snapshot_model = p.model,
    snapshot_image_url = COALESCE((SELECT pi.url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.position, pi.id LIMIT 1), ''),
    snapshot_options = COALESCE((SELECT jsonb_agg(jsonb_build_object('groupLabel', g.label, 'valueLabel', ov.label) ORDER BY g.position, g.id)
      FROM variant_option_values vov JOIN product_option_groups g ON g.id = vov.group_id JOIN product_option_values ov ON ov.id = vov.option_value_id
      WHERE vov.variant_id = v.id), '[]'::jsonb), updated_at = now()
FROM product_variants v JOIN products p ON p.id = v.product_id JOIN categories c ON c.id = p.category_id
WHERE ci.user_id = $1 AND ci.variant_id = v.id AND p.active AND v.active;

-- name: ListCartRows :many
SELECT ci.id, ci.variant_id, ci.quantity, ci.selected, ci.snapshot_brand_name, ci.snapshot_product_name,
       ci.snapshot_model, ci.snapshot_image_url, ci.snapshot_options::text AS snapshot_options,
       v.product_id, p.active AS product_active, v.active AS variant_active, v.price_vnd::text AS price_vnd, v.stock_quantity,
       c.name AS brand_name, p.name AS product_name, p.model
FROM cart_items ci JOIN product_variants v ON v.id = ci.variant_id JOIN products p ON p.id = v.product_id JOIN categories c ON c.id = p.category_id
WHERE ci.user_id = $1 ORDER BY ci.created_at, ci.id;

-- name: InsertOrIncrementCart :one
INSERT INTO cart_items (user_id, variant_id, quantity, snapshot_brand_name, snapshot_product_name, snapshot_model, snapshot_image_url, snapshot_options)
VALUES ($1, $2, 1, $3, $4, $5, $6, $7::jsonb)
ON CONFLICT (user_id, variant_id) DO UPDATE SET quantity = cart_items.quantity + 1, updated_at = now()
  WHERE CASE
    WHEN cart_items.quantity = 9223372036854775807 THEN false
    ELSE cart_items.quantity + 1 <= $8::bigint
  END
RETURNING id;

-- name: LockCartItem :one
SELECT id, variant_id, quantity, selected FROM cart_items WHERE id = $1 AND user_id = $2 FOR UPDATE;

-- name: SetCartQuantity :exec
UPDATE cart_items SET quantity = $3::bigint, updated_at = now() WHERE id = $1 AND user_id = $2;

-- name: SetCartSelected :exec
UPDATE cart_items SET selected = $3, updated_at = now() WHERE id = $1 AND user_id = $2;

-- name: SetAllCartSelected :exec
UPDATE cart_items ci SET selected = $2, updated_at = now()
WHERE ci.user_id = $1 AND ($2 = false OR EXISTS (
    SELECT 1 FROM product_variants v JOIN products p ON p.id = v.product_id
    WHERE v.id = ci.variant_id AND p.active AND v.active AND v.stock_quantity > 0 AND ci.quantity <= v.stock_quantity
));

-- name: RemoveCartItem :exec
DELETE FROM cart_items WHERE id = $1 AND user_id = $2;
