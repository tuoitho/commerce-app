-- name: LockSubmittedCartItems :many
SELECT ci.id, ci.user_id, ci.variant_id, ci.quantity, ci.selected,
       ci.snapshot_brand_name, ci.snapshot_product_name, ci.snapshot_model,
       ci.snapshot_image_url, ci.snapshot_options::text AS snapshot_options,
       v.product_id, p.active AS product_active, v.active AS variant_active,
       CASE
           WHEN lap.variant_id IS NOT NULL AND (fsap.variant_id IS NULL OR lap.live_price_vnd <= fsap.flash_price_vnd) THEN lap.live_price_vnd
           WHEN fsap.variant_id IS NOT NULL THEN fsap.flash_price_vnd
           ELSE v.price_vnd
       END::text AS price_vnd,
       CASE
           WHEN lap.variant_id IS NOT NULL AND (fsap.variant_id IS NULL OR lap.live_price_vnd <= fsap.flash_price_vnd) THEN lap.session_id::text
           ELSE ''
       END::text AS live_session_id,
       CASE
           WHEN fsap.variant_id IS NOT NULL AND (lap.variant_id IS NULL OR fsap.flash_price_vnd < lap.live_price_vnd) THEN fsap.flash_sale_id::text
           ELSE ''
       END::text AS flash_sale_id,
       v.stock_quantity,
       p.brand AS brand_name, p.name AS product_name, p.model,
       COALESCE((SELECT pi.url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.position, pi.id LIMIT 1), '')::text AS image_url,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('groupLabel', g.label, 'valueLabel', ov.label) ORDER BY g.position, g.id)
                 FROM variant_option_values vov JOIN product_option_groups g ON g.id = vov.group_id
                 JOIN product_option_values ov ON ov.id = vov.option_value_id
                 WHERE vov.variant_id = v.id), '[]'::jsonb)::text AS options
FROM cart_items ci
JOIN product_variants v ON v.id = ci.variant_id
JOIN products p ON p.id = v.product_id
LEFT JOIN live_active_variant_prices lap ON lap.variant_id = v.id
LEFT JOIN flash_sale_active_variant_prices fsap ON fsap.variant_id = v.id
WHERE ci.user_id = @user_id AND v.id = ANY(@variant_ids::uuid[])
ORDER BY v.id ASC, ci.id ASC
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
    user_id, status, payment_method, payment_status,
    subtotal_vnd, shipping_fee_vnd, discount_vnd, total_vnd,
    voucher_id, voucher_code, voucher_type, delivery_method,
    recipient_name, phone, province_name, ward_name, detail_address
)
VALUES (
    @user_id, @status, @payment_method, @payment_status,
    @subtotal_vnd::numeric, @shipping_fee_vnd::numeric, @discount_vnd::numeric, @total_vnd::numeric,
    sqlc.narg(voucher_id)::uuid, sqlc.narg(voucher_code)::text, sqlc.narg(voucher_type)::text, @delivery_method,
    @recipient_name, @phone, @province_name, @ward_name, @detail_address
)
RETURNING id, user_id, status, payment_method, payment_status, payment_transaction_id, paid_at,
          subtotal_vnd::text AS subtotal_vnd,
          shipping_fee_vnd::text AS shipping_fee_vnd,
          discount_vnd::text AS discount_vnd,
          total_vnd::text AS total_vnd,
          voucher_id, voucher_code, voucher_type, delivery_method, shipping_carrier, tracking_code,
          recipient_name, phone, province_name, ward_name, detail_address,
          created_at, updated_at, confirmed_at, preparing_at, shipped_at, cancelled_at, delivered_at;

-- name: InsertOrderItem :exec
INSERT INTO order_items (
    order_id, variant_id, product_id,
    brand_name, product_name, model, image_url, options,
    unit_price_vnd, quantity, line_total_vnd, live_session_id, flash_sale_id
)
VALUES (
    @order_id, @variant_id, @product_id,
    @brand_name, @product_name, @model, @image_url, @options::jsonb,
    @unit_price_vnd::numeric, @quantity::bigint, @line_total_vnd::numeric,
    sqlc.narg(live_session_id)::uuid, sqlc.narg(flash_sale_id)::uuid
);

