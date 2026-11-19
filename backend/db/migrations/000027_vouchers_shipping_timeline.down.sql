DROP INDEX IF EXISTS order_status_events_order_created_idx;
DROP TABLE IF EXISTS order_status_events;

UPDATE return_requests SET expected_refund_amount_vnd = 1 WHERE expected_refund_amount_vnd = 0;
UPDATE return_requests SET refund_amount_vnd = 1 WHERE refund_amount_vnd = 0;

ALTER TABLE return_requests DROP CONSTRAINT IF EXISTS return_requests_expected_refund_amount_vnd_check;
ALTER TABLE return_requests ADD CONSTRAINT return_requests_expected_refund_amount_vnd_check
    CHECK (expected_refund_amount_vnd = trunc(expected_refund_amount_vnd) AND expected_refund_amount_vnd > 0);

ALTER TABLE return_requests DROP CONSTRAINT IF EXISTS return_requests_refund_amount_vnd_check;
ALTER TABLE return_requests ADD CONSTRAINT return_requests_refund_amount_vnd_check
    CHECK (refund_amount_vnd = trunc(refund_amount_vnd) AND refund_amount_vnd > 0);

ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_single_promo_source_check;
ALTER TABLE order_items DROP COLUMN IF EXISTS flash_sale_id;

ALTER TABLE orders
    DROP COLUMN IF EXISTS shipped_at,
    DROP COLUMN IF EXISTS preparing_at,
    DROP COLUMN IF EXISTS tracking_code,
    DROP COLUMN IF EXISTS shipping_carrier,
    DROP COLUMN IF EXISTS delivery_method,
    DROP COLUMN IF EXISTS discount_vnd,
    DROP COLUMN IF EXISTS voucher_type,
    DROP COLUMN IF EXISTS voucher_code,
    DROP COLUMN IF EXISTS voucher_id;

DROP INDEX IF EXISTS voucher_usages_voucher_user_active_idx;
DROP TABLE IF EXISTS voucher_usages;
DROP INDEX IF EXISTS vouchers_active_window_idx;
DROP TABLE IF EXISTS vouchers;
