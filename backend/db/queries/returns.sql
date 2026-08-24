-- name: InsertReturnRequest :one
INSERT INTO return_requests (order_id, user_id, reason_code, description)
VALUES (@order_id, @user_id, @reason_code, @description)
RETURNING id, order_id, user_id, status, reason_code, description, reject_reason,
          COALESCE(refund_amount_vnd::text, '')::text AS refund_amount_vnd,
          created_at, updated_at, approved_at, rejected_at, received_at, refunded_at, cancelled_at;

-- name: InsertReturnRequestItem :exec
INSERT INTO return_request_items (return_request_id, order_item_id, quantity)
VALUES (@return_request_id, @order_item_id, @quantity::bigint);

-- name: CountOpenReturnRequests :one
SELECT count(*) AS count
FROM return_requests
WHERE order_id = $1 AND status IN ('pending_approval', 'approved');

-- name: SumConsumedQuantitiesByOrder :many
SELECT ri.order_item_id, SUM(ri.quantity)::bigint AS consumed_quantity
FROM return_request_items ri
JOIN return_requests rr ON rr.id = ri.return_request_id
WHERE rr.order_id = $1
  AND rr.status IN ('pending_approval', 'approved', 'received', 'refunded')
GROUP BY ri.order_item_id;

-- name: ListReturnRequestsByOrder :many
SELECT id, order_id, user_id, status, reason_code, description, reject_reason,
       COALESCE(refund_amount_vnd::text, '')::text AS refund_amount_vnd,
       created_at, updated_at, approved_at, rejected_at, received_at, refunded_at, cancelled_at
FROM return_requests
WHERE order_id = $1 AND user_id = $2
ORDER BY created_at DESC, id DESC;

-- name: ListReturnRequestsByAdmin :many
SELECT rr.id, rr.order_id, rr.user_id, rr.status, rr.reason_code, rr.description, rr.reject_reason,
       COALESCE(rr.refund_amount_vnd::text, '')::text AS refund_amount_vnd,
       rr.created_at, rr.updated_at, rr.approved_at, rr.rejected_at, rr.received_at, rr.refunded_at, rr.cancelled_at,
       u.email AS buyer_email,
       o.total_vnd::text AS total_vnd,
       o.shipping_fee_vnd::text AS shipping_fee_vnd
FROM return_requests rr
JOIN users u ON u.id = rr.user_id
JOIN orders o ON o.id = rr.order_id
WHERE (COALESCE(cardinality(@statuses::text[]), 0) = 0 OR rr.status = ANY(@statuses::text[]))
ORDER BY rr.created_at DESC, rr.id DESC;

-- name: GetReturnRequestByAdminID :one
SELECT rr.id, rr.order_id, rr.user_id, rr.status, rr.reason_code, rr.description, rr.reject_reason,
       COALESCE(rr.refund_amount_vnd::text, '')::text AS refund_amount_vnd,
       rr.created_at, rr.updated_at, rr.approved_at, rr.rejected_at, rr.received_at, rr.refunded_at, rr.cancelled_at,
       u.email AS buyer_email,
       o.total_vnd::text AS total_vnd,
       o.shipping_fee_vnd::text AS shipping_fee_vnd
FROM return_requests rr
JOIN users u ON u.id = rr.user_id
JOIN orders o ON o.id = rr.order_id
WHERE rr.id = $1;

-- name: ListReturnRequestItemsByRequestIDs :many
SELECT ri.id, ri.return_request_id, ri.order_item_id, oi.product_name, oi.image_url,
       oi.unit_price_vnd::text AS unit_price_vnd, ri.quantity
FROM return_request_items ri
JOIN order_items oi ON oi.id = ri.order_item_id
WHERE ri.return_request_id = ANY(@request_ids::uuid[])
ORDER BY ri.id ASC;

-- name: LockReturnRequestForUpdate :one
SELECT id, order_id, user_id, status, reason_code, description, reject_reason,
       COALESCE(refund_amount_vnd::text, '')::text AS refund_amount_vnd,
       created_at, updated_at, approved_at, rejected_at, received_at, refunded_at, cancelled_at
FROM return_requests
WHERE id = $1
FOR UPDATE;

-- name: LockReturnRequestForUser :one
SELECT id, order_id, user_id, status, reason_code, description, reject_reason,
       COALESCE(refund_amount_vnd::text, '')::text AS refund_amount_vnd,
       created_at, updated_at, approved_at, rejected_at, received_at, refunded_at, cancelled_at
FROM return_requests
WHERE id = $1 AND user_id = $2
FOR UPDATE;

-- name: HasRefundedReturnRequest :one
SELECT EXISTS(
    SELECT 1 FROM return_requests WHERE order_id = $1 AND status = 'refunded'
) AS has_refunded;

-- name: ListOrderIDsWithRefundedRequests :many
SELECT DISTINCT order_id
FROM return_requests
WHERE status = 'refunded' AND order_id = ANY(@order_ids::uuid[]);

-- name: ApproveReturnRequest :exec
UPDATE return_requests
SET status = 'approved', approved_at = now(), updated_at = now()
WHERE id = $1;

-- name: RejectReturnRequest :exec
UPDATE return_requests
SET status = 'rejected', reject_reason = $2, rejected_at = now(), updated_at = now()
WHERE id = $1;

-- name: ReceiveReturnRequest :exec
UPDATE return_requests
SET status = 'received', received_at = now(), updated_at = now()
WHERE id = $1;

-- name: CancelReturnRequest :exec
UPDATE return_requests
SET status = 'cancelled', cancelled_at = now(), updated_at = now()
WHERE id = $1;

-- name: RefundReturnRequest :exec
UPDATE return_requests
SET status = 'refunded',
    refund_amount_vnd = @amount::numeric,
    refunded_by_user_id = @admin_user_id,
    refunded_at = now(),
    updated_at = now()
WHERE id = @id;

-- name: SetOrderStatusReturned :exec
UPDATE orders
SET status = 'returned', updated_at = now()
WHERE id = $1 AND status <> 'returned';
