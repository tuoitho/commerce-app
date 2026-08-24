-- name: IsProductPublic :one
SELECT p.id
FROM products p
JOIN product_variants v ON v.product_id = p.id
WHERE p.id = $1
  AND p.active
  AND v.active
LIMIT 1;

-- name: IsProductFavorited :one
SELECT product_id
FROM product_favorites
WHERE user_id = $1 AND product_id = $2;

-- name: AddFavorite :exec
INSERT INTO product_favorites (user_id, product_id, favorited_at)
VALUES ($1, $2, now())
ON CONFLICT (user_id, product_id) DO NOTHING;

-- name: AddFavoriteIfPublic :execrows
INSERT INTO product_favorites (user_id, product_id, favorited_at)
SELECT @user_id, p.id, now()
FROM products p
JOIN product_variants v ON v.product_id = p.id
WHERE p.id = @product_id
  AND p.active
  AND v.active
GROUP BY p.id
ON CONFLICT (user_id, product_id) DO NOTHING;

-- name: DeleteFavorite :exec
DELETE FROM product_favorites
WHERE user_id = $1 AND product_id = $2;

-- name: ListFavorites :many
SELECT
    pf.user_id,
    pf.product_id,
    pf.favorited_at,
    p.name AS product_name,
    p.model AS product_model,
    p.brand AS product_brand,
    p.active AS product_active,
    c.id AS category_id,
    c.name AS category_name,
    COALESCE((
        SELECT pi.url
        FROM product_images pi
        WHERE pi.product_id = p.id
        ORDER BY pi.position ASC, pi.id ASC
        LIMIT 1
    ), '')::text AS primary_image_url,
    COUNT(v.id) FILTER (WHERE v.active) AS active_variant_count,
    COALESCE(MIN(v.price_vnd) FILTER (WHERE v.active)::text, '')::text AS min_price_vnd,
    COALESCE(MAX(v.price_vnd) FILTER (WHERE v.active)::text, '')::text AS max_price_vnd,
    COALESCE(BOOL_OR(v.stock_quantity > 0) FILTER (WHERE v.active), false)::boolean AS has_active_stock
FROM product_favorites pf
JOIN products p ON p.id = pf.product_id
JOIN categories c ON c.id = p.category_id
LEFT JOIN product_variants v ON v.product_id = p.id
WHERE pf.user_id = $1
GROUP BY pf.user_id, pf.product_id, pf.favorited_at, p.id, p.name, p.model, p.brand, p.active, c.id, c.name
ORDER BY pf.favorited_at DESC, pf.product_id ASC;