-- name: RemoveSelectedCartItems :exec
DELETE FROM cart_items
WHERE user_id = $1 AND selected = true;

-- name: GetOrderByID :one
SELECT id, user_id, status, payment_method, payment_status, payment_transaction_id, paid_at,
       subtotal_vnd::text AS subtotal_vnd,
       shipping_fee_vnd::text AS shipping_fee_vnd,
       discount_vnd::text AS discount_vnd,
       total_vnd::text AS total_vnd,
       voucher_id, voucher_code, voucher_type, delivery_method, shipping_carrier, tracking_code,
       recipient_name, phone, province_name, ward_name, detail_address,
       created_at, updated_at, confirmed_at, preparing_at, shipped_at, cancelled_at, delivered_at
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
SELECT id, user_id, status, payment_method, payment_status, payment_transaction_id, paid_at,
       subtotal_vnd::text AS subtotal_vnd,
       shipping_fee_vnd::text AS shipping_fee_vnd,
       discount_vnd::text AS discount_vnd,
       total_vnd::text AS total_vnd,
       voucher_id, voucher_code, voucher_type, delivery_method, shipping_carrier, tracking_code,
       recipient_name, phone, province_name, ward_name, detail_address,
       created_at, updated_at, confirmed_at, preparing_at, shipped_at, cancelled_at, delivered_at
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
SELECT id, user_id, status, payment_method, payment_status, payment_transaction_id, paid_at,
       subtotal_vnd::text AS subtotal_vnd,
       shipping_fee_vnd::text AS shipping_fee_vnd,
       discount_vnd::text AS discount_vnd,
       total_vnd::text AS total_vnd,
       voucher_id, voucher_code, voucher_type, delivery_method, shipping_carrier, tracking_code,
       recipient_name, phone, province_name, ward_name, detail_address,
       created_at, updated_at, confirmed_at, preparing_at, shipped_at, cancelled_at, delivered_at
FROM orders
WHERE id = $1 AND user_id = $2
FOR UPDATE;

-- name: SetOrderStatus :exec
UPDATE orders
SET status = $2,
    confirmed_at = $3,
    cancelled_at = $4,
    delivered_at = $5,
    updated_at = now()
WHERE id = $1;

-- name: SetOrderPreparing :exec
UPDATE orders
SET status = 'preparing',
    preparing_at = COALESCE(preparing_at, @preparing_at::timestamptz),
    updated_at = now()
WHERE id = @id;

-- name: SetOrderShipped :exec
UPDATE orders
SET status = 'shipped',
    shipped_at = COALESCE(shipped_at, @shipped_at::timestamptz),
    updated_at = now()
WHERE id = @id;

-- name: SetOrderShippedWithTracking :exec
UPDATE orders
SET status = 'shipped',
    shipping_carrier = @shipping_carrier,
    tracking_code = @tracking_code,
    shipped_at = COALESCE(shipped_at, @shipped_at::timestamptz),
    updated_at = now()
WHERE id = @id;

-- name: SetOrderPaymentFailed :exec
UPDATE orders
SET payment_status = 'failed',
    updated_at = now()
WHERE id = @id
  AND status = 'pending_confirmation'
  AND payment_status = 'pending';

-- name: SetOrderPaymentPending :exec
UPDATE orders
SET payment_status = 'pending',
    updated_at = now()
WHERE id = @id;

-- name: SetOrderPaymentPaid :exec
UPDATE orders
SET payment_status = 'paid',
    payment_transaction_id = sqlc.narg(payment_transaction_id)::text,
    paid_at = COALESCE(paid_at, @paid_at::timestamptz),
    updated_at = now()
WHERE id = @id;

-- name: SetOrderPaymentRefunded :exec
UPDATE orders
SET payment_status = 'refunded',
    updated_at = now()
WHERE id = @id;

-- name: ConfirmOrderMomoPaid :exec
UPDATE orders
SET status = 'confirmed',
    confirmed_at = COALESCE(confirmed_at, @now::timestamptz),
    payment_status = 'paid',
    payment_transaction_id = sqlc.narg(payment_transaction_id)::text,
    paid_at = COALESCE(paid_at, @now::timestamptz),
    updated_at = now()
