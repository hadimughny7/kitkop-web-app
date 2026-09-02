const { Order, OrderItem, Menu, Transaction, RawMaterial, StockLog, User } = require('../models');
const { Op, fn, col, literal } = require('sequelize');
const { sequelize } = require('../config/database');
const ExcelJS = require('exceljs');

/**
 * Helper: get current date/time in WIB (UTC+7)
 */
const getWIBNow = () => {
  const now = new Date();
  return new Date(now.getTime() + (7 * 60 * 60 * 1000));
};

/**
 * Helper: get WIB date string (YYYY-MM-DD)
 */
const getWIBDateStr = (d) => {
  const wib = new Date(d.getTime() + (7 * 60 * 60 * 1000));
  return wib.toISOString().slice(0, 10);
};

/**
 * Helper: get date range from period (WIB-aware)
 */
const getDateRange = (period, start_date, end_date) => {
  const WIB = '+07:00';
  let startDate, endDate;

  if (start_date && end_date) {
    startDate = new Date(`${start_date}T00:00:00${WIB}`);
    endDate = new Date(`${end_date}T23:59:59.999${WIB}`);
  } else {
    // Get today's date in WIB
    const wibNow = getWIBNow();
    const todayStr = wibNow.toISOString().slice(0, 10);
    const year = wibNow.getUTCFullYear();
    const month = String(wibNow.getUTCMonth() + 1).padStart(2, '0');

    endDate = new Date(`${todayStr}T23:59:59.999${WIB}`);

    switch (period) {
      case 'daily':
        startDate = new Date(`${todayStr}T00:00:00${WIB}`);
        break;
      case 'weekly': {
        const weekAgo = new Date(wibNow);
        weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);
        const weekAgoStr = weekAgo.toISOString().slice(0, 10);
        startDate = new Date(`${weekAgoStr}T00:00:00${WIB}`);
        break;
      }
      case 'monthly':
        startDate = new Date(`${year}-${month}-01T00:00:00${WIB}`);
        break;
      case 'yearly':
        startDate = new Date(`${year}-01-01T00:00:00${WIB}`);
        break;
      default:
        startDate = new Date(`${year}-${month}-01T00:00:00${WIB}`);
    }
  }

  return { startDate, endDate };
};

/**
 * GET /api/reports/orders
 */
