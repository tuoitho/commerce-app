ALTER TABLE products
    ALTER COLUMN stock_quantity TYPE numeric USING stock_quantity::numeric;

ALTER TABLE product_variants
    ALTER COLUMN stock_quantity TYPE numeric USING stock_quantity::numeric;

ALTER TABLE cart_items
    ALTER COLUMN quantity TYPE numeric USING quantity::numeric;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM products WHERE stock_quantity <> trunc(stock_quantity)
        OR stock_quantity < 0 OR stock_quantity > 9223372036854775807) THEN
        RAISE EXCEPTION 'products.stock_quantity is outside unsigned int64';
    END IF;
    IF EXISTS (SELECT 1 FROM product_variants WHERE stock_quantity <> trunc(stock_quantity)
        OR stock_quantity < 0 OR stock_quantity > 9223372036854775807) THEN
        RAISE EXCEPTION 'product_variants.stock_quantity is outside unsigned int64';
    END IF;
    IF EXISTS (SELECT 1 FROM cart_items WHERE quantity <> trunc(quantity)
        OR quantity < 1 OR quantity > 9223372036854775807) THEN
        RAISE EXCEPTION 'cart_items.quantity is outside positive int64';
    END IF;
END $$;

ALTER TABLE products
    ADD CONSTRAINT products_stock_quantity_int64
    CHECK (stock_quantity = trunc(stock_quantity)
        AND stock_quantity BETWEEN 0 AND 9223372036854775807);

ALTER TABLE product_variants
    ADD CONSTRAINT product_variants_stock_quantity_int64
    CHECK (stock_quantity = trunc(stock_quantity)
        AND stock_quantity BETWEEN 0 AND 9223372036854775807);

ALTER TABLE cart_items
    ADD CONSTRAINT cart_items_quantity_int64
    CHECK (quantity = trunc(quantity)
        AND quantity BETWEEN 1 AND 9223372036854775807);
