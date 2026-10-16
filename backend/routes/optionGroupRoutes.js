const { emitRealtime } = require('../socket/realtimeEvents');
const router = require('express').Router();
const { verifyToken, authorizeRoles } = require('../middleware/auth');
const { OptionGroup, Menu, RawMaterial } = require('../models');
const { sequelize } = require('../config/database');
const { validateGroup, fail } = require('../services/menuOptions');
router.use(verifyToken);
router.get('/', authorizeRoles('owner', 'manajer', 'kasir'), async (req, res, next) => {
  try {
    const groups = await OptionGroup.findAll({ include: [{ model: Menu, as: 'menus', attributes: ['id', 'name'], through: { attributes: [] } }], order: [['id', 'ASC']] });
    res.json({ success: true, data: groups });
  } catch (error) { next(error); }
});

async function save(req, res, next) {
  try {
    const definition = validateGroup(req.body);
    const group = await sequelize.transaction(async (transaction) => {
      const allGroups = await OptionGroup.findAll({ transaction });
      const otherIds = new Set(allGroups.filter((g) => String(g.id) !== req.params.id).flatMap((g) => g.choices.map((c) => c.id)));
      if (definition.choices.some((c) => otherIds.has(c.id))) fail('ID pilihan sudah digunakan kelompok lain.');
      const materials = [...new Set(definition.choices.flatMap((c) => c.ingredients.map((i) => i.raw_material_id)))];
      if (materials.length && await RawMaterial.count({ where: { id: materials }, transaction }) !== materials.length) fail('Bahan resep tidak ditemukan.');
      if (!req.params.id) return OptionGroup.create(definition, { transaction });
      const existing = await OptionGroup.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!existing) fail('Kelompok tidak ditemukan.', 404);
      return existing.update(definition, { transaction });
    });
    emitRealtime(req.app.get('io'), 'menu-updated');
    res.json({ success: true, data: group });
  } catch (error) { next(error); }
}
router.post('/', authorizeRoles('owner', 'manajer'), save);
router.put('/:id', authorizeRoles('owner', 'manajer'), save);
router.patch('/:id/choices/:choiceId/availability', authorizeRoles('owner', 'manajer', 'kasir'), async (req, res, next) => {
  try {
    const result = await sequelize.transaction(async (transaction) => {
      const group = await OptionGroup.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!group) fail('Kelompok tidak ditemukan.', 404);
      if (!group.choices.some((c) => c.id === req.params.choiceId)) fail('Pilihan tidak ditemukan.', 404);
      if (typeof req.body.is_available !== 'boolean') fail('Status ketersediaan tidak valid.');
      const choices = group.choices.map((c) => c.id === req.params.choiceId ? { ...c, is_available: req.body.is_available, is_default: req.body.is_available ? c.is_default : false } : c);
      return group.update({ choices }, { transaction });
    });
    emitRealtime(req.app.get('io'), 'menu-updated');
    res.json({ success: true, data: result });
  } catch (error) { next(error); }
});
module.exports = router;
