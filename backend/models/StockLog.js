const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const StockLog = sequelize.define('StockLog', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  raw_material_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'raw_materials', key: 'id' },
  },
  change_qty: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
  },
  type: {
    type: DataTypes.ENUM('auto_deduction', 'restock', 'manual_adjustment', 'refund', 'manual_reduction'),
    allowNull: false,
  },
  reference_order_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'orders', key: 'id' },
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
  },
}, {
  tableName: 'stock_logs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    { fields: ['created_at'] },
  ],
});

module.exports = StockLog;
