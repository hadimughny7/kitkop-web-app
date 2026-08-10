const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const MenuCategory = sequelize.define('MenuCategory', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
  },
  description: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  sort_order: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
}, {
  tableName: 'menu_categories',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
});

module.exports = MenuCategory;
