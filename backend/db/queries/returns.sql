-- name: CreateReturnRequest :one
INSERT INTO return_requests (
    order_id, user_id, status, reason_code, description, expected_refund_amount_vnd
)
VALUES (
    @order_id, @user_id, @status, @reason_code, @description, @expected_refund_amount_vnd::numeric
)
RETURNING id, order_id, user_id, status, reason_code, description, reject_reason,
          expected_refund_amount_vnd::text AS expected_refund_amount_vnd,
          refund_amount_vnd::text AS refund_amount_vnd,
          refunded_by_user_id, created_at, updated_at,
          approved_at, rejected_at, received_at, refunded_at, cancelled_at;

-- name: InsertReturnRequestItem :exec
INSERT INTO return_request_items (
    return_request_id, order_item_id, quantity
)
VALUES (
    @return_request_id, @order_item_id, @quantity::bigint
);

-- name: GetLatestReturnRequestByOrderID :one
SELECT id, order_id, user_id, status, reason_code, description, reject_reason,
       expected_refund_amount_vnd::text AS expected_refund_amount_vnd,
       refund_amount_vnd::text AS refund_amount_vnd,
       refunded_by_user_id, created_at, updated_at,
       approved_at, rejected_at, received_at, refunded_at, cancelled_at
FROM return_requests
WHERE order_id = $1
ORDER BY created_at DESC, id DESC
LIMIT 1;

-- name: ListLatestReturnRequestsByOrderIDs :many
SELECT DISTINCT ON (order_id)
       id, order_id, user_id, status, reason_code, description, reject_reason,
       expected_refund_amount_vnd::text AS expected_refund_amount_vnd,
       refund_amount_vnd::text AS refund_amount_vnd,
       refunded_by_user_id, created_at, updated_at,
       approved_at, rejected_at, received_at, refunded_at, cancelled_at
FROM return_requests
WHERE order_id = ANY(@order_ids::uuid[])
ORDER BY order_id, created_at DESC, id DESC;

-- name: ListReturnRequestItemsByRequestID :many
SELECT rri.id, rri.return_request_id, rri.order_item_id, rri.quantity, rri.received_variant_id,
       oi.variant_id, oi.product_id, oi.brand_name, oi.product_name, oi.model, oi.image_url,
       oi.options::text AS options,
       oi.unit_price_vnd::text AS unit_price_vnd,
       oi.line_total_vnd::text AS line_total_vnd
FROM return_request_items rri
JOIN order_items oi ON oi.id = rri.order_item_id
WHERE rri.return_request_id = $1
ORDER BY oi.id ASC;

-- name: ListReturnRequestItemsByRequestIDs :many
SELECT rri.id, rri.return_request_id, rri.order_item_id, rri.quantity, rri.received_variant_id,
       oi.variant_id, oi.product_id, oi.brand_name, oi.product_name, oi.model, oi.image_url,
       oi.options::text AS options,
       oi.unit_price_vnd::text AS unit_price_vnd,
       oi.line_total_vnd::text AS line_total_vnd
FROM return_request_items rri
JOIN order_items oi ON oi.id = rri.order_item_id
WHERE rri.return_request_id = ANY(@return_request_ids::uuid[])
ORDER BY rri.return_request_id, oi.id ASC;

-- name: LockReturnRequestForUpdate :one
SELECT id, order_id, user_id, status, reason_code, description, reject_reason,
       expected_refund_amount_vnd::text AS expected_refund_amount_vnd,
       refund_amount_vnd::text AS refund_amount_vnd,
       refunded_by_user_id, created_at, updated_at,
       approved_at, rejected_at, received_at, refunded_at, cancelled_at
FROM return_requests
WHERE id = $1
FOR UPDATE;

-- name: LockReturnRequestByOrderAndUser :one
SELECT id, order_id, user_id, status, reason_code, description, reject_reason,
       expected_refund_amount_vnd::text AS expected_refund_amount_vnd,
       refund_amount_vnd::text AS refund_amount_vnd,
       refunded_by_user_id, created_at, updated_at,
       approved_at, rejected_at, received_at, refunded_at, cancelled_at
FROM return_requests
WHERE id = $1 AND order_id = $2 AND user_id = $3
FOR UPDATE;

-- name: CancelReturnRequest :exec
UPDATE return_requests
SET status = 'cancelled',
    cancelled_at = now(),
    updated_at = now()
WHERE id = $1;

