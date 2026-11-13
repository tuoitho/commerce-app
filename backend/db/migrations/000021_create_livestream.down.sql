DROP VIEW IF EXISTS live_active_variant_prices;
ALTER TABLE order_items DROP COLUMN IF EXISTS live_session_id;
DROP TABLE IF EXISTS live_comments;
DROP TABLE IF EXISTS live_variant_prices;
DROP TABLE IF EXISTS live_session_products;
DROP TABLE IF EXISTS live_sessions;
