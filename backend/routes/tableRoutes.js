const express = require('express');
const router = express.Router();
const { getTables, getTableById, getTableByNumber, createTable, updateTable, deleteTable, bulkToggleTables } = require('../controllers/tableController');
const { verifyToken, authorizeRoles } = require('../middleware/auth');

// Public (for QR scan)
router.get('/by-number/:tableNumber', getTableByNumber);

// Staff routes
router.get('/', verifyToken, getTables);
router.get('/:id', verifyToken, getTableById);
router.post('/', verifyToken, authorizeRoles('owner', 'manajer'), createTable);
router.patch('/bulk-toggle', verifyToken, authorizeRoles('owner', 'manajer', 'kasir'), bulkToggleTables);
router.put('/:id', verifyToken, authorizeRoles('owner', 'manajer', 'kasir'), updateTable);
router.delete('/:id', verifyToken, authorizeRoles('owner', 'manajer'), deleteTable);

module.exports = router;
