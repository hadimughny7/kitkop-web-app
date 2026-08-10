const express = require('express');
const router = express.Router();
const { getCategories, createCategory, updateCategory, deleteCategory } = require('../controllers/categoryController');
const { verifyToken, authorizeRoles } = require('../middleware/auth');

// Public
router.get('/', getCategories);

// Staff-only
router.post('/', verifyToken, authorizeRoles('owner', 'manajer'), createCategory);
router.put('/:id', verifyToken, authorizeRoles('owner', 'manajer'), updateCategory);
router.delete('/:id', verifyToken, authorizeRoles('owner', 'manajer'), deleteCategory);

module.exports = router;
