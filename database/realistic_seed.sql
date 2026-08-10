USE kitkop_db;

SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE menu_recipes;
TRUNCATE TABLE order_items;
TRUNCATE TABLE transactions;
TRUNCATE TABLE order_status_logs;
TRUNCATE TABLE stock_logs;
TRUNCATE TABLE orders;
TRUNCATE TABLE customers;
TRUNCATE TABLE raw_materials;
TRUNCATE TABLE menus;
TRUNCATE TABLE menu_categories;
TRUNCATE TABLE tables_;
TRUNCATE TABLE users;
SET FOREIGN_KEY_CHECKS = 1;

-- 1. USERS
INSERT INTO users (name, email, username, password_hash, role) VALUES
('Owner Kitkop', 'owner@kitkop.com', 'owner', '$2a$10$8KzQKx8q8qF5V7Iy5XJ5/.ykYRqUz1FKmGx0GIxh0z5qXJ8DXHC6S', 'owner'),
('Manajer Kitkop', 'manajer@kitkop.com', 'manajer', '$2a$10$bkqHe3r571kYKEj2s/ShW.ExLavO6wtb3TMpGnywhtpypc4VWlWPu', 'manajer'),
('Andi Kasir', 'kasir@kitkop.com', 'kasir', '$2a$10$bkqHe3r571kYKEj2s/ShW.ExLavO6wtb3TMpGnywhtpypc4VWlWPu', 'kasir'),
('Budi Kitchen', 'kitchen@kitkop.com', 'kitchen', '$2a$10$bkqHe3r571kYKEj2s/ShW.ExLavO6wtb3TMpGnywhtpypc4VWlWPu', 'kitchen'),
('Caca Barista', 'barista@kitkop.com', 'barista', '$2a$10$bkqHe3r571kYKEj2s/ShW.ExLavO6wtb3TMpGnywhtpypc4VWlWPu', 'barista');

-- 2. TABLES
INSERT INTO tables_ (table_number) VALUES
('A1'), ('A2'), ('A3'), ('A4'), ('A5'),
('B1'), ('B2'), ('B3'), ('B4'), ('B5'),
('Outdoor 1'), ('Outdoor 2'), ('Outdoor 3');

-- 3. MENU CATEGORIES
INSERT INTO menu_categories (name, description, sort_order) VALUES
('Coffee (Espresso Based)', 'Olahan kopi berbasis espresso', 1),
('Manual Brew', 'Kopi seduh manual V60, Japanese, dll', 2),
('Non-Coffee', 'Minuman tanpa kopi', 3),
('Pastry & Bakery', 'Roti, croissant, dan kue', 4),
('Main Course', 'Makanan berat', 5),
('Snack', 'Camilan pendamping kopi', 6);

-- 4. RAW MATERIALS (Bahan Baku Coffeeshop)
INSERT INTO raw_materials (name, category, stock, unit, min_stock, status) VALUES
-- Kopi & Susu
('House Blend Espresso (Robusta+Arabica)', 'Kopi', 5000, 'g', 1000, 'aman'),
('Single Origin Arabica (Gayo/Flores)', 'Kopi', 2000, 'g', 500, 'aman'),
('Fresh Milk', 'Susu', 20000, 'ml', 5000, 'aman'),
('Oat Milk', 'Susu', 5000, 'ml', 1000, 'aman'),
('Susu Kental Manis (SKM)', 'Susu', 3000, 'ml', 1000, 'aman'),
-- Sirup & Powder
('Gula Cair (Simple Syrup)', 'Sirup', 5000, 'ml', 1000, 'aman'),
('Sirup Vanilla', 'Sirup', 2000, 'ml', 500, 'aman'),
('Sirup Caramel', 'Sirup', 2000, 'ml', 500, 'aman'),
('Matcha Powder Premium', 'Powder', 1500, 'g', 300, 'aman'),
('Chocolate Powder', 'Powder', 2000, 'g', 500, 'aman'),
('Red Velvet Powder', 'Powder', 1000, 'g', 200, 'aman'),
('Teh Hitam (Black Tea)', 'Teh', 1000, 'g', 200, 'aman'),
('Sirup Lychee', 'Sirup', 1000, 'ml', 300, 'aman'),
-- Kemasan (Packaging)
('Cup Plastik Cold 16oz', 'Kemasan', 500, 'pcs', 100, 'aman'),
('Cup Kertas Hot 8oz', 'Kemasan', 300, 'pcs', 50, 'aman'),
('Sedotan Plastik', 'Kemasan', 1000, 'pcs', 200, 'aman'),
('Plastik Takeaway', 'Kemasan', 500, 'pcs', 100, 'aman'),
-- Makanan
('Croissant Butter (Frozen)', 'Pastry', 50, 'pcs', 10, 'aman'),
('Pain au Chocolat (Frozen)', 'Pastry', 30, 'pcs', 10, 'aman'),
('Kentang Goreng (Shoestring)', 'Makanan', 5000, 'g', 1000, 'aman'),
('Sosis Sapi', 'Makanan', 50, 'pcs', 15, 'aman'),
('Nasi Putih', 'Makanan', 5000, 'g', 1000, 'aman'),
('Dada Ayam Fillet', 'Makanan', 3000, 'g', 1000, 'aman'),
('Minyak Goreng', 'Bahan Pelengkap', 5000, 'ml', 1000, 'aman'),
('Bumbu Nasi Goreng', 'Bahan Pelengkap', 1000, 'g', 200, 'aman');

