const { Menu, MenuCategory, MenuRecipe, RawMaterial, OrderItem } = require('../models');
const { Op } = require('sequelize');
const path = require('path');
const fs = require('fs');

/**
 * GET /api/menus
 * List all menus (public - for customer & staff)
 */
const getMenus = async (req, res, next) => {
  try {
    const { category_id, search, available_only } = req.query;

    const where = {};
    if (category_id) where.category_id = category_id;
    if (search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } },
      ];
    }
    if (available_only === 'true') where.is_available = 1;

    const menus = await Menu.findAll({
      where,
      include: [
        { model: MenuCategory, as: 'category', attributes: ['id', 'name'] },
      ],
      order: [['category_id', 'ASC'], ['name', 'ASC']],
    });

    res.json({ success: true, data: menus });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/menus/:id
 * Get single menu with recipes
 */
const getMenuById = async (req, res, next) => {
  try {
    const menu = await Menu.findByPk(req.params.id, {
      include: [
        { model: MenuCategory, as: 'category', attributes: ['id', 'name'] },
        {
          model: MenuRecipe,
          as: 'recipes',
          include: [
            { model: RawMaterial, as: 'rawMaterial', attributes: ['id', 'name', 'unit', 'stock'] },
          ],
        },
      ],
    });

    if (!menu) {
      return res.status(404).json({ success: false, message: 'Menu tidak ditemukan.' });
    }

    res.json({ success: true, data: menu });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/menus
 * Create new menu item (staff only)
 */
const createMenu = async (req, res, next) => {
  try {
    const { category_id, name, description, price } = req.body;

    if (!category_id || !name || !price) {
      return res.status(400).json({
        success: false,
        message: 'category_id, name, dan price wajib diisi.',
      });
    }

    const image = req.file ? `/uploads/menus/${req.file.filename}` : null;

    const menu = await Menu.create({
      category_id,
      name,
      description,
      price,
      image,
    });

    const menuWithCategory = await Menu.findByPk(menu.id, {
      include: [{ model: MenuCategory, as: 'category', attributes: ['id', 'name'] }],
    });

    res.status(201).json({
      success: true,
      message: 'Menu berhasil ditambahkan.',
      data: menuWithCategory,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/menus/:id
 * Update menu item
 */
const updateMenu = async (req, res, next) => {
  try {
    const menu = await Menu.findByPk(req.params.id);
    if (!menu) {
      return res.status(404).json({ success: false, message: 'Menu tidak ditemukan.' });
    }

    const { category_id, name, description, price } = req.body;

    if (category_id) menu.category_id = category_id;
    if (name) menu.name = name;
    if (description !== undefined) menu.description = description;
    if (price) menu.price = price;

    // Handle image update
    if (req.file) {
      // Delete old image
      if (menu.image) {
        const oldPath = path.join(__dirname, '..', menu.image);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      menu.image = `/uploads/menus/${req.file.filename}`;
    }

    await menu.save();

    const updatedMenu = await Menu.findByPk(menu.id, {
      include: [{ model: MenuCategory, as: 'category', attributes: ['id', 'name'] }],
    });

    res.json({
      success: true,
      message: 'Menu berhasil diperbarui.',
      data: updatedMenu,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/menus/:id
 */
const deleteMenu = async (req, res, next) => {
  try {
    const menu = await Menu.findByPk(req.params.id);
    if (!menu) {
      return res.status(404).json({ success: false, message: 'Menu tidak ditemukan.' });
    }

    // 1. Cek apakah menu sudah pernah dipesan (ada di OrderItem)
    const orderCount = await OrderItem.count({ where: { menu_id: menu.id } });
    if (orderCount > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Menu ini tidak bisa dihapus karena sudah ada di riwayat pesanan. Silakan matikan status ketersediaannya saja.' 
      });
    }

    // 2. Hapus resep yang terkait (MenuRecipe) agar tidak ada foreign key error
    await MenuRecipe.destroy({ where: { menu_id: menu.id } });

    // 3. Delete image file
    if (menu.image) {
      const imgPath = path.join(__dirname, '..', menu.image);
      if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
    }

    await menu.destroy();

    res.json({ success: true, message: 'Menu berhasil dihapus.' });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/menus/:id/availability
 * Toggle menu availability
 */
const toggleAvailability = async (req, res, next) => {
  try {
    const menu = await Menu.findByPk(req.params.id);
    if (!menu) {
      return res.status(404).json({ success: false, message: 'Menu tidak ditemukan.' });
    }

    menu.is_available = menu.is_available ? 0 : 1;
    await menu.save();

    res.json({
      success: true,
      message: `Menu ${menu.is_available ? 'tersedia' : 'tidak tersedia'}.`,
      data: { id: menu.id, is_available: menu.is_available },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getMenus, getMenuById, createMenu, updateMenu, deleteMenu, toggleAvailability };
