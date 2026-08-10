const { MenuRecipe, Menu, RawMaterial } = require('../models');

/**
 * GET /api/recipes
 * Get all recipes (optionally filter by menu_id)
 */
const getRecipes = async (req, res, next) => {
  try {
    const { menu_id } = req.query;
    const where = {};
    if (menu_id) where.menu_id = menu_id;

    const recipes = await MenuRecipe.findAll({
      where,
      include: [
        { model: Menu, as: 'menu', attributes: ['id', 'name'] },
        { model: RawMaterial, as: 'rawMaterial', attributes: ['id', 'name', 'unit', 'stock'] },
      ],
    });

    res.json({ success: true, data: recipes });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/recipes
 * Add recipe ingredient
 */
const createRecipe = async (req, res, next) => {
  try {
    const { menu_id, raw_material_id, quantity_used } = req.body;
    if (!menu_id || !raw_material_id || !quantity_used) {
      return res.status(400).json({ success: false, message: 'menu_id, raw_material_id, dan quantity_used wajib diisi.' });
    }

    const recipe = await MenuRecipe.create({ menu_id, raw_material_id, quantity_used });
    const fullRecipe = await MenuRecipe.findByPk(recipe.id, {
      include: [
        { model: Menu, as: 'menu', attributes: ['id', 'name'] },
        { model: RawMaterial, as: 'rawMaterial', attributes: ['id', 'name', 'unit'] },
      ],
    });

    res.status(201).json({ success: true, message: 'Resep berhasil ditambahkan.', data: fullRecipe });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/recipes/:id
 */
const updateRecipe = async (req, res, next) => {
  try {
    const recipe = await MenuRecipe.findByPk(req.params.id);
    if (!recipe) {
      return res.status(404).json({ success: false, message: 'Resep tidak ditemukan.' });
    }
    const { quantity_used } = req.body;
    if (quantity_used) recipe.quantity_used = quantity_used;
    await recipe.save();
    res.json({ success: true, message: 'Resep berhasil diperbarui.', data: recipe });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/recipes/:id
 */
const deleteRecipe = async (req, res, next) => {
  try {
    const recipe = await MenuRecipe.findByPk(req.params.id);
    if (!recipe) {
      return res.status(404).json({ success: false, message: 'Resep tidak ditemukan.' });
    }
    await recipe.destroy();
    res.json({ success: true, message: 'Resep berhasil dihapus.' });
  } catch (error) {
    next(error);
  }
};

module.exports = { getRecipes, createRecipe, updateRecipe, deleteRecipe };
