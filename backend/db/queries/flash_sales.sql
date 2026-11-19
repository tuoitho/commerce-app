-- name: GetCurrentRunningFlashSale :one
SELECT id, name, starts_at, ends_at
FROM flash_sales
WHERE active = true
  AND starts_at <= now()
  AND now() < ends_at
ORDER BY starts_at DESC, id ASC
LIMIT 1;

-- name: ListPublicFlashSaleItems :many
SELECT fsi.product_id,
       fsi.variant_id,
       p.name AS product_name,
       p.brand,
       p.model,
       COALESCE((SELECT pi.url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.position ASC, pi.id ASC LIMIT 1), '')::text AS image_url,
       COALESCE((SELECT string_agg(ov.label, ' / ' ORDER BY g.position, g.id)
                 FROM variant_option_values vov
                 JOIN product_option_groups g ON g.id = vov.group_id
                 JOIN product_option_values ov ON ov.id = vov.option_value_id
                 WHERE vov.variant_id = v.id), '')::text AS option_label,
       v.price_vnd::text AS regular_price_vnd,
       fsi.flash_price_vnd::text AS flash_price_vnd,
       fsi.quota,
       fsi.sold_quantity,
       (v.stock_quantity > 0)::boolean AS in_stock
FROM flash_sale_items fsi
JOIN products p ON p.id = fsi.product_id
JOIN product_variants v ON v.id = fsi.variant_id
WHERE fsi.flash_sale_id = @flash_sale_id
  AND p.active = true
  AND v.active = true
  AND fsi.flash_price_vnd < v.price_vnd
ORDER BY fsi.position ASC, fsi.variant_id ASC;

-- name: CountAdminFlashSales :one
SELECT COUNT(*)::bigint
FROM flash_sales fs
WHERE (
    sqlc.narg('status')::text IS NULL
    OR sqlc.narg('status')::text = ''
    OR (sqlc.narg('status')::text = 'inactive' AND NOT fs.active)
    OR (sqlc.narg('status')::text = 'scheduled' AND fs.active AND now() < fs.starts_at)
    OR (sqlc.narg('status')::text = 'running' AND fs.active AND fs.starts_at <= now() AND now() < fs.ends_at)
    OR (sqlc.narg('status')::text = 'ended' AND fs.active AND now() >= fs.ends_at)
);

-- name: ListAdminFlashSales :many
SELECT fs.id,
       fs.name,
       fs.starts_at,
       fs.ends_at,
       fs.active,
       fs.created_at,
       fs.updated_at,
       COUNT(fsi.variant_id)::integer AS variant_count,
       COALESCE(SUM(fsi.quota), 0)::integer AS total_quota,
       COALESCE(SUM(fsi.sold_quantity), 0)::integer AS total_sold
FROM flash_sales fs
LEFT JOIN flash_sale_items fsi ON fsi.flash_sale_id = fs.id
WHERE (
    sqlc.narg('status')::text IS NULL
    OR sqlc.narg('status')::text = ''
    OR (sqlc.narg('status')::text = 'inactive' AND NOT fs.active)
    OR (sqlc.narg('status')::text = 'scheduled' AND fs.active AND now() < fs.starts_at)
    OR (sqlc.narg('status')::text = 'running' AND fs.active AND fs.starts_at <= now() AND now() < fs.ends_at)
    OR (sqlc.narg('status')::text = 'ended' AND fs.active AND now() >= fs.ends_at)
)
GROUP BY fs.id
ORDER BY fs.starts_at DESC, fs.created_at DESC, fs.id DESC
LIMIT @row_limit OFFSET @row_offset;

-- name: GetAdminFlashSaleByID :one
SELECT id, name, starts_at, ends_at, active, created_at, updated_at
FROM flash_sales
WHERE id = @id;

-- name: LockFlashSale :one
SELECT id, name, starts_at, ends_at, active, created_at, updated_at
FROM flash_sales
WHERE id = @id
FOR UPDATE;

-- name: ListAdminFlashSaleItems :many
SELECT fsi.product_id,
       fsi.variant_id,
       p.name AS product_name,
       p.brand,
       p.model,
       COALESCE((SELECT pi.url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.position ASC, pi.id ASC LIMIT 1), '')::text AS image_url,
       COALESCE((SELECT string_agg(ov.label, ' / ' ORDER BY g.position, g.id)
                 FROM variant_option_values vov
                 JOIN product_option_groups g ON g.id = vov.group_id
                 JOIN product_option_values ov ON ov.id = vov.option_value_id
                 WHERE vov.variant_id = v.id), '')::text AS option_label,
       (v.active AND p.active)::boolean AS variant_active,
       v.price_vnd::text AS regular_price_vnd,
       fsi.flash_price_vnd::text AS flash_price_vnd,
       fsi.quota,
       fsi.sold_quantity,
       fsi.position
FROM flash_sale_items fsi
JOIN products p ON p.id = fsi.product_id
JOIN product_variants v ON v.id = fsi.variant_id
WHERE fsi.flash_sale_id = @flash_sale_id
ORDER BY fsi.position ASC, fsi.variant_id ASC;

-- name: ListVariantsForFlashSaleValidation :many
SELECT v.id, v.product_id, v.active AS variant_active, p.active AS product_active, v.price_vnd::text AS price_vnd
FROM product_variants v
JOIN products p ON p.id = v.product_id
WHERE v.id = ANY(@variant_ids::uuid[]);

-- name: ListFlashSaleItemSold :many
SELECT variant_id, sold_quantity
FROM flash_sale_items
WHERE flash_sale_id = @flash_sale_id;

-- name: CreateFlashSale :one
INSERT INTO flash_sales (name, starts_at, ends_at, active, created_by)
VALUES (@name, @starts_at, @ends_at, @active, sqlc.narg(created_by)::uuid)
RETURNING id, name, starts_at, ends_at, active, created_at, updated_at;

-- name: UpdateFlashSale :one
UPDATE flash_sales
SET name = @name,
    starts_at = @starts_at,
    ends_at = @ends_at,
    active = @active,
    updated_at = now()
WHERE id = @id
RETURNING id, name, starts_at, ends_at, active, created_at, updated_at;

-- name: DeleteFlashSaleItemsExcept :exec
DELETE FROM flash_sale_items
WHERE flash_sale_id = @flash_sale_id
  AND NOT (variant_id = ANY(@variant_ids::uuid[]));

-- name: UpsertFlashSaleItem :exec
INSERT INTO flash_sale_items (flash_sale_id, product_id, variant_id, flash_price_vnd, quota, position)
VALUES (@flash_sale_id, @product_id, @variant_id, @flash_price_vnd::numeric, @quota, @position)
ON CONFLICT (flash_sale_id, variant_id) DO UPDATE
SET product_id = EXCLUDED.product_id,
    flash_price_vnd = EXCLUDED.flash_price_vnd,
    quota = EXCLUDED.quota,
    position = EXCLUDED.position;

-- name: GetFlashSaleTotalSold :one
SELECT COALESCE(SUM(sold_quantity), 0)::integer AS total_sold
FROM flash_sale_items
WHERE flash_sale_id = @flash_sale_id;

-- name: DeleteFlashSale :execrows
DELETE FROM flash_sales
WHERE id = @id;
