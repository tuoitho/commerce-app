CREATE TABLE categories (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name       text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE products (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id    uuid NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    name           text NOT NULL,
    description    text NOT NULL DEFAULT '',
    price          numeric(10, 2) NOT NULL CHECK (price >= 0),
    currency       text NOT NULL,
    stock_quantity integer NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX products_category_id_idx ON products (category_id);
CREATE INDEX products_stock_quantity_idx ON products (stock_quantity);
CREATE INDEX products_name_lower_idx ON products (lower(name));

CREATE TABLE product_images (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    url        text NOT NULL,
    position   integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX product_images_product_id_position_idx ON product_images (product_id, position);
