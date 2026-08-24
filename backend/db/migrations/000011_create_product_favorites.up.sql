CREATE TABLE product_favorites (
    user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id   uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    favorited_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, product_id)
);

CREATE INDEX product_favorites_user_order_idx
    ON product_favorites (user_id, favorited_at DESC, product_id);
