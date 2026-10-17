const bcrypt = require('bcryptjs');
const { User } = require('../models');
const { Op } = require('sequelize');
const { userRoom } = require('../socket/realtimeEvents');
const { STAFF_ROLES } = require('../constants/roles');
const { sequelize } = require('../config/database');
const { revokeStaffSockets } = require('../services/staffSessions');
const { assertCanCreate, assertCanUpdate, assertCanDelete, withManagedUsers } = require('../services/userManagementPolicy');

/**
 * GET /api/users
 * List all staff users (manajer/owner only)
 */
const getUsers = async (req, res, next) => {
  try {
    const { search, role } = req.query;

    const where = {};
    if (role) where.role = role;
    if (search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
        { username: { [Op.like]: `%${search}%` } },
      ];
    }

    const users = await User.findAll({
      where,
      attributes: { exclude: ['password_hash', 'session_version'] },
      include: [
        { model: User, as: 'creator', attributes: ['id', 'name'] },
      ],
      order: [['created_at', 'DESC']],
    });

    res.json({
      success: true,
      data: users,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/users/:id
 * Get single user
 */
const getUserById = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.params.id, {
      attributes: { exclude: ['password_hash', 'session_version'] },
      include: [
        { model: User, as: 'creator', attributes: ['id', 'name'] },
      ],
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User tidak ditemukan.',
      });
    }

    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/users
 * Create new staff account (manajer/owner only)
 */
const createUser = async (req, res, next) => {
  try {
    const { name, email, username, password, role } = req.body;

    if (!name || !email || !username || !password || !role) {
      return res.status(400).json({
        success: false,
        message: 'Semua field wajib diisi (name, email, username, password, role).',
      });
    }

    const validRoles = STAFF_ROLES;
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Role tidak valid. Pilih: ${validRoles.join(', ')}`,
      });
    }

    const user = await withManagedUsers(req, undefined, async ({ actor, transaction }) => {
      assertCanCreate(actor, role);
      const existing = await User.findOne({
        where: { [Op.or]: [{ email }, { username }] }, transaction,
      });
      if (existing) throw Object.assign(new Error('Email atau username sudah digunakan.'), { statusCode: 409 });
      const password_hash = await bcrypt.hash(password, 10);
      return User.create({ name, email, username, password_hash, role, created_by: actor.id }, { transaction });
    });

    res.status(201).json({
      success: true,
      message: 'Akun staff berhasil dibuat.',
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        username: user.username,
        role: user.role,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/users/:id
 * Update staff account
 */
const updateUser = async (req, res, next) => {
  try {
    const { name, email, username, password, role, is_active } = req.body;

    if (role !== undefined && !STAFF_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Role tidak valid. Pilih: ${STAFF_ROLES.join(', ')}`,
      });
    }

    const { user, accessChanged } = await withManagedUsers(req, Number(req.params.id), async ({ actor, target: user, transaction }) => {
      assertCanUpdate(actor, user, { role, is_active });
      if (email && email !== user.email) {
        const existing = await User.findOne({ where: { email }, transaction });
        if (existing) throw Object.assign(new Error('Email sudah digunakan.'), { statusCode: 409 });
      }
      if (username && username !== user.username) {
        const existing = await User.findOne({ where: { username }, transaction });
        if (existing) throw Object.assign(new Error('Username sudah digunakan.'), { statusCode: 409 });
      }
      if (name) user.name = name;
      if (email) user.email = email;
      if (username) user.username = username;
      if (role) user.role = role;
      if (is_active !== undefined) user.is_active = is_active;
      if (password) {
        user.password_hash = await bcrypt.hash(password, 10);
        user.session_version = sequelize.literal('session_version + 1');
      }
      const accessChanged = user.changed('role') || user.changed('is_active');
      await user.save({ transaction });
      return { user, accessChanged };
    });
    if (password) {
      const current = await User.findByPk(user.id, { attributes: ['session_version'] });
      await revokeStaffSockets(req.app.get('io'), user.id, current.session_version);
    }
    if (accessChanged) {
      req.app.get('io')?.in(userRoom(user.id)).disconnectSockets(true);
    }

    res.json({
      success: true,
      message: 'Akun staff berhasil diperbarui.',
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        username: user.username,
        role: user.role,
        is_active: user.is_active,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/users/:id
 * Delete staff account
 */
const deleteUser = async (req, res, next) => {
  try {
    const user = await withManagedUsers(req, Number(req.params.id), async ({ actor, target, transaction }) => {
      if (target.id === actor.id) {
        throw Object.assign(new Error('Tidak dapat menghapus akun sendiri.'), { statusCode: 400 });
      }
      assertCanDelete(actor, target);
      await target.destroy({ transaction });
      return target;
    });
    req.app.get('io')?.in(userRoom(user.id)).disconnectSockets(true);

    res.json({
      success: true,
      message: 'Akun staff berhasil dihapus.',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getUsers, getUserById, createUser, updateUser, deleteUser };
