const test = require('node:test');
const assert = require('node:assert/strict');
const { categoryItemType } = require('../services/categoryTypes');

test('category names determine food, drinks and snacks without database IDs', () => {
  for (const name of ['Coffee (Espresso Based)', 'Manual Brew', 'Non-Coffee', 'Kopi', 'Minuman Dingin', 'Minuman Panas', 'Tea', 'Teh', 'Juice', 'Matcha', 'Non Kopi']) assert.equal(categoryItemType(name), 'minuman', name);
  for (const name of ['Snack', 'Snacks', 'Camilan', 'Cemilan Goreng']) assert.equal(categoryItemType(name), 'snack', name);
  for (const name of ['Makanan', 'Main Course', 'Pastry & Bakery', 'Menu Spesial', 'Coffeehouse food', 'Snacking', '']) assert.equal(categoryItemType(name), 'makanan', name);
});

test('case, spacing and category punctuation do not change recognized names', () => {
  for (const name of [' NON-COFFEE ', 'non_coffee', 'Non / Coffee', '  MANUAL   BREW ', 'Ｃｏｆｆｅｅ']) assert.equal(categoryItemType(name), 'minuman');
  assert.equal(categoryItemType('  SNACK  '), 'snack');
});
