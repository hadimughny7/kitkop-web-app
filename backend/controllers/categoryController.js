const { MenuCategory } = require('../models');

/**
 * GET /api/categories
 */
const getCategories = async (req, res, next) => {
  try {
    const categories = await MenuCategory.findAll({
      order: [['sort_order', 'ASC']],
    });
    res.json({ success: true, data: categories });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/categories
 */
const createCategory = async (req, res, next) => {
  try {
    const { name, description, sort_order } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'Nama kategori wajib diisi.' });
    }
    const category = await MenuCategory.create({ name, description, sort_order: sort_order || 0 });
    res.status(201).json({ success: true, message: 'Kategori berhasil ditambahkan.', data: category });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/categories/:id
 */
const updateCategory = async (req, res, next) => {
  try {
    const category = await MenuCategory.findByPk(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Kategori tidak ditemukan.' });
    }
    const { name, description, sort_order } = req.body;
    if (name) category.name = name;
    if (description !== undefined) category.description = description;
    if (sort_order !== undefined) category.sort_order = sort_order;
    await category.save();
    res.json({ success: true, message: 'Kategori berhasil diperbarui.', data: category });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/categories/:id
 */
const deleteCategory = async (req, res, next) => {
  try {
    const category = await MenuCategory.findByPk(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Kategori tidak ditemukan.' });
    }
    await category.destroy();
    res.json({ success: true, message: 'Kategori berhasil dihapus.' });
  } catch (error) {
    next(error);
  }
};

module.exports = { getCategories, createCategory, updateCategory, deleteCategory };
