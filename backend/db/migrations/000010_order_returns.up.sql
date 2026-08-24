ALTER TABLE orders ADD COLUMN delivered_at timestamptz NULL;

UPDATE orders
SET delivered_at = COALESCE(updated_at, created_at)
WHERE status = 'delivered' AND delivered_at IS NULL;

CREATE TABLE return_requests (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id             uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id              uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status               text NOT NULL DEFAULT 'pending_approval'
        CHECK (status IN ('pending_approval', 'approved', 'received', 'refunded', 'rejected', 'cancelled')),
    reason_code          text NOT NULL
        CHECK (reason_code IN ('defective', 'not_as_described', 'wrong_or_missing', 'changed_mind')),
    description          text NOT NULL DEFAULT '',
    reject_reason        text NOT NULL DEFAULT '',
    refund_amount_vnd    numeric NULL
        CHECK (refund_amount_vnd = trunc(refund_amount_vnd) AND refund_amount_vnd > 0),
    refunded_by_user_id  uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    approved_at          timestamptz NULL,
    rejected_at          timestamptz NULL,
    received_at          timestamptz NULL,
    refunded_at          timestamptz NULL,
    cancelled_at         timestamptz NULL
);

CREATE UNIQUE INDEX return_requests_one_open_per_order_idx
    ON return_requests (order_id)
    WHERE status IN ('pending_approval', 'approved');

CREATE INDEX return_requests_status_created_at_idx ON return_requests (status, created_at);
CREATE INDEX return_requests_order_id_idx ON return_requests (order_id);
CREATE INDEX return_requests_user_id_idx ON return_requests (user_id);

CREATE TABLE return_request_items (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    return_request_id  uuid NOT NULL REFERENCES return_requests(id) ON DELETE CASCADE,
    order_item_id      uuid NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
    quantity           bigint NOT NULL CHECK (quantity > 0)
);

CREATE INDEX return_request_items_return_request_id_idx ON return_request_items (return_request_id);
CREATE INDEX return_request_items_order_item_id_idx ON return_request_items (order_item_id);
