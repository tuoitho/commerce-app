-- name: AddFavorite :execrows
INSERT INTO product_favorites (user_id, product_id)
SELECT $1, p.id
FROM products p
WHERE p.id = $2
  AND p.active
  AND EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.active)
ON CONFLICT (user_id, product_id) DO NOTHING;

-- name: IsProductEligibleForFavorite :one
SELECT EXISTS (
    SELECT 1
    FROM products p
    WHERE p.id = $1
      AND p.active
      AND EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.active)
) AS eligible;

-- name: DeleteFavorite :exec
DELETE FROM product_favorites
WHERE user_id = $1 AND product_id = $2;

-- name: GetFavoriteProductIDs :many
SELECT product_id
FROM product_favorites
WHERE user_id = $1 AND product_id = ANY($2::uuid[]);

-- name: CountFavoritesByUserID :one
SELECT count(*)
FROM product_favorites
WHERE user_id = $1;

-- name: ListFavoritesByUserID :many
SELECT pf.product_id,
       pf.created_at AS favorited_at,
       p.name,
       p.model,
       p.brand,
       p.description,
       p.price::text AS default_price,
       p.currency AS default_currency,
       p.stock_quantity AS default_stock,
       p.active AS product_active,
       c.id AS category_id,
       c.name AS category_name,
       COALESCE((
           SELECT pi.url
           FROM product_images pi
           WHERE pi.product_id = p.id
           ORDER BY pi.position ASC, pi.id ASC
           LIMIT 1
       ), '')::text AS primary_image_url
FROM product_favorites pf
JOIN products p ON p.id = pf.product_id
JOIN categories c ON c.id = p.category_id
WHERE pf.user_id = $1
ORDER BY pf.created_at DESC, pf.product_id ASC
LIMIT $2 OFFSET $3;
