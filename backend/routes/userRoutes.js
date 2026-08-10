const express = require('express');
const router = express.Router();
const { getUsers, getUserById, createUser, updateUser, deleteUser } = require('../controllers/userController');
const { verifyToken, authorizeRoles } = require('../middleware/auth');

// All routes require authentication + owner/manajer role
router.use(verifyToken);
router.use(authorizeRoles('owner', 'manajer'));

router.get('/', getUsers);
router.get('/:id', getUserById);
router.post('/', createUser);
router.put('/:id', updateUser);
router.delete('/:id', deleteUser);

module.exports = router;
