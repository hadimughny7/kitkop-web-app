const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

module.exports = sequelize.define('QrisAttempt', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  transaction_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'transactions', key: 'id' } },
  ref_id: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  source: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'gateway' },
  trx_id: { type: DataTypes.STRING(100), allowNull: true },
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  status: { type: DataTypes.ENUM('creating', 'pending', 'unknown', 'failed', 'expired', 'paid'), allowNull: false },
  qr_url: { type: DataTypes.TEXT, allowNull: true },
  qr_string: { type: DataTypes.TEXT, allowNull: true },
  pay_url: { type: DataTypes.TEXT, allowNull: true },
  expires_at: { type: DataTypes.DATE, allowNull: false },
}, { tableName: 'qris_attempts', engine: 'InnoDB', createdAt: 'created_at', updatedAt: 'updated_at', indexes: [{ fields: ['transaction_id'] }] });
