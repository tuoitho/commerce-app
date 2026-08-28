ALTER TABLE product_reviews
ADD COLUMN admin_reply text DEFAULT NULL CHECK (admin_reply IS NULL OR char_length(admin_reply) <= 1000),
ADD COLUMN admin_replied_at timestamptz DEFAULT NULL;
