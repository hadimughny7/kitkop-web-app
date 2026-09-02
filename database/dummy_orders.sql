INSERT INTO customers (name, phone, email) VALUES
('Budi Santoso', '08123456789', 'budi@example.com'),
('Siti Aminah', '08987654321', 'siti@example.com');

INSERT INTO orders (customer_id, user_id, table_id, order_type, status, payment_status, payment_method, subtotal, discount, tax, total, amount_paid, change_amount) VALUES
(1, 1, 1, 'dine_in', 'completed', 'paid', 'cash', 50000, 0, 5000, 55000, 60000, 5000),
(2, 1, 2, 'takeaway', 'preparing', 'paid', 'qris', 45000, 0, 4500, 49500, 49500, 0);

INSERT INTO order_items (order_id, menu_id, quantity, price, subtotal, status) VALUES
(1, 1, 2, 15000, 30000, 'served'),
(1, 4, 1, 20000, 20000, 'served'),
(2, 2, 1, 25000, 25000, 'preparing'),
(2, 5, 1, 20000, 20000, 'preparing');

INSERT INTO transactions (order_id, user_id, type, amount, payment_method, status) VALUES
(1, 1, 'income', 55000, 'cash', 'success'),
(2, 1, 'income', 49500, 'qris', 'success');
