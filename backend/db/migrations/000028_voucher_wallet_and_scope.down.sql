DROP INDEX IF EXISTS user_vouchers_voucher_id_idx;
DROP INDEX IF EXISTS user_vouchers_user_claimed_idx;
DROP TABLE IF EXISTS user_vouchers;

DROP INDEX IF EXISTS voucher_products_product_id_idx;
DROP TABLE IF EXISTS voucher_products;

DROP INDEX IF EXISTS voucher_categories_category_id_idx;
DROP TABLE IF EXISTS voucher_categories;

ALTER TABLE vouchers
    DROP COLUMN IF EXISTS scope_type;
