UPDATE orders o
SET kitchen_status = (
  SELECT CASE WHEN COUNT(*) > 0 THEN 'pending' ELSE 'none' END
  FROM order_items i
  WHERE i.order_id = o.id AND i.item_type IN ('makanan', 'snack')
),
barista_status = (
  SELECT CASE WHEN COUNT(*) > 0 THEN 'pending' ELSE 'none' END
  FROM order_items i
  WHERE i.order_id = o.id AND i.item_type = 'minuman'
)
WHERE status IN ('pending', 'confirmed');

-- Ensure preparing/ready matches
UPDATE orders SET kitchen_status = 'preparing' WHERE status = 'preparing' AND kitchen_status != 'none';
UPDATE orders SET barista_status = 'preparing' WHERE status = 'preparing' AND barista_status != 'none';
UPDATE orders SET kitchen_status = 'ready' WHERE status = 'ready' AND kitchen_status != 'none';
UPDATE orders SET barista_status = 'ready' WHERE status = 'ready' AND barista_status != 'none';
