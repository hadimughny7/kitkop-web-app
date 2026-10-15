const express = require('express');
const router = express.Router();
const { createQrisPayment, paymentCallback, getPaymentStatus, simulatePayment, payCash } = require('../controllers/paymentController');
const { verifyToken, authorizeRoles } = require('../middleware/auth');

// Public (customer payment)
router.post('/create-qris', createQrisPayment);
router.post('/callback', paymentCallback);
router.get('/:orderId/status', getPaymentStatus);

// Dev only - simulate payment
router.post('/:orderId/simulate-pay', simulatePayment);

// Kasir manual payment
router.post('/:orderId/cash', verifyToken, authorizeRoles('kasir', 'manajer', 'owner'), payCash);

module.exports = router;
