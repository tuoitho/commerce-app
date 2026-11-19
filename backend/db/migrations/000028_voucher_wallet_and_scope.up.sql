ALTER TABLE vouchers
    ADD COLUMN scope_type text NOT NULL DEFAULT 'all'
        CHECK (scope_type IN ('all', 'categories', 'products'));

CREATE TABLE voucher_categories (
    voucher_id  uuid NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
    category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (voucher_id, category_id)
);

CREATE INDEX voucher_categories_category_id_idx
    ON voucher_categories (category_id);

CREATE TABLE voucher_products (
    voucher_id uuid NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    PRIMARY KEY (voucher_id, product_id)
);

CREATE INDEX voucher_products_product_id_idx
    ON voucher_products (product_id);

CREATE TABLE user_vouchers (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    voucher_id uuid NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
    claimed_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, voucher_id)
);

CREATE INDEX user_vouchers_user_claimed_idx
    ON user_vouchers (user_id, claimed_at DESC, id DESC);

CREATE INDEX user_vouchers_voucher_id_idx
    ON user_vouchers (voucher_id);
