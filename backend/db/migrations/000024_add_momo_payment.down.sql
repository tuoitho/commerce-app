DROP INDEX IF EXISTS orders_pending_payment_timeout_idx;

ALTER TABLE orders
    DROP COLUMN IF EXISTS paid_at,
    DROP COLUMN IF EXISTS payment_transaction_id,
    DROP COLUMN IF EXISTS payment_status;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check
    CHECK (payment_method = 'cod');
