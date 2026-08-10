const express = require('express');
const router = express.Router();
const { getMenus, getMenuById, createMenu, updateMenu, deleteMenu, toggleAvailability } = require('../controllers/menuController');
const { verifyToken, authorizeRoles } = require('../middleware/auth');
const upload = require('../middleware/upload');

// Public routes (customer & staff)
router.get('/', getMenus);
router.get('/:id', getMenuById);

// Staff-only routes
router.post('/', verifyToken, authorizeRoles('owner', 'manajer'), upload.single('image'), createMenu);
router.put('/:id', verifyToken, authorizeRoles('owner', 'manajer'), upload.single('image'), updateMenu);
router.delete('/:id', verifyToken, authorizeRoles('owner', 'manajer'), deleteMenu);
router.patch('/:id/availability', verifyToken, authorizeRoles('owner', 'manajer', 'kasir'), toggleAvailability);

module.exports = router;
