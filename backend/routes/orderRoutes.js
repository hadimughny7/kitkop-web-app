const express = require('express');
const router = express.Router();
const { createOrder, getOrders, getOrderById, trackOrder, updateOrderStatus, rejectOrderItem, updateItemStatus, processAllItems, completeAllItems } = require('../controllers/orderController');
const { verifyToken, authorizeRoles, optionalAuth } = require('../middleware/auth');

// Public (customer) — optionalAuth attaches req.user if token present (kasir)
router.post('/', optionalAuth, createOrder);
router.get('/track/:orderNumber', trackOrder);

// Staff routes
router.get('/', verifyToken, getOrders);
router.get('/:id', verifyToken, getOrderById);
router.patch('/:id/status', verifyToken, authorizeRoles('owner', 'manajer', 'kasir'), updateOrderStatus);

// Per-item status updates (bulk routes BEFORE parameterized to avoid conflict)
router.patch('/:orderId/items/process-all', verifyToken, authorizeRoles('owner', 'manajer', 'kitchen', 'barista'), processAllItems);
router.patch('/:orderId/items/complete-all', verifyToken, authorizeRoles('owner', 'manajer', 'kitchen', 'barista'), completeAllItems);
router.patch('/:orderId/items/:itemId/status', verifyToken, authorizeRoles('owner', 'manajer', 'kitchen', 'barista'), updateItemStatus);
router.patch('/:orderId/items/:itemId/reject', verifyToken, authorizeRoles('owner', 'manajer', 'kitchen'), rejectOrderItem);

module.exports = router;

