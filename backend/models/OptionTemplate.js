const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// Independent copies: removing a shortcut never changes menu-option associations.
module.exports = sequelize.define('OptionTemplate', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  fingerprint: { type: DataTypes.STRING(64), allowNull: false, unique: true },
  name: { type: DataTypes.STRING(100), allowNull: false },
  min_choices: { type: DataTypes.INTEGER, allowNull: false },
  max_choices: { type: DataTypes.INTEGER, allowNull: false },
  is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  choices: { type: DataTypes.JSON, allowNull: false },
  is_deleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
}, { tableName: 'option_templates', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });
