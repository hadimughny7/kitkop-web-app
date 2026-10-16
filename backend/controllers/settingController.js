const { Setting } = require('../models');
const { sequelize } = require('../config/database');

/**
 * Get all settings (public)
 */
const getSettings = async (req, res) => {
  try {
    const settings = await Setting.findAll();
    const result = {};
    settings.forEach(s => {
      result[s.key] = s.value;
    });
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ success: false, message: 'Gagal memuat pengaturan.' });
  }
};

/**
 * Update settings (owner/manajer only)
 */
const updateSettings = async (req, res) => {
  try {
    const updates = [];
    // Validate the entire request before opening a transaction or writing any row.
    for (const [key, label] of [['tax_percentage', 'pajak'], ['service_charge_percentage', 'service charge']]) {
      const input = req.body[key];
      if (input === undefined) continue;
      const numericInput = typeof input === 'number'
        || (typeof input === 'string' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(input.trim()));
      const value = numericInput ? Number(input) : NaN;
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        return res.status(400).json({ success: false, message: `Persentase ${label} harus antara 0-100.` });
      }
      updates.push({ key, value: String(value), description: `Persentase ${label} (%)` });
    }

    const result = await sequelize.transaction(async transaction => {
      // Keep a stable write order for concurrent requests changing both settings.
      for (const update of updates) await Setting.upsert(update, { transaction });
      const settings = await Setting.findAll({ transaction });
      return Object.fromEntries(settings.map(setting => [setting.key, setting.value]));
    });

    res.json({ success: true, message: 'Pengaturan berhasil diperbarui.', data: result });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ success: false, message: 'Gagal memperbarui pengaturan.' });
  }
};

module.exports = { getSettings, updateSettings };
