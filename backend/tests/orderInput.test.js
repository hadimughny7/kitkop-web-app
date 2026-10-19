const test = require('node:test');
const assert = require('node:assert/strict');
const { validateOrderInput } = require('../services/orderInput');

const valid = () => ({ customer_name: 'Guest', items: [{ menu_id: 1, qty: 1 }] });
const rejects = body => assert.throws(() => validateOrderInput(body), error => error.statusCode === 400);

test('order input requires an object and a nonempty items array', () => {
  for (const body of [undefined, null, [], true, false, 1, 'order', new Date(), {}]) rejects(body);
  for (const items of [undefined, null, [], {}, true, 1, 'items']) rejects({ ...valid(), items });
});

test('every item must be a record with a positive ID and integer quantity', () => {
  for (const item of [undefined, null, [], [1], true, false, 1, 'item', new Date(), {}]) {
    rejects({ ...valid(), items: [item] });
    rejects({ ...valid(), items: [valid().items[0], item] });
  }
  rejects({ ...valid(), items: new Array(1) });
  for (const menu_id of [undefined, null, true, false, [], [1], {}, 0, -1, 1.5, 2147483648, Infinity, '', '1abc', '0x1', '1e0']) {
    rejects({ ...valid(), items: [{ menu_id, qty: 1 }] });
  }
  for (const qty of [undefined, null, true, [], {}, '1', 0, -1, 1.5, 1000, Infinity]) {
    rejects({ ...valid(), items: [{ menu_id: 1, qty }] });
  }
});

test('options, notes and expected prices reject malformed types before database access', () => {
  for (const option_ids of [null, {}, true, 'ice', [null], [[]], [1], [''], ['a b'], ['a'.repeat(65)], ['ice', 'ice'], new Array(1001).fill('ice')]) {
    rejects({ ...valid(), items: [{ ...valid().items[0], option_ids }] });
  }
  for (const notes of [[], {}, true, 1, 'a'.repeat(65536), '☕'.repeat(21846)]) {
    rejects({ ...valid(), items: [{ ...valid().items[0], notes }] });
  }
  for (const expected_price of [null, [], {}, true, '', '5abc', -1, Infinity, NaN, 0.001]) {
    rejects({ ...valid(), items: [{ ...valid().items[0], expected_price }] });
  }
});

test('customer fields, table IDs and order types cannot be coerced from arrays or objects', () => {
  for (const customer_name of [undefined, null, '', '   ', [], {}, true, 1, 'a'.repeat(101)]) rejects({ ...valid(), customer_name });
  for (const field of ['customer_phone', 'customer_email']) {
    for (const value of [[], {}, true, 1, 'a'.repeat(field === 'customer_phone' ? 21 : 101)]) rejects({ ...valid(), [field]: value });
  }
  for (const order_type of [[], {}, true, false, 0, 'unknown']) rejects({ ...valid(), order_type });
  for (const table_id of [[], {}, true, false, '', 0, -1, 1.2, '1abc']) rejects({ ...valid(), table_id });
});

test('valid guest/POS inputs keep optional contacts, numeric-string IDs, zero prices and notes without mutation', () => {
  for (const order_type of [undefined, null, '', 'qr', 'kasir']) {
    const body = { ...valid(), order_type, table_id: ' 1 ', customer_phone: null, customer_email: '', items: [
      { menu_id: '1', qty: 999, option_ids: ['ice'], notes: null, expected_price: '0.00' },
      { menu_id: 2, qty: 1, notes: 'a'.repeat(65535) },
    ] };
    const before = structuredClone(body);
    assert.equal(validateOrderInput(body), body); assert.deepEqual(body, before);
  }
});
