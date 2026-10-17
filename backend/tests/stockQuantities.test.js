const test = require('node:test');
const assert = require('node:assert/strict');
const { stockQuantity, changedStock, MAX_STOCK } = require('../services/stockQuantities');

test('stock quantities accept exact zero, numeric strings and two-decimal fractions', () => {
  for (const [input, expected] of [[0, 0], ['0', 0], ['0.00', 0], [5, 5], ['5', 5], [' 5.25 ', 5.25], ['.5', 0.5], [0.1 + 0.2, 0.3], [MAX_STOCK, MAX_STOCK]]) {
    assert.equal(stockQuantity(input), expected);
  }
  assert.equal(stockQuantity('0.01', true), 0.01);
  for (const input of [0, '0', '0.00']) assert.throws(() => stockQuantity(input, true), { statusCode: 400 });
});

test('stock quantities reject partial strings, coercion, invalid bounds and silent decimal rounding', () => {
  for (const input of ['5abc', '5 gram', 'Infinity', 'NaN', '1e3', '1e-999', '0x10', '1,000', '', ' ', null, undefined, true, false, [], [5], {}, -1, '-1', Infinity, -Infinity, NaN, 10000000000, 0.001, 1.234, 1e-17, Number.MIN_VALUE]) {
    assert.throws(() => stockQuantity(input), { statusCode: 400 });
    assert.throws(() => stockQuantity(input, true), { statusCode: 400 });
  }
});

test('manual changes preserve hundredths, reject overflow and can replenish existing negative balances', () => {
  assert.equal(changedStock('0.30', -0.2), 0.1);
  assert.equal(changedStock(-5, 2), -3);
  assert.equal(changedStock(MAX_STOCK - 0.01, 0.01), MAX_STOCK);
  assert.throws(() => changedStock(MAX_STOCK, 0.01), { statusCode: 400 });
  assert.throws(() => changedStock('invalid', 1), { statusCode: 400 });
});
