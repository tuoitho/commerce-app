-- name: LockSubmittedCartItems :many
SELECT ci.id, ci.user_id, ci.variant_id, ci.quantity, ci.selected,
       ci.snapshot_brand_name, ci.snapshot_product_name, ci.snapshot_model,
       ci.snapshot_image_url, ci.snapshot_options::text AS snapshot_options,
       v.product_id, p.active AS product_active, v.active AS variant_active,
       v.price_vnd::text AS price_vnd, v.stock_quantity,
       p.brand AS brand_name, p.name AS product_name, p.model,
       COALESCE((SELECT pi.url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.position, pi.id LIMIT 1), '')::text AS image_url,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('groupLabel', g.label, 'valueLabel', ov.label) ORDER BY g.position, g.id)
                 FROM variant_option_values vov JOIN product_option_groups g ON g.id = vov.group_id
                 JOIN product_option_values ov ON ov.id = vov.option_value_id
                 WHERE vov.variant_id = v.id), '[]'::jsonb)::text AS options
FROM cart_items ci
JOIN product_variants v ON v.id = ci.variant_id
JOIN products p ON p.id = v.product_id
WHERE ci.user_id = @user_id AND v.id = ANY(@variant_ids::uuid[])
ORDER BY ci.created_at, ci.id
FOR UPDATE OF ci, v;

-- name: DecrementVariantStock :one
UPDATE product_variants
SET stock_quantity = stock_quantity - @quantity::bigint,
    updated_at = now()
WHERE id = @id AND active AND stock_quantity >= @quantity::bigint
RETURNING id;

-- name: IncrementVariantStock :exec
UPDATE product_variants
SET stock_quantity = stock_quantity + @quantity::bigint,
    updated_at = now()
WHERE id = @id;

-- name: InsertOrder :one
INSERT INTO orders (
    user_id, status, payment_method,
    subtotal_vnd, shipping_fee_vnd, total_vnd,
    recipient_name, phone, province_name, ward_name, detail_address
)
VALUES (
    @user_id, @status, @payment_method,
    @subtotal_vnd::numeric, @shipping_fee_vnd::numeric, @total_vnd::numeric,
    @recipient_name, @phone, @province_name, @ward_name, @detail_address
)
RETURNING id, user_id, status, payment_method,
          subtotal_vnd::text AS subtotal_vnd,
          shipping_fee_vnd::text AS shipping_fee_vnd,
          total_vnd::text AS total_vnd,
          recipient_name, phone, province_name, ward_name, detail_address,
          created_at, updated_at, confirmed_at, cancelled_at, delivered_at;

-- name: InsertOrderItem :exec
INSERT INTO order_items (
    order_id, variant_id, product_id,
    brand_name, product_name, model, image_url, options,
    unit_price_vnd, quantity, line_total_vnd
)
VALUES (
    @order_id, @variant_id, @product_id,
    @brand_name, @product_name, @model, @image_url, @options::jsonb,
    @unit_price_vnd::numeric, @quantity::bigint, @line_total_vnd::numeric
);

-- name: RemoveSelectedCartItems :exec
DELETE FROM cart_items
WHERE user_id = $1 AND selected = true;

-- name: GetOrderByID :one
SELECT id, user_id, status, payment_method,
       subtotal_vnd::text AS subtotal_vnd,
       shipping_fee_vnd::text AS shipping_fee_vnd,
       total_vnd::text AS total_vnd,
       recipient_name, phone, province_name, ward_name, detail_address,
       created_at, updated_at, confirmed_at, cancelled_at, delivered_at
FROM orders
WHERE id = $1 AND user_id = $2;

-- name: ListOrderItemsByOrderID :many
SELECT id, order_id, variant_id, product_id,
       brand_name, product_name, model, image_url,
       options::text AS options,
       unit_price_vnd::text AS unit_price_vnd,
       quantity,
       line_total_vnd::text AS line_total_vnd
FROM order_items
WHERE order_id = $1
ORDER BY id ASC;

