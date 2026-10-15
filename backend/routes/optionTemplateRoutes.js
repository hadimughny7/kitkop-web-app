const router = require('express').Router();
const { verifyToken, authorizeRoles } = require('../middleware/auth');
const { OptionTemplate } = require('../models');

router.use(verifyToken, authorizeRoles('owner', 'manajer'));
router.get('/', async (req, res, next) => {
  try {
    const templates = await OptionTemplate.findAll({ where: { is_deleted: false },
      attributes: ['id', 'name', 'min_choices', 'max_choices', 'is_active', 'choices'], order: [['id', 'ASC']] });
    res.json({ success: true, data: templates });
  } catch (error) { next(error); }
});
router.delete('/:id', async (req, res, next) => {
  try {
    const template = await OptionTemplate.findOne({ where: { id: req.params.id, is_deleted: false } });
    if (!template) return res.status(404).json({ success: false, message: 'Add-on tersimpan tidak ditemukan.' });
    await template.update({ is_deleted: true });
    res.json({ success: true, message: 'Dihapus dari daftar tersimpan. Pilihan pada menu tetap tersedia.' });
  } catch (error) { next(error); }
});
module.exports = router;
