ALTER TABLE order_items ADD COLUMN status ENUM('active', 'rejected') DEFAULT 'active' AFTER item_type;
