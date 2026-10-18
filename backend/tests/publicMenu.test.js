const test = require('node:test');
const assert = require('node:assert/strict');
const publicMenu = require('../services/publicMenu');

test('public menu serialization excludes internal relations and nested choice metadata without mutating its source', () => {
  const privateRecipe = { raw_material_id: 8, quantity_used: 5, rawMaterial: { stock: 777, name: 'PRIVATE_INGREDIENT' } };
  const source = {
    id: 1, category_id: 2, name: 'Kopi', description: 'Public description', price: '10000.00', image: null, is_available: 1,
    recipes: [privateRecipe], rawMaterials: [privateRecipe.rawMaterial], stock: 777,
    category: { id: 2, name: 'Kopi', recipes: [privateRecipe], internal: { stock: 777 } },
    optionGroups: [{
      id: 3, name: 'Tambahan', min_choices: 0, max_choices: 0, is_active: true,
      recipes: [privateRecipe], MenuOptionGroup: { sort_order: 1, internal: privateRecipe },
      choices: [{ id: 'shot', name: 'Extra shot', price: 500, is_available: true, is_default: false,
        ingredients: [privateRecipe], rawMaterial: privateRecipe.rawMaterial, internal_metadata: { nested: privateRecipe } }],
    }],
  };
  const before = structuredClone(source);
  const result = publicMenu({ toJSON: () => source });
  assert.deepEqual(result, {
    id: 1, category_id: 2, name: 'Kopi', description: 'Public description', price: '10000.00', image: null, is_available: 1,
    category: { id: 2, name: 'Kopi' },
    optionGroups: [{ id: 3, name: 'Tambahan', min_choices: 0, max_choices: 0, is_active: true,
      choices: [{ id: 'shot', name: 'Extra shot', price: 500, is_available: true, is_default: false }] }],
  });
  assert.equal(JSON.stringify(result).includes('PRIVATE_INGREDIENT'), false);
  assert.deepEqual(source, before);
});

test('public options retain display order and rules but cannot carry objects through scalar fields', () => {
  const result = publicMenu({ id: 1, name: 'Kopi', optionGroups: [
    { id: 2, name: 'Second', max_choices: 1, MenuOptionGroup: { sort_order: 2 }, choices: [{ id: 'hot', name: { stock: 777 }, price: { rawMaterial: 'private' }, is_available: true }] },
    { id: 1, name: 'First', max_choices: 0, MenuOptionGroup: { sort_order: 0 }, choices: [] },
  ] });
  assert.deepEqual(result.optionGroups.map(group => group.id), [1, 2]);
  assert.equal(result.optionGroups[0].max_choices, 0);
  assert.deepEqual(result.optionGroups[1].choices, [{ id: 'hot', is_available: true }]);
  assert.deepEqual(publicMenu({ id: 1, name: 'Plain', category: null }).optionGroups, []);
});
