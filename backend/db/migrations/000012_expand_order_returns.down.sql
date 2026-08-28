DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM orders WHERE status = 'partially_returned') THEN 
        RAISE EXCEPTION 'Cannot rollback migration 000012: orders with status partially_returned exist'; 
    END IF; 
END $$;

ALTER TABLE return_request_items DROP COLUMN IF EXISTS received_variant_id;
DROP INDEX IF EXISTS return_request_items_request_order_item_unique_idx;
DROP INDEX IF EXISTS return_requests_one_refunded_per_order_idx;

DROP INDEX IF EXISTS return_requests_one_open_per_order_idx;
CREATE UNIQUE INDEX return_requests_one_open_per_order_idx
    ON return_requests (order_id)
    WHERE status IN ('pending_approval', 'approved');

ALTER TABLE return_requests DROP CONSTRAINT IF EXISTS return_requests_refunded_fields_check;
ALTER TABLE return_requests DROP CONSTRAINT IF EXISTS return_requests_reject_reason_check;
ALTER TABLE return_requests DROP CONSTRAINT IF EXISTS return_requests_description_length_check;
ALTER TABLE return_requests DROP CONSTRAINT IF EXISTS return_requests_expected_refund_amount_vnd_check;
ALTER TABLE return_requests DROP COLUMN IF EXISTS expected_refund_amount_vnd;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check 
    CHECK (status IN ('pending_confirmation', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled', 'cancel_requested', 'returned'));
