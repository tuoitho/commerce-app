CREATE TABLE addresses (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_name text NOT NULL,
    phone          text NOT NULL,
    province_code  integer NOT NULL,
    province_name  text NOT NULL,
    ward_code      integer NOT NULL,
    ward_name      text NOT NULL,
    detail_address text NOT NULL,
    is_default     boolean NOT NULL DEFAULT false,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX addresses_user_id_idx ON addresses (user_id);
CREATE INDEX addresses_user_id_is_default_idx ON addresses (user_id) WHERE is_default;

CREATE TABLE orders (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status           text NOT NULL DEFAULT 'pending_confirmation'
        CHECK (status IN ('pending_confirmation', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled', 'cancel_requested', 'returned')),
    payment_method   text NOT NULL DEFAULT 'cod'
        CHECK (payment_method = 'cod'),
    subtotal_vnd     numeric NOT NULL
        CHECK (subtotal_vnd = trunc(subtotal_vnd) AND subtotal_vnd >= 0 AND subtotal_vnd < 100000000000000000000000000000000000000),
    shipping_fee_vnd numeric NOT NULL
        CHECK (shipping_fee_vnd = trunc(shipping_fee_vnd) AND shipping_fee_vnd >= 0 AND shipping_fee_vnd < 100000000000000000000000000000000000000),
    total_vnd        numeric NOT NULL
        CHECK (total_vnd = trunc(total_vnd) AND total_vnd >= 0 AND total_vnd < 100000000000000000000000000000000000000),
    recipient_name   text NOT NULL,
    phone            text NOT NULL,
    province_name    text NOT NULL,
    ward_name        text NOT NULL,
    detail_address   text NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    confirmed_at     timestamptz NULL,
    cancelled_at     timestamptz NULL
);

CREATE INDEX orders_user_id_created_at_idx ON orders (user_id, created_at DESC);
CREATE INDEX orders_user_id_status_idx ON orders (user_id, status);
CREATE INDEX orders_status_created_at_idx ON orders (status, created_at);

CREATE TABLE order_items (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id       uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    variant_id     uuid NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
    product_id     uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    brand_name     text NOT NULL,
    product_name   text NOT NULL,
    model          text NOT NULL DEFAULT '',
    image_url      text NOT NULL DEFAULT '',
    options        jsonb NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(options) = 'array'),
    unit_price_vnd numeric NOT NULL
        CHECK (unit_price_vnd = trunc(unit_price_vnd) AND unit_price_vnd > 0 AND unit_price_vnd < 100000000000000000000000000000000000000),
    quantity       numeric NOT NULL
        CHECK (quantity = trunc(quantity) AND quantity > 0 AND quantity < 100000000000000000000000000000000000000),
    line_total_vnd numeric NOT NULL
        CHECK (line_total_vnd = trunc(line_total_vnd) AND line_total_vnd >= 0 AND line_total_vnd < 100000000000000000000000000000000000000)
);

CREATE INDEX order_items_order_id_idx ON order_items (order_id);
CREATE INDEX order_items_variant_id_idx ON order_items (variant_id);
CREATE INDEX order_items_product_id_idx ON order_items (product_id);
