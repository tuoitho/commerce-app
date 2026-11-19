CREATE TABLE vouchers (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code             text NOT NULL UNIQUE
        CHECK (code = upper(btrim(code)) AND code ~ '^[A-Z0-9_-]{3,32}$'),
    title            text NOT NULL
        CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
    description      text NOT NULL DEFAULT ''
        CHECK (char_length(description) <= 500),
    voucher_type     text NOT NULL
        CHECK (voucher_type IN ('percent', 'fixed_amount', 'freeship')),
    discount_value   numeric NOT NULL
        CHECK (
            discount_value = trunc(discount_value)
            AND (
                (voucher_type = 'percent' AND discount_value BETWEEN 1 AND 100)
                OR (voucher_type = 'fixed_amount' AND discount_value > 0)
                OR (voucher_type = 'freeship' AND discount_value = 0)
            )
        ),
    max_discount_vnd numeric NULL
        CHECK (
            (voucher_type = 'fixed_amount' AND max_discount_vnd IS NULL)
            OR (voucher_type IN ('percent', 'freeship') AND (max_discount_vnd IS NULL OR (max_discount_vnd = trunc(max_discount_vnd) AND max_discount_vnd > 0)))
        ),
    min_order_vnd    numeric NOT NULL DEFAULT 0
        CHECK (min_order_vnd = trunc(min_order_vnd) AND min_order_vnd >= 0),
    usage_limit      integer NULL
        CHECK (usage_limit IS NULL OR usage_limit >= 1),
    used_count       integer NOT NULL DEFAULT 0
        CHECK (used_count >= 0 AND (usage_limit IS NULL OR used_count <= usage_limit)),
    per_user_limit   integer NOT NULL DEFAULT 1
        CHECK (per_user_limit >= 1),
    starts_at        timestamptz NOT NULL,
    ends_at          timestamptz NOT NULL CHECK (ends_at > starts_at),
    active           boolean NOT NULL DEFAULT true,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX vouchers_active_window_idx ON vouchers (active, starts_at, ends_at);

CREATE TABLE voucher_usages (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    voucher_id   uuid NOT NULL REFERENCES vouchers(id) ON DELETE RESTRICT,
    user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_id     uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
    discount_vnd numeric NOT NULL CHECK (discount_vnd = trunc(discount_vnd) AND discount_vnd >= 0),
    status       text NOT NULL DEFAULT 'applied' CHECK (status IN ('applied', 'restored')),
    created_at   timestamptz NOT NULL DEFAULT now(),
    restored_at  timestamptz NULL
);

CREATE INDEX voucher_usages_voucher_user_active_idx
    ON voucher_usages (voucher_id, user_id)
    WHERE status = 'applied';

ALTER TABLE orders
    ADD COLUMN voucher_id       uuid NULL REFERENCES vouchers(id) ON DELETE SET NULL,
    ADD COLUMN voucher_code     text NULL,
    ADD COLUMN voucher_type     text NULL CHECK (voucher_type IS NULL OR voucher_type IN ('percent', 'fixed_amount', 'freeship')),
    ADD COLUMN discount_vnd     numeric NOT NULL DEFAULT 0 CHECK (discount_vnd = trunc(discount_vnd) AND discount_vnd >= 0),
    ADD COLUMN delivery_method  text NOT NULL DEFAULT 'standard' CHECK (delivery_method IN ('standard', 'express_2h')),
    ADD COLUMN shipping_carrier text NULL,
    ADD COLUMN tracking_code    text NULL,
    ADD COLUMN preparing_at     timestamptz NULL,
    ADD COLUMN shipped_at       timestamptz NULL;

ALTER TABLE order_items
    ADD COLUMN flash_sale_id uuid NULL REFERENCES flash_sales(id) ON DELETE SET NULL,
    ADD CONSTRAINT order_items_single_promo_source_check CHECK (NOT (live_session_id IS NOT NULL AND flash_sale_id IS NOT NULL));

ALTER TABLE return_requests DROP CONSTRAINT IF EXISTS return_requests_refund_amount_vnd_check;
ALTER TABLE return_requests ADD CONSTRAINT return_requests_refund_amount_vnd_check
    CHECK (refund_amount_vnd = trunc(refund_amount_vnd) AND refund_amount_vnd >= 0);

ALTER TABLE return_requests DROP CONSTRAINT IF EXISTS return_requests_expected_refund_amount_vnd_check;
ALTER TABLE return_requests ADD CONSTRAINT return_requests_expected_refund_amount_vnd_check
    CHECK (expected_refund_amount_vnd = trunc(expected_refund_amount_vnd) AND expected_refund_amount_vnd >= 0);

CREATE TABLE order_status_events (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id   uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status     text NOT NULL CHECK (status IN ('pending_confirmation', 'confirmed', 'preparing', 'cancel_requested', 'shipped', 'delivered', 'cancelled', 'partially_returned', 'returned')),
    actor_type text NOT NULL CHECK (actor_type IN ('customer', 'admin', 'system')),
    note       text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX order_status_events_order_created_idx
    ON order_status_events (order_id, created_at ASC, id ASC);

-- Backfill preparing_at and shipped_at on existing orders
UPDATE orders
SET preparing_at = COALESCE(confirmed_at, created_at)
WHERE status IN ('preparing', 'cancel_requested', 'shipped', 'delivered', 'partially_returned', 'returned')
  AND preparing_at IS NULL;

UPDATE orders
SET shipped_at = COALESCE(delivered_at, updated_at)
WHERE status IN ('shipped', 'delivered', 'partially_returned', 'returned')
  AND shipped_at IS NULL;

-- Backfill chronological timeline events for existing orders
INSERT INTO order_status_events (order_id, status, actor_type, note, created_at)
SELECT id, 'pending_confirmation', 'customer', 'Đơn hàng được tạo', created_at
FROM orders;

INSERT INTO order_status_events (order_id, status, actor_type, note, created_at)
SELECT id, 'confirmed', 'system', 'Đơn hàng đã được xác nhận', confirmed_at
FROM orders
WHERE confirmed_at IS NOT NULL;

INSERT INTO order_status_events (order_id, status, actor_type, note, created_at)
SELECT id, 'preparing', 'admin', 'Đơn hàng đang được chuẩn bị', preparing_at
FROM orders
WHERE preparing_at IS NOT NULL;

INSERT INTO order_status_events (order_id, status, actor_type, note, created_at)
SELECT id, 'cancel_requested', 'customer', 'Khách hàng gửi yêu cầu hủy đơn hàng', updated_at
FROM orders
WHERE status = 'cancel_requested';

INSERT INTO order_status_events (order_id, status, actor_type, note, created_at)
SELECT id, 'shipped', 'admin', 'Đơn hàng đã được bàn giao cho đơn vị vận chuyển', shipped_at
FROM orders
WHERE shipped_at IS NOT NULL;

INSERT INTO order_status_events (order_id, status, actor_type, note, created_at)
SELECT id, 'delivered', 'admin', 'Đơn hàng đã giao thành công', delivered_at
FROM orders
WHERE delivered_at IS NOT NULL;

INSERT INTO order_status_events (order_id, status, actor_type, note, created_at)
SELECT id, 'cancelled', 'system', 'Đơn hàng đã được hủy', cancelled_at
FROM orders
WHERE cancelled_at IS NOT NULL;

INSERT INTO order_status_events (order_id, status, actor_type, note, created_at)
SELECT o.id, o.status, 'admin',
       CASE WHEN o.status = 'returned' THEN 'Hoàn tiền trả hàng toàn bộ đơn' ELSE 'Hoàn tiền trả hàng một phần' END,
       GREATEST(COALESCE(o.delivered_at, o.updated_at), o.updated_at)
FROM orders o
WHERE o.status IN ('partially_returned', 'returned');