const getOrderReport = async (req, res, next) => {
  try {
    const { period = 'monthly', start_date, end_date } = req.query;
    const { startDate, endDate } = getDateRange(period, start_date, end_date);

    const where = {
      created_at: { [Op.between]: [startDate, endDate] },
    };

    // Total orders & revenue
    const totalOrders = await Order.count({ where });
    const completedOrders = await Order.count({ where: { ...where, status: 'completed' } });
    const cancelledOrders = await Order.count({ where: { ...where, status: 'cancelled' } });

    const revenueResult = await Order.findOne({
      where: { ...where, status: 'completed' },
      attributes: [
        [fn('SUM', col('subtotal')), 'totalSubtotal'],
        [fn('SUM', col('tax')), 'totalTax'],
        [fn('SUM', col('total')), 'totalRevenue'],
      ],
      raw: true,
    });

    // Top selling items
    const topItems = await OrderItem.findAll({
      attributes: [
        'menu_id',
        [fn('SUM', col('qty')), 'total_qty'],
        [fn('SUM', literal('`OrderItem`.`price` * `OrderItem`.`qty`')), 'total_sales'],
      ],
      include: [
        {
          model: Order,
          as: 'order',
          attributes: [],
          where: { ...where, status: { [Op.ne]: 'cancelled' } },
        },
        { model: Menu, as: 'menu', attributes: ['id', 'name', 'price'] },
      ],
      group: ['menu_id', 'menu.id', 'menu.name', 'menu.price'],
      order: [[fn('SUM', col('qty')), 'DESC']],
      limit: 10,
      raw: false,
    });

    // Daily trend
    const dailyTrend = await Order.findAll({
      where: { ...where, status: { [Op.ne]: 'cancelled' } },
      attributes: [
        [literal('DATE(DATE_ADD(created_at, INTERVAL 7 HOUR))'), 'date'],
        [fn('COUNT', col('id')), 'order_count'],
        [fn('SUM', col('total')), 'revenue'],
      ],
      group: [literal('DATE(DATE_ADD(created_at, INTERVAL 7 HOUR))')],
      order: [[literal('DATE(DATE_ADD(created_at, INTERVAL 7 HOUR))'), 'ASC']],
      raw: true,
    });

    // Status breakdown
    const statusBreakdown = await Order.findAll({
      where,
      attributes: [
        'status',
        [fn('COUNT', col('id')), 'count'],
      ],
      group: ['status'],
      raw: true,
    });

    res.json({
      success: true,
      data: {
        period: { start: startDate, end: endDate, type: period },
        summary: {
          totalOrders,
          completedOrders,
          cancelledOrders,
          totalRevenue: parseFloat(revenueResult?.totalRevenue) || 0,
          totalSubtotal: parseFloat(revenueResult?.totalSubtotal) || 0,
          totalTax: parseFloat(revenueResult?.totalTax) || 0,
        },
        topItems,
        dailyTrend,
        statusBreakdown,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/reports/stocks
 */
const getStockReport = async (req, res, next) => {
  try {
    const { period = 'monthly', start_date, end_date } = req.query;
    const { startDate, endDate } = getDateRange(period, start_date, end_date);

    // Stock movements
    const movements = await StockLog.findAll({
      where: { created_at: { [Op.between]: [startDate, endDate] } },
      include: [
        { model: RawMaterial, as: 'rawMaterial', attributes: ['id', 'name', 'unit'] },
      ],
      order: [['created_at', 'DESC']],
    });

    // Summary by type
    const deductions = await StockLog.sum('change_qty', {
      where: { created_at: { [Op.between]: [startDate, endDate] }, type: 'auto_deduction' },
    });

    const restocks = await StockLog.sum('change_qty', {
      where: { created_at: { [Op.between]: [startDate, endDate] }, type: 'restock' },
    });

    // Current critical items
    const criticalItems = await RawMaterial.findAll({
      where: { status: { [Op.in]: ['kritis', 'menipis'] } },
      order: [['stock', 'ASC']],
    });

    res.json({
      success: true,
      data: {
        period: { start: startDate, end: endDate, type: period },
        summary: {
          totalDeductions: Math.abs(parseFloat(deductions) || 0),
          totalRestocks: parseFloat(restocks) || 0,
          criticalCount: criticalItems.length,
        },
        movements,
        criticalItems,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/reports/orders/export
 * Export order report to Excel
 */
const exportOrderReport = async (req, res, next) => {
  try {
    const { period = 'monthly', start_date, end_date } = req.query;
    const { startDate, endDate } = getDateRange(period, start_date, end_date);

    const orders = await Order.findAll({
      where: { created_at: { [Op.between]: [startDate, endDate] } },
      include: [
        { model: OrderItem, as: 'items', include: [{ model: Menu, as: 'menu', attributes: ['name'] }] },
        { model: require('../models').Customer, as: 'customer', attributes: ['name', 'phone'] },
        { model: require('../models').Table, as: 'table', attributes: ['table_number'] },
        { model: User, as: 'cashier', attributes: ['id', 'name'] },
      ],
      order: [['created_at', 'DESC']],
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Laporan Pesanan');

    sheet.columns = [
      { header: 'No. Order', key: 'order_number', width: 20 },
      { header: 'Tanggal', key: 'date', width: 20 },
      { header: 'Pelanggan', key: 'customer', width: 20 },
      { header: 'Meja', key: 'table', width: 10 },
      { header: 'Tipe', key: 'type', width: 10 },
      { header: 'Kasir', key: 'cashier', width: 20 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Subtotal', key: 'subtotal', width: 15 },
      { header: 'Pajak', key: 'tax', width: 15 },
      { header: 'Total', key: 'total', width: 15 },
    ];

    // Style header
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    orders.forEach((order) => {
      sheet.addRow({
        order_number: order.order_number,
        date: new Date(order.created_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
        customer: order.customer?.name || '-',
        table: order.table?.table_number || '-',
        type: order.order_type,
        cashier: order.cashier?.name || '-',
        status: order.status,
        subtotal: parseFloat(order.subtotal),
        tax: parseFloat(order.tax),
        total: parseFloat(order.total),
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=laporan-pesanan-${period}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/reports/stocks/export
 */
const exportStockReport = async (req, res, next) => {
  try {
    const materials = await RawMaterial.findAll({ order: [['name', 'ASC']] });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Laporan Stok');

    sheet.columns = [
      { header: 'Nama Bahan', key: 'name', width: 25 },
      { header: 'Kategori', key: 'category', width: 15 },
      { header: 'Stok', key: 'stock', width: 12 },
      { header: 'Satuan', key: 'unit', width: 10 },
      { header: 'Min. Stok', key: 'min_stock', width: 12 },
      { header: 'Status', key: 'status', width: 12 },
    ];

    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    materials.forEach((m) => {
      sheet.addRow({
        name: m.name,
        category: m.category || '-',
        stock: parseFloat(m.stock),
        unit: m.unit,
        min_stock: parseFloat(m.min_stock),
        status: m.status,
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=laporan-stok.xlsx');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/reports/dashboard
 * Dashboard summary for main dashboard
 */
const getDashboardSummary = async (req, res, next) => {
  try {
    const WIB = '+07:00';
    const wibNow = getWIBNow();
    const todayStr = wibNow.toISOString().slice(0, 10);
    const startOfDay = new Date(`${todayStr}T00:00:00${WIB}`);
    const endOfDay = new Date(`${todayStr}T23:59:59.999${WIB}`);

    const todayWhere = { created_at: { [Op.between]: [startOfDay, endOfDay] } };

    const todayOrders = await Order.count({ where: todayWhere });
    const activeOrders = await Order.count({
      where: { status: { [Op.in]: ['pending', 'confirmed', 'preparing', 'ready'] } },
    });

    const todayRevenueResult = await Order.findOne({
      where: { ...todayWhere, status: 'completed' },
      attributes: [[fn('SUM', col('total')), 'revenue']],
      raw: true,
    });

    // Total cash payments today
    const todayCashResult = await Transaction.findOne({
      where: {
        paid_at: { [Op.between]: [startOfDay, endOfDay] },
        payment_method: 'CASH',
        status: 'paid',
      },
      attributes: [[fn('SUM', col('amount')), 'totalCash']],
      raw: true,
    });

    const criticalStock = await RawMaterial.count({ where: { status: 'kritis' } });
    const lowStock = await RawMaterial.count({ where: { status: 'menipis' } });

    res.json({
      success: true,
      data: {
        todayOrders,
        activeOrders,
        todayRevenue: parseFloat(todayRevenueResult?.revenue) || 0,
        todayCash: parseFloat(todayCashResult?.totalCash) || 0,
        criticalStock,
        lowStock,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/reports/report-dashboard
 * Unified dashboard laporan — returns all data in one call
 */
const getReportDashboard = async (req, res, next) => {
  try {
    const { period = 'monthly', start_date, end_date } = req.query;
    const { startDate, endDate } = getDateRange(period, start_date, end_date);

    const orderWhere = {
      created_at: { [Op.between]: [startDate, endDate] },
      status: { [Op.ne]: 'cancelled' },
    };

    // === KPI ===
    const revenueResult = await Order.findOne({
      where: { created_at: { [Op.between]: [startDate, endDate] }, status: 'completed' },
      attributes: [
        [fn('SUM', col('total')), 'totalRevenue'],
      ],
      raw: true,
    });

    const totalTransactions = await Order.count({
      where: { created_at: { [Op.between]: [startDate, endDate] }, status: 'completed' },
    });

    const totalItemsSoldResult = await OrderItem.findOne({
      attributes: [[fn('SUM', col('OrderItem.qty')), 'totalQty']],
      include: [{
        model: Order,
        as: 'order',
        attributes: [],
        where: { created_at: { [Op.between]: [startDate, endDate] }, status: 'completed' },
      }],
      raw: true,
    });

    const lowStockCount = await RawMaterial.count({
      where: { status: { [Op.in]: ['kritis', 'menipis'] } },
    });

    const outOfStockCount = await RawMaterial.count({
      where: { stock: 0 },
    });

    // === CHART DATA — adaptive grouping ===
    let chartGroupExpr, chartLabelExpr;
    const effectivePeriod = (start_date && end_date) ? 'custom' : period;

    if (effectivePeriod === 'daily') {
      // Group by hour
      chartGroupExpr = fn('HOUR', col('created_at'));
      chartLabelExpr = [fn('HOUR', col('created_at')), 'label'];
    } else if (effectivePeriod === 'yearly') {
      // Group by month
      chartGroupExpr = fn('MONTH', col('created_at'));
      chartLabelExpr = [fn('MONTH', col('created_at')), 'label'];
    } else {
      // Group by date (weekly, monthly, custom)
      chartGroupExpr = literal('DATE(DATE_ADD(created_at, INTERVAL 7 HOUR))');
      chartLabelExpr = [literal('DATE(DATE_ADD(created_at, INTERVAL 7 HOUR))'), 'label'];
    }

    const chartData = await Order.findAll({
      where: { created_at: { [Op.between]: [startDate, endDate] }, status: 'completed' },
      attributes: [
        chartLabelExpr,
        [fn('SUM', col('total')), 'revenue'],
        [fn('COUNT', col('id')), 'transactions'],
      ],
      group: [chartGroupExpr],
      order: [[chartGroupExpr, 'ASC']],
      raw: true,
    });

    // === TOP 5 MENU ===
    const topMenus = await OrderItem.findAll({
      attributes: [
        'menu_id',
        [fn('SUM', col('OrderItem.qty')), 'total_qty'],
        [fn('SUM', literal('`OrderItem`.`price` * `OrderItem`.`qty`')), 'total_revenue'],
      ],
      include: [
        {
          model: Order,
          as: 'order',
          attributes: [],
          where: { created_at: { [Op.between]: [startDate, endDate] }, status: 'completed' },
        },
        { model: Menu, as: 'menu', attributes: ['id', 'name', 'price'] },
      ],
      group: ['menu_id', 'menu.id', 'menu.name', 'menu.price'],
      order: [[fn('SUM', col('OrderItem.qty')), 'DESC']],
      limit: 5,
      raw: false,
    });

    // === STOCK STATUS ===
    const allMaterials = await RawMaterial.findAll({
      attributes: ['id', 'name', 'stock', 'unit', 'min_stock', 'status'],
      order: [['name', 'ASC']],
    });

    // === DAILY SALES TABLE ===
    const dailySales = await Order.findAll({
      where: { created_at: { [Op.between]: [startDate, endDate] }, status: 'completed' },
      attributes: [
        [literal('DATE(DATE_ADD(created_at, INTERVAL 7 HOUR))'), 'date'],
        [fn('COUNT', col('id')), 'transaction_count'],
        [fn('SUM', col('total')), 'total_revenue'],
      ],
      group: [literal('DATE(DATE_ADD(created_at, INTERVAL 7 HOUR))')],
      order: [[literal('DATE(DATE_ADD(created_at, INTERVAL 7 HOUR))'), 'ASC']],
      raw: true,
    });

    // Get menu items sold per day — separate query
    const dailyItemsSold = await OrderItem.findAll({
      attributes: [
        [literal('DATE(DATE_ADD(`order`.created_at, INTERVAL 7 HOUR))'), 'date'],
        [fn('SUM', col('OrderItem.qty')), 'items_sold'],
      ],
      include: [{
        model: Order,
        as: 'order',
        attributes: [],
        where: { created_at: { [Op.between]: [startDate, endDate] }, status: 'completed' },
      }],
      group: [literal('DATE(DATE_ADD(`order`.created_at, INTERVAL 7 HOUR))')],
      raw: true,
    });

    // Merge items_sold into dailySales
    const itemsMap = {};
    dailyItemsSold.forEach((row) => {
      itemsMap[row.date] = parseInt(row.items_sold) || 0;
    });
    const dailySalesMerged = dailySales.map((row) => ({
      ...row,
      items_sold: itemsMap[row.date] || 0,
    }));

    res.json({
      success: true,
      data: {
        period: { start: startDate, end: endDate, type: effectivePeriod },
        kpi: {
          totalRevenue: parseFloat(revenueResult?.totalRevenue) || 0,
          totalTransactions,
          totalItemsSold: parseInt(totalItemsSoldResult?.totalQty) || 0,
          lowStockCount,
          outOfStockCount,
        },
        chartData,
        topMenus,
        stockStatus: allMaterials,
        dailySales: dailySalesMerged,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/reports/report-dashboard/export
 * Export Dashboard Laporan to protected Excel (.xlsx)
 */
const exportReportDashboard = async (req, res, next) => {
  try {
    const { period = 'monthly', start_date, end_date } = req.query;
    const { startDate, endDate } = getDateRange(period, start_date, end_date);

    // Fetch same data as dashboard
    const revenueResult = await Order.findOne({
      where: { created_at: { [Op.between]: [startDate, endDate] }, status: 'completed' },
      attributes: [[fn('SUM', col('total')), 'totalRevenue']],
      raw: true,
    });

    const totalTransactions = await Order.count({
      where: { created_at: { [Op.between]: [startDate, endDate] }, status: 'completed' },
    });

    const totalItemsSoldResult = await OrderItem.findOne({
      attributes: [[fn('SUM', col('OrderItem.qty')), 'totalQty']],
      include: [{
        model: Order, as: 'order', attributes: [],
        where: { created_at: { [Op.between]: [startDate, endDate] }, status: 'completed' },
      }],
      raw: true,
    });

    const lowStockCount = await RawMaterial.count({
      where: { status: { [Op.in]: ['kritis', 'menipis'] } },
    });
    const outOfStockCount = await RawMaterial.count({ where: { stock: 0 } });

    // Daily sales
    const dailySales = await Order.findAll({
      where: { created_at: { [Op.between]: [startDate, endDate] }, status: 'completed' },
      attributes: [
        [literal('DATE(DATE_ADD(created_at, INTERVAL 7 HOUR))'), 'date'],
        [fn('COUNT', col('id')), 'transaction_count'],
        [fn('SUM', col('total')), 'total_revenue'],
      ],
      group: [literal('DATE(DATE_ADD(created_at, INTERVAL 7 HOUR))')],
      order: [[literal('DATE(DATE_ADD(created_at, INTERVAL 7 HOUR))'), 'ASC']],
      raw: true,
    });

    const dailyItemsSold = await OrderItem.findAll({
      attributes: [
        [literal('DATE(DATE_ADD(`order`.created_at, INTERVAL 7 HOUR))'), 'date'],
        [fn('SUM', col('OrderItem.qty')), 'items_sold'],
      ],
      include: [{
        model: Order, as: 'order', attributes: [],
        where: { created_at: { [Op.between]: [startDate, endDate] }, status: 'completed' },
      }],
      group: [literal('DATE(DATE_ADD(`order`.created_at, INTERVAL 7 HOUR))')],
      raw: true,
    });

    const itemsMap = {};
    dailyItemsSold.forEach((row) => { itemsMap[row.date] = parseInt(row.items_sold) || 0; });

    // All materials
    const allMaterials = await RawMaterial.findAll({
      attributes: ['id', 'name', 'stock', 'unit', 'min_stock', 'status'],
      order: [['name', 'ASC']],
    });

    // Stock Movements for new sheets
    const stockMovements = await sequelize.query(`
      SELECT 
        DATE(DATE_ADD(sl.created_at, INTERVAL 7 HOUR)) AS date,
        sl.type,
        rm.name AS material_name,
        rm.unit AS material_unit,
        SUM(sl.change_qty) AS total_qty
      FROM stock_logs sl
      JOIN raw_materials rm ON sl.raw_material_id = rm.id
      WHERE sl.created_at BETWEEN :startDate AND :endDate
      GROUP BY DATE(DATE_ADD(sl.created_at, INTERVAL 7 HOUR)), sl.type, rm.id, rm.name, rm.unit
      ORDER BY DATE(DATE_ADD(sl.created_at, INTERVAL 7 HOUR)) ASC, rm.name ASC
    `, {
      replacements: { startDate, endDate },
      type: sequelize.QueryTypes.SELECT
    });

    const restockMovements = stockMovements.filter(m => ['restock', 'refund'].includes(m.type) && parseFloat(m.total_qty) > 0);
    const autoDeductMovements = stockMovements.filter(m => m.type === 'auto_deduction' && parseFloat(m.total_qty) < 0);
    const manualDeductMovements = stockMovements.filter(m => m.type === 'manual_reduction' && parseFloat(m.total_qty) < 0);

    // === BUILD EXCEL ===
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Cafe Kitkop System';
    workbook.created = new Date();

    const headerStyle = {
      font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: {
        top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      },
    };

    const cellBorder = {
      top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
    };

    const formatDateID = (d) => new Date(d).toLocaleDateString('id-ID', { 
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' 
    });

    // ---- Sheet 1: Ringkasan ----
    const sheet1 = workbook.addWorksheet('Ringkasan');
    sheet1.columns = [
      { width: 30 },
      { width: 40 },
    ];

    const titleRow = sheet1.addRow(['LAPORAN CAFE KITKOP']);
    titleRow.font = { bold: true, size: 16, color: { argb: 'FF1F2937' } };
    sheet1.mergeCells('A1:B1');
    titleRow.alignment = { horizontal: 'center' };

    sheet1.addRow([]);

    const summaryData = [
      ['Periode Laporan', `${formatDateID(startDate)} - ${formatDateID(endDate)}`],
      ['Tanggal Generate', formatDateID(new Date())],
      [''],
      ['Total Penjualan', parseFloat(revenueResult?.totalRevenue) || 0],
      ['Total Transaksi', totalTransactions],
      ['Total Menu Terjual', parseInt(totalItemsSoldResult?.totalQty) || 0],
      ['Jumlah Stok Menipis', lowStockCount],
      ['Jumlah Stok Habis', outOfStockCount],
    ];

    summaryData.forEach((rowData) => {
      const row = sheet1.addRow(rowData);
      row.getCell(1).font = { bold: true, size: 11 };
      row.getCell(1).border = cellBorder;
      row.getCell(2).border = cellBorder;
      if (rowData[0] === 'Total Penjualan') {
        row.getCell(2).numFmt = '#,##0';
      }
    });

    // ---- Sheet 2: Laporan Penjualan ----
    const sheet2 = workbook.addWorksheet('Laporan Penjualan');
    sheet2.columns = [
      { header: 'No', key: 'no', width: 8 },
      { header: 'Tanggal', key: 'date', width: 20 },
      { header: 'Jumlah Transaksi', key: 'transactions', width: 18 },
      { header: 'Menu Terjual', key: 'items', width: 15 },
      { header: 'Total Penjualan', key: 'revenue', width: 20 },
    ];

    // Style header row
    sheet2.getRow(1).eachCell((cell) => {
      Object.assign(cell, headerStyle);
      cell.font = headerStyle.font;
      cell.fill = headerStyle.fill;
      cell.alignment = headerStyle.alignment;
      cell.border = headerStyle.border;
    });

    dailySales.forEach((row, idx) => {
      const dataRow = sheet2.addRow({
        no: idx + 1,
        date: formatDateID(row.date),
        transactions: parseInt(row.transaction_count),
        items: itemsMap[row.date] || 0,
        revenue: parseFloat(row.total_revenue),
      });
      dataRow.eachCell((cell) => { cell.border = cellBorder; });
      dataRow.getCell(5).numFmt = '#,##0';
    });

    // ---- Sheet 3: Laporan Stok ----
    const sheet3 = workbook.addWorksheet('Laporan Stok Bahan Baku');
    sheet3.columns = [
      { header: 'No', key: 'no', width: 8 },
      { header: 'Bahan Baku', key: 'name', width: 25 },
      { header: 'Stok', key: 'stock', width: 12 },
      { header: 'Satuan', key: 'unit', width: 12 },
      { header: 'Minimum Stok', key: 'min_stock', width: 15 },
      { header: 'Status', key: 'status', width: 15 },
    ];

    sheet3.getRow(1).eachCell((cell) => {
      Object.assign(cell, headerStyle);
      cell.font = headerStyle.font;
      cell.fill = headerStyle.fill;
      cell.alignment = headerStyle.alignment;
      cell.border = headerStyle.border;
    });

    const statusLabel = (s) => {
      if (s === 'aman') return 'Aman';
      if (s === 'menipis') return 'Menipis';
      return 'Habis';
    };

    allMaterials.forEach((m, idx) => {
      const stock = parseFloat(m.stock);
      const displayStatus = stock <= 0 ? 'Habis' : statusLabel(m.status);
      const dataRow = sheet3.addRow({
        no: idx + 1,
        name: m.name,
        stock: stock,
        unit: m.unit,
        min_stock: parseFloat(m.min_stock),
        status: displayStatus,
      });
      dataRow.eachCell((cell) => { cell.border = cellBorder; });

      // Color-code status cell
      const statusCell = dataRow.getCell(6);
      if (displayStatus === 'Habis') {
        statusCell.font = { bold: true, color: { argb: 'FFDC2626' } };
      } else if (displayStatus === 'Menipis') {
        statusCell.font = { bold: true, color: { argb: 'FFD97706' } };
      } else {
        statusCell.font = { bold: true, color: { argb: 'FF16A34A' } };
      }
    });

    // ---- Helper for Movement Sheets ----
    const addMovementSheet = (sheetName, data, isDeduction = false) => {
      const sheet = workbook.addWorksheet(sheetName);
      sheet.columns = [
        { header: 'No', key: 'no', width: 8 },
        { header: 'Tanggal', key: 'date', width: 20 },
        { header: 'Bahan Baku', key: 'material_name', width: 25 },
        { header: isDeduction ? 'Jumlah Keluar' : 'Jumlah Masuk', key: 'qty', width: 18 },
        { header: 'Satuan', key: 'unit', width: 12 },
      ];

      sheet.getRow(1).eachCell((cell) => {
        Object.assign(cell, headerStyle);
        cell.font = headerStyle.font;
        cell.fill = headerStyle.fill;
        cell.alignment = headerStyle.alignment;
        cell.border = headerStyle.border;
      });

      data.forEach((row, idx) => {
        const dataRow = sheet.addRow({
          no: idx + 1,
          date: formatDateID(row.date),
          material_name: row.material_name,
          qty: isDeduction ? Math.abs(parseFloat(row.total_qty)) : parseFloat(row.total_qty),
          unit: row.material_unit,
        });
        dataRow.eachCell((cell) => { cell.border = cellBorder; });
      });

      return sheet;
    };

    // ---- Sheet 4: Penambahan Stok ----
    const sheet4 = addMovementSheet('Penambahan Stok', restockMovements, false);

    // ---- Sheet 5: Pengurangan Otomatis ----
    const sheet5 = addMovementSheet('Pengurangan Otomatis', autoDeductMovements, true);

    // ---- Sheet 6: Pengurangan Manual ----
    const sheet6 = addMovementSheet('Pengurangan Manual', manualDeductMovements, true);

    // === PROTECT ALL SHEETS ===
    const protectionOptions = {
      selectLockedCells: true,
      selectUnlockedCells: true,
      formatCells: false,
      formatColumns: false,
      formatRows: false,
      insertColumns: false,
      insertRows: false,
      insertHyperlinks: false,
      deleteColumns: false,
      deleteRows: false,
      sort: false,
      autoFilter: false,
      pivotTables: false,
    };

    // Lock all cells in each sheet
    [sheet1, sheet2, sheet3, sheet4, sheet5, sheet6].forEach((sheet) => {
      sheet.eachRow((row) => {
        row.eachCell((cell) => {
          cell.protection = { locked: true };
        });
      });
      sheet.protect('kitkop2024', protectionOptions);
    });

    // Protect workbook structure
    workbook.calcProperties = { fullCalcOnLoad: true };

    // Generate filename
    const startStr = startDate.toISOString().split('T')[0].replace(/-/g, '-');
    const endStr = endDate.toISOString().split('T')[0].replace(/-/g, '-');
    const filename = `Laporan_${startStr}_${endStr}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
};

module.exports = { getOrderReport, getStockReport, exportOrderReport, exportStockReport, getDashboardSummary, getReportDashboard, exportReportDashboard };
