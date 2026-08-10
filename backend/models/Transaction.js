const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Transaction = sequelize.define('Transaction', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  order_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'orders', key: 'id' },
  },
  ref_id: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
  },
  trx_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
  },
  payment_method: {
    type: DataTypes.STRING(20),
    defaultValue: 'QRIS',
  },
  status: {
    type: DataTypes.ENUM('pending', 'paid', 'expired', 'failed'),
    defaultValue: 'pending',
  },
  qris_content: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  paid_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'transactions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    { fields: ['status'] },
    { fields: ['created_at'] },
  ],
});

module.exports = Transaction;
