const { Table } = require('../models');

/**
 * GET /api/tables
 */
const getTables = async (req, res, next) => {
  try {
    const tables = await Table.findAll({
      order: [['table_number', 'ASC']],
    });
    res.json({ success: true, data: tables });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/tables/:id
 */
const getTableById = async (req, res, next) => {
  try {
    const table = await Table.findByPk(req.params.id);
    if (!table) {
      return res.status(404).json({ success: false, message: 'Meja tidak ditemukan.' });
    }
    res.json({ success: true, data: table });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/tables/by-number/:tableNumber
 * Get table by table_number (for QR code scanning)
 */
const getTableByNumber = async (req, res, next) => {
  try {
    const table = await Table.findOne({
      where: { table_number: req.params.tableNumber },
    });
    if (!table) {
      return res.status(404).json({ success: false, message: 'Meja tidak ditemukan.' });
    }
    if (!table.is_active) {
      return res.status(400).json({ success: false, message: 'Meja tidak aktif.' });
    }
    res.json({ success: true, data: table });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/tables
 */
  const createTable = async (req, res, next) => {
  try {
    const { table_number, capacity } = req.body;
    if (!table_number) {
      return res.status(400).json({ success: false, message: 'Nomor meja wajib diisi.' });
    }

    // Generate QR code URL
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const qr_code_url = `${clientUrl}/order?table=${table_number}`;

    const table = await Table.create({ table_number, qr_code_url, capacity: capacity || 4 });
    res.status(201).json({ success: true, message: 'Meja berhasil ditambahkan.', data: table });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/tables/:id
 */
const updateTable = async (req, res, next) => {
  try {
    const table = await Table.findByPk(req.params.id);
    if (!table) {
      return res.status(404).json({ success: false, message: 'Meja tidak ditemukan.' });
    }

    const { table_number, is_active, capacity } = req.body;
    if (table_number) {
      table.table_number = table_number;
      const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
      table.qr_code_url = `${clientUrl}/order?table=${table_number}`;
    }
    if (is_active !== undefined) table.is_active = is_active;
    if (capacity !== undefined) table.capacity = capacity;

    await table.save();
    res.json({ success: true, message: 'Meja berhasil diperbarui.', data: table });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/tables/:id
 */
const deleteTable = async (req, res, next) => {
  try {
    const table = await Table.findByPk(req.params.id);
    if (!table) {
      return res.status(404).json({ success: false, message: 'Meja tidak ditemukan.' });
    }
    await table.destroy();
    res.json({ success: true, message: 'Meja berhasil dihapus.' });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/tables/bulk-toggle
 * Activate or deactivate all tables at once
 */
const bulkToggleTables = async (req, res, next) => {
  try {
    const { is_active } = req.body;
    if (is_active === undefined) {
      return res.status(400).json({ success: false, message: 'Parameter is_active wajib diisi.' });
    }
    await Table.update({ is_active }, { where: {} });
    const action = is_active ? 'diaktifkan' : 'dinonaktifkan';
    res.json({ success: true, message: `Semua meja berhasil ${action}.` });
  } catch (error) {
    next(error);
  }
};

module.exports = { getTables, getTableById, getTableByNumber, createTable, updateTable, deleteTable, bulkToggleTables };
