ALTER TABLE product_reviews
ADD COLUMN admin_reply text DEFAULT NULL CHECK (admin_reply IS NULL OR char_length(admin_reply) <= 1000),
ADD COLUMN admin_replied_at timestamptz DEFAULT NULL;

UPDATE product_reviews pr
SET admin_reply = rr.content,
    admin_replied_at = rr.updated_at
FROM review_replies rr
WHERE pr.id = rr.review_id;

DROP TABLE IF EXISTS review_helpfulness_votes;
DROP TABLE IF EXISTS review_replies;
