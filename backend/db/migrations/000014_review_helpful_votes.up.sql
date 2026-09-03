CREATE TABLE review_helpful_votes (
    review_id  uuid NOT NULL REFERENCES product_reviews(id) ON DELETE CASCADE,
    user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_helpful boolean NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (review_id, user_id)
);

CREATE INDEX review_helpful_votes_review_id_idx ON review_helpful_votes (review_id);
CREATE INDEX review_helpful_votes_user_id_idx ON review_helpful_votes (user_id);
