const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

// Choice IDs remain stable when a group is edited. Order items keep their own snapshot.
module.exports = sequelize.define('OptionGroup', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(100), allowNull: false },
  min_choices: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  max_choices: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  choices: { type: DataTypes.JSON, allowNull: false },
}, { tableName: 'option_groups', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });
