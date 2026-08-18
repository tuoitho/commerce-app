UPDATE categories SET name = btrim(name);
CREATE UNIQUE INDEX categories_name_normalized_uidx ON categories (lower(btrim(name)));
