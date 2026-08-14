ALTER TABLE products
    ADD COLUMN model text NOT NULL DEFAULT '',
    ADD COLUMN featured boolean NOT NULL DEFAULT false,
    ADD COLUMN active boolean NOT NULL DEFAULT false;

CREATE TABLE product_option_groups (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    label      text NOT NULL,
    position   integer NOT NULL DEFAULT 0 CHECK (position >= 0),
    UNIQUE (product_id, label),
    UNIQUE (product_id, id)
);

CREATE INDEX product_option_groups_product_id_position_idx
    ON product_option_groups (product_id, position);

CREATE TABLE product_option_values (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL,
    group_id   uuid NOT NULL,
    label      text NOT NULL,
    position   integer NOT NULL DEFAULT 0 CHECK (position >= 0),
    UNIQUE (group_id, label),
    UNIQUE (product_id, group_id, id),
    FOREIGN KEY (product_id, group_id)
        REFERENCES product_option_groups (product_id, id) ON DELETE CASCADE
);

CREATE INDEX product_option_values_product_group_position_idx
    ON product_option_values (product_id, group_id, position);

CREATE TABLE product_variants (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id    uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    price_vnd     numeric NOT NULL
        CHECK (price_vnd = trunc(price_vnd) AND price_vnd > 0 AND price_vnd < 100000000000000000000000000000000000000),
    stock_quantity numeric(38, 0) NOT NULL DEFAULT 0
        CHECK (stock_quantity >= 0),
    active        boolean NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (product_id, id)
);

CREATE INDEX product_variants_product_active_idx
    ON product_variants (product_id, active);
CREATE INDEX product_variants_price_vnd_idx ON product_variants (price_vnd);
CREATE INDEX product_variants_stock_quantity_idx ON product_variants (stock_quantity);

CREATE TABLE variant_option_values (
    variant_id     uuid NOT NULL,
    product_id     uuid NOT NULL,
    group_id       uuid NOT NULL,
    option_value_id uuid NOT NULL,
    PRIMARY KEY (variant_id, group_id),
    FOREIGN KEY (product_id, variant_id)
        REFERENCES product_variants (product_id, id) ON DELETE CASCADE,
    FOREIGN KEY (product_id, group_id, option_value_id)
        REFERENCES product_option_values (product_id, group_id, id) ON DELETE RESTRICT
);

CREATE INDEX variant_option_values_product_group_value_idx
    ON variant_option_values (product_id, group_id, option_value_id);
CREATE INDEX variant_option_values_option_value_id_idx
    ON variant_option_values (option_value_id);

CREATE OR REPLACE FUNCTION validate_product_variant_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    affected_product_id uuid;
    variant_record record;
BEGIN
    affected_product_id := COALESCE(NEW.product_id, OLD.product_id);

    FOR variant_record IN
        SELECT id
        FROM product_variants
        WHERE product_id = affected_product_id
    LOOP
        IF (SELECT count(*) FROM product_option_groups WHERE product_id = affected_product_id)
             <> (SELECT count(*) FROM variant_option_values WHERE variant_id = variant_record.id)
           OR EXISTS (
                SELECT 1
                FROM product_option_groups groups
                WHERE groups.product_id = affected_product_id
                  AND NOT EXISTS (
                      SELECT 1
                      FROM variant_option_values links
                      WHERE links.variant_id = variant_record.id
                        AND links.group_id = groups.id
                  )
           )
        THEN
            RAISE EXCEPTION 'variant % must contain exactly one value for every product option group',
                variant_record.id USING ERRCODE = 'check_violation';
        END IF;

        IF EXISTS (
            SELECT 1
            FROM product_variants other
            WHERE other.product_id = affected_product_id
              AND other.id <> variant_record.id
              AND ARRAY(
                  SELECT option_value_id
                  FROM variant_option_values
                  WHERE variant_id = other.id
                  ORDER BY group_id
              ) = ARRAY(
                  SELECT option_value_id
                  FROM variant_option_values
                  WHERE variant_id = variant_record.id
                  ORDER BY group_id
              )
        ) THEN
            RAISE EXCEPTION 'product % contains duplicate variant option combination',
                affected_product_id USING ERRCODE = 'unique_violation';
        END IF;
    END LOOP;

    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER product_variants_integrity_trigger
AFTER INSERT OR UPDATE OR DELETE ON product_variants
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_product_variant_integrity();

CREATE CONSTRAINT TRIGGER variant_option_values_integrity_trigger
AFTER INSERT OR UPDATE OR DELETE ON variant_option_values
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_product_variant_integrity();

CREATE CONSTRAINT TRIGGER product_option_groups_integrity_trigger
AFTER INSERT OR UPDATE OR DELETE ON product_option_groups
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION validate_product_variant_integrity();

CREATE TABLE cart_items (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    variant_id            uuid NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
    quantity              numeric NOT NULL
        CHECK (quantity = trunc(quantity) AND quantity > 0 AND quantity < 100000000000000000000000000000000000000),
    selected              boolean NOT NULL DEFAULT true,
    snapshot_brand_name   text NOT NULL DEFAULT '',
    snapshot_product_name text NOT NULL DEFAULT '',
    snapshot_model        text NOT NULL DEFAULT '',
    snapshot_image_url    text NOT NULL DEFAULT '',
    snapshot_options      jsonb NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(snapshot_options) = 'array'),
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, variant_id)
);

CREATE INDEX cart_items_user_id_created_at_idx ON cart_items (user_id, created_at);
CREATE INDEX cart_items_variant_id_idx ON cart_items (variant_id);
