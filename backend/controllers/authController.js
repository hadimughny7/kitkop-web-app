const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../models');

/**
 * POST /api/auth/login
 * Login staff (email/username + password)
 */
const login = async (req, res, next) => {
  try {
    const { login, password } = req.body || {};

    if (typeof login !== 'string' || !login.trim() || login.length > 100 ||
        typeof password !== 'string' || !password || password.length > 1024) {
      return res.status(400).json({
        success: false,
        message: 'Email/username dan password wajib diisi.',
      });
    }

    const user = req.loginUser !== undefined ? req.loginUser : await User.findOne({
      where: {
        [require('sequelize').Op.or]: [
          { email: login },
          { username: login },
        ],
      },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Email/username atau password salah.',
      });
    }

    if (!user.is_active) {
      return res.status(401).json({
        success: false,
        message: 'Akun telah dinonaktifkan. Hubungi manajer.',
      });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Email/username atau password salah.',
      });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role, sessionVersion: user.session_version },
      process.env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '24h' }
    );

    res.json({
      success: true,
      message: 'Login berhasil.',
      data: {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          username: user.username,
          role: user.role,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/auth/me
 * Get current logged-in user info
 */
const getMe = async (req, res, next) => {
  try {
    res.json({
      success: true,
      data: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        username: req.user.username,
        role: req.user.role,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { login, getMe };
