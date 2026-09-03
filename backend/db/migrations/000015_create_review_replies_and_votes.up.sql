CREATE TABLE review_replies (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id  uuid NOT NULL UNIQUE REFERENCES product_reviews(id) ON DELETE CASCADE,
    content    text NOT NULL CHECK (char_length(content) >= 1 AND char_length(content) <= 1000),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO review_replies (review_id, content, created_at, updated_at)
SELECT id, admin_reply, COALESCE(admin_replied_at, updated_at), COALESCE(admin_replied_at, updated_at)
FROM product_reviews
WHERE admin_reply IS NOT NULL;

CREATE TABLE review_helpfulness_votes (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    review_id  uuid NULL REFERENCES product_reviews(id) ON DELETE CASCADE,
    reply_id   uuid NULL REFERENCES review_replies(id) ON DELETE CASCADE,
    vote       text NOT NULL CHECK (vote IN ('helpful', 'unhelpful')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT review_helpfulness_votes_target_check CHECK (
        (review_id IS NOT NULL AND reply_id IS NULL) OR
        (review_id IS NULL AND reply_id IS NOT NULL)
    ),
    CONSTRAINT review_helpfulness_votes_user_review_unique UNIQUE (user_id, review_id),
    CONSTRAINT review_helpfulness_votes_user_reply_unique UNIQUE (user_id, reply_id)
);

CREATE INDEX idx_review_helpfulness_votes_review_vote ON review_helpfulness_votes (review_id, vote) WHERE review_id IS NOT NULL;
CREATE INDEX idx_review_helpfulness_votes_reply_vote ON review_helpfulness_votes (reply_id, vote) WHERE reply_id IS NOT NULL;

ALTER TABLE product_reviews
DROP COLUMN admin_replied_at,
DROP COLUMN admin_reply;
