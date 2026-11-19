CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE OR REPLACE FUNCTION f_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE PARALLEL SAFE STRICT
AS $func$
    SELECT replace(replace(public.unaccent('public.unaccent', lower($1)), 'đ', 'd'), 'Đ', 'd');
$func$;

ALTER TABLE products
    ADD COLUMN specs jsonb NOT NULL DEFAULT '[]'::jsonb
    CONSTRAINT products_specs_array_check CHECK (jsonb_typeof(specs) = 'array');

CREATE INDEX products_search_trgm_idx
    ON products USING gin ((f_unaccent(name || ' ' || brand || ' ' || model)) gin_trgm_ops)
    WHERE active;

CREATE TABLE flash_sales (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name       text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
    starts_at  timestamptz NOT NULL,
    ends_at    timestamptz NOT NULL CHECK (ends_at > starts_at),
    active     boolean NOT NULL DEFAULT true,
    created_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT flash_sales_no_active_overlap
        EXCLUDE USING gist (tstzrange(starts_at, ends_at, '[)') WITH &&) WHERE (active = true)
);

CREATE TABLE flash_sale_items (
    flash_sale_id   uuid NOT NULL REFERENCES flash_sales(id) ON DELETE CASCADE,
    product_id      uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_id      uuid NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    flash_price_vnd numeric NOT NULL CHECK (flash_price_vnd = trunc(flash_price_vnd) AND flash_price_vnd > 0),
    quota           integer NOT NULL CHECK (quota BETWEEN 1 AND 100000),
    sold_quantity   integer NOT NULL DEFAULT 0 CHECK (sold_quantity >= 0 AND sold_quantity <= quota),
    position        integer NOT NULL DEFAULT 0 CHECK (position >= 0),
    PRIMARY KEY (flash_sale_id, variant_id)
);

CREATE INDEX flash_sale_items_variant_idx ON flash_sale_items (variant_id);

CREATE VIEW flash_sale_running_variants AS
SELECT fs.id AS flash_sale_id, fs.name AS campaign_name, fs.starts_at, fs.ends_at,
       fsi.product_id, fsi.variant_id, fsi.flash_price_vnd, fsi.quota, fsi.sold_quantity, fsi.position
FROM flash_sale_items fsi
JOIN flash_sales fs ON fs.id = fsi.flash_sale_id
JOIN product_variants v ON v.id = fsi.variant_id
WHERE fs.active = true
  AND fs.starts_at <= now()
  AND now() < fs.ends_at
  AND fsi.flash_price_vnd < v.price_vnd;

CREATE VIEW flash_sale_active_variant_prices AS
SELECT flash_sale_id, campaign_name, starts_at, ends_at,
       product_id, variant_id, flash_price_vnd, quota, sold_quantity
FROM flash_sale_running_variants
WHERE sold_quantity < quota;
