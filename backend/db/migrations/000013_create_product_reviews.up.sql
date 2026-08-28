CREATE TABLE product_reviews (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_item_id uuid NOT NULL UNIQUE REFERENCES order_items(id) ON DELETE RESTRICT,
    rating        smallint NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment       text NOT NULL DEFAULT '' CHECK (char_length(comment) <= 1000),
    edit_count    smallint NOT NULL DEFAULT 0 CHECK (edit_count >= 0 AND edit_count <= 1),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX product_reviews_created_at_id_idx ON product_reviews (created_at DESC, id DESC);

CREATE TABLE review_media (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id  uuid NOT NULL REFERENCES product_reviews(id) ON DELETE CASCADE,
    media_type text NOT NULL CHECK (media_type IN ('image', 'video')),
    mime_type  text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm')),
    object_key text NOT NULL UNIQUE,
    size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND ((media_type = 'image' AND size_bytes <= 5000000) OR (media_type = 'video' AND size_bytes <= 50000000))),
    position   smallint NOT NULL CHECK (position >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT review_media_review_id_media_type_position_key UNIQUE (review_id, media_type, position)
);
