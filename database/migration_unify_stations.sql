-- Drop kitchen_status and barista_status from orders
ALTER TABLE orders DROP COLUMN kitchen_status;
ALTER TABLE orders DROP COLUMN barista_status;

-- Update users to change barista role to kitchen
UPDATE users SET role = 'kitchen' WHERE role = 'barista';

-- Alter users table role ENUM
ALTER TABLE users MODIFY COLUMN role ENUM('kasir', 'kitchen', 'manajer', 'owner') NOT NULL;
