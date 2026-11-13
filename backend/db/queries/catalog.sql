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
        LIMIT 1), '')::text AS primary_image_url
FROM products p
JOIN categories c ON c.id = p.category_id
WHERE p.active
  AND EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.active)
  AND (sqlc.narg('q')::text IS NULL OR lower(c.name) LIKE '%' || lower(sqlc.narg('q')::text) || '%'
       OR lower(p.brand) LIKE '%' || lower(sqlc.narg('q')::text) || '%'
       OR lower(p.name) LIKE '%' || lower(sqlc.narg('q')::text) || '%'
       OR lower(p.model) LIKE '%' || lower(sqlc.narg('q')::text) || '%')
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
ORDER BY p.name ASC, p.model ASC, p.id ASC;

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
       COALESCE(lap.quota - lap.sold_quantity, 0)::integer AS live_remaining
FROM product_variants v
LEFT JOIN live_active_variant_prices lap ON lap.variant_id = v.id
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
       p.active,
       p.created_at,
       p.updated_at
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
        LIMIT 1), '')::text AS primary_image_url
FROM products p
JOIN categories c ON c.id = p.category_id
WHERE p.active
  AND (sqlc.narg('q')::text IS NULL OR lower(c.name) LIKE '%' || lower(sqlc.narg('q')::text) || '%'
       OR lower(p.brand) LIKE '%' || lower(sqlc.narg('q')::text) || '%'
       OR lower(p.name) LIKE '%' || lower(sqlc.narg('q')::text) || '%'
       OR lower(p.model) LIKE '%' || lower(sqlc.narg('q')::text) || '%')
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
       p.active,
       p.created_at,
       p.updated_at
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
    active,
    created_at,
    updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, true, now(), now()
)
RETURNING id, category_id, name, description, price::text AS price, currency, stock_quantity, model, brand, featured, active, created_at, updated_at;

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
SET category_id = $2,
    name = $3,
    description = $4,
    price = $5,
    currency = $6,
    stock_quantity = $7,
    model = $8,
    brand = $9,
    featured = $10,
    active = true,
    updated_at = now()
WHERE id = $1 AND active
RETURNING id, category_id, name, description, price::text AS price, currency, stock_quantity, model, brand, featured, active, created_at, updated_at;

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


