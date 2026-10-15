const { RawMaterial, MenuRecipe, StockLog, Menu, Order, Customer, Table, User, OrderItem, OptionGroup, OptionTemplate } = require('../models');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * GET /api/stocks
 */
const getStocks = async (req, res, next) => {
  try {
    const { search, status, category } = req.query;
    const where = {};
    if (search) where.name = { [Op.like]: `%${search}%` };
    if (status) where.status = status;
    if (category) where.category = category;

    const materials = await RawMaterial.findAll({
      where,
      order: [['name', 'ASC']],
    });

    // Summary stats
    const total = await RawMaterial.count();
    const critical = await RawMaterial.count({ where: { status: 'kritis' } });
    const low = await RawMaterial.count({ where: { status: 'menipis' } });
    const recipeCount = await MenuRecipe.count({ distinct: true, col: 'menu_id' });

    res.json({
      success: true,
      data: materials,
      summary: { total, critical, low, recipeCount },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/stocks
 */
const createStock = async (req, res, next) => {
  try {
    const { name, category, stock, unit, min_stock } = req.body;
    if (!name || !unit) {
      return res.status(400).json({ success: false, message: 'Nama dan satuan wajib diisi.' });
    }

    const stockVal = parseFloat(stock) || 0;
    const minVal = parseFloat(min_stock) || 0;
    let status = 'aman';
    if (stockVal <= 0) status = 'kritis';
    else if (stockVal <= minVal) status = 'menipis';

    const material = await RawMaterial.create({
      name, category, stock: stockVal, unit, min_stock: minVal, status,
    });

    res.status(201).json({ success: true, message: 'Bahan baku berhasil ditambahkan.', data: material });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/stocks/:id
 */
const updateStock = async (req, res, next) => {
  try {
    const material = await RawMaterial.findByPk(req.params.id);
    if (!material) {
      return res.status(404).json({ success: false, message: 'Bahan baku tidak ditemukan.' });
    }

    const { name, category, unit, min_stock, stock } = req.body;
    if (name) material.name = name;
    if (category !== undefined) material.category = category;
    if (unit) material.unit = unit;
    if (min_stock !== undefined) material.min_stock = parseFloat(min_stock);
    if (stock !== undefined) material.stock = parseFloat(stock);

    // Recalculate status
    const stockVal = parseFloat(material.stock);
    const minVal = parseFloat(material.min_stock);
    if (stockVal <= 0) material.status = 'kritis';
    else if (stockVal <= minVal) material.status = 'menipis';
    else material.status = 'aman';

    await material.save();
    res.json({ success: true, message: 'Bahan baku berhasil diperbarui.', data: material });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/stocks/:id
 */
const deleteStock = async (req, res, next) => {
  try {
    const material = await RawMaterial.findByPk(req.params.id);
    if (!material) {
      return res.status(404).json({ success: false, message: 'Bahan baku tidak ditemukan.' });
    }
    const groups = await OptionGroup.findAll({ attributes: ['choices'] });
    const templates = await OptionTemplate.findAll({ where: { is_deleted: false }, attributes: ['choices'] });
    const snapshots = await OrderItem.findAll({ where: { stock_refunded: false }, attributes: ['stock_usage'] });
    const usedInOptions = [...groups, ...templates].some((g) => g.choices.some((c) => (c.ingredients || []).some((i) => Number(i.raw_material_id) === material.id)));
    const usedInSnapshot = snapshots.some((i) => (i.stock_usage || []).some((r) => Number(r.raw_material_id) === material.id));
    if (usedInOptions || usedInSnapshot) return res.status(400).json({ success: false, message: 'Bahan masih digunakan oleh pilihan menu atau resep pesanan.' });
    await material.destroy();
    res.json({ success: true, message: 'Bahan baku berhasil dihapus.' });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/stocks/:id/restock
 * Manual restock
 */
const restockMaterial = async (req, res, next) => {
  try {
    const material = await RawMaterial.findByPk(req.params.id);
    if (!material) {
      return res.status(404).json({ success: false, message: 'Bahan baku tidak ditemukan.' });
    }

    const { quantity, notes } = req.body;
    if (!quantity || parseFloat(quantity) <= 0) {
      return res.status(400).json({ success: false, message: 'Jumlah restock harus lebih dari 0.' });
    }

    const addQty = parseFloat(quantity);
    material.stock = parseFloat(material.stock) + addQty;

    // Update status
    if (material.stock <= 0) material.status = 'kritis';
    else if (material.stock <= parseFloat(material.min_stock)) material.status = 'menipis';
    else material.status = 'aman';

    await material.save();

    // Log
    await StockLog.create({
      raw_material_id: material.id,
      change_qty: addQty,
      type: 'restock',
      notes: notes || `Restock ${addQty} ${material.unit}`,
      created_by: req.user ? req.user.id : null,
    });

    const io = req.app.get('io');
    if (io) io.emit('stock-updated');

    res.json({ success: true, message: 'Restock berhasil.', data: material });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/stocks/logs
 */
const getStockLogs = async (req, res, next) => {
  try {
    const { raw_material_id, type, page = 1, limit = 50 } = req.query;
    const where = {};
    if (raw_material_id) where.raw_material_id = raw_material_id;
    if (type) where.type = type;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await StockLog.findAndCountAll({
      where,
      include: [
        { model: RawMaterial, as: 'rawMaterial', attributes: ['id', 'name', 'unit'] },
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset,
    });

    res.json({
      success: true,
      data: rows,
      pagination: { total: count, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(count / parseInt(limit)) },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/stocks/logs/by-date
 * Get stock logs for a specific date, grouped by order
 */
const getStockLogsByDate = async (req, res, next) => {
  try {
    const { date, type } = req.query;

    // Default to today in WIB (UTC+7) if no date provided
    // Always use WIB timezone so it works on both local and UTC-based hosting
    const WIB_OFFSET = '+07:00';
    let dateStr = date;
    if (!dateStr) {
      // Get today's date in WIB
      const now = new Date();
      const wibNow = new Date(now.getTime() + (7 * 60 * 60 * 1000));
      dateStr = wibNow.toISOString().slice(0, 10);
    }
    const startOfDay = new Date(`${dateStr}T00:00:00${WIB_OFFSET}`);
    const endOfDay = new Date(`${dateStr}T23:59:59.999${WIB_OFFSET}`);

    const where = {
      created_at: { [Op.between]: [startOfDay, endOfDay] },
    };
    if (type) where.type = type;

    const logs = await StockLog.findAll({
      where,
      include: [
        { model: RawMaterial, as: 'rawMaterial', attributes: ['id', 'name', 'unit', 'stock', 'status'] },
        {
          model: Order,
          as: 'referenceOrder',
          attributes: ['id', 'order_number', 'status', 'total', 'created_at'],
          include: [
            { model: Customer, as: 'customer', attributes: ['id', 'name'] },
            { model: Table, as: 'table', attributes: ['id', 'table_number'] },
          ],
        },
        { model: User, as: 'createdByUser', attributes: ['id', 'name'] },
      ],
      order: [['created_at', 'DESC']],
    });

    // Group logs by order
    const orderMap = new Map();
    const nonOrderLogs = [];

    for (const log of logs) {
      const plain = log.toJSON();
      if (plain.reference_order_id) {
        const orderId = plain.reference_order_id;
        if (!orderMap.has(orderId)) {
          orderMap.set(orderId, {
            order: plain.referenceOrder,
            logs: [],
          });
        }
        orderMap.get(orderId).logs.push({
          id: plain.id,
          raw_material_id: plain.raw_material_id,
          rawMaterial: plain.rawMaterial,
          change_qty: plain.change_qty,
          type: plain.type,
          notes: plain.notes,
          created_at: plain.created_at,
          createdByUser: plain.createdByUser,
        });
      } else {
        nonOrderLogs.push(plain);
      }
    }

    // Summary stats for the day
    const totalDeductions = logs.filter(l => parseFloat(l.change_qty) < 0).length;
    const totalRestocks = logs.filter(l => l.type === 'restock').length;
    const totalRefunds = logs.filter(l => l.type === 'refund').length;
    const uniqueOrders = orderMap.size;

    res.json({
      success: true,
      data: {
        byOrder: Array.from(orderMap.values()),
        nonOrderLogs,
        summary: {
          totalLogs: logs.length,
          totalDeductions,
          totalRestocks,
          totalRefunds,
          uniqueOrders,
          date: startOfDay.toISOString().slice(0, 10),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Auto deduct stock when order is created
 * Called from orderController after order creation
 */
// Lock each item before applying its snapshotted recipe: retries cannot double-deduct.
const applyItemStock = async (orderId, itemId, transaction, refund = false) => {
  const item = await OrderItem.findByPk(itemId, { transaction, lock: transaction.LOCK.UPDATE });
  if (!item || (refund ? item.stock_refunded : item.stock_deducted || item.status === 'rejected')) return;
  // Legacy items have no snapshot; retain their existing recipe-based refund behavior.
  if (refund && item.stock_usage !== null && !item.stock_deducted) return;
  const recipes = item.stock_usage ?? await MenuRecipe.findAll({ where: { menu_id: item.menu_id }, transaction });
  for (const recipe of [...recipes].sort((a, b) => a.raw_material_id - b.raw_material_id)) {
    const material = await RawMaterial.findByPk(recipe.raw_material_id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!material) throw new Error('Bahan resep pesanan tidak ditemukan.');
    const change = Number(recipe.quantity_used) * item.qty * (refund ? 1 : -1);
    material.stock = Number(material.stock) + change;
    material.status = material.stock <= 0 ? 'kritis' : material.stock <= Number(material.min_stock) ? 'menipis' : 'aman';
    await material.save({ transaction });
    await StockLog.create({ raw_material_id: material.id, change_qty: change,
      type: refund ? 'refund' : 'auto_deduction', reference_order_id: orderId,
      notes: `${refund ? 'Refund' : 'Auto deduction'} item #${item.id}`,
    }, { transaction });
  }
  await item.update(refund ? { stock_refunded: true } : { stock_deducted: true }, { transaction });
};
const deductStockForOrder = async (orderId, orderItems, transaction) => {
  for (const item of [...orderItems].sort((a, b) => a.id - b.id)) await applyItemStock(orderId, item.id, transaction);
};
const refundStockForOrderItem = async (orderId, orderItem, transaction) => {
  await applyItemStock(orderId, orderItem.id, transaction, true);
};

/**
 * POST /api/stocks/:id/reduce
 * Manual stock reduction (expired, damaged, unusable)
 */
const reduceMaterial = async (req, res, next) => {
  try {
    const material = await RawMaterial.findByPk(req.params.id);
    if (!material) {
      return res.status(404).json({ success: false, message: 'Bahan baku tidak ditemukan.' });
    }

    const { quantity, notes } = req.body;
    if (!quantity || parseFloat(quantity) <= 0) {
      return res.status(400).json({ success: false, message: 'Jumlah pengurangan harus lebih dari 0.' });
    }

    const reduceQty = parseFloat(quantity);
    const currentStock = parseFloat(material.stock);

    if (reduceQty > currentStock) {
      return res.status(400).json({ success: false, message: `Jumlah pengurangan (${reduceQty}) melebihi stok saat ini (${currentStock} ${material.unit}).` });
    }

    material.stock = currentStock - reduceQty;

    // Update status
    if (material.stock <= 0) material.status = 'kritis';
    else if (material.stock <= parseFloat(material.min_stock)) material.status = 'menipis';
    else material.status = 'aman';

    await material.save();

    // Log
    await StockLog.create({
      raw_material_id: material.id,
      change_qty: -reduceQty,
      type: 'manual_reduction',
      notes: notes || `Pengurangan manual ${reduceQty} ${material.unit}`,
      created_by: req.user ? req.user.id : null,
    });

    const io = req.app.get('io');
    if (io) io.emit('stock-updated');

    res.json({ success: true, message: 'Pengurangan stok berhasil.', data: material });
  } catch (error) {
    next(error);
  }
};

module.exports = { getStocks, createStock, updateStock, deleteStock, restockMaterial, reduceMaterial, getStockLogs, getStockLogsByDate, deductStockForOrder, refundStockForOrderItem };

