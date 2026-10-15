import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCartItem, addCartLine, replaceCartLine, optionText, copyOptionTemplate } from '../src/utils/menuOptions.js';
const menu = { id: 1, name: 'Kopi susu', price: '20000' };
const ice = [{ group_id: 1, group_name: 'Penyajian', choice_id: 'ice', name: 'Ice', price: 2000 }];
const hot = [{ group_id: 1, group_name: 'Penyajian', choice_id: 'hot', name: 'Hot', price: 0 }];
test('plain menus merge while distinct configurations and notes remain separate', () => {
  let cart = addCartLine([], makeCartItem(menu));
  cart = addCartLine(cart, makeCartItem(menu));
  assert.equal(cart[0].qty, 2);
  cart = addCartLine(cart, makeCartItem(menu, ice));
  cart = addCartLine(cart, makeCartItem(menu, hot));
  cart = addCartLine(cart, makeCartItem(menu, ice, 'Untuk dibawa'));
  assert.equal(cart.length, 4);
  assert.equal(cart[1].price, 22000);
  assert.equal(optionText(cart[1]), 'Penyajian: Ice');
});
test('editing merges matching rows and preserves quantities', () => {
  const a = { ...makeCartItem(menu, ice), qty: 2 };
  const b = { ...makeCartItem(menu, hot), qty: 3 };
  const cart = replaceCartLine([a, b], a.line_id, makeCartItem(menu, hot));
  assert.equal(cart.length, 1);
  assert.equal(cart[0].qty, 5);
  assert.equal(cart[0].price, 20000);
});
test('changed prices do not silently merge with old cart lines', () => {
  const a = makeCartItem(menu, ice);
  const b = makeCartItem({ ...menu, price: 21000 }, ice);
  assert.equal(addCartLine([a], b).length, 2);
});

test('template copies keep their settings and ingredients but have independent identities', () => {
  const template = { id: 7, name: 'Penyajian', min_choices: 1, max_choices: 1, is_active: true,
    choices: [{ id: 'old-ice', name: 'Ice', price: 2000, is_available: true, is_default: false, ingredients: [{ raw_material_id: 2, quantity_used: 5 }] }] };
  const a = copyOptionTemplate(template);
  const b = copyOptionTemplate(template);
  assert.equal(a.id, undefined);
  assert.notEqual(a._editorId, b._editorId);
  assert.notEqual(a.choices[0].id, b.choices[0].id);
  assert.equal(a.choices[0].price, 2000);
  assert.equal(a.min_choices, 1);
  a.choices[0].ingredients[0].quantity_used = 20;
  assert.equal(template.choices[0].ingredients[0].quantity_used, 5);
  assert.equal(b.choices[0].ingredients[0].quantity_used, 5);
});
