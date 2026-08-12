-- name: ListCategories :many
SELECT id, name
FROM categories
ORDER BY name ASC;

-- name: ListProducts :many
SELECT p.id,
       p.name,
       p.description,
       c.id   AS category_id,
       c.name AS category_name,
       p.price::text AS price,
       p.currency,
       p.stock_quantity,
       p.created_at,
       p.updated_at,
       COALESCE((SELECT pi.url
        FROM product_images pi
        WHERE pi.product_id = p.id
        ORDER BY pi.position ASC, pi.id ASC
        LIMIT 1), '')::text AS primary_image_url
FROM products p
JOIN categories c ON c.id = p.category_id
WHERE (sqlc.narg('q')::text IS NULL OR lower(p.name) LIKE '%' || lower(sqlc.narg('q')::text) || '%')
  AND (sqlc.narg('category_id')::uuid IS NULL OR p.category_id = sqlc.narg('category_id')::uuid)
  AND (sqlc.narg('min_price')::numeric IS NULL OR p.price >= sqlc.narg('min_price')::numeric)
  AND (sqlc.narg('max_price')::numeric IS NULL OR p.price <= sqlc.narg('max_price')::numeric)
  AND (sqlc.narg('in_stock')::boolean IS NULL OR (p.stock_quantity > 0) = sqlc.narg('in_stock')::boolean)
ORDER BY p.name ASC, p.id ASC;

-- name: GetProductByID :one
SELECT p.id,
       p.name,
       p.description,
       c.id   AS category_id,
       c.name AS category_name,
       p.price::text AS price,
       p.currency,
       p.stock_quantity,
       p.created_at,
       p.updated_at
FROM products p
JOIN categories c ON c.id = p.category_id
WHERE p.id = $1;

-- name: ListProductImages :many
SELECT url
FROM product_images
WHERE product_id = $1
ORDER BY position ASC, id ASC;
