UPDATE order_items SET item_type = 'minuman' WHERE menu_id IN (SELECT id FROM menus WHERE category_id IN (1, 2, 3));
