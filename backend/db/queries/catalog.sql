-- name: ListCategories :many
SELECT c.id, c.name
FROM categories c
WHERE EXISTS (
    SELECT 1
    FROM products p
    JOIN product_variants v ON v.product_id = p.id
    WHERE p.category_id = c.id
      AND p.active
      AND v.active
)
ORDER BY c.name ASC, c.id ASC;

-- name: ListAdminCategories :many
SELECT id, name FROM categories ORDER BY name ASC, id ASC;

-- name: CreateCategory :one
INSERT INTO categories (name) VALUES ($1) RETURNING id, name;

-- name: UpdateCategory :one
UPDATE categories SET name = $2 WHERE id = $1 RETURNING id, name;

-- name: DeleteCategory :one
DELETE FROM categories WHERE id = $1 RETURNING id, name;

-- name: CountProductsByCategory :one
SELECT count(*) FROM products WHERE category_id = $1;

-- name: ListBrands :many
SELECT DISTINCT p.brand
FROM products p
WHERE p.active
  AND p.brand <> ''
  AND EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.active)
ORDER BY p.brand ASC;

-- name: ListProducts :many
WITH review_stats AS (
    SELECT oi.product_id,
           COUNT(pr.id)::bigint AS review_count,
           COALESCE(ROUND(AVG(pr.rating), 1), 0)::double precision AS average_rating
    FROM product_reviews pr
    JOIN order_items oi ON oi.id = pr.order_item_id
    GROUP BY oi.product_id
),
sold_stats AS (
    SELECT oi.product_id,
           COALESCE(SUM(oi.quantity), 0)::bigint AS sold_count
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.status IN ('delivered', 'partially_returned')
    GROUP BY oi.product_id
),
variant_price_stats AS (
    SELECT v.product_id,
           MIN(v.price_vnd) FILTER (WHERE v.active) AS min_active_price_vnd
    FROM product_variants v
    WHERE v.active
    GROUP BY v.product_id
)
SELECT p.id,
       p.name,
       p.model,
       p.brand,
       p.description,
       c.id AS category_id,
       c.name AS category_name,
       p.featured,
       p.active,
       p.created_at,
       p.updated_at,
       COALESCE((SELECT pi.url
        FROM product_images pi
        WHERE pi.product_id = p.id
        ORDER BY pi.position ASC, pi.id ASC
        LIMIT 1), '')::text AS primary_image_url,
       COALESCE(rs.average_rating, 0)::double precision AS average_rating,
       COALESCE(rs.review_count, 0)::bigint AS review_count,
       COALESCE(ss.sold_count, 0)::bigint AS sold_count
FROM products p
JOIN categories c ON c.id = p.category_id
JOIN variant_price_stats vps ON vps.product_id = p.id
LEFT JOIN review_stats rs ON rs.product_id = p.id
LEFT JOIN sold_stats ss ON ss.product_id = p.id
WHERE p.active
  AND (sqlc.narg('q')::text IS NULL
       OR f_unaccent(c.name) LIKE '%' || f_unaccent(sqlc.narg('q')::text) || '%'
       OR f_unaccent(p.brand) LIKE '%' || f_unaccent(sqlc.narg('q')::text) || '%'
       OR f_unaccent(p.name) LIKE '%' || f_unaccent(sqlc.narg('q')::text) || '%'
       OR f_unaccent(p.model) LIKE '%' || f_unaccent(sqlc.narg('q')::text) || '%'
       OR (char_length(f_unaccent(sqlc.narg('q')::text)) >= 3
           AND word_similarity(f_unaccent(sqlc.narg('q')::text), f_unaccent(p.name || ' ' || p.brand || ' ' || p.model)) >= 0.35))
  AND (sqlc.narg('category_ids')::uuid[] IS NULL
       OR NOT EXISTS (SELECT 1 FROM categories fc WHERE fc.id = ANY(sqlc.narg('category_ids')::uuid[]))
       OR p.category_id = ANY(sqlc.narg('category_ids')::uuid[]))
  AND (sqlc.narg('brands')::text[] IS NULL
       OR p.brand ILIKE ANY (sqlc.narg('brands')::text[]))
  AND (sqlc.narg('min_price_vnd')::numeric IS NULL AND sqlc.narg('max_price_vnd')::numeric IS NULL OR EXISTS (
       SELECT 1 FROM product_variants v
       WHERE v.product_id = p.id AND v.active
         AND (sqlc.narg('min_price_vnd')::numeric IS NULL OR v.price_vnd >= sqlc.narg('min_price_vnd')::numeric)
         AND (sqlc.narg('max_price_vnd')::numeric IS NULL OR v.price_vnd <= sqlc.narg('max_price_vnd')::numeric)
  ))
  AND (sqlc.narg('in_stock')::boolean IS NULL
       OR (sqlc.narg('in_stock')::boolean AND EXISTS (
           SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.active AND v.stock_quantity > 0
       ))
       OR (NOT sqlc.narg('in_stock')::boolean AND NOT EXISTS (
           SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.active AND v.stock_quantity > 0
       )))
  AND (sqlc.narg('featured')::boolean IS NULL OR p.featured = sqlc.narg('featured')::boolean)
  AND (sqlc.narg('min_rating')::double precision IS NULL
       OR (COALESCE(rs.review_count, 0) > 0 AND COALESCE(rs.average_rating, 0) >= sqlc.narg('min_rating')::double precision))
