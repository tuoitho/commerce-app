DROP TABLE IF EXISTS return_request_items;
DROP TABLE IF EXISTS return_requests;

ALTER TABLE orders DROP COLUMN IF EXISTS delivered_at;
