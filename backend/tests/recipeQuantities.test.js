const test = require('node:test');
const assert = require('node:assert/strict');
const { recipeQuantity } = require('../services/recipeQuantities');
const { buildStockUsage, validateGroup } = require('../services/menuOptions');

test('recipe quantities accept positive decimal amounts without coercing invalid values', () => {
  for (const value of [0.01, 0.29, 0.5, 1, 18.25, '0.50', ' 18.25 ', '1e-2', 99999999.99]) {
    assert.equal(recipeQuantity(value), Number(value));
  }
  for (const value of [-5, '-5', 0, '0', '', ' ', null, undefined, NaN, Infinity, 'Infinity', 'abc', '5grams', '0x10', '0,5', true, false, [], [1], {}, 0.001, 0.005, 1.234, 100000000]) {
    assert.throws(() => recipeQuantity(value), error => error.statusCode === 400, String(value));
  }
});

test('invalid recipe ingredients cannot be hidden by aggregation or add-ons', () => {
  const base = [{ raw_material_id: 1, quantity_used: 10 }];
  for (const quantity_used of [-5, 0, 'abc', true]) {
    assert.throws(() => buildStockUsage([...base, { raw_material_id: 1, quantity_used }], []), error => error.statusCode === 409);
    assert.throws(() => buildStockUsage(base, [{ ingredients: [{ raw_material_id: 1, quantity_used }] }]), error => error.statusCode === 409);
    assert.throws(() => validateGroup({ name: 'Extra', min_choices: 0, max_choices: 1, choices: [
      { id: 'extra', name: 'Extra', price: 0, ingredients: [{ raw_material_id: 1, quantity_used }] },
    ] }), error => error.statusCode === 400);
  }
  assert.deepEqual(buildStockUsage([], []), []);
  assert.deepEqual(buildStockUsage([{ raw_material_id: 1, quantity_used: '0.29' }], [{ ingredients: [{ raw_material_id: 1, quantity_used: 0.5 }] }]), [
    { raw_material_id: 1, quantity_used: 0.79 },
  ]);
});
