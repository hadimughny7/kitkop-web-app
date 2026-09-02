const express = require('express');
const router = express.Router();
const { getSettings, updateSettings } = require('../controllers/settingController');
const { verifyToken, authorizeRoles } = require('../middleware/auth');

// GET /api/settings — public (needed by customer cart)
router.get('/', getSettings);

// PUT /api/settings — owner/manajer only
router.put('/', verifyToken, authorizeRoles('owner', 'manajer'), updateSettings);

module.exports = router;
