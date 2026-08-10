-- Migration: Add cashier_id to orders table
-- Tracks which kasir (cashier) created each order from POS

ALTER TABLE orders
ADD COLUMN cashier_id INT NULL AFTER order_type,
ADD CONSTRAINT fk_orders_cashier
  FOREIGN KEY (cashier_id) REFERENCES users(id)
  ON DELETE SET NULL
  ON UPDATE CASCADE;
