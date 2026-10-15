const { Order, Transaction } = require('../models');
const { fail } = require('./menuOptions');

const assertOrderPaid = async (order, transaction) => {
  const payment = await Transaction.findOne({ where: { order_id: order.id }, transaction });
  if (payment?.status !== 'paid') fail('Pesanan belum lunas dan belum dapat diproses.', 409);
};

const getProductionOrder = async (orderId, transaction, allowedStatuses) => {
  // Serialize production actions with other updates on the same order.
  const order = await Order.findByPk(orderId, { transaction, lock: transaction.LOCK.UPDATE });
  if (!order) fail('Pesanan tidak ditemukan.', 404);
  await assertOrderPaid(order, transaction);
  if (!allowedStatuses.includes(order.status)) fail(`Pesanan berstatus "${order.status}" tidak dapat diproses dengan tindakan ini.`, 409);
  return order;
};

module.exports = { assertOrderPaid, getProductionOrder };
