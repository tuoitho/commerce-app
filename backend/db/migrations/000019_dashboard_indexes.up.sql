CREATE INDEX orders_delivered_at_idx ON orders (delivered_at) WHERE delivered_at IS NOT NULL;
CREATE INDEX orders_created_at_idx ON orders (created_at);
CREATE INDEX return_requests_refunded_at_idx ON return_requests (refunded_at) WHERE status = 'refunded';
