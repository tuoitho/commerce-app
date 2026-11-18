-- Deterministic demo data for the commerce storefront.
--
-- Idempotent: re-running replaces the demo images, addresses, carts, and orders
-- created here while preserving user-generated rows.
-- Apply after catalog.sql with:
--   psql "$DB_URL" -f db/seed/sample-data.sql

BEGIN;

-- Refresh the four catalog descriptions that mixed English and Vietnamese.
UPDATE products SET description = 'Khung titan nhẹ bền, chip A18 Pro mạnh mẽ cùng hệ thống camera Pro 48MP và nút Điều Khiển Camera.'
WHERE id = '10000000-0000-0001-0000-000000000001';
UPDATE products SET description = 'Thiết kế gọn nhẹ, chip A18, camera Fusion 48MP và thời lượng pin ấn tượng trong tầm giá dễ tiếp cận.'
WHERE id = '10000000-0000-0001-0000-000000000002';
UPDATE products SET description = 'Flagship nhỏ gọn với chip Snapdragon 8 Elite, cụm camera Leica và màn hình AMOLED 120Hz viền siêu mỏng.'
WHERE id = '10000000-0000-0001-0000-000000000003';
UPDATE products SET description = 'Màn hình AMOLED sáng rõ, pin 5500mAh và camera 108MP đáp ứng tốt nhu cầu học tập, giải trí hằng ngày.'
WHERE id = '10000000-0000-0001-0000-000000000004';

-- New flagship products.
INSERT INTO products
    (id, category_id, name, model, brand, description, price, currency, stock_quantity, featured, active)
VALUES
    ('10000000-0000-0001-0000-000000000021', '10000000-0000-0000-0000-000000000001',
     'OPPO Find X8 Pro', 'CPH2659', 'OPPO',
     'Cụm camera Hasselblad 50MP, chip Dimensity 9400 và pin 5910mAh, thiết kế mỏng nhẹ đạt chuẩn kháng nước IP68/IP69.',
     24990000, 'VND', 48, true, true),
    ('10000000-0000-0001-0000-000000000022', '10000000-0000-0000-0000-000000000001',
     'vivo X200 Pro', 'V2413', 'vivo',
     'Camera ZEISS 200MP tele tiềm vọng, chip Dimensity 9400 và pin 6000mAh, màn hình LTPO AMOLED 120Hz cao cấp.',
     26990000, 'VND', 40, true, true),
    ('10000000-0000-0001-0000-000000000023', '10000000-0000-0000-0000-000000000001',
     'OnePlus 13', 'CPH2653', 'OnePlus',
     'Chip Snapdragon 8 Elite, màn hình LTPO AMOLED 2K 120Hz và pin 6000mAh sạc nhanh 100W, hiệu năng flagship toàn diện.',
     22990000, 'VND', 44, true, true)
ON CONFLICT (id) DO UPDATE SET
    category_id = EXCLUDED.category_id,
    name = EXCLUDED.name,
    model = EXCLUDED.model,
    brand = EXCLUDED.brand,
    description = EXCLUDED.description,
    price = EXCLUDED.price,
    currency = EXCLUDED.currency,
    stock_quantity = EXCLUDED.stock_quantity,
    featured = EXCLUDED.featured,
    active = EXCLUDED.active,
    updated_at = now();

-- Replace catalog images with public product photos.
DELETE FROM product_images
WHERE product_id IN (
    '10000000-0000-0001-0000-000000000001',
    '10000000-0000-0001-0000-000000000002',
    '10000000-0000-0001-0000-000000000003',
    '10000000-0000-0001-0000-000000000004',
    '10000000-0000-0001-0000-000000000005',
    '10000000-0000-0001-0000-000000000006',
    '10000000-0000-0001-0000-000000000007',
    '10000000-0000-0001-0000-000000000008',
    '10000000-0000-0001-0000-000000000009',
    '10000000-0000-0001-0000-000000000010',
    '10000000-0000-0001-0000-000000000011',
    '10000000-0000-0001-0000-000000000012',
    '10000000-0000-0001-0000-000000000013',
    '10000000-0000-0001-0000-000000000014',
    '10000000-0000-0001-0000-000000000015',
    '10000000-0000-0001-0000-000000000016',
    '10000000-0000-0001-0000-000000000017',
    '10000000-0000-0001-0000-000000000018',
    '10000000-0000-0001-0000-000000000019',
    '10000000-0000-0001-0000-000000000020',
    '10000000-0000-0001-0000-000000000021',
    '10000000-0000-0001-0000-000000000022',
    '10000000-0000-0001-0000-000000000023'
);

