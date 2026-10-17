const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { STAFF_ROLES } = require('../constants/roles');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    validate: { isEmail: true },
  },
  username: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
  },
  password_hash: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  session_version: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    defaultValue: 0,
  },
  role: {
    type: DataTypes.ENUM(...STAFF_ROLES),
    allowNull: false,
    validate: { isIn: [STAFF_ROLES] },
  },
  is_active: {
    type: DataTypes.TINYINT,
    defaultValue: 1,
  },
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
  },
}, {
  tableName: 'users',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = User;
