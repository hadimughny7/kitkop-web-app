-- ============================================
-- Cafe Kitkop - Database Schema
-- Sistem Informasi Pemesanan Menu Terintegrasi POS
-- ============================================

CREATE DATABASE IF NOT EXISTS kitkop_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE kitkop_db;

-- ============================================
-- 1. USERS (Staff accounts)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('kasir', 'barista', 'kitchen', 'manajer', 'owner') NOT NULL,
  is_active TINYINT(1) DEFAULT 1,
  created_by INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ============================================
-- 2. CUSTOMERS (Identitas pemesan, tanpa akun)
-- ============================================
CREATE TABLE IF NOT EXISTS customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(100) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================
-- 3. TABLES (Meja cafe)
-- ============================================
CREATE TABLE IF NOT EXISTS tables_ (
  id INT AUTO_INCREMENT PRIMARY KEY,
  table_number VARCHAR(10) NOT NULL UNIQUE,
  qr_code_url VARCHAR(255) DEFAULT NULL,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================
-- 4. MENU CATEGORIES
-- ============================================
CREATE TABLE IF NOT EXISTS menu_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  description VARCHAR(255) DEFAULT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================
-- 5. MENUS
-- ============================================
CREATE TABLE IF NOT EXISTS menus (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT DEFAULT NULL,
  price DECIMAL(12, 2) NOT NULL,
  image VARCHAR(255) DEFAULT NULL,
  is_available TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES menu_categories(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ============================================
-- 6. RAW MATERIALS (Bahan baku)
-- ============================================
CREATE TABLE IF NOT EXISTS raw_materials (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  category VARCHAR(50) DEFAULT NULL,
  stock DECIMAL(12, 2) NOT NULL DEFAULT 0,
  unit VARCHAR(20) NOT NULL,
  min_stock DECIMAL(12, 2) NOT NULL DEFAULT 0,
  status ENUM('aman', 'menipis', 'kritis') DEFAULT 'aman',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================
-- 7. MENU RECIPES (Relasi menu <-> bahan baku)
-- ============================================
CREATE TABLE IF NOT EXISTS menu_recipes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  menu_id INT NOT NULL,
  raw_material_id INT NOT NULL,
  quantity_used DECIMAL(10, 2) NOT NULL,
  FOREIGN KEY (menu_id) REFERENCES menus(id) ON DELETE CASCADE,
  FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id) ON DELETE RESTRICT,
  UNIQUE KEY unique_menu_material (menu_id, raw_material_id)
) ENGINE=InnoDB;

-- ============================================
-- 8. ORDERS
-- ============================================
CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  table_id INT DEFAULT NULL,
  customer_id INT DEFAULT NULL,
  order_number VARCHAR(20) NOT NULL UNIQUE,
  status ENUM('pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled') DEFAULT 'pending',
  kitchen_status ENUM('none', 'pending', 'preparing', 'ready') DEFAULT 'none',
  barista_status ENUM('none', 'pending', 'preparing', 'ready') DEFAULT 'none',
  subtotal DECIMAL(12, 2) NOT NULL DEFAULT 0,
  tax DECIMAL(12, 2) NOT NULL DEFAULT 0,
  total DECIMAL(12, 2) NOT NULL DEFAULT 0,
  order_type ENUM('qr', 'kasir') NOT NULL DEFAULT 'qr',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (table_id) REFERENCES tables_(id) ON DELETE SET NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  INDEX idx_orders_created_at (created_at),
  INDEX idx_orders_status (status),
  INDEX idx_orders_order_type (order_type)
) ENGINE=InnoDB;

-- ============================================
-- 9. ORDER ITEMS
-- ============================================
CREATE TABLE IF NOT EXISTS order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  menu_id INT NOT NULL,
  qty INT NOT NULL DEFAULT 1,
  price DECIMAL(12, 2) NOT NULL,
  notes TEXT DEFAULT NULL,
  item_type ENUM('makanan', 'minuman', 'snack') DEFAULT 'makanan',
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (menu_id) REFERENCES menus(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ============================================
-- 10. ORDER STATUS LOGS
-- ============================================
CREATE TABLE IF NOT EXISTS order_status_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  status ENUM('pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled') NOT NULL,
  changed_by INT DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_status_logs_changed_at (changed_at)
) ENGINE=InnoDB;

-- ============================================
-- 11. TRANSACTIONS (Pembayaran)
-- ============================================
CREATE TABLE IF NOT EXISTS transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  ref_id VARCHAR(50) NOT NULL UNIQUE,
  trx_id VARCHAR(100) DEFAULT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  payment_method VARCHAR(20) DEFAULT 'QRIS',
  status ENUM('pending', 'paid', 'expired', 'failed') DEFAULT 'pending',
  qris_content TEXT DEFAULT NULL,
  paid_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  INDEX idx_transactions_status (status),
  INDEX idx_transactions_created_at (created_at)
) ENGINE=InnoDB;

-- ============================================
-- 12. STOCK LOGS (Riwayat perubahan stok)
-- ============================================
CREATE TABLE IF NOT EXISTS stock_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  raw_material_id INT NOT NULL,
  change_qty DECIMAL(12, 2) NOT NULL,
  type ENUM('auto_deduction', 'restock', 'manual_adjustment') NOT NULL,
  reference_order_id INT DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  created_by INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id) ON DELETE CASCADE,
  FOREIGN KEY (reference_order_id) REFERENCES orders(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_stock_logs_created_at (created_at)
) ENGINE=InnoDB;

-- ============================================
-- SEED DATA
-- ============================================

-- Default owner account (password: owner123)
-- Hash generated with bcryptjs, 10 rounds
INSERT INTO users (name, email, username, password_hash, role) VALUES
('Owner Kitkop', 'owner@kitkop.com', 'owner', '$2a$10$8KzQKx8q8qF5V7Iy5XJ5/.ykYRqUz1FKmGx0GIxh0z5qXJ8DXHC6S', 'owner'),
('Manajer Kitkop', 'manajer@kitkop.com', 'manajer', '$2a$10$bkqHe3r571kYKEj2s/ShW.ExLavO6wtb3TMpGnywhtpypc4VWlWPu', 'manajer'),
('Kasir Kitkop', 'kasir@kitkop.com', 'kasir', '$2a$10$bkqHe3r571kYKEj2s/ShW.ExLavO6wtb3TMpGnywhtpypc4VWlWPu', 'kasir'),
('Kitchen Kitkop', 'kitchen@kitkop.com', 'kitchen', '$2a$10$bkqHe3r571kYKEj2s/ShW.ExLavO6wtb3TMpGnywhtpypc4VWlWPu', 'kitchen'),
('Barista Kitkop', 'barista@kitkop.com', 'barista', '$2a$10$bkqHe3r571kYKEj2s/ShW.ExLavO6wtb3TMpGnywhtpypc4VWlWPu', 'barista');

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