-- 5. MENUS
INSERT INTO menus (category_id, name, description, price, is_available) VALUES
-- Coffee (1)
(1, 'Espresso', 'Single shot espresso (30ml)', 15000, 1),
(1, 'Americano Hot', 'Espresso + Air Panas', 18000, 1),
(1, 'Iced Americano', 'Espresso + Air Dingin + Es', 20000, 1),
(1, 'Cafe Latte Hot', 'Espresso + Steam Milk', 25000, 1),
(1, 'Iced Cafe Latte', 'Espresso + Fresh Milk + Es', 27000, 1),
(1, 'Vanilla Latte Iced', 'Espresso + Fresh Milk + Sirup Vanilla', 30000, 1),
(1, 'Caramel Macchiato', 'Espresso + Fresh Milk + Sirup Caramel', 32000, 1),
(1, 'Es Kopi Susu Gula Aren', 'Signature Iced Coffee dengan Gula Aren Asli', 22000, 1),
(1, 'Oat Milk Latte Iced', 'Vegan friendly latte dengan susu oat', 35000, 1),
-- Manual Brew (2)
(2, 'V60 Arabica', 'Kopi seduh manual V60', 25000, 1),
(2, 'Japanese Iced Coffee', 'V60 diseduh langsung ke atas es batu', 28000, 1),
-- Non-Coffee (3)
(3, 'Matcha Latte Iced', 'Premium Japanese Matcha + Fresh Milk', 28000, 1),
(3, 'Signature Chocolate Iced', 'Rich chocolate premium + Fresh Milk', 26000, 1),
(3, 'Red Velvet Latte Iced', 'Red velvet powder + Fresh Milk', 26000, 1),
(3, 'Lychee Tea Iced', 'Teh hitam segar + Sirup Lychee + Buah Lychee', 22000, 1),
(3, 'Lemon Tea Iced', 'Teh hitam segar + perasan lemon asli', 20000, 1),
-- Pastry & Bakery (4)
(4, 'Butter Croissant', 'Croissant mentega renyah, dipanaskan sebelum disajikan', 22000, 1),
(4, 'Pain au Chocolat', 'Croissant dengan isian coklat', 25000, 1),
-- Main Course (5)
(5, 'Nasi Goreng Kitkop', 'Nasi goreng signature dengan ayam dan telur', 30000, 1),
(5, 'Chicken Katsu Don', 'Nasi dengan ayam katsu dan saus spesial', 35000, 1),
-- Snack (6)
(6, 'French Fries', 'Kentang goreng renyah', 20000, 1),
(6, 'Mix Platter', 'Kentang goreng dan sosis sapi', 30000, 1);

-- 6. MENU RECIPES (Logika Pengurangan Stok Otomatis)
-- Material IDs based on order above:
-- 1: House Blend Espresso
-- 2: Single Origin
-- 3: Fresh Milk
-- 4: Oat Milk
-- 5: SKM
-- 6: Gula Cair
-- 7: Sirup Vanilla
-- 8: Sirup Caramel
-- 9: Matcha Powder
-- 10: Chocolate Powder
-- 11: Red Velvet Powder
-- 12: Teh Hitam
-- 13: Sirup Lychee
-- 14: Cup Plastik Cold 16oz
-- 15: Cup Kertas Hot 8oz
-- 16: Sedotan Plastik
-- 17: Plastik Takeaway
-- 18: Croissant Butter
-- 19: Pain au Chocolat
-- 20: Kentang Goreng
-- 21: Sosis Sapi
-- 22: Nasi Putih
-- 23: Dada Ayam Fillet
-- 24: Minyak Goreng
-- 25: Bumbu Nasi Goreng

