DROP TABLE IF EXISTS cart_items;
DROP TRIGGER IF EXISTS product_option_groups_integrity_trigger ON product_option_groups;
DROP TRIGGER IF EXISTS variant_option_values_integrity_trigger ON variant_option_values;
DROP TRIGGER IF EXISTS product_variants_integrity_trigger ON product_variants;
DROP FUNCTION IF EXISTS validate_product_variant_integrity();
DROP TABLE IF EXISTS variant_option_values;
DROP TABLE IF EXISTS product_variants;
DROP TABLE IF EXISTS product_option_values;
DROP TABLE IF EXISTS product_option_groups;

ALTER TABLE products
    DROP COLUMN IF EXISTS active,
    DROP COLUMN IF EXISTS featured,
    DROP COLUMN IF EXISTS model;
