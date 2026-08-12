-- Deterministic sample catalog data.
--
-- Idempotent: re-running this file against a migrated database never creates
-- duplicates. Run it with `make seed` (or psql -f) after `make db-up`.

INSERT INTO categories (id, name) VALUES
    ('00000000-0000-0000-0000-000000000001', 'Electronics'),
    ('00000000-0000-0000-0000-000000000002', 'Books'),
    ('00000000-0000-0000-0000-000000000003', 'Clothing'),
    ('00000000-0000-0000-0000-000000000004', 'Home & Kitchen')
ON CONFLICT (name) DO NOTHING;

INSERT INTO products (id, category_id, name, description, price, currency, stock_quantity) VALUES
    ('00000000-0000-0001-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Wireless Mouse',
     'A reliable wireless mouse with silent clicks and a long battery life.', 24.99, 'USD', 12),
    ('00000000-0000-0001-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Wireless Keyboard',
     'A compact wireless keyboard with tactile keys and multi-device pairing.', 59.90, 'USD', 0),
    ('00000000-0000-0001-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Mechanical Keyboard',
     'A full-size mechanical keyboard with hot-swappable switches and RGB backlight.', 129.00, 'USD', 5),
    ('00000000-0000-0001-0000-000000000004', '00000000-0000-0000-0000-000000000002', 'The Go Programming Language',
     'The authoritative book on the Go programming language.', 45.00, 'USD', 8),
    ('00000000-0000-0001-0000-000000000005', '00000000-0000-0000-0000-000000000002', 'Designing Data-Intensive Applications',
     'A deep dive into the architecture of reliable, scalable, maintainable systems.', 62.50, 'USD', 0),
    ('00000000-0000-0001-0000-000000000006', '00000000-0000-0000-0000-000000000003', 'Cotton T-Shirt',
     'A soft, breathable 100% cotton t-shirt in a classic fit.', 12.99, 'USD', 40),
    ('00000000-0000-0001-0000-000000000007', '00000000-0000-0000-0000-000000000003', 'Running Shoes',
     'Lightweight running shoes with responsive cushioning.', 89.90, 'USD', 3),
    ('00000000-0000-0001-0000-000000000008', '00000000-0000-0000-0000-000000000004', 'Ceramic Mug',
     'A large ceramic mug that keeps your drinks warm.', 9.50, 'USD', 25),
    ('00000000-0000-0001-0000-000000000009', '00000000-0000-0000-0000-000000000004', 'Blender 1000W',
     'A powerful countertop blender for smoothies and sauces.', 149.00, 'USD', 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO product_images (id, product_id, url, position) VALUES
    ('00000000-0000-0002-0000-000000000001', '00000000-0000-0001-0000-000000000001', 'https://picsum.photos/seed/wireless-mouse/600/600', 0),
    ('00000000-0000-0002-0000-000000000002', '00000000-0000-0001-0000-000000000002', 'https://picsum.photos/seed/wireless-keyboard/600/600', 0),
    ('00000000-0000-0002-0000-000000000003', '00000000-0000-0001-0000-000000000003', 'https://picsum.photos/seed/mechanical-keyboard/600/600', 0),
    ('00000000-0000-0002-0000-000000000004', '00000000-0000-0001-0000-000000000004', 'https://picsum.photos/seed/go-book/600/600', 0),
    ('00000000-0000-0002-0000-000000000005', '00000000-0000-0001-0000-000000000005', 'https://picsum.photos/seed/ddia-book/600/600', 0),
    ('00000000-0000-0002-0000-000000000006', '00000000-0000-0001-0000-000000000006', 'https://picsum.photos/seed/cotton-tshirt/600/600', 0),
    ('00000000-0000-0002-0000-000000000007', '00000000-0000-0001-0000-000000000007', 'https://picsum.photos/seed/running-shoes/600/600', 0),
    ('00000000-0000-0002-0000-000000000008', '00000000-0000-0001-0000-000000000008', 'https://picsum.photos/seed/ceramic-mug/600/600', 0),
    ('00000000-0000-0002-0000-000000000009', '00000000-0000-0001-0000-000000000009', 'https://picsum.photos/seed/blender/600/600', 0)
ON CONFLICT (id) DO NOTHING;