ORDER BY
  CASE WHEN sqlc.arg('sort')::text = 'bestselling' THEN COALESCE(ss.sold_count, 0) END DESC,
  CASE WHEN sqlc.arg('sort')::text = 'bestselling' THEN COALESCE(rs.average_rating, 0) END DESC,
  CASE WHEN sqlc.arg('sort')::text = 'newest' THEN p.created_at END DESC,
  CASE WHEN sqlc.arg('sort')::text = 'newest' THEN p.id END DESC,
  CASE WHEN sqlc.arg('sort')::text = 'price_asc' THEN vps.min_active_price_vnd END ASC,
  CASE WHEN sqlc.arg('sort')::text = 'price_desc' THEN vps.min_active_price_vnd END DESC,
  CASE WHEN sqlc.arg('sort')::text = 'rating_desc' THEN COALESCE(rs.average_rating, 0) END DESC,
  CASE WHEN sqlc.arg('sort')::text = 'rating_desc' THEN COALESCE(rs.review_count, 0) END DESC,
  p.name ASC,
  CASE WHEN sqlc.arg('sort')::text = '' THEN p.model ELSE '' END ASC,
  p.id ASC;

-- name: ListProductOptionGroups :many
SELECT id, label, position
FROM product_option_groups
WHERE product_id = $1
ORDER BY position ASC, id ASC;

-- name: ListProductOptionValues :many
SELECT id, group_id, label, position
FROM product_option_values
WHERE product_id = $1
ORDER BY group_id ASC, position ASC, id ASC;

-- name: ListActiveProductVariants :many
SELECT v.id, v.price_vnd::text AS price_vnd, v.stock_quantity, v.active,
       (lap.variant_id IS NOT NULL)::boolean AS has_live_price,
       COALESCE(lap.live_price_vnd, 0)::text AS live_price_vnd,
       (lap.quota IS NOT NULL)::boolean AS has_live_quota,
       COALESCE(lap.quota - lap.sold_quantity, 0)::integer AS live_remaining,
       (fsrv.variant_id IS NOT NULL)::boolean AS has_flash_sale,
       COALESCE(fsrv.flash_sale_id::text, '')::text AS flash_sale_id,
       COALESCE(fsrv.campaign_name, '')::text AS flash_sale_campaign_name,
       COALESCE(fsrv.flash_price_vnd, 0)::text AS flash_sale_price_vnd,
       COALESCE(fsrv.quota, 0)::integer AS flash_sale_quota,
       COALESCE(fsrv.sold_quantity, 0)::integer AS flash_sale_sold_quantity,
       COALESCE(fsrv.ends_at, to_timestamp(0))::timestamptz AS flash_sale_ends_at
FROM product_variants v
LEFT JOIN live_active_variant_prices lap ON lap.variant_id = v.id
LEFT JOIN flash_sale_running_variants fsrv ON fsrv.variant_id = v.id
WHERE v.product_id = $1 AND v.active
ORDER BY v.price_vnd ASC, v.id ASC;

-- name: ListVariantOptionValues :many
SELECT variant_id, group_id, option_value_id
FROM variant_option_values
WHERE product_id = $1
ORDER BY variant_id ASC, group_id ASC;

