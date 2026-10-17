const express = require('express');
const router = express.Router();
const { login, getMe } = require('../controllers/authController');
const { verifyToken } = require('../middleware/auth');
const { createLoginRateLimiters } = require('../middleware/loginRateLimit');

router.post('/login', ...createLoginRateLimiters(), login);
router.get('/me', verifyToken, getMe);

module.exports = router;
