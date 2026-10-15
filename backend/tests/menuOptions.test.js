const test = require('node:test');
const assert = require('node:assert/strict');
const { validateGroup, resolveOptions, buildStockUsage } = require('../services/menuOptions');
const choice = (id, overrides = {}) => ({ id, name: id, price: 0, is_available: true, ...overrides });
const group = (overrides = {}) => ({ id: 1, name: 'Penyajian', min_choices: 1, max_choices: 1, is_active: true, choices: [choice('ice'), choice('hot')], ...overrides });

test('menus without groups accept plain orders but reject foreign selections', () => {
  assert.deepEqual(resolveOptions([]), { selections: [], extra: 0 });
  assert.throws(() => resolveOptions([], ['ice']), /bukan milik/);
});
test('required, maximum, duplicate, inactive and unavailable options are validated', () => {
  assert.throws(() => resolveOptions([group()]), /Penyajian/);
  assert.throws(() => resolveOptions([group()], ['ice', 'hot']), /Penyajian/);
  assert.throws(() => resolveOptions([group()], ['ice', 'ice']), /duplikat/);
  assert.throws(() => resolveOptions([group({ is_active: false })], ['ice']), /bukan milik/);
  assert.throws(() => resolveOptions([group({ choices: [choice('ice', { is_available: false })] })], ['ice']), /tidak tersedia/);
});
test('optional multi-choice prices and ingredients are snapshotted from server definitions', () => {
  const g = group({ min_choices: 0, max_choices: 2, choices: [choice('shot', { price: 5000.25, ingredients: [{ raw_material_id: 1, quantity_used: 18 }] }), choice('syrup', { price: 2000.50 })] });
  assert.equal(resolveOptions([g], []).extra, 0);
  const result = resolveOptions([g], ['shot', 'syrup']);
  assert.equal(result.extra, 7000.75);
  assert.equal(result.selections[0].group_name, 'Penyajian');
  const usage = buildStockUsage([{ raw_material_id: 1, quantity_used: 18 }, { raw_material_id: 2, quantity_used: 100 }], result.selections);
  assert.deepEqual(usage, [{ raw_material_id: 1, quantity_used: 36 }, { raw_material_id: 2, quantity_used: 100 }]);
});
test('group settings reject invalid bounds, prices, default selections and recipes', () => {
  assert.equal(validateGroup(group()).min_choices, 1);
  for (const patch of [{ min_choices: 2, max_choices: 1 }, { max_choices: -1 }, { max_choices: null }, { max_choices: '' }, { choices: [] }, { choices: [choice('x', { price: -1 })] }, { choices: [choice('x', { price: 'no' })] }, { choices: [choice('x', { is_default: true, is_available: false })] }, { choices: [choice('x', { ingredients: [{ raw_material_id: 2, quantity_used: -1 }] })] }, { choices: [choice('x'), choice('x')] }]) {
    assert.throws(() => validateGroup(group(patch)));
  }
});

test('unlimited options allow all available choices and defaults while preserving required and availability rules', () => {
  const choices = Array.from({ length: 50 }, (_, i) => choice(`extra-${i}`, { price: 100, is_default: true }));
  const unlimited = { ...validateGroup(group({ min_choices: 0, max_choices: 0, choices })), id: 1 };
  assert.equal(unlimited.max_choices, 0);
  assert.equal(resolveOptions([unlimited], choices.map((c) => c.id)).extra, 5000);
  assert.equal(resolveOptions([unlimited], []).selections.length, 0);
  assert.throws(() => resolveOptions([{ ...unlimited, min_choices: 1 }], []), /minimal 1/);
  assert.throws(() => resolveOptions([{ ...unlimited, choices: [choice('sold-out', { is_available: false })] }], ['sold-out']), /tidak tersedia/);
  assert.equal(resolveOptions(Array.from({ length: 3 }, (_, i) => ({ ...unlimited, id: i, choices: choices.map((c) => ({ ...c, id: `${i}-${c.id}` })) })), Array.from({ length: 3 }, (_, i) => choices.map((c) => `${i}-${c.id}`)).flat()).selections.length, 150);
});
