-- Drop database integrity triggers in favor of pure application-layer validation in Go

DROP TRIGGER IF EXISTS product_variants_integrity_trigger ON product_variants;
DROP TRIGGER IF EXISTS variant_option_values_integrity_trigger ON variant_option_values;
DROP TRIGGER IF EXISTS product_option_groups_integrity_trigger ON product_option_groups;
DROP FUNCTION IF EXISTS validate_product_variant_integrity();