WHERE id = @id;

-- name: AutoConfirmDueOrders :exec
WITH confirmed AS (
    UPDATE orders o
    SET status = 'confirmed',
        confirmed_at = now(),
        updated_at = now()
    WHERE o.status = 'pending_confirmation'
      AND o.payment_method = 'cod'
      AND o.created_at <= $1
    RETURNING o.id
)
INSERT INTO order_status_events (order_id, status, actor_type, note)
SELECT id, 'confirmed', 'system', 'Hệ thống tự động xác nhận đơn hàng COD'
FROM confirmed;

-- name: AutoConfirmDueOrdersReturning :many
WITH confirmed AS (
    UPDATE orders o
    SET status = 'confirmed',
        confirmed_at = now(),
        updated_at = now()
    WHERE o.status = 'pending_confirmation'
      AND o.payment_method = 'cod'
      AND o.created_at <= $1
    RETURNING o.id, o.user_id, o.total_vnd
),
events AS (
    INSERT INTO order_status_events (order_id, status, actor_type, note)
    SELECT id, 'confirmed', 'system', 'Hệ thống tự động xác nhận đơn hàng COD'
    FROM confirmed
)
SELECT id, user_id, total_vnd::text AS total_vnd
FROM confirmed;

-- name: LockExpiredMomoOrders :many
SELECT id, user_id, total_vnd::text AS total_vnd
FROM orders
WHERE status = 'pending_confirmation'
  AND payment_method = 'momo'
  AND payment_status IN ('pending', 'failed')
  AND created_at <= @cutoff::timestamptz
ORDER BY created_at ASC, id ASC
FOR UPDATE SKIP LOCKED;

-- name: MarkOrderMomoExpiredCancelled :exec
UPDATE orders
SET status = 'cancelled',
    cancelled_at = @cancelled_at::timestamptz,
    payment_status = 'failed',
    updated_at = now()
WHERE id = @id;

-- name: ListOrdersByAdmin :many
SELECT o.id, o.user_id, o.status, o.payment_method, o.payment_status, o.payment_transaction_id, o.paid_at,
       o.subtotal_vnd::text AS subtotal_vnd,
       o.shipping_fee_vnd::text AS shipping_fee_vnd,
       o.discount_vnd::text AS discount_vnd,
       o.total_vnd::text AS total_vnd,
       o.voucher_id, o.voucher_code, o.voucher_type, o.delivery_method, o.shipping_carrier, o.tracking_code,
       o.recipient_name, o.phone, o.province_name, o.ward_name, o.detail_address,
       o.created_at, o.updated_at, o.confirmed_at, o.preparing_at, o.shipped_at, o.cancelled_at, o.delivered_at,
       u.email AS buyer_email
FROM orders o
JOIN users u ON u.id = o.user_id
WHERE (COALESCE(cardinality(@statuses::text[]), 0) = 0 OR o.status = ANY(@statuses::text[]))
ORDER BY o.created_at DESC, o.id DESC;

-- name: GetOrderByAdminID :one
SELECT o.id, o.user_id, o.status, o.payment_method, o.payment_status, o.payment_transaction_id, o.paid_at,
       o.subtotal_vnd::text AS subtotal_vnd,
       o.shipping_fee_vnd::text AS shipping_fee_vnd,
       o.discount_vnd::text AS discount_vnd,
       o.total_vnd::text AS total_vnd,
       o.voucher_id, o.voucher_code, o.voucher_type, o.delivery_method, o.shipping_carrier, o.tracking_code,
       o.recipient_name, o.phone, o.province_name, o.ward_name, o.detail_address,
       o.created_at, o.updated_at, o.confirmed_at, o.preparing_at, o.shipped_at, o.cancelled_at, o.delivered_at,
       u.email AS buyer_email
FROM orders o
JOIN users u ON u.id = o.user_id
WHERE o.id = $1;

