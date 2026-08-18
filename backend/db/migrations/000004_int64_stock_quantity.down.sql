ALTER TABLE products
    DROP CONSTRAINT IF EXISTS products_stock_quantity_int64;

ALTER TABLE cart_items
    DROP CONSTRAINT IF EXISTS cart_items_quantity_int64;

ALTER TABLE product_variants
    DROP CONSTRAINT IF EXISTS product_variants_stock_quantity_int64;

ALTER TABLE product_variants
    ALTER COLUMN stock_quantity TYPE numeric USING stock_quantity::numeric;

ALTER TABLE cart_items
    ALTER COLUMN quantity TYPE numeric USING quantity::numeric;

DO $$
BEGIN
    IF (SELECT COALESCE(MAX(stock_quantity), 0) FROM products) <= 2147483647 THEN
        ALTER TABLE products
            ALTER COLUMN stock_quantity TYPE integer USING stock_quantity::integer;
    END IF;
END $$;

ALTER TABLE products
    DROP CONSTRAINT IF EXISTS products_stock_quantity_rollback_int64;
ALTER TABLE products
    ADD CONSTRAINT products_stock_quantity_rollback_int64
    CHECK (stock_quantity = trunc(stock_quantity)
        AND stock_quantity BETWEEN 0 AND 9223372036854775807);

ALTER TABLE product_variants
    DROP CONSTRAINT IF EXISTS product_variants_stock_quantity_rollback_int64;
ALTER TABLE product_variants
    ADD CONSTRAINT product_variants_stock_quantity_rollback_int64
    CHECK (stock_quantity = trunc(stock_quantity)
        AND stock_quantity BETWEEN 0 AND 9223372036854775807);

ALTER TABLE cart_items
    DROP CONSTRAINT IF EXISTS cart_items_quantity_rollback_int64;
ALTER TABLE cart_items
    ADD CONSTRAINT cart_items_quantity_rollback_int64
    CHECK (quantity = trunc(quantity)
        AND quantity BETWEEN 1 AND 9223372036854775807);
