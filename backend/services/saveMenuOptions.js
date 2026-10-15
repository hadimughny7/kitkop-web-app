const { randomUUID } = require('node:crypto');
const { OptionGroup, MenuOptionGroup, RawMaterial } = require('../models');
const { rememberOptionTemplate } = require('./optionTemplates');
const { validateGroup, fail } = require('./menuOptions');

function parseMenuOptions(value) {
  if (value === undefined) return undefined;
  let groups;
  try { groups = typeof value === 'string' ? JSON.parse(value) : value; } catch { fail('Pilihan menu tidak valid.'); }
  if (!Array.isArray(groups) || groups.length > 20) fail('Maksimal 20 jenis pilihan per menu.');
  const seen = new Set();
  const choiceIds = new Set();
  return groups.map((group) => {
    if (!group || typeof group !== 'object') fail('Pilihan menu tidak valid.');
    const id = group.id === undefined ? undefined : Number(group.id);
    if (id !== undefined && (!Number.isInteger(id) || id < 1 || seen.has(id))) fail('ID pilihan menu tidak valid atau duplikat.');
    if (id !== undefined) seen.add(id);
    const definition = validateGroup(group);
    for (const choice of definition.choices) {
      if (choiceIds.has(choice.id)) fail('ID pilihan tidak boleh sama antar jenis pilihan.');
      choiceIds.add(choice.id);
    }
    return { id, definition };
  });
}

async function saveMenuOptions(menu, groups, transaction, rememberTemplates = true) {
  if (groups === undefined) return;
  const attached = await menu.getOptionGroups({ transaction, lock: transaction.LOCK.UPDATE });
  const attachedById = new Map(attached.map((g) => [g.id, g]));
  const materialIds = [...new Set(groups.flatMap((g) => g.definition.choices.flatMap((c) => c.ingredients.map((i) => i.raw_material_id))))];
  if (materialIds.length && await RawMaterial.count({ where: { id: materialIds }, transaction }) !== materialIds.length) fail('Bahan tambahan tidak ditemukan.');
  const allGroups = await OptionGroup.findAll({ transaction });
  const savedIds = [];
  for (const { id, definition } of groups) {
    let group;
    let changed = id === undefined;
    if (id !== undefined) {
      group = attachedById.get(id);
      if (!group) fail('Pilihan bukan milik menu ini. Muat ulang menu sebelum menyimpan.');
      const previous = validateGroup(group.toJSON());
      changed = JSON.stringify(previous) !== JSON.stringify(definition);
      // Existing shared groups become private when edited from one menu.
      if (changed && await MenuOptionGroup.count({ where: { option_group_id: id }, transaction }) > 1) {
        group = await OptionGroup.create({ ...definition, choices: definition.choices.map((c) => ({ ...c, id: randomUUID() })) }, { transaction });
      } else if (changed) {
        const foreignIds = new Set(allGroups.filter((g) => g.id !== id).flatMap((g) => g.choices.map((c) => c.id)));
        if (definition.choices.some((c) => foreignIds.has(c.id))) fail('ID pilihan sudah digunakan menu lain.');
        await group.update(definition, { transaction });
      }
    } else {
      const foreignIds = new Set(allGroups.flatMap((g) => g.choices.map((c) => c.id)));
      if (definition.choices.some((c) => foreignIds.has(c.id))) fail('ID pilihan sudah digunakan menu lain.');
      group = await OptionGroup.create(definition, { transaction });
    }
    if (changed && rememberTemplates) await rememberOptionTemplate(definition, transaction);
    savedIds.push(group.id);
  }
  await menu.setOptionGroups([], { transaction });
  for (const [sort_order, id] of savedIds.entries()) {
    await menu.addOptionGroup(id, { through: { sort_order }, transaction });
  }
  for (const old of attached) {
    if (!savedIds.includes(old.id) && !await MenuOptionGroup.count({ where: { option_group_id: old.id }, transaction })) {
      await old.destroy({ transaction });
    }
  }
}

module.exports = { parseMenuOptions, saveMenuOptions };
