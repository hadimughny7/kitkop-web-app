const bcrypt = require('bcryptjs');
const { User } = require('../models');
const { Op } = require('sequelize');

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
      attributes: { exclude: ['password_hash'] },
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
      attributes: { exclude: ['password_hash'] },
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

    const validRoles = ['kasir', 'barista', 'kitchen', 'manajer', 'owner'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Role tidak valid. Pilih: ${validRoles.join(', ')}`,
      });
    }

    // Check duplicates
    const existing = await User.findOne({
      where: {
        [Op.or]: [{ email }, { username }],
      },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Email atau username sudah digunakan.',
      });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      username,
      password_hash,
      role,
      created_by: req.user.id,
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
    const user = await User.findByPk(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User tidak ditemukan.',
      });
    }

    const { name, email, username, password, role, is_active } = req.body;

    // Check email/username uniqueness if changed
    if (email && email !== user.email) {
      const existing = await User.findOne({ where: { email } });
      if (existing) {
        return res.status(409).json({
          success: false,
          message: 'Email sudah digunakan.',
        });
      }
    }

    if (username && username !== user.username) {
      const existing = await User.findOne({ where: { username } });
      if (existing) {
        return res.status(409).json({
          success: false,
          message: 'Username sudah digunakan.',
        });
      }
    }

    // Update fields
    if (name) user.name = name;
    if (email) user.email = email;
    if (username) user.username = username;
    if (role) user.role = role;
    if (is_active !== undefined) user.is_active = is_active;
    if (password) {
      user.password_hash = await bcrypt.hash(password, 10);
    }

    await user.save();

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
    const user = await User.findByPk(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User tidak ditemukan.',
      });
    }

    // Prevent deleting own account
    if (user.id === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'Tidak dapat menghapus akun sendiri.',
      });
    }

    await user.destroy();

    res.json({
      success: true,
      message: 'Akun staff berhasil dihapus.',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getUsers, getUserById, createUser, updateUser, deleteUser };