-- Menu IDs based on order above:
-- 1: Espresso
-- 2: Americano Hot
-- 3: Iced Americano
-- 4: Cafe Latte Hot
-- 5: Iced Cafe Latte
-- 6: Vanilla Latte Iced
-- 7: Caramel Macchiato
-- 8: Es Kopi Susu Gula Aren
-- 9: Oat Milk Latte Iced
-- 10: V60
-- 11: Japanese
-- 12: Matcha Latte Iced
-- 13: Signature Choco Iced
-- 14: Red Velvet Iced
-- 15: Lychee Tea
-- 16: Lemon Tea
-- 17: Butter Croissant
-- 18: Pain au Chocolat
-- 19: Nasi Goreng
-- 20: Chicken Katsu
-- 21: French Fries
-- 22: Mix Platter

INSERT INTO menu_recipes (menu_id, raw_material_id, quantity_used) VALUES
-- Espresso (1) -> 18g Kopi, Cup Hot
(1, 1, 18), (1, 15, 1),
-- Americano Hot (2) -> 18g Kopi, Cup Hot
(2, 1, 18), (2, 15, 1),
-- Iced Americano (3) -> 18g Kopi, Cup Cold, Sedotan
(3, 1, 18), (3, 14, 1), (3, 16, 1),
-- Cafe Latte Hot (4) -> 18g Kopi, 150ml Fresh Milk, Cup Hot
(4, 1, 18), (4, 3, 150), (4, 15, 1),
-- Iced Cafe Latte (5) -> 18g Kopi, 150ml Fresh Milk, Cup Cold, Sedotan
(5, 1, 18), (5, 3, 150), (5, 14, 1), (5, 16, 1),
-- Vanilla Latte Iced (6) -> 18g Kopi, 120ml Fresh Milk, 20ml Sirup Vanilla, Cup Cold, Sedotan
(6, 1, 18), (6, 3, 120), (6, 7, 20), (6, 14, 1), (6, 16, 1),
-- Caramel Macchiato (7) -> 18g Kopi, 120ml Fresh Milk, 20ml Sirup Caramel, Cup Cold, Sedotan
(7, 1, 18), (7, 3, 120), (7, 8, 20), (7, 14, 1), (7, 16, 1),
-- Es Kopi Susu Gula Aren (8) -> 18g Kopi, 100ml Fresh Milk, 30ml SKM, 20ml Gula Cair, Cup Cold, Sedotan
(8, 1, 18), (8, 3, 100), (8, 5, 30), (8, 6, 20), (8, 14, 1), (8, 16, 1),
-- Oat Milk Latte Iced (9) -> 18g Kopi, 150ml Oat Milk, Cup Cold, Sedotan
(9, 1, 18), (9, 4, 150), (9, 14, 1), (9, 16, 1),

-- V60 Arabica (10) -> 15g Single Origin, Cup Hot
(10, 2, 15), (10, 15, 1),
-- Japanese Iced Coffee (11) -> 15g Single Origin, Cup Cold, Sedotan
(11, 2, 15), (11, 14, 1), (11, 16, 1),

-- Matcha Latte Iced (12) -> 20g Matcha, 150ml Fresh Milk, Cup Cold, Sedotan
(12, 9, 20), (12, 3, 150), (12, 14, 1), (12, 16, 1),
-- Signature Choco Iced (13) -> 25g Choco, 150ml Fresh Milk, Cup Cold, Sedotan
(13, 10, 25), (13, 3, 150), (13, 14, 1), (13, 16, 1),
-- Red Velvet Iced (14) -> 25g Red Velvet, 150ml Fresh Milk, Cup Cold, Sedotan
(14, 11, 25), (14, 3, 150), (14, 14, 1), (14, 16, 1),
-- Lychee Tea (15) -> 5g Teh, 30ml Sirup Lychee, Cup Cold, Sedotan
(15, 12, 5), (15, 13, 30), (15, 14, 1), (15, 16, 1),
-- Lemon Tea (16) -> 5g Teh, 20ml Gula Cair, Cup Cold, Sedotan
(16, 12, 5), (16, 6, 20), (16, 14, 1), (16, 16, 1),

-- Butter Croissant (17) -> 1 Croissant
(17, 18, 1),
-- Pain au Chocolat (18) -> 1 Pain au Chocolat
(18, 19, 1),

-- Nasi Goreng Kitkop (19) -> 200g Nasi, 50g Ayam, 30ml Minyak, 20g Bumbu
(19, 22, 200), (19, 23, 50), (19, 24, 30), (19, 25, 20),
-- Chicken Katsu Don (20) -> 150g Nasi, 100g Ayam, 50ml Minyak
(20, 22, 150), (20, 23, 100), (20, 24, 50),

-- French Fries (21) -> 150g Kentang, 50ml Minyak
(21, 20, 150), (21, 24, 50),
-- Mix Platter (22) -> 100g Kentang, 2 Sosis, 50ml Minyak
(22, 20, 100), (22, 21, 2), (22, 24, 50);