-- name: GetProductByID :one
SELECT p.id,
       p.name,
       p.model,
       p.brand,
       p.description,
       c.id AS category_id,
       c.name AS category_name,
       p.featured,
       p.specs::text AS specs,
       p.active,
       p.created_at,
       p.updated_at,
       COALESCE((
           SELECT ROUND(AVG(pr.rating), 1)::double precision
           FROM product_reviews pr
           JOIN order_items oi ON oi.id = pr.order_item_id
           WHERE oi.product_id = p.id
       ), 0)::double precision AS average_rating,
       COALESCE((
           SELECT COUNT(pr.id)::bigint
           FROM product_reviews pr
           JOIN order_items oi ON oi.id = pr.order_item_id
           WHERE oi.product_id = p.id
       ), 0)::bigint AS review_count,
       COALESCE((
           SELECT SUM(oi.quantity)::bigint
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           WHERE oi.product_id = p.id
             AND o.status IN ('delivered', 'partially_returned')
       ), 0)::bigint AS sold_count
FROM products p
JOIN categories c ON c.id = p.category_id
WHERE p.id = $1
  AND p.active
  AND EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.active);

-- name: ListProductImages :many
SELECT url
FROM product_images
WHERE product_id = $1
ORDER BY position ASC, id ASC;

-- name: GetCategoryByID :one
SELECT id, name, created_at
FROM categories
WHERE id = $1;

-- name: ListAdminProducts :many
WITH review_stats AS (
    SELECT oi.product_id,
           COUNT(pr.id)::bigint AS review_count,
           COALESCE(ROUND(AVG(pr.rating), 1), 0)::double precision AS average_rating
    FROM product_reviews pr
    JOIN order_items oi ON oi.id = pr.order_item_id
    GROUP BY oi.product_id
),
sold_stats AS (
    SELECT oi.product_id,
           COALESCE(SUM(oi.quantity), 0)::bigint AS sold_count
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.status IN ('delivered', 'partially_returned')
    GROUP BY oi.product_id
)
SELECT p.id,
       p.name,
       p.model,
       p.brand,
       p.description,
       p.price::text AS price,
       p.currency,
       p.stock_quantity,
       c.id AS category_id,
       c.name AS category_name,
       p.featured,
       p.active,
       p.created_at,
       p.updated_at,
       COALESCE((SELECT pi.url
        FROM product_images pi
        WHERE pi.product_id = p.id
        ORDER BY pi.position ASC, pi.id ASC
        LIMIT 1), '')::text AS primary_image_url,
       COALESCE(rs.average_rating, 0)::double precision AS average_rating,
       COALESCE(rs.review_count, 0)::bigint AS review_count,
       COALESCE(ss.sold_count, 0)::bigint AS sold_count
FROM products p
JOIN categories c ON c.id = p.category_id
LEFT JOIN review_stats rs ON rs.product_id = p.id
LEFT JOIN sold_stats ss ON ss.product_id = p.id
WHERE p.active
  AND (sqlc.narg('q')::text IS NULL
       OR f_unaccent(c.name) LIKE '%' || f_unaccent(sqlc.narg('q')::text) || '%'
       OR f_unaccent(p.brand) LIKE '%' || f_unaccent(sqlc.narg('q')::text) || '%'
       OR f_unaccent(p.name) LIKE '%' || f_unaccent(sqlc.narg('q')::text) || '%'
       OR f_unaccent(p.model) LIKE '%' || f_unaccent(sqlc.narg('q')::text) || '%'
       OR (char_length(f_unaccent(sqlc.narg('q')::text)) >= 3
           AND word_similarity(f_unaccent(sqlc.narg('q')::text), f_unaccent(p.name || ' ' || p.brand || ' ' || p.model)) >= 0.35))
ORDER BY p.name ASC, p.model ASC, p.id ASC;

-- name: GetAdminProductByID :one
SELECT p.id,
       p.name,
       p.model,
       p.brand,
       p.description,
       p.price::text AS price,
       p.currency,
       p.stock_quantity,
       c.id AS category_id,
       c.name AS category_name,
       p.featured,
       p.specs::text AS specs,
       p.active,
       p.created_at,
       p.updated_at,
       COALESCE((
           SELECT ROUND(AVG(pr.rating), 1)::double precision
           FROM product_reviews pr
           JOIN order_items oi ON oi.id = pr.order_item_id
           WHERE oi.product_id = p.id
       ), 0)::double precision AS average_rating,
       COALESCE((
           SELECT COUNT(pr.id)::bigint
           FROM product_reviews pr
           JOIN order_items oi ON oi.id = pr.order_item_id
           WHERE oi.product_id = p.id
       ), 0)::bigint AS review_count,
       COALESCE((
           SELECT SUM(oi.quantity)::bigint
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           WHERE oi.product_id = p.id
             AND o.status IN ('delivered', 'partially_returned')
       ), 0)::bigint AS sold_count
