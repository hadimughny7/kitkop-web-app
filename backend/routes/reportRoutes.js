const express = require('express');
const router = express.Router();
const { getOrderReport, getStockReport, exportOrderReport, exportStockReport, getDashboardSummary, getReportDashboard, exportReportDashboard } = require('../controllers/reportController');
const { verifyToken, authorizeRoles } = require('../middleware/auth');

router.use(verifyToken);
router.use(authorizeRoles('owner', 'manajer'));

router.get('/dashboard', getDashboardSummary);
router.get('/orders', getOrderReport);
router.get('/stocks', getStockReport);
router.get('/orders/export', exportOrderReport);
router.get('/stocks/export', exportStockReport);
router.get('/report-dashboard', getReportDashboard);
router.get('/report-dashboard/export', exportReportDashboard);

module.exports = router;