-- name: ApproveReturnRequest :exec
UPDATE return_requests
SET status = 'approved',
    approved_at = now(),
    updated_at = now()
WHERE id = $1;

-- name: RejectReturnRequest :exec
UPDATE return_requests
SET status = 'rejected',
    reject_reason = $2,
    rejected_at = now(),
    updated_at = now()
WHERE id = $1;

-- name: ReceiveReturnRequest :exec
UPDATE return_requests
SET status = 'received',
    received_at = now(),
    updated_at = now()
WHERE id = $1;

-- name: UpdateReturnRequestItemReceivedVariant :exec
UPDATE return_request_items
SET received_variant_id = @received_variant_id
WHERE return_request_id = @return_request_id AND order_item_id = @order_item_id;

-- name: RefundReturnRequest :exec
UPDATE return_requests
SET status = 'refunded',
    refund_amount_vnd = @refund_amount_vnd::numeric,
    refunded_by_user_id = @refunded_by_user_id,
    refunded_at = now(),
    updated_at = now()
WHERE id = @id;

-- name: ListReturnRequestsAdmin :many
SELECT rr.id, rr.order_id, rr.user_id, rr.status, rr.reason_code, rr.description, rr.reject_reason,
       rr.expected_refund_amount_vnd::text AS expected_refund_amount_vnd,
       rr.refund_amount_vnd::text AS refund_amount_vnd,
       rr.refunded_by_user_id, rr.created_at, rr.updated_at,
       rr.approved_at, rr.rejected_at, rr.received_at, rr.refunded_at, rr.cancelled_at,
       u.email AS buyer_email,
       count(*) OVER() AS total_count
FROM return_requests rr
JOIN users u ON u.id = rr.user_id
WHERE (COALESCE(@status::text, '') = '' OR rr.status = @status::text)
ORDER BY rr.created_at DESC, rr.id DESC
LIMIT @limit_count OFFSET @offset_count;

-- name: GetReturnRequestAdminByID :one
SELECT rr.id, rr.order_id, rr.user_id, rr.status, rr.reason_code, rr.description, rr.reject_reason,
       rr.expected_refund_amount_vnd::text AS expected_refund_amount_vnd,
       rr.refund_amount_vnd::text AS refund_amount_vnd,
       rr.refunded_by_user_id, rr.created_at, rr.updated_at,
       rr.approved_at, rr.rejected_at, rr.received_at, rr.refunded_at, rr.cancelled_at,
       u.email AS buyer_email
FROM return_requests rr
JOIN users u ON u.id = rr.user_id
WHERE rr.id = $1;

-- name: HasOpenReturnRequestForOrder :one
SELECT EXISTS (
    SELECT 1 FROM return_requests
    WHERE order_id = $1 AND status IN ('pending_approval', 'approved', 'received')
) AS has_open;

-- name: HasRefundedReturnRequestForOrder :one
SELECT EXISTS (
    SELECT 1 FROM return_requests
    WHERE order_id = $1 AND status = 'refunded'
) AS has_refunded;

-- name: IsOrderItemRefunded :one
SELECT EXISTS (
    SELECT 1
    FROM return_requests rr
    JOIN return_request_items rri ON rri.return_request_id = rr.id
    WHERE rr.status = 'refunded' AND rri.order_item_id = $1
) AS is_refunded;

-- name: SearchVariantOptionsAdmin :many
SELECT v.id AS variant_id,
       v.product_id,
       p.brand AS brand_name,
       p.name AS product_name,
       p.model,
       v.stock_quantity,
       p.active AS product_active,
       v.active AS variant_active,
       COALESCE((
           SELECT jsonb_agg(jsonb_build_object('groupLabel', g.label, 'valueLabel', ov.label) ORDER BY g.position, g.id)
           FROM variant_option_values vov
           JOIN product_option_groups g ON g.id = vov.group_id
           JOIN product_option_values ov ON ov.id = vov.option_value_id
           WHERE vov.variant_id = v.id
       ), '[]'::jsonb)::text AS options,
       count(*) OVER() AS total_count
FROM product_variants v
JOIN products p ON p.id = v.product_id
WHERE (
    COALESCE(@query::text, '') = '' OR
    p.name ILIKE '%' || @query::text || '%' OR
    p.brand ILIKE '%' || @query::text || '%' OR
    p.model ILIKE '%' || @query::text || '%'
)
ORDER BY p.name ASC, v.id ASC
LIMIT @limit_count OFFSET @offset_count;