-- name: ListOrderItemsByOrderIDs :many
SELECT id, order_id, variant_id, product_id,
       brand_name, product_name, model, image_url,
       options::text AS options,
       unit_price_vnd::text AS unit_price_vnd,
       quantity,
       line_total_vnd::text AS line_total_vnd
FROM order_items
WHERE order_id = ANY(@order_ids::uuid[])
ORDER BY order_id, id ASC;

-- name: ListOrdersByUser :many
SELECT id, user_id, status, payment_method,
       subtotal_vnd::text AS subtotal_vnd,
       shipping_fee_vnd::text AS shipping_fee_vnd,
       total_vnd::text AS total_vnd,
       recipient_name, phone, province_name, ward_name, detail_address,
       created_at, updated_at, confirmed_at, cancelled_at, delivered_at
FROM orders
WHERE user_id = @user_id
  AND (COALESCE(cardinality(@statuses::text[]), 0) = 0 OR status = ANY(@statuses::text[]))
ORDER BY created_at DESC, id DESC;

-- name: CountOrdersByStatus :many
SELECT status, count(*) AS count
FROM orders
WHERE user_id = $1
GROUP BY status;

-- name: LockOrderForUpdate :one
SELECT id, user_id, status, payment_method,
       subtotal_vnd::text AS subtotal_vnd,
       shipping_fee_vnd::text AS shipping_fee_vnd,
       total_vnd::text AS total_vnd,
       recipient_name, phone, province_name, ward_name, detail_address,
       created_at, updated_at, confirmed_at, cancelled_at, delivered_at
FROM orders
WHERE id = $1 AND user_id = $2
FOR UPDATE;

-- name: SetOrderStatus :exec
UPDATE orders
SET status = $2,
    confirmed_at = $3,
    cancelled_at = $4,
    updated_at = now()
WHERE id = $1;

-- name: AutoConfirmDueOrders :exec
UPDATE orders
SET status = 'confirmed',
    confirmed_at = now(),
    updated_at = now()
WHERE status = 'pending_confirmation' AND created_at <= $1;

-- name: ListOrdersByAdmin :many
SELECT o.id, o.user_id, o.status, o.payment_method,
       o.subtotal_vnd::text AS subtotal_vnd,
       o.shipping_fee_vnd::text AS shipping_fee_vnd,
       o.total_vnd::text AS total_vnd,
       o.recipient_name, o.phone, o.province_name, o.ward_name, o.detail_address,
       o.created_at, o.updated_at, o.confirmed_at, o.cancelled_at, o.delivered_at,
       u.email AS buyer_email
FROM orders o
JOIN users u ON u.id = o.user_id
WHERE (COALESCE(cardinality(@statuses::text[]), 0) = 0 OR o.status = ANY(@statuses::text[]))
ORDER BY o.created_at DESC, o.id DESC;

-- name: GetOrderByAdminID :one
SELECT o.id, o.user_id, o.status, o.payment_method,
       o.subtotal_vnd::text AS subtotal_vnd,
       o.shipping_fee_vnd::text AS shipping_fee_vnd,
       o.total_vnd::text AS total_vnd,
       o.recipient_name, o.phone, o.province_name, o.ward_name, o.detail_address,
       o.created_at, o.updated_at, o.confirmed_at, o.cancelled_at, o.delivered_at,
       u.email AS buyer_email
FROM orders o
JOIN users u ON u.id = o.user_id
WHERE o.id = $1;

-- name: LockOrderForUpdateAdmin :one
SELECT o.id, o.user_id, o.status, o.payment_method,
       o.subtotal_vnd::text AS subtotal_vnd,
       o.shipping_fee_vnd::text AS shipping_fee_vnd,
       o.total_vnd::text AS total_vnd,
       o.recipient_name, o.phone, o.province_name, o.ward_name, o.detail_address,
       o.created_at, o.updated_at, o.confirmed_at, o.cancelled_at, o.delivered_at,
       u.email AS buyer_email
FROM orders o
JOIN users u ON u.id = o.user_id
WHERE o.id = $1
FOR UPDATE;

-- name: SetOrderDeliveredAt :exec
UPDATE orders
SET delivered_at = now(), updated_at = now()
WHERE id = $1;

