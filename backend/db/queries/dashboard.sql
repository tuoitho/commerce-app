-- name: GetDashboardDeliveredRevenueDaily :many
SELECT
    to_char(o.delivered_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS date,
    COALESCE(SUM(o.total_vnd), 0)::text AS delivered_vnd,
    COUNT(*)::bigint AS delivered_orders
FROM orders o
WHERE o.status IN ('delivered', 'partially_returned', 'returned')
  AND o.delivered_at >= @range_start::timestamptz AND o.delivered_at <= @range_end::timestamptz
GROUP BY to_char(o.delivered_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD')
ORDER BY date ASC;

-- name: GetDashboardRefundedDaily :many
SELECT
    to_char(rr.refunded_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS date,
    COALESCE(SUM(rr.refund_amount_vnd), 0)::text AS refunded_vnd
FROM return_requests rr
WHERE rr.status = 'refunded'
  AND rr.refunded_at >= @range_start::timestamptz AND rr.refunded_at <= @range_end::timestamptz
GROUP BY to_char(rr.refunded_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD')
ORDER BY date ASC;

-- name: GetDashboardOrderCountsInRange :one
SELECT
    COUNT(*)::bigint AS new_orders_count,
    COUNT(*) FILTER (WHERE status = 'cancelled')::bigint AS cancelled_orders_count
FROM orders
WHERE created_at >= @range_start AND created_at <= @range_end;

-- name: GetDashboardOrdersByStatus :many
SELECT
    status,
    COUNT(*)::bigint AS count
FROM orders
GROUP BY status;

-- name: GetDashboardPendingReturns :one
SELECT
    COUNT(*) FILTER (WHERE status = 'pending_approval')::bigint AS pending_approval_count,
    COUNT(*) FILTER (WHERE status = 'received')::bigint AS received_count
FROM return_requests
WHERE status IN ('pending_approval', 'received');

-- name: GetDashboardTopProducts :many
SELECT
    p.id AS product_id,
    p.name,
    p.brand,
    COALESCE((
        SELECT pi.url
        FROM product_images pi
        WHERE pi.product_id = p.id
        ORDER BY pi.position ASC, pi.id ASC
        LIMIT 1
    ), '')::text AS image_url,
    p.active,
    SUM(oi.quantity)::bigint AS quantity_sold,
    SUM(oi.line_total_vnd)::text AS revenue_vnd
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
JOIN products p ON p.id = oi.product_id
WHERE o.created_at >= @range_start AND o.created_at <= @range_end
  AND o.status <> 'cancelled'
GROUP BY p.id, p.name, p.brand, p.active
ORDER BY quantity_sold DESC, SUM(oi.line_total_vnd) DESC, p.name ASC, p.id ASC
LIMIT 5;

-- name: GetDashboardLowStockVariants :many
SELECT
    v.id AS variant_id,
    v.product_id,
    p.name AS product_name,
    v.stock_quantity,
    COALESCE((
        SELECT jsonb_agg(jsonb_build_object('groupLabel', g.label, 'valueLabel', ov.label) ORDER BY g.position, g.id)
        FROM variant_option_values vov
        JOIN product_option_groups g ON g.id = vov.group_id
        JOIN product_option_values ov ON ov.id = vov.option_value_id
        WHERE vov.variant_id = v.id
    ), '[]'::jsonb)::text AS options,
    COUNT(*) OVER()::bigint AS total_count
FROM product_variants v
JOIN products p ON p.id = v.product_id
WHERE v.active AND p.active AND v.stock_quantity <= 5
ORDER BY v.stock_quantity ASC, p.name ASC, v.id ASC
LIMIT 10;
