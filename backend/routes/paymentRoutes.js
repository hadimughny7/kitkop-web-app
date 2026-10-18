const express = require('express');
const router = express.Router();
const { createQrisPayment, paymentCallback, getPaymentStatus, simulatePayment, payCash } = require('../controllers/paymentController');
const { verifyToken, authorizeRoles } = require('../middleware/auth');
const { requirePaymentAccess } = require('../middleware/paymentAccess');

// Guest order capability or an authenticated payment-authorized staff member.
router.post('/create-qris', requirePaymentAccess, createQrisPayment);
router.post('/callback', paymentCallback);
router.get('/:orderId/status', requirePaymentAccess, getPaymentStatus);

// Dev only - simulate payment
router.post('/:orderId/simulate-pay', simulatePayment);

// Kasir manual payment
router.post('/:orderId/cash', verifyToken, authorizeRoles('kasir', 'manajer', 'owner'), payCash);

module.exports = router;
