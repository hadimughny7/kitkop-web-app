const { Setting } = require('../models');

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
    const { tax_percentage, service_charge_percentage } = req.body;

    // Validate
    if (tax_percentage !== undefined) {
      const taxVal = parseFloat(tax_percentage);
      if (isNaN(taxVal) || taxVal < 0 || taxVal > 100) {
        return res.status(400).json({ success: false, message: 'Persentase pajak harus antara 0-100.' });
      }
      await Setting.upsert({ key: 'tax_percentage', value: String(taxVal), description: 'Persentase pajak (%)' });
    }

    if (service_charge_percentage !== undefined) {
      const serviceVal = parseFloat(service_charge_percentage);
      if (isNaN(serviceVal) || serviceVal < 0 || serviceVal > 100) {
        return res.status(400).json({ success: false, message: 'Persentase service charge harus antara 0-100.' });
      }
      await Setting.upsert({ key: 'service_charge_percentage', value: String(serviceVal), description: 'Persentase service charge (%)' });
    }

    // Return updated settings
    const settings = await Setting.findAll();
    const result = {};
    settings.forEach(s => {
      result[s.key] = s.value;
    });

    res.json({ success: true, message: 'Pengaturan berhasil diperbarui.', data: result });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ success: false, message: 'Gagal memperbarui pengaturan.' });
  }
};

module.exports = { getSettings, updateSettings };
