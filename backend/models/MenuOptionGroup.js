const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

module.exports = sequelize.define('MenuOptionGroup', {
  menu_id: { type: DataTypes.INTEGER, primaryKey: true, references: { model: 'menus', key: 'id' }, onDelete: 'CASCADE' },
  option_group_id: { type: DataTypes.INTEGER, primaryKey: true, references: { model: 'option_groups', key: 'id' }, onDelete: 'RESTRICT' },
  sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
}, { tableName: 'menu_option_groups', timestamps: false });
