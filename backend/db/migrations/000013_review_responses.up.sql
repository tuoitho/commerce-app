CREATE TABLE review_responses (
    review_id uuid PRIMARY KEY REFERENCES product_reviews(id) ON DELETE CASCADE,
    content text NOT NULL CHECK (length(content) BETWEEN 1 AND 1000),
    created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
