const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

module.exports = sequelize.define('OrderCounter', {
  date_key: { type: DataTypes.STRING(8), primaryKey: true, allowNull: false },
  last_sequence: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
}, { tableName: 'order_counters', timestamps: false, engine: 'InnoDB' });
