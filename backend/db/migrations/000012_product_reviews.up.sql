CREATE TABLE product_reviews (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_item_id uuid NOT NULL UNIQUE REFERENCES order_items(id) ON DELETE RESTRICT,
    user_id       uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    product_id    uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    variant_id    uuid NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
    rating        integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment       text NOT NULL DEFAULT '' CHECK (length(comment) <= 1000),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    edited_at     timestamptz NULL
);

CREATE INDEX product_reviews_product_id_updated_at_id_idx ON product_reviews (product_id, updated_at DESC, id DESC);
CREATE INDEX product_reviews_user_id_idx ON product_reviews (user_id);

CREATE TABLE review_media (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id  uuid NOT NULL REFERENCES product_reviews(id) ON DELETE CASCADE,
    object_key text NOT NULL UNIQUE,
    type       text NOT NULL CHECK (type IN ('image', 'video')),
    mime_type  text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm')),
    size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND ((type = 'image' AND size_bytes <= 5242880) OR (type = 'video' AND size_bytes <= 52428800))),
    position   integer NOT NULL CHECK (position >= 0 AND position <= 4),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT review_media_review_id_position_key UNIQUE (review_id, position)
);

CREATE INDEX review_media_review_id_position_idx ON review_media (review_id, position ASC);
