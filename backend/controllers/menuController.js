const { emitRealtime } = require('../socket/realtimeEvents');
const { Menu, MenuCategory, MenuRecipe, RawMaterial, OrderItem, OptionGroup } = require('../models');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const { fail } = require('../services/menuOptions');
const { parseMenuOptions, saveMenuOptions } = require('../services/saveMenuOptions');
const { priceAmount } = require('../services/menuPrices');
const { storeMenuImage, removeMenuImage } = require('../services/menuImages');
const optionInclude = { model: OptionGroup, as: 'optionGroups', attributes: ['id', 'name', 'min_choices', 'max_choices', 'is_active', 'choices'], through: { attributes: ['sort_order'] } };
// Public menu responses omit internal ingredient recipes.
const publicMenu = (menu) => {
  const data = menu.toJSON();
  data.optionGroups = (data.optionGroups || []).sort((a,b) => a.MenuOptionGroup.sort_order - b.MenuOptionGroup.sort_order).map((g) => ({ ...g, choices: g.choices.map(({ ingredients, ...choice }) => choice) }));
  return data;
};
const parseGroups = async (value) => {
  if (value === undefined) return undefined;
  let ids;
  try { ids = typeof value === 'string' ? JSON.parse(value) : value; } catch { fail('Daftar kelompok tidak valid.'); }
  if (!Array.isArray(ids) || ids.length > 20 || ids.some((id) => !Number.isInteger(Number(id)) || Number(id) < 1) || new Set(ids.map(Number)).size !== ids.length) fail('Daftar kelompok tidak valid.');
  if (await OptionGroup.count({ where: { id: ids } }) !== ids.length) fail('Kelompok tidak ditemukan.');
  return ids.map(Number);
};
const attachGroups = async (menu, ids, transaction) => {
  if (ids === undefined) return;
  await menu.setOptionGroups([], { transaction });
  for (const [index, id] of ids.entries()) await menu.addOptionGroup(id, { through: { sort_order: index }, transaction });
};
const releaseUnusedImage = async image => {
  if (!image) return;
  try {
    if (!await Menu.count({ where: { image } })) await removeMenuImage(image);
  } catch (error) {
    // The DB commit has succeeded; cleanup failure must not report a failed save.
    console.warn('Unable to check unused menu image:', error.name);
  }
};

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
        optionInclude,
      ],
      order: [['category_id', 'ASC'], ['name', 'ASC']],
    });

    res.json({ success: true, data: menus.map(publicMenu) });
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
        optionInclude,
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

    res.json({ success: true, data: publicMenu(menu) });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/menus
 * Create new menu item (staff only)
 */
const createMenu = async (req, res, next) => {
  let image = null;
  let committed = false;
  try {
    const { category_id, name, description, price } = req.body;

    if (!category_id || !name || price === undefined) {
      return res.status(400).json({
        success: false,
        message: 'category_id, name, dan price wajib diisi.',
      });
    }

    const validPrice = priceAmount(price);
    const options = parseMenuOptions(req.body.option_groups);
    if (options !== undefined && req.body.option_group_ids !== undefined) fail('Gunakan satu format pilihan menu.');
    const groupIds = await parseGroups(req.body.option_group_ids);
    image = req.file ? await storeMenuImage(req.file.buffer) : null;

    const menu = await sequelize.transaction(async (transaction) => {
      const created = await Menu.create({
      category_id,
      name,
      description,
      price: validPrice,
      image,
      }, { transaction });
      await attachGroups(created, groupIds, transaction);
      await saveMenuOptions(created, options, transaction);
      return created;
    });
    committed = true;

    const menuWithCategory = await Menu.findByPk(menu.id, {
      include: [{ model: MenuCategory, as: 'category', attributes: ['id', 'name'] }, optionInclude],
    });

    res.status(201).json({
      success: true,
      message: 'Menu berhasil ditambahkan.',
      data: publicMenu(menuWithCategory),
    });
  } catch (error) {
    if (!committed && image) await removeMenuImage(image);
    next(error);
  }
};

/**
 * PUT /api/menus/:id
 * Update menu item
 */
const updateMenu = async (req, res, next) => {
  let newImage = null;
  let committed = false;
  try {
    const { category_id, name, description, price } = req.body;
    const validPrice = price !== undefined ? priceAmount(price) : undefined;
    const options = parseMenuOptions(req.body.option_groups);
    if (options !== undefined && req.body.option_group_ids !== undefined) fail('Gunakan satu format pilihan menu.');
    const groupIds = await parseGroups(req.body.option_group_ids);

    newImage = req.file ? await storeMenuImage(req.file.buffer) : null;
    let oldImage;
    const menu = await sequelize.transaction(async (transaction) => {
      const current = await Menu.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!current) fail('Menu tidak ditemukan.', 404);
      oldImage = current.image;
      if (category_id) current.category_id = category_id;
      if (name) current.name = name;
      if (description !== undefined) current.description = description;
      if (validPrice !== undefined) current.price = validPrice;
      if (newImage) current.image = newImage;
      await current.save({ transaction });
      await attachGroups(current, groupIds, transaction);
      await saveMenuOptions(current, options, transaction);
      return current;
    });
    committed = true;
    if (newImage && oldImage !== newImage) await releaseUnusedImage(oldImage);

    const updatedMenu = await Menu.findByPk(menu.id, {
      include: [{ model: MenuCategory, as: 'category', attributes: ['id', 'name'] }, optionInclude],
    });

    res.json({
      success: true,
      message: 'Menu berhasil diperbarui.',
      data: publicMenu(updatedMenu),
    });
  } catch (error) {
    if (!committed && newImage) await removeMenuImage(newImage);
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

    const image = menu.image;
    await menu.destroy();
    await releaseUnusedImage(image);

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

const getMenuOptions = async (req, res, next) => {
  try {
    const menu = await Menu.findByPk(req.params.id);
    if (!menu) fail('Menu tidak ditemukan.', 404);
    const groups = await menu.getOptionGroups();
    groups.sort((a, b) => a.MenuOptionGroup.sort_order - b.MenuOptionGroup.sort_order);
    res.json({ success: true, data: groups });
  } catch (error) { next(error); }
};

const setMenuOptionAvailability = async (req, res, next) => {
  try {
    if (typeof req.body.is_available !== 'boolean') fail('Status ketersediaan tidak valid.');
    await sequelize.transaction(async (transaction) => {
      const menu = await Menu.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!menu) fail('Menu tidak ditemukan.', 404);
      const groups = await menu.getOptionGroups({ transaction });
      groups.sort((a, b) => a.MenuOptionGroup.sort_order - b.MenuOptionGroup.sort_order);
      const target = groups.find((g) => String(g.id) === req.params.groupId);
      if (!target || !target.choices.some((c) => c.id === req.params.choiceId)) fail('Pilihan menu tidak ditemukan.', 404);
      const definitions = groups.map((g) => ({ ...g.toJSON(), choices: g.choices.map((c) => g.id === target.id && c.id === req.params.choiceId ? { ...c, is_available: req.body.is_available, is_default: req.body.is_available && c.is_default } : c) }));
      await saveMenuOptions(menu, parseMenuOptions(definitions), transaction, false);
    });
    emitRealtime(req.app.get('io'), 'menu-updated');
    res.json({ success: true, message: 'Ketersediaan pilihan diperbarui.' });
  } catch (error) { next(error); }
};

module.exports = { getMenuOptions, setMenuOptionAvailability, getMenus, getMenuById, createMenu, updateMenu, deleteMenu, toggleAvailability };