INSERT INTO product_images (id, product_id, url, position) VALUES
    ('10000000-0000-0002-0000-000000000001', '10000000-0000-0001-0000-000000000001', 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7f/Back_view_of_iPhone_16_Pro_White_Titanium.jpg/1280px-Back_view_of_iPhone_16_Pro_White_Titanium.jpg', 0),
    ('10000000-0000-0002-0000-000000000002', '10000000-0000-0001-0000-000000000001', 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/About_iPhone_16_Pro_White_Titanium.jpg/1280px-About_iPhone_16_Pro_White_Titanium.jpg', 1),
    ('10000000-0000-0002-0000-000000000003', '10000000-0000-0001-0000-000000000001', 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Right_view_of_iPhone_16_Pro_White_Titanium.jpg/1280px-Right_view_of_iPhone_16_Pro_White_Titanium.jpg', 2),
    ('10000000-0000-0002-0000-000000000004', '10000000-0000-0001-0000-000000000002', 'https://upload.wikimedia.org/wikipedia/commons/6/65/IPhone_16e.png', 0),
    ('10000000-0000-0002-0000-000000000005', '10000000-0000-0001-0000-000000000002', 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/IPhone_16e_black_front_view.jpg/1280px-IPhone_16e_black_front_view.jpg', 1),
    ('10000000-0000-0002-0000-000000000006', '10000000-0000-0001-0000-000000000002', 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/IPhone_16e_black_rear_view.jpg/1280px-IPhone_16e_black_rear_view.jpg', 2),
    ('10000000-0000-0002-0000-000000000007', '10000000-0000-0001-0000-000000000003', 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/af/Xiaomi_15_%281%29.jpg/1280px-Xiaomi_15_%281%29.jpg', 0),
    ('10000000-0000-0002-0000-000000000008', '10000000-0000-0001-0000-000000000003', 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/Xiaomi_15_%282%29.jpg/1280px-Xiaomi_15_%282%29.jpg', 1),
    ('10000000-0000-0002-0000-000000000009', '10000000-0000-0001-0000-000000000003', 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/Xiaomi_15_%2854239541799%29.jpg/1280px-Xiaomi_15_%2854239541799%29.jpg', 2),
    ('10000000-0000-0002-0000-000000000010', '10000000-0000-0001-0000-000000000004', 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/76/Redmi_Note_14_Pro_%28November_1%2C_2024%29.jpg/1280px-Redmi_Note_14_Pro_%28November_1%2C_2024%29.jpg', 0),
    ('10000000-0000-0002-0000-000000000011', '10000000-0000-0001-0000-000000000004', 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/71/Redmi_Note_14_Pro_%281%29.jpg/1280px-Redmi_Note_14_Pro_%281%29.jpg', 1),
    ('10000000-0000-0002-0000-000000000012', '10000000-0000-0001-0000-000000000004', 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Redmi_Note_14_Pro_%282%29.jpg/1280px-Redmi_Note_14_Pro_%282%29.jpg', 2),
    ('10000000-0000-0002-0000-000000000013', '10000000-0000-0001-0000-000000000005', 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fe/Back_view_of_iPhone_16_Pro_Max_Natural_Titanium.jpg/1280px-Back_view_of_iPhone_16_Pro_Max_Natural_Titanium.jpg', 0),
    ('10000000-0000-0002-0000-000000000014', '10000000-0000-0001-0000-000000000005', 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ad/About_iPhone_16_Pro_Max_Natural_Titanium.jpg/1280px-About_iPhone_16_Pro_Max_Natural_Titanium.jpg', 1),
    ('10000000-0000-0002-0000-000000000015', '10000000-0000-0001-0000-000000000005', 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/01/Right_view_of_iPhone_16_Pro_Max_Natural_Titanium.jpg/1280px-Right_view_of_iPhone_16_Pro_Max_Natural_Titanium.jpg', 2),
    ('10000000-0000-0002-0000-000000000016', '10000000-0000-0001-0000-000000000006', 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/72/About_iPhone_16_Ultramarine.jpg/1280px-About_iPhone_16_Ultramarine.jpg', 0),
    ('10000000-0000-0002-0000-000000000017', '10000000-0000-0001-0000-000000000006', 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bf/Back_view_of_iPhone_16_Ultramarine.jpg/1280px-Back_view_of_iPhone_16_Ultramarine.jpg', 1),
    ('10000000-0000-0002-0000-000000000018', '10000000-0000-0001-0000-000000000006', 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/IPhone_16_Ultramarine_Rear.png/1280px-IPhone_16_Ultramarine_Rear.png', 2),
    ('10000000-0000-0002-0000-000000000019', '10000000-0000-0001-0000-000000000007', 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/42/Front_of_iPhone_15_Pro_Max.jpg/1280px-Front_of_iPhone_15_Pro_Max.jpg', 0),
    ('10000000-0000-0002-0000-000000000020', '10000000-0000-0001-0000-000000000007', 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/Back_view_of_iPhone_15_Pro_Max_Natural_Titanium.jpg/1280px-Back_view_of_iPhone_15_Pro_Max_Natural_Titanium.jpg', 1),
    ('10000000-0000-0002-0000-000000000021', '10000000-0000-0001-0000-000000000007', 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/IPhone_15_Pro_Max_Camera.jpg/1280px-IPhone_15_Pro_Max_Camera.jpg', 2),
    ('10000000-0000-0002-0000-000000000022', '10000000-0000-0001-0000-000000000008', 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/About_iPhone_15_Blue.jpg/1280px-About_iPhone_15_Blue.jpg', 0),
    ('10000000-0000-0002-0000-000000000023', '10000000-0000-0001-0000-000000000008', 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Back_view_of_iPhone_15_Blue.jpg/1280px-Back_view_of_iPhone_15_Blue.jpg', 1),
    ('10000000-0000-0002-0000-000000000024', '10000000-0000-0001-0000-000000000008', 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/48/Apple_iPhone_15.jpg/1280px-Apple_iPhone_15.jpg', 2),
    ('10000000-0000-0002-0000-000000000025', '10000000-0000-0001-0000-000000000009', 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/ba/Apple_iPhone_13_Pro.jpg/1280px-Apple_iPhone_13_Pro.jpg', 0),
    ('10000000-0000-0002-0000-000000000026', '10000000-0000-0001-0000-000000000009', 'https://upload.wikimedia.org/wikipedia/commons/9/91/Back_of_the_iPhone_13_Pro.jpg', 1),
    ('10000000-0000-0002-0000-000000000027', '10000000-0000-0001-0000-000000000009', 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/Apple_iPhone_13_Pro_and_13_Pro_Max.jpg/1280px-Apple_iPhone_13_Pro_and_13_Pro_Max.jpg', 2),
    ('10000000-0000-0002-0000-000000000028', '10000000-0000-0001-0000-000000000010', 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Samsung_Galaxy_S25_Ultra_Titanium_Silverblue.jpg/1280px-Samsung_Galaxy_S25_Ultra_Titanium_Silverblue.jpg', 0),
    ('10000000-0000-0002-0000-000000000029', '10000000-0000-0001-0000-000000000010', 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/Rear_view_of_the_Samsung_Galaxy_S25_Ultra_smartphone.jpg/1280px-Rear_view_of_the_Samsung_Galaxy_S25_Ultra_smartphone.jpg', 1),
    ('10000000-0000-0002-0000-000000000030', '10000000-0000-0001-0000-000000000010', 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b7/Samsung_Galaxy_S25_Ultra_smartphone_-_side_view.jpg/1280px-Samsung_Galaxy_S25_Ultra_smartphone_-_side_view.jpg', 2),
    ('10000000-0000-0002-0000-000000000031', '10000000-0000-0001-0000-000000000011', 'https://upload.wikimedia.org/wikipedia/commons/e/ea/Galaxy_S25_Black.png', 0),
    ('10000000-0000-0002-0000-000000000032', '10000000-0000-0001-0000-000000000011', 'https://upload.wikimedia.org/wikipedia/commons/d/d4/Galaxy_S25_Black_%28front%29.png', 1),
    ('10000000-0000-0002-0000-000000000033', '10000000-0000-0001-0000-000000000012', 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Samsung_Galaxy_Z_Fold_6.jpg/1280px-Samsung_Galaxy_Z_Fold_6.jpg', 0),
    ('10000000-0000-0002-0000-000000000034', '10000000-0000-0001-0000-000000000012', 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/Samsung_Galaxy_Z_Fold_6_%282%29.jpg/1280px-Samsung_Galaxy_Z_Fold_6_%282%29.jpg', 1),
    ('10000000-0000-0002-0000-000000000035', '10000000-0000-0001-0000-000000000012', 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/Samsung_Galaxy_Z_Fold_6_%283%29.jpg/1280px-Samsung_Galaxy_Z_Fold_6_%283%29.jpg', 2),
    ('10000000-0000-0002-0000-000000000036', '10000000-0000-0001-0000-000000000013', 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/Samsung_Galaxy_Z_Flip_6.jpg/1280px-Samsung_Galaxy_Z_Flip_6.jpg', 0),
    ('10000000-0000-0002-0000-000000000037', '10000000-0000-0001-0000-000000000013', 'https://upload.wikimedia.org/wikipedia/commons/e/e3/%E4%B8%89%E6%98%9FGalaxy_Z_Flip6.png', 1),
    ('10000000-0000-0002-0000-000000000038', '10000000-0000-0001-0000-000000000014', 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/Samsung_Galaxy_A55_5G_2024.jpg/1280px-Samsung_Galaxy_A55_5G_2024.jpg', 0),
    ('10000000-0000-0002-0000-000000000039', '10000000-0000-0001-0000-000000000014', 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Samsung_Galaxy_A55_5G_2024_%281%29.jpg/1280px-Samsung_Galaxy_A55_5G_2024_%281%29.jpg', 1),
    ('10000000-0000-0002-0000-000000000040', '10000000-0000-0001-0000-000000000014', 'https://upload.wikimedia.org/wikipedia/commons/b/b4/Galaxy_A55.jpg', 2),
    ('10000000-0000-0002-0000-000000000041', '10000000-0000-0001-0000-000000000015', 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/Samsung_Galaxy_A15_5G_2024.jpg/1280px-Samsung_Galaxy_A15_5G_2024.jpg', 0),
    ('10000000-0000-0002-0000-000000000042', '10000000-0000-0001-0000-000000000015', 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/94/Samsung_Galaxy_A15_5G_2024_%281%29.jpg/1280px-Samsung_Galaxy_A15_5G_2024_%281%29.jpg', 1),
    ('10000000-0000-0002-0000-000000000043', '10000000-0000-0001-0000-000000000015', 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/Samsung_Galaxy_A15_20240529_HOF7502_RAW-Export_cens.png/1280px-Samsung_Galaxy_A15_20240529_HOF7502_RAW-Export_cens.png', 2),
    ('10000000-0000-0002-0000-000000000044', '10000000-0000-0001-0000-000000000016', 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/Xiaomi_15_Ultra_001.jpg/1280px-Xiaomi_15_Ultra_001.jpg', 0),
    ('10000000-0000-0002-0000-000000000045', '10000000-0000-0001-0000-000000000016', 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Xiaomi_15_Ultra_002.jpg/1280px-Xiaomi_15_Ultra_002.jpg', 1),
    ('10000000-0000-0002-0000-000000000046', '10000000-0000-0001-0000-000000000016', 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Xiaomi_15_Ultra.jpg/1280px-Xiaomi_15_Ultra.jpg', 2),
    ('10000000-0000-0002-0000-000000000047', '10000000-0000-0001-0000-000000000017', 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/48/Xiaomi_14T_Pro.jpg/1280px-Xiaomi_14T_Pro.jpg', 0),
    ('10000000-0000-0002-0000-000000000048', '10000000-0000-0001-0000-000000000017', 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/Xiaomi_14T_Pro_front.jpg/1280px-Xiaomi_14T_Pro_front.jpg', 1),
    ('10000000-0000-0002-0000-000000000049', '10000000-0000-0001-0000-000000000017', 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/da/Xiaomi-14T-Pro---RuinDig_001.jpg/1280px-Xiaomi-14T-Pro---RuinDig_001.jpg', 2),
    ('10000000-0000-0002-0000-000000000050', '10000000-0000-0001-0000-000000000018', 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ef/Redmi_Note_14_Pro%2B_%281%29.jpg/1280px-Redmi_Note_14_Pro%2B_%281%29.jpg', 0),
    ('10000000-0000-0002-0000-000000000051', '10000000-0000-0001-0000-000000000018', 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f7/Redmi_Note_14_Pro%2B_%282%29.jpg/1280px-Redmi_Note_14_Pro%2B_%282%29.jpg', 1),
    ('10000000-0000-0002-0000-000000000052', '10000000-0000-0001-0000-000000000018', 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Redmi_Note_14_Pro_Plus_Xiaomi_Store.jpg/1280px-Redmi_Note_14_Pro_Plus_Xiaomi_Store.jpg', 2),
    ('10000000-0000-0002-0000-000000000053', '10000000-0000-0001-0000-000000000019', 'https://i02.appmifile.com/mi-com-product/fly-birds/poco-x7-pro/pc/1a097d170ec6940798552eee961fc641.png', 0),
    ('10000000-0000-0002-0000-000000000054', '10000000-0000-0001-0000-000000000019', 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/Poco_X7_Phone.png/1280px-Poco_X7_Phone.png', 1),
    ('10000000-0000-0002-0000-000000000055', '10000000-0000-0001-0000-000000000020', 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/Redmi_14C_front.jpg/1280px-Redmi_14C_front.jpg', 0),
    ('10000000-0000-0002-0000-000000000056', '10000000-0000-0001-0000-000000000020', 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Redmi_14C_back.jpg/1280px-Redmi_14C_back.jpg', 1),
    ('10000000-0000-0002-0000-000000000057', '10000000-0000-0001-0000-000000000021', 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/OPPO_Find_X8_Pro_white_back.png/1280px-OPPO_Find_X8_Pro_white_back.png', 0),
    ('10000000-0000-0002-0000-000000000058', '10000000-0000-0001-0000-000000000021', 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/Star_Grey_Oppo_Find_X8.jpg/1280px-Star_Grey_Oppo_Find_X8.jpg', 1),
    ('10000000-0000-0002-0000-000000000059', '10000000-0000-0001-0000-000000000022', 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/Vivo_X200_Pro_blue.png/1280px-Vivo_X200_Pro_blue.png', 0),
    ('10000000-0000-0002-0000-000000000060', '10000000-0000-0001-0000-000000000022', 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Vivo_X200_Pro_mini_pink.png/1280px-Vivo_X200_Pro_mini_pink.png', 1),
    ('10000000-0000-0002-0000-000000000061', '10000000-0000-0001-0000-000000000023', 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/14/OnePlus_13_back.jpg/1280px-OnePlus_13_back.jpg', 0),
    ('10000000-0000-0002-0000-000000000062', '10000000-0000-0001-0000-000000000023', 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/13/OnePlus_13_volume_slider.jpg/1280px-OnePlus_13_volume_slider.jpg', 1)
ON CONFLICT (id) DO UPDATE SET
    product_id = EXCLUDED.product_id,
    url = EXCLUDED.url,
    position = EXCLUDED.position;

INSERT INTO product_option_groups (id, product_id, label, position) VALUES
    ('11000000-0000-0000-0000-000000000042', '10000000-0000-0001-0000-000000000021', 'Dung lượng', 0),
    ('11000000-0000-0000-0000-000000000043', '10000000-0000-0001-0000-000000000021', 'Màu sắc', 1),
    ('11000000-0000-0000-0000-000000000044', '10000000-0000-0001-0000-000000000022', 'Dung lượng', 0),
    ('11000000-0000-0000-0000-000000000045', '10000000-0000-0001-0000-000000000022', 'Màu sắc', 1),
    ('11000000-0000-0000-0000-000000000046', '10000000-0000-0001-0000-000000000023', 'Dung lượng', 0),
    ('11000000-0000-0000-0000-000000000047', '10000000-0000-0001-0000-000000000023', 'Màu sắc', 1)
ON CONFLICT (id) DO UPDATE SET
    label = EXCLUDED.label,
    position = EXCLUDED.position;

INSERT INTO product_option_values (id, product_id, group_id, label, position) VALUES
    ('12000000-0000-0000-0000-000000000080', '10000000-0000-0001-0000-000000000021', '11000000-0000-0000-0000-000000000042', '256GB', 0),
    ('12000000-0000-0000-0000-000000000081', '10000000-0000-0001-0000-000000000021', '11000000-0000-0000-0000-000000000042', '512GB', 1),
    ('12000000-0000-0000-0000-000000000082', '10000000-0000-0001-0000-000000000021', '11000000-0000-0000-0000-000000000043', 'Đen', 0),
    ('12000000-0000-0000-0000-000000000083', '10000000-0000-0001-0000-000000000021', '11000000-0000-0000-0000-000000000043', 'Trắng', 1),
    ('12000000-0000-0000-0000-000000000084', '10000000-0000-0001-0000-000000000022', '11000000-0000-0000-0000-000000000044', '256GB', 0),
    ('12000000-0000-0000-0000-000000000085', '10000000-0000-0001-0000-000000000022', '11000000-0000-0000-0000-000000000044', '512GB', 1),
    ('12000000-0000-0000-0000-000000000086', '10000000-0000-0001-0000-000000000022', '11000000-0000-0000-0000-000000000045', 'Xanh', 0),
    ('12000000-0000-0000-0000-000000000087', '10000000-0000-0001-0000-000000000022', '11000000-0000-0000-0000-000000000045', 'Đen', 1),
    ('12000000-0000-0000-0000-000000000088', '10000000-0000-0001-0000-000000000023', '11000000-0000-0000-0000-000000000046', '256GB', 0),
    ('12000000-0000-0000-0000-000000000089', '10000000-0000-0001-0000-000000000023', '11000000-0000-0000-0000-000000000046', '512GB', 1),
    ('12000000-0000-0000-0000-000000000090', '10000000-0000-0001-0000-000000000023', '11000000-0000-0000-0000-000000000047', 'Đen', 0),
    ('12000000-0000-0000-0000-000000000091', '10000000-0000-0001-0000-000000000023', '11000000-0000-0000-0000-000000000047', 'Xanh', 1)
ON CONFLICT (id) DO UPDATE SET
    label = EXCLUDED.label,
    position = EXCLUDED.position;

INSERT INTO product_variants (id, product_id, price_vnd, stock_quantity, active) VALUES
    ('13000000-0000-0000-0000-000000000079', '10000000-0000-0001-0000-000000000021', 24990000, 15, true),
    ('13000000-0000-0000-0000-000000000080', '10000000-0000-0001-0000-000000000021', 24990000, 12, true),
    ('13000000-0000-0000-0000-000000000081', '10000000-0000-0001-0000-000000000021', 27990000, 11, true),
    ('13000000-0000-0000-0000-000000000082', '10000000-0000-0001-0000-000000000021', 27990000, 10, true),
    ('13000000-0000-0000-0000-000000000083', '10000000-0000-0001-0000-000000000022', 26990000, 12, true),
    ('13000000-0000-0000-0000-000000000084', '10000000-0000-0001-0000-000000000022', 26990000, 10, true),
    ('13000000-0000-0000-0000-000000000085', '10000000-0000-0001-0000-000000000022', 29990000, 10, true),
    ('13000000-0000-0000-0000-000000000086', '10000000-0000-0001-0000-000000000022', 29990000, 8, true),
    ('13000000-0000-0000-0000-000000000087', '10000000-0000-0001-0000-000000000023', 22990000, 14, true),
    ('13000000-0000-0000-0000-000000000088', '10000000-0000-0001-0000-000000000023', 22990000, 10, true),
    ('13000000-0000-0000-0000-000000000089', '10000000-0000-0001-0000-000000000023', 25990000, 12, true),
    ('13000000-0000-0000-0000-000000000090', '10000000-0000-0001-0000-000000000023', 25990000, 8, true)
ON CONFLICT (id) DO UPDATE SET
    product_id = EXCLUDED.product_id,
    price_vnd = EXCLUDED.price_vnd,
    stock_quantity = EXCLUDED.stock_quantity,
    active = EXCLUDED.active,
    updated_at = now();

INSERT INTO variant_option_values (variant_id, product_id, group_id, option_value_id) VALUES
    ('13000000-0000-0000-0000-000000000079', '10000000-0000-0001-0000-000000000021', '11000000-0000-0000-0000-000000000042', '12000000-0000-0000-0000-000000000080'),
    ('13000000-0000-0000-0000-000000000079', '10000000-0000-0001-0000-000000000021', '11000000-0000-0000-0000-000000000043', '12000000-0000-0000-0000-000000000082'),
    ('13000000-0000-0000-0000-000000000080', '10000000-0000-0001-0000-000000000021', '11000000-0000-0000-0000-000000000042', '12000000-0000-0000-0000-000000000080'),
    ('13000000-0000-0000-0000-000000000080', '10000000-0000-0001-0000-000000000021', '11000000-0000-0000-0000-000000000043', '12000000-0000-0000-0000-000000000083'),
    ('13000000-0000-0000-0000-000000000081', '10000000-0000-0001-0000-000000000021', '11000000-0000-0000-0000-000000000042', '12000000-0000-0000-0000-000000000081'),
    ('13000000-0000-0000-0000-000000000081', '10000000-0000-0001-0000-000000000021', '11000000-0000-0000-0000-000000000043', '12000000-0000-0000-0000-000000000082'),
    ('13000000-0000-0000-0000-000000000082', '10000000-0000-0001-0000-000000000021', '11000000-0000-0000-0000-000000000042', '12000000-0000-0000-0000-000000000081'),
    ('13000000-0000-0000-0000-000000000082', '10000000-0000-0001-0000-000000000021', '11000000-0000-0000-0000-000000000043', '12000000-0000-0000-0000-000000000083'),
    ('13000000-0000-0000-0000-000000000083', '10000000-0000-0001-0000-000000000022', '11000000-0000-0000-0000-000000000044', '12000000-0000-0000-0000-000000000084'),
    ('13000000-0000-0000-0000-000000000083', '10000000-0000-0001-0000-000000000022', '11000000-0000-0000-0000-000000000045', '12000000-0000-0000-0000-000000000086'),
    ('13000000-0000-0000-0000-000000000084', '10000000-0000-0001-0000-000000000022', '11000000-0000-0000-0000-000000000044', '12000000-0000-0000-0000-000000000084'),
    ('13000000-0000-0000-0000-000000000084', '10000000-0000-0001-0000-000000000022', '11000000-0000-0000-0000-000000000045', '12000000-0000-0000-0000-000000000087'),
    ('13000000-0000-0000-0000-000000000085', '10000000-0000-0001-0000-000000000022', '11000000-0000-0000-0000-000000000044', '12000000-0000-0000-0000-000000000085'),
    ('13000000-0000-0000-0000-000000000085', '10000000-0000-0001-0000-000000000022', '11000000-0000-0000-0000-000000000045', '12000000-0000-0000-0000-000000000086'),
    ('13000000-0000-0000-0000-000000000086', '10000000-0000-0001-0000-000000000022', '11000000-0000-0000-0000-000000000044', '12000000-0000-0000-0000-000000000085'),
    ('13000000-0000-0000-0000-000000000086', '10000000-0000-0001-0000-000000000022', '11000000-0000-0000-0000-000000000045', '12000000-0000-0000-0000-000000000087'),
    ('13000000-0000-0000-0000-000000000087', '10000000-0000-0001-0000-000000000023', '11000000-0000-0000-0000-000000000046', '12000000-0000-0000-0000-000000000088'),
    ('13000000-0000-0000-0000-000000000087', '10000000-0000-0001-0000-000000000023', '11000000-0000-0000-0000-000000000047', '12000000-0000-0000-0000-000000000090'),
    ('13000000-0000-0000-0000-000000000088', '10000000-0000-0001-0000-000000000023', '11000000-0000-0000-0000-000000000046', '12000000-0000-0000-0000-000000000088'),
    ('13000000-0000-0000-0000-000000000088', '10000000-0000-0001-0000-000000000023', '11000000-0000-0000-0000-000000000047', '12000000-0000-0000-0000-000000000091'),
    ('13000000-0000-0000-0000-000000000089', '10000000-0000-0001-0000-000000000023', '11000000-0000-0000-0000-000000000046', '12000000-0000-0000-0000-000000000089'),
    ('13000000-0000-0000-0000-000000000089', '10000000-0000-0001-0000-000000000023', '11000000-0000-0000-0000-000000000047', '12000000-0000-0000-0000-000000000090'),
    ('13000000-0000-0000-0000-000000000090', '10000000-0000-0001-0000-000000000023', '11000000-0000-0000-0000-000000000046', '12000000-0000-0000-0000-000000000089'),
    ('13000000-0000-0000-0000-000000000090', '10000000-0000-0001-0000-000000000023', '11000000-0000-0000-0000-000000000047', '12000000-0000-0000-0000-000000000091')
ON CONFLICT (variant_id, group_id) DO UPDATE SET
    option_value_id = EXCLUDED.option_value_id;

-- Demo addresses.
INSERT INTO addresses
    (id, user_id, recipient_name, phone, province_code, province_name, ward_code, ward_name, detail_address, is_default)
VALUES
    ('80000000-0000-0000-0000-000000000001', '22222222-1111-1111-1111-111111111111',
     'Nguyễn Minh Anh', '0912345678', 1, 'Thành phố Hà Nội', 70, 'Phường Hoàn Kiếm',
     '18 Lý Thái Tổ', true),
    ('80000000-0000-0000-0000-000000000002', '22222222-1111-1111-1111-111111111111',
     'Trần Quốc Bảo', '0987654321', 79, 'Thành phố Hồ Chí Minh', 26743, 'Phường Bến Thành',
     '72 Lê Lợi', false),
    ('80000000-0000-0000-0000-000000000003', '22222222-1111-1111-1111-222222222222',
     'Lê Thu Hà', '0905123456', 48, 'Thành phố Đà Nẵng', 20242, 'Phường Hải Châu',
     '25 Bạch Đằng', true),
    ('80000000-0000-0000-0000-000000000004', '22222222-1111-1111-1111-222222222222',
     'Phạm Gia Huy', '0938765432', 1, 'Thành phố Hà Nội', 4, 'Phường Ba Đình',
     '12 Nguyễn Thái Học', false),
    ('80000000-0000-0000-0000-000000000005', 'ededb01d-da93-47a8-989b-f513f7d5ed20',
     'Vũ Hoàng Nam', '0977123456', 79, 'Thành phố Hồ Chí Minh', 26740, 'Phường Sài Gòn',
     '101 Nguyễn Huệ', false)
ON CONFLICT (id) DO UPDATE SET
    user_id = EXCLUDED.user_id,
    recipient_name = EXCLUDED.recipient_name,
    phone = EXCLUDED.phone,
    province_code = EXCLUDED.province_code,
    province_name = EXCLUDED.province_name,
    ward_code = EXCLUDED.ward_code,
    ward_name = EXCLUDED.ward_name,
    detail_address = EXCLUDED.detail_address,
    is_default = EXCLUDED.is_default,
    updated_at = now();

-- Demo cart items.
DELETE FROM cart_items
WHERE id IN (
    '70000000-0000-0000-0000-000000000001',
    '70000000-0000-0000-0000-000000000002',
    '70000000-0000-0000-0000-000000000003',
    '70000000-0000-0000-0000-000000000004',
    '70000000-0000-0000-0000-000000000005',
    '70000000-0000-0000-0000-000000000006',
    '70000000-0000-0000-0000-000000000007'
);

INSERT INTO cart_items
    (id, user_id, variant_id, quantity, selected,
     snapshot_brand_name, snapshot_product_name, snapshot_model, snapshot_image_url, snapshot_options)
VALUES
    ('70000000-0000-0000-0000-000000000001', '22222222-1111-1111-1111-111111111111',
     '13000000-0000-0000-0000-000000000007', 1, true,
     'Apple', 'iPhone 16 Pro', 'A3294',
     'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7f/Back_view_of_iPhone_16_Pro_White_Titanium.jpg/1280px-Back_view_of_iPhone_16_Pro_White_Titanium.jpg',
     '[{"groupLabel":"Dung lượng","valueLabel":"256GB"},{"groupLabel":"Màu sắc","valueLabel":"Titan đen"},{"groupLabel":"Phiên bản mạng","valueLabel":"5G"}]'::jsonb),
    ('70000000-0000-0000-0000-000000000002', '22222222-1111-1111-1111-111111111111',
     '13000000-0000-0000-0000-000000000040', 1, true,
     'Samsung', 'Samsung Galaxy S25 Ultra', 'SM-S938B',
     'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Samsung_Galaxy_S25_Ultra_Titanium_Silverblue.jpg/1280px-Samsung_Galaxy_S25_Ultra_Titanium_Silverblue.jpg',
     '[{"groupLabel":"Dung lượng","valueLabel":"256GB"},{"groupLabel":"Màu sắc","valueLabel":"Titan Đen"}]'::jsonb),
    ('70000000-0000-0000-0000-000000000003', '22222222-1111-1111-1111-111111111111',
     '13000000-0000-0000-0000-000000000073', 2, true,
     'Xiaomi', 'POCO X7 Pro', '24122RKC7G',
     'https://i02.appmifile.com/mi-com-product/fly-birds/poco-x7-pro/pc/1a097d170ec6940798552eee961fc641.png',
     '[{"groupLabel":"Dung lượng","valueLabel":"256GB"},{"groupLabel":"Màu sắc","valueLabel":"Vàng POCO"}]'::jsonb),
    ('70000000-0000-0000-0000-000000000004', '22222222-1111-1111-1111-222222222222',
     '13000000-0000-0000-0000-000000000013', 1, true,
     'Xiaomi', 'Xiaomi 15', '24129PN74G',
     'https://upload.wikimedia.org/wikipedia/commons/thumb/a/af/Xiaomi_15_%281%29.jpg/1280px-Xiaomi_15_%281%29.jpg',
     '[{"groupLabel":"Dung lượng","valueLabel":"256GB"},{"groupLabel":"Màu sắc","valueLabel":"Đen"}]'::jsonb),
    ('70000000-0000-0000-0000-000000000005', '22222222-1111-1111-1111-222222222222',
     '13000000-0000-0000-0000-000000000009', 1, true,
     'Apple', 'iPhone 16e', 'A3409',
     'https://upload.wikimedia.org/wikipedia/commons/6/65/IPhone_16e.png',
     '[{"groupLabel":"Dung lượng","valueLabel":"128GB"},{"groupLabel":"Màu sắc","valueLabel":"Đen"}]'::jsonb),
    ('70000000-0000-0000-0000-000000000006', 'ededb01d-da93-47a8-989b-f513f7d5ed20',
     '13000000-0000-0000-0000-000000000021', 1, true,
     'Apple', 'iPhone 16 Pro Max', 'A3297',
     'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fe/Back_view_of_iPhone_16_Pro_Max_Natural_Titanium.jpg/1280px-Back_view_of_iPhone_16_Pro_Max_Natural_Titanium.jpg',
     '[{"groupLabel":"Dung lượng","valueLabel":"256GB"},{"groupLabel":"Màu sắc","valueLabel":"Titan Sa Mạc"}]'::jsonb),
    ('70000000-0000-0000-0000-000000000007', 'ededb01d-da93-47a8-989b-f513f7d5ed20',
     '13000000-0000-0000-0000-000000000069', 1, true,
     'Xiaomi', 'Redmi Note 14 Pro+', '24090RA29G',
     'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ef/Redmi_Note_14_Pro%2B_%281%29.jpg/1280px-Redmi_Note_14_Pro%2B_%281%29.jpg',
     '[{"groupLabel":"Dung lượng","valueLabel":"256GB"},{"groupLabel":"Màu sắc","valueLabel":"Tím Lavender"}]'::jsonb);

-- Demo orders.
DELETE FROM product_reviews
WHERE order_item_id IN (
    SELECT id FROM order_items WHERE order_id IN (
        '90000000-0000-0000-0000-000000000001',
        '90000000-0000-0000-0000-000000000002',
        '90000000-0000-0000-0000-000000000003',
        '90000000-0000-0000-0000-000000000004',
        '90000000-0000-0000-0000-000000000005',
        '90000000-0000-0000-0000-000000000006',
        '90000000-0000-0000-0000-000000000007'
    )
);
DELETE FROM return_requests
WHERE order_id IN (
    '90000000-0000-0000-0000-000000000001',
    '90000000-0000-0000-0000-000000000002',
    '90000000-0000-0000-0000-000000000003',
    '90000000-0000-0000-0000-000000000004',
    '90000000-0000-0000-0000-000000000005',
    '90000000-0000-0000-0000-000000000006',
    '90000000-0000-0000-0000-000000000007'
);
DELETE FROM orders
WHERE id IN (
    '90000000-0000-0000-0000-000000000001',
    '90000000-0000-0000-0000-000000000002',
    '90000000-0000-0000-0000-000000000003',
    '90000000-0000-0000-0000-000000000004',
    '90000000-0000-0000-0000-000000000005',
    '90000000-0000-0000-0000-000000000006',
    '90000000-0000-0000-0000-000000000007'
);

INSERT INTO orders
    (id, user_id, status, payment_method, subtotal_vnd, shipping_fee_vnd, total_vnd,
     recipient_name, phone, province_name, ward_name, detail_address,
     created_at, updated_at, confirmed_at, cancelled_at, delivered_at)
VALUES
    ('90000000-0000-0000-0000-000000000001', '22222222-1111-1111-1111-111111111111',
     'delivered', 'cod', 68480000, 0, 68480000,
     'Nguyễn Minh Anh', '0912345678', 'Thành phố Hà Nội', 'Phường Hoàn Kiếm', '18 Lý Thái Tổ',
     now() - interval '20 days', now() - interval '15 days', now() - interval '19 days', NULL, now() - interval '15 days'),
    ('90000000-0000-0000-0000-000000000002', '22222222-1111-1111-1111-111111111111',
     'shipped', 'cod', 40770000, 0, 40770000,
     'Nguyễn Minh Anh', '0912345678', 'Thành phố Hà Nội', 'Phường Hoàn Kiếm', '18 Lý Thái Tổ',
     now() - interval '4 days', now() - interval '2 days', now() - interval '3 days', NULL, NULL),
    ('90000000-0000-0000-0000-000000000003', '22222222-1111-1111-1111-111111111111',
     'cancelled', 'cod', 34990000, 0, 34990000,
     'Trần Quốc Bảo', '0987654321', 'Thành phố Hồ Chí Minh', 'Phường Bến Thành', '72 Lê Lợi',
     now() - interval '12 days', now() - interval '11 days', NULL, now() - interval '11 days', NULL),
    ('90000000-0000-0000-0000-000000000004', '22222222-1111-1111-1111-222222222222',
     'pending_confirmation', 'cod', 46680000, 0, 46680000,
     'Lê Thu Hà', '0905123456', 'Thành phố Đà Nẵng', 'Phường Hải Châu', '25 Bạch Đằng',
     now() - interval '5 minutes', now() - interval '5 minutes', NULL, NULL, NULL),
    ('90000000-0000-0000-0000-000000000005', '22222222-1111-1111-1111-222222222222',
     'confirmed', 'cod', 49480000, 0, 49480000,
     'Lê Thu Hà', '0905123456', 'Thành phố Đà Nẵng', 'Phường Hải Châu', '25 Bạch Đằng',
     now() - interval '2 days', now() - interval '1 day', now() - interval '1 day', NULL, NULL),
    ('90000000-0000-0000-0000-000000000006', 'ededb01d-da93-47a8-989b-f513f7d5ed20',
     'preparing', 'cod', 44980000, 0, 44980000,
     'Vũ Hoàng Nam', '0977123456', 'Thành phố Hồ Chí Minh', 'Phường Sài Gòn', '101 Nguyễn Huệ',
     now() - interval '1 day', now() - interval '20 hours', now() - interval '20 hours', NULL, NULL),
    ('90000000-0000-0000-0000-000000000007', 'ededb01d-da93-47a8-989b-f513f7d5ed20',
     'delivered', 'cod', 13170000, 0, 13170000,
     'Vũ Hoàng Nam', '0977123456', 'Thành phố Hồ Chí Minh', 'Phường Sài Gòn', '101 Nguyễn Huệ',
     now() - interval '30 days', now() - interval '25 days', now() - interval '29 days', NULL, now() - interval '25 days');

INSERT INTO order_items
    (id, order_id, variant_id, product_id, brand_name, product_name, model, image_url, options,
     unit_price_vnd, quantity, line_total_vnd)
VALUES
    ('90000000-0000-0001-0000-000000000001', '90000000-0000-0000-0000-000000000001',
     '13000000-0000-0000-0000-000000000007', '10000000-0000-0001-0000-000000000001',
     'Apple', 'iPhone 16 Pro', 'A3294',
     'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7f/Back_view_of_iPhone_16_Pro_White_Titanium.jpg/1280px-Back_view_of_iPhone_16_Pro_White_Titanium.jpg',
     '[{"groupLabel":"Dung lượng","valueLabel":"256GB"},{"groupLabel":"Màu sắc","valueLabel":"Titan đen"},{"groupLabel":"Phiên bản mạng","valueLabel":"5G"}]'::jsonb,
     32490000, 1, 32490000),
    ('90000000-0000-0001-0000-000000000002', '90000000-0000-0000-0000-000000000001',
     '13000000-0000-0000-0000-000000000040', '10000000-0000-0001-0000-000000000010',
     'Samsung', 'Samsung Galaxy S25 Ultra', 'SM-S938B',
     'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Samsung_Galaxy_S25_Ultra_Titanium_Silverblue.jpg/1280px-Samsung_Galaxy_S25_Ultra_Titanium_Silverblue.jpg',
     '[{"groupLabel":"Dung lượng","valueLabel":"256GB"},{"groupLabel":"Màu sắc","valueLabel":"Titan Đen"}]'::jsonb,
     35990000, 1, 35990000),
    ('90000000-0000-0001-0000-000000000003', '90000000-0000-0000-0000-000000000002',
     '13000000-0000-0000-0000-000000000013', '10000000-0000-0001-0000-000000000003',
     'Xiaomi', 'Xiaomi 15', '24129PN74G',
     'https://upload.wikimedia.org/wikipedia/commons/thumb/a/af/Xiaomi_15_%281%29.jpg/1280px-Xiaomi_15_%281%29.jpg',
     '[{"groupLabel":"Dung lượng","valueLabel":"256GB"},{"groupLabel":"Màu sắc","valueLabel":"Đen"}]'::jsonb,
     20990000, 1, 20990000),
    ('90000000-0000-0001-0000-000000000004', '90000000-0000-0000-0000-000000000002',
     '13000000-0000-0000-0000-000000000073', '10000000-0000-0001-0000-000000000019',
     'Xiaomi', 'POCO X7 Pro', '24122RKC7G',
     'https://i02.appmifile.com/mi-com-product/fly-birds/poco-x7-pro/pc/1a097d170ec6940798552eee961fc641.png',
     '[{"groupLabel":"Dung lượng","valueLabel":"256GB"},{"groupLabel":"Màu sắc","valueLabel":"Vàng POCO"}]'::jsonb,
     9890000, 2, 19780000),
    ('90000000-0000-0001-0000-000000000005', '90000000-0000-0000-0000-000000000003',
     '13000000-0000-0000-0000-000000000061', '10000000-0000-0001-0000-000000000016',
     'Xiaomi', 'Xiaomi 15 Ultra', '25010PN30G',
     'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/Xiaomi_15_Ultra_001.jpg/1280px-Xiaomi_15_Ultra_001.jpg',
     '[{"groupLabel":"Dung lượng","valueLabel":"512GB"},{"groupLabel":"Màu sắc","valueLabel":"Đen Da"}]'::jsonb,
     34990000, 1, 34990000),
    ('90000000-0000-0001-0000-000000000006', '90000000-0000-0000-0000-000000000004',
     '13000000-0000-0000-0000-000000000021', '10000000-0000-0001-0000-000000000005',
     'Apple', 'iPhone 16 Pro Max', 'A3297',
     'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fe/Back_view_of_iPhone_16_Pro_Max_Natural_Titanium.jpg/1280px-Back_view_of_iPhone_16_Pro_Max_Natural_Titanium.jpg',
     '[{"groupLabel":"Dung lượng","valueLabel":"256GB"},{"groupLabel":"Màu sắc","valueLabel":"Titan Sa Mạc"}]'::jsonb,
     36990000, 1, 36990000),
    ('90000000-0000-0001-0000-000000000007', '90000000-0000-0000-0000-000000000004',
     '13000000-0000-0000-0000-000000000056', '10000000-0000-0001-0000-000000000014',
     'Samsung', 'Samsung Galaxy A55 5G', 'SM-A556B',
     'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/Samsung_Galaxy_A55_5G_2024.jpg/1280px-Samsung_Galaxy_A55_5G_2024.jpg',
     '[{"groupLabel":"Dung lượng","valueLabel":"128GB"},{"groupLabel":"Màu sắc","valueLabel":"Xanh Iceblue"}]'::jsonb,
     9690000, 1, 9690000),
    ('90000000-0000-0001-0000-000000000008', '90000000-0000-0000-0000-000000000005',
     '13000000-0000-0000-0000-000000000029', '10000000-0000-0001-0000-000000000007',
     'Apple', 'iPhone 15 Pro Max', 'A3106',
     'https://upload.wikimedia.org/wikipedia/commons/thumb/4/42/Front_of_iPhone_15_Pro_Max.jpg/1280px-Front_of_iPhone_15_Pro_Max.jpg',
     '[{"groupLabel":"Dung lượng","valueLabel":"256GB"},{"groupLabel":"Màu sắc","valueLabel":"Titan Xanh"}]'::jsonb,
     31490000, 1, 31490000),
    ('90000000-0000-0001-0000-000000000009', '90000000-0000-0000-0000-000000000005',
     '13000000-0000-0000-0000-000000000065', '10000000-0000-0001-0000-000000000017',
     'Xiaomi', 'Xiaomi 14T Pro', '2407FPN8EG',
     'https://upload.wikimedia.org/wikipedia/commons/thumb/4/48/Xiaomi_14T_Pro.jpg/1280px-Xiaomi_14T_Pro.jpg',
     '[{"groupLabel":"Dung lượng","valueLabel":"256GB"},{"groupLabel":"Màu sắc","valueLabel":"Titan Xám"}]'::jsonb,
     17990000, 1, 17990000),
    ('90000000-0000-0001-0000-000000000010', '90000000-0000-0000-0000-000000000006',
     '13000000-0000-0000-0000-000000000025', '10000000-0000-0001-0000-000000000006',
     'Apple', 'iPhone 16', 'A3288',
     'https://upload.wikimedia.org/wikipedia/commons/thumb/7/72/About_iPhone_16_Ultramarine.jpg/1280px-About_iPhone_16_Ultramarine.jpg',
     '[{"groupLabel":"Dung lượng","valueLabel":"128GB"},{"groupLabel":"Màu sắc","valueLabel":"Hồng"}]'::jsonb,
     22990000, 1, 22990000),
    ('90000000-0000-0001-0000-000000000011', '90000000-0000-0000-0000-000000000006',
     '13000000-0000-0000-0000-000000000043', '10000000-0000-0001-0000-000000000011',
     'Samsung', 'Samsung Galaxy S25', 'SM-S931B',
     'https://upload.wikimedia.org/wikipedia/commons/e/ea/Galaxy_S25_Black.png',
     '[{"groupLabel":"Dung lượng","valueLabel":"128GB"},{"groupLabel":"Màu sắc","valueLabel":"Xanh Navy"}]'::jsonb,
     21990000, 1, 21990000),
    ('90000000-0000-0001-0000-000000000012', '90000000-0000-0000-0000-000000000007',
     '13000000-0000-0000-0000-000000000017', '10000000-0000-0001-0000-000000000004',
     'Xiaomi', 'Redmi Note 14', '23117RA68G',
     'https://upload.wikimedia.org/wikipedia/commons/thumb/7/76/Redmi_Note_14_Pro_%28November_1%2C_2024%29.jpg/1280px-Redmi_Note_14_Pro_%28November_1%2C_2024%29.jpg',
     '[{"groupLabel":"Dung lượng","valueLabel":"128GB"},{"groupLabel":"Màu sắc","valueLabel":"Đen"}]'::jsonb,
     4990000, 2, 9980000),
    ('90000000-0000-0001-0000-000000000013', '90000000-0000-0000-0000-000000000007',
     '13000000-0000-0000-0000-000000000077', '10000000-0000-0001-0000-000000000020',
     'Xiaomi', 'Redmi 14C', '2409BRN2CG',
     'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/Redmi_14C_front.jpg/1280px-Redmi_14C_front.jpg',
     '[{"groupLabel":"Dung lượng","valueLabel":"128GB"},{"groupLabel":"Màu sắc","valueLabel":"Xanh Sao Trời"}]'::jsonb,
     3190000, 1, 3190000);

COMMIT;
