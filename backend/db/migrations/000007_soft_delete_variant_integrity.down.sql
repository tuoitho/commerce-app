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
