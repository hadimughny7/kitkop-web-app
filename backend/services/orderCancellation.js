const { Order, OrderItem, OrderStatusLog, Transaction } = require('../models');
const { sequelize } = require('../config/database');
const { refundStockForOrderItem } = require('../controllers/stockController');

// Call with the order row already locked, before changing its status.
const refundUnprocessedStock = async (order, transaction) => {
  const payment = await Transaction.findOne({ where: { order_id: order.id, status: 'paid' }, transaction });
  if (!payment) return 0;
  const items = await OrderItem.findAll({
    where: { order_id: order.id, status: 'pending' },
    order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE,
  });
  let refunded = 0;
  for (const item of items) {
    if (await refundStockForOrderItem(order.id, item, transaction)) refunded++;
  }
  return refunded;
};

// Recheck the current row: a timer's earlier list may now contain a paid order.
const expirePendingOrder = (orderId, expiredBefore) => sequelize.transaction(async transaction => {
  const order = await Order.findByPk(orderId, { transaction, lock: transaction.LOCK.UPDATE });
  if (!order || order.status !== 'pending' || order.created_at >= expiredBefore) return null;
  const payment = await Transaction.findOne({ where: { order_id: order.id }, transaction });
  if (payment?.status === 'paid') return null;
  await order.update({ status: 'cancelled' }, { transaction });
  await OrderStatusLog.create({
    order_id: order.id, status: 'cancelled',
    notes: 'Pesanan dibatalkan otomatis: batas waktu pembayaran 10 menit telah habis.',
  }, { transaction });
  await Transaction.update({ status: 'expired' }, { where: { order_id: order.id, status: 'pending' }, transaction });
  return order;
});

module.exports = { refundUnprocessedStock, expirePendingOrder };
