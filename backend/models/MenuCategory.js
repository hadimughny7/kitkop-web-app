const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { ITEM_TYPES } = require('../services/categoryTypes');

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
  item_type: {
    type: DataTypes.ENUM(...ITEM_TYPES),
    allowNull: true, // Legacy categories may need an explicit choice by a manager.
    validate: { isIn: [ITEM_TYPES] },
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
