ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check
    CHECK (payment_method IN ('cod', 'momo'));

ALTER TABLE orders
    ADD COLUMN payment_status text NOT NULL DEFAULT 'pending'
        CONSTRAINT orders_payment_status_check
        CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
    ADD COLUMN payment_transaction_id text NULL,
    ADD COLUMN paid_at timestamptz NULL;

UPDATE orders
SET payment_status = 'paid',
    paid_at = COALESCE(delivered_at, updated_at)
WHERE status IN ('delivered', 'partially_returned');

UPDATE orders
SET payment_status = 'refunded',
    paid_at = COALESCE(delivered_at, updated_at)
WHERE status = 'returned';

CREATE INDEX orders_pending_payment_timeout_idx
    ON orders (payment_method, created_at)
    WHERE status = 'pending_confirmation';
