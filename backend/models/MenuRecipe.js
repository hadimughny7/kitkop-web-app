const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { recipeQuantity } = require('../services/recipeQuantities');

const MenuRecipe = sequelize.define('MenuRecipe', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  menu_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'menus', key: 'id' },
  },
  raw_material_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'raw_materials', key: 'id' },
  },
  quantity_used: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    validate: {
      positiveQuantity(value) { recipeQuantity(value); },
    },
  },
}, {
  tableName: 'menu_recipes',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['menu_id', 'raw_material_id'],
    },
  ],
});

module.exports = MenuRecipe;
