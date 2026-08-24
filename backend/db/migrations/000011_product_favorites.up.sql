CREATE TABLE product_favorites (
    user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, product_id)
);

CREATE INDEX idx_product_favorites_user_created ON product_favorites (user_id, created_at DESC, product_id);
CREATE INDEX idx_product_favorites_product_id ON product_favorites (product_id);