FROM products p
JOIN categories c ON c.id = p.category_id
WHERE p.id = $1
  AND p.active;

-- name: CreateProduct :one
INSERT INTO products (
    category_id,
    name,
    description,
    price,
    currency,
    stock_quantity,
    model,
    brand,
    featured,
    specs,
    active,
    created_at,
    updated_at
) VALUES (
    @category_id, @name, @description, @price, @currency, @stock_quantity, @model, @brand, @featured, @specs::jsonb, true, now(), now()
)
RETURNING id, category_id, name, description, price::text AS price, currency, stock_quantity, model, brand, featured, specs::text AS specs, active, created_at, updated_at;

-- name: CreateProductImage :exec
INSERT INTO product_images (
    product_id,
    url,
    position,
    created_at
) VALUES (
    $1, $2, $3, now()
);

-- name: UpdateProduct :one
UPDATE products
SET category_id = @category_id,
    name = @name,
    description = @description,
    price = @price,
    currency = @currency,
    stock_quantity = @stock_quantity,
    model = @model,
    brand = @brand,
    featured = @featured,
    specs = @specs::jsonb,
    active = true,
    updated_at = now()
WHERE id = @id AND active
RETURNING id, category_id, name, description, price::text AS price, currency, stock_quantity, model, brand, featured, specs::text AS specs, active, created_at, updated_at;

-- name: DeleteProductImages :exec
DELETE FROM product_images
WHERE product_id = $1;

-- name: SoftDeleteProduct :one
UPDATE products
SET active = false,
    updated_at = now()
WHERE id = $1 AND active
RETURNING id;

-- name: UpdateVariantStock :exec
UPDATE product_variants
SET stock_quantity = $2
WHERE id = $1;

-- name: CreateProductOptionGroup :exec
INSERT INTO product_option_groups (
    id,
    product_id,
    label,
    position
) VALUES (
    $1, $2, $3, $4
);

-- name: DeleteProductOptionGroups :exec
DELETE FROM product_option_groups
WHERE product_id = $1;

-- name: CreateProductOptionValue :exec
INSERT INTO product_option_values (
    id,
    product_id,
    group_id,
    label,
    position
) VALUES (
    $1, $2, $3, $4, $5
);

-- name: DeleteProductOptionValues :exec
DELETE FROM product_option_values
WHERE product_id = $1;

-- name: CreateProductVariant :exec
INSERT INTO product_variants (
    id,
    product_id,
    price_vnd,
    stock_quantity,
    active,
    created_at,
    updated_at
) VALUES (
    $1, $2, $3, $4, $5, now(), now()
);

-- name: UpdateProductVariant :exec
UPDATE product_variants
SET price_vnd = $2,
    stock_quantity = $3,
    active = $4,
    updated_at = now()
WHERE id = $1 AND product_id = $5;

-- name: DeleteProductVariant :exec
DELETE FROM product_variants
WHERE id = $1 AND product_id = $2;

-- name: SoftDeleteProductVariant :exec
UPDATE product_variants
SET active = false,
    updated_at = now()
WHERE id = $1 AND product_id = $2;

-- name: DeleteProductVariants :exec
DELETE FROM product_variants
WHERE product_id = $1;

-- name: SoftDeleteProductVariants :exec
UPDATE product_variants
SET active = false,
    updated_at = now()
WHERE product_id = $1;

-- name: ListProductVariants :many
SELECT id, price_vnd::text AS price_vnd, stock_quantity, active
FROM product_variants
WHERE product_id = $1
ORDER BY price_vnd ASC, id ASC;

-- name: CreateVariantOptionValue :exec
INSERT INTO variant_option_values (
    variant_id,
    product_id,
    group_id,
    option_value_id
) VALUES (
    $1, $2, $3, $4
);

-- name: DeleteVariantOptionValues :exec
DELETE FROM variant_option_values
WHERE product_id = $1;

-- name: UpdateProductPriceAndStock :exec
UPDATE products
SET price = $2,
    stock_quantity = $3,
    updated_at = now()
WHERE id = $1;


