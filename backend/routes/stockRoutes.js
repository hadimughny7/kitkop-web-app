const express = require('express');
const router = express.Router();
const { getStocks, createStock, updateStock, deleteStock, restockMaterial, reduceMaterial, getStockLogs, getStockLogsByDate } = require('../controllers/stockController');
const { verifyToken, authorizeRoles } = require('../middleware/auth');

router.use(verifyToken);

router.get('/', getStocks);
router.get('/logs', getStockLogs);
router.get('/logs/by-date', getStockLogsByDate);
router.post('/', authorizeRoles('owner', 'manajer'), createStock);
router.put('/:id', authorizeRoles('owner', 'manajer'), updateStock);
router.delete('/:id', authorizeRoles('owner', 'manajer'), deleteStock);
router.post('/:id/restock', authorizeRoles('owner', 'manajer', 'kitchen', 'barista'), restockMaterial);
router.post('/:id/reduce', authorizeRoles('owner', 'manajer', 'kitchen', 'barista'), reduceMaterial);

module.exports = router;
