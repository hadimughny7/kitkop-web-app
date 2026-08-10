const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Table = sequelize.define('Table', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  table_number: {
    type: DataTypes.STRING(10),
    allowNull: false,
    unique: true,
  },
  qr_code_url: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  capacity: {
    type: DataTypes.INTEGER,
    defaultValue: 4,
  },
  is_active: {
    type: DataTypes.TINYINT,
    defaultValue: 1,
  },
}, {
  tableName: 'tables_',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
});

module.exports = Table;
