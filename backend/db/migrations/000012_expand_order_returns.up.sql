-- 1. Expand orders status check to include partially_returned
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check 
    CHECK (status IN ('pending_confirmation', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled', 'cancel_requested', 'partially_returned', 'returned'));

-- 2. Add expected_refund_amount_vnd to return_requests and backfill
ALTER TABLE return_requests ADD COLUMN expected_refund_amount_vnd numeric NULL;

WITH item_sums AS (
    SELECT 
        rri.return_request_id,
        SUM(oi.line_total_vnd) AS items_total,
        COUNT(DISTINCT rri.order_item_id) AS returned_count
    FROM return_request_items rri
    JOIN order_items oi ON oi.id = rri.order_item_id
    GROUP BY rri.return_request_id
),
order_item_counts AS (
    SELECT order_id, COUNT(*) AS total_count
    FROM order_items
    GROUP BY order_id
)
UPDATE return_requests rr
SET expected_refund_amount_vnd = CASE 
    WHEN isum.returned_count = oic.total_count THEN isum.items_total + o.shipping_fee_vnd
    ELSE isum.items_total
END
FROM item_sums isum, orders o, order_item_counts oic
WHERE rr.id = isum.return_request_id
  AND o.id = rr.order_id
  AND oic.order_id = rr.order_id;

-- Fallback for any legacy return row without items
UPDATE return_requests
SET expected_refund_amount_vnd = COALESCE(refund_amount_vnd, 1)
WHERE expected_refund_amount_vnd IS NULL;

ALTER TABLE return_requests ALTER COLUMN expected_refund_amount_vnd SET NOT NULL;
ALTER TABLE return_requests ADD CONSTRAINT return_requests_expected_refund_amount_vnd_check
    CHECK (expected_refund_amount_vnd = trunc(expected_refund_amount_vnd) AND expected_refund_amount_vnd > 0);

ALTER TABLE return_requests ADD CONSTRAINT return_requests_description_length_check
    CHECK (char_length(description) <= 1000);

ALTER TABLE return_requests ADD CONSTRAINT return_requests_reject_reason_check
    CHECK (char_length(reject_reason) <= 1000 AND ((status != 'rejected') OR (char_length(trim(reject_reason)) > 0)));

ALTER TABLE return_requests ADD CONSTRAINT return_requests_refunded_fields_check
    CHECK ((status != 'refunded') OR (refund_amount_vnd IS NOT NULL AND refunded_by_user_id IS NOT NULL AND refunded_at IS NOT NULL));

-- 3. Replace unique open index to include pending_approval, approved, received
DROP INDEX IF EXISTS return_requests_one_open_per_order_idx;
CREATE UNIQUE INDEX return_requests_one_open_per_order_idx
    ON return_requests (order_id)
    WHERE status IN ('pending_approval', 'approved', 'received');

-- 4. Unique refunded index per order
CREATE UNIQUE INDEX return_requests_one_refunded_per_order_idx
    ON return_requests (order_id)
    WHERE status = 'refunded';

-- 5. Unique (return_request_id, order_item_id)
CREATE UNIQUE INDEX return_request_items_request_order_item_unique_idx
    ON return_request_items (return_request_id, order_item_id);

-- 6. Add received_variant_id to return_request_items
ALTER TABLE return_request_items
    ADD COLUMN received_variant_id uuid NULL REFERENCES product_variants(id) ON DELETE RESTRICT;
