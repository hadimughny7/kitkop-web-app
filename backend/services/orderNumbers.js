const { QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { OrderCounter } = require('../models');
const { fail } = require('./menuOptions');

// Keep the existing UTC date and ORD-YYYYMMDD-XXXX format.
const allocateOrderNumber = async (transaction, { resync = false, now = new Date() } = {}) => {
  const dateKey = now.toISOString().slice(0, 10).replace(/-/g, '');
  // The primary key serializes even the first requests of a new day across servers.
  await sequelize.query(
    'INSERT INTO order_counters (date_key, last_sequence) VALUES (:dateKey, 0) ON DUPLICATE KEY UPDATE date_key = :dateKey',
    { replacements: { dateKey }, transaction },
  );
  const counter = await OrderCounter.findByPk(dateKey, { transaction, lock: transaction.LOCK.UPDATE });
  let sequence = Number(counter.last_sequence);
  if (sequence === 0 || resync) {
    // Bootstrap existing databases; numeric MAX also works past order 9999.
    const [row] = await sequelize.query(
      'SELECT COALESCE(MAX(CAST(SUBSTRING(order_number, 14) AS UNSIGNED)), 0) AS last_sequence FROM orders WHERE order_number REGEXP :pattern',
      { replacements: { pattern: `^ORD-${dateKey}-[0-9]{1,7}$` }, transaction, type: QueryTypes.SELECT },
    );
    sequence = Math.max(sequence, Number(row.last_sequence));
  }
  if (sequence >= 9999999) fail('Nomor pesanan hari ini telah mencapai batas. Hubungi pengelola.', 503);
  counter.last_sequence = sequence + 1;
  await counter.save({ transaction });
  return `ORD-${dateKey}-${String(counter.last_sequence).padStart(4, '0')}`;
};

const isOrderNumberConflict = error => error.name === 'SequelizeUniqueConstraintError'
  && (Object.hasOwn(error.fields || {}, 'order_number') || error.errors?.some(detail => detail.path === 'order_number'));

const isRetryableOrderError = error => isOrderNumberConflict(error)
  || ['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.original?.code);

module.exports = { allocateOrderNumber, isRetryableOrderError };