-- name: LockOrderForUpdateAdmin :one
SELECT o.id, o.user_id, o.status, o.payment_method, o.payment_status, o.payment_transaction_id, o.paid_at,
       o.subtotal_vnd::text AS subtotal_vnd,
       o.shipping_fee_vnd::text AS shipping_fee_vnd,
       o.discount_vnd::text AS discount_vnd,
       o.total_vnd::text AS total_vnd,
       o.voucher_id, o.voucher_code, o.voucher_type, o.delivery_method, o.shipping_carrier, o.tracking_code,
       o.recipient_name, o.phone, o.province_name, o.ward_name, o.detail_address,
       o.created_at, o.updated_at, o.confirmed_at, o.preparing_at, o.shipped_at, o.cancelled_at, o.delivered_at,
       u.email AS buyer_email
FROM orders o
JOIN users u ON u.id = o.user_id
WHERE o.id = $1
FOR UPDATE OF o;

-- name: ListReviewableOrdersByUser :many
SELECT o.id, o.user_id, o.status, o.payment_method, o.payment_status, o.payment_transaction_id, o.paid_at,
       o.subtotal_vnd::text AS subtotal_vnd,
       o.shipping_fee_vnd::text AS shipping_fee_vnd,
       o.discount_vnd::text AS discount_vnd,
       o.total_vnd::text AS total_vnd,
       o.voucher_id, o.voucher_code, o.voucher_type, o.delivery_method, o.shipping_carrier, o.tracking_code,
       o.recipient_name, o.phone, o.province_name, o.ward_name, o.detail_address,
       o.created_at, o.updated_at, o.confirmed_at, o.preparing_at, o.shipped_at, o.cancelled_at, o.delivered_at
FROM orders o
WHERE o.user_id = @user_id
  AND o.status IN ('delivered', 'partially_returned')
  AND EXISTS (
      SELECT 1
      FROM order_items oi
      WHERE oi.order_id = o.id
        AND NOT EXISTS (
            SELECT 1
            FROM product_reviews pr
            WHERE pr.order_item_id = oi.id
        )
        AND NOT EXISTS (
            SELECT 1
            FROM return_request_items rri
            JOIN return_requests rr ON rr.id = rri.return_request_id
            WHERE rri.order_item_id = oi.id
              AND rr.status = 'refunded'
        )
  )
ORDER BY o.created_at DESC, o.id DESC;

-- name: CountReviewableOrdersByUser :one
SELECT COUNT(*)::bigint AS count
FROM orders o
WHERE o.user_id = $1
  AND o.status IN ('delivered', 'partially_returned')
  AND EXISTS (
      SELECT 1
      FROM order_items oi
      WHERE oi.order_id = o.id
        AND NOT EXISTS (
            SELECT 1
            FROM product_reviews pr
            WHERE pr.order_item_id = oi.id
        )
        AND NOT EXISTS (
            SELECT 1
            FROM return_request_items rri
            JOIN return_requests rr ON rr.id = rri.return_request_id
            WHERE rri.order_item_id = oi.id
              AND rr.status = 'refunded'
        )
  );

-- name: InsertOrderStatusEvent :exec
INSERT INTO order_status_events (order_id, status, actor_type, note, created_at)
VALUES (@order_id, @status, @actor_type, @note, clock_timestamp());

-- name: ListOrderStatusEventsByOrderID :many
SELECT id, order_id, status, actor_type, note, created_at
FROM order_status_events
WHERE order_id = @order_id
ORDER BY created_at ASC,
         CASE status
             WHEN 'pending_confirmation' THEN 1
             WHEN 'confirmed' THEN 2
             WHEN 'preparing' THEN 3
             WHEN 'cancel_requested' THEN 4
             WHEN 'shipped' THEN 5
             WHEN 'delivered' THEN 6
             WHEN 'cancelled' THEN 7
             WHEN 'partially_returned' THEN 8
             WHEN 'returned' THEN 9
             ELSE 99
         END ASC,
         id ASC;

