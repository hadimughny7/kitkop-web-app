ALTER TABLE orders ADD COLUMN kitchen_status ENUM('none', 'pending', 'preparing', 'ready') DEFAULT 'none' AFTER status;
ALTER TABLE orders ADD COLUMN barista_status ENUM('none', 'pending', 'preparing', 'ready') DEFAULT 'none' AFTER kitchen_status;