-- name: ListOrderStatusEventsByOrderIDs :many
SELECT id, order_id, status, actor_type, note, created_at
FROM order_status_events
WHERE order_id = ANY(@order_ids::uuid[])
ORDER BY order_id,
         created_at ASC,
         CASE status
             WHEN 'pending_confirmation' THEN 1
             WHEN 'confirmed' THEN 2
             WHEN 'preparing' THEN 3
             WHEN 'cancel_requested' THEN 4
             WHEN 'shipped' THEN 5
             WHEN 'delivered' THEN 6
             WHEN 'cancelled' THEN 7
             WHEN 'partially_returned' THEN 8
             WHEN 'returned' THEN 9
             ELSE 99
         END ASC,
         id ASC;

-- name: ConsumeFlashSaleQuota :one
UPDATE flash_sale_items fsi
SET sold_quantity = fsi.sold_quantity + @quantity::integer
FROM flash_sales fs
WHERE fsi.flash_sale_id = fs.id
  AND fsi.flash_sale_id = @flash_sale_id
  AND fsi.variant_id = @variant_id
  AND fs.active = true
  AND fs.starts_at <= now()
  AND now() < fs.ends_at
  AND fsi.sold_quantity + @quantity::integer <= fsi.quota
RETURNING fsi.sold_quantity;

-- name: GetFlashSaleQuotaRemaining :one
SELECT GREATEST(fsi.quota - fsi.sold_quantity, 0)::integer AS remaining
FROM flash_sale_items fsi
JOIN flash_sales fs ON fs.id = fsi.flash_sale_id
WHERE fsi.flash_sale_id = @flash_sale_id
  AND fsi.variant_id = @variant_id
  AND fs.active = true
  AND fs.starts_at <= now()
  AND now() < fs.ends_at;

-- name: RestoreFlashSaleQuotaForOrder :exec
UPDATE flash_sale_items fsi
SET sold_quantity = GREATEST(fsi.sold_quantity - restored.qty, 0)::integer
FROM (
    SELECT oi.flash_sale_id, oi.variant_id, SUM(oi.quantity) AS qty
    FROM order_items oi
    WHERE oi.order_id = @order_id
      AND oi.flash_sale_id IS NOT NULL
    GROUP BY oi.flash_sale_id, oi.variant_id
) restored
WHERE fsi.flash_sale_id = restored.flash_sale_id
  AND fsi.variant_id = restored.variant_id;

-- name: RestoreFlashSaleQuotaItem :exec
UPDATE flash_sale_items
SET sold_quantity = GREATEST(sold_quantity - @quantity::integer, 0)::integer
WHERE flash_sale_id = @flash_sale_id
  AND variant_id = @variant_id;

-- name: ListOrderItemRestoreTargetsByOrderIDs :many
SELECT oi.order_id,
       oi.variant_id,
       oi.quantity,
       COALESCE(oi.live_session_id::text, '')::text AS live_session_id,
       COALESCE(oi.flash_sale_id::text, '')::text AS flash_sale_id
FROM order_items oi
WHERE oi.order_id = ANY(@order_ids::uuid[])
ORDER BY oi.variant_id ASC, oi.id ASC;

-- name: ListCartItemQuantitiesForUpdate :many
SELECT variant_id, quantity
FROM cart_items
WHERE user_id = @user_id
FOR UPDATE;

-- name: UpsertCartItemWithQuantity :exec
INSERT INTO cart_items (
    user_id, variant_id, quantity, selected,
    snapshot_brand_name, snapshot_product_name, snapshot_model, snapshot_image_url, snapshot_options
)
VALUES (
    @user_id, @variant_id, @quantity::bigint, true,
    @snapshot_brand_name, @snapshot_product_name, @snapshot_model, @snapshot_image_url, @snapshot_options::jsonb
)
ON CONFLICT (user_id, variant_id) DO UPDATE
SET quantity = EXCLUDED.quantity,
    selected = true,
    snapshot_brand_name = EXCLUDED.snapshot_brand_name,
    snapshot_product_name = EXCLUDED.snapshot_product_name,
    snapshot_model = EXCLUDED.snapshot_model,
    snapshot_image_url = EXCLUDED.snapshot_image_url,
    snapshot_options = EXCLUDED.snapshot_options,
    updated_at = now();
