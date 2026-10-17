const test = require('node:test');
const assert = require('node:assert/strict');
const { priceAmount, MAX_PRICE } = require('../services/menuPrices');
const { resolveOptions } = require('../services/menuOptions');

test('prices accept zero and finite decimal amounts representable in the database', () => {
  for (const [input, expected] of [[0, 0], ['0', 0], ['0.00', 0], [0.01, 0.01], [' 25000.50 ', 25000.5], ['1e3', 1000], [MAX_PRICE, MAX_PRICE]]) {
    assert.equal(priceAmount(input), expected);
  }
});

test('prices reject negative, malformed, non-finite, coerced, excessive and overprecise values', () => {
  for (const value of [-100, '-100', -0.001, '-0.001', undefined, null, '', ' ', '5abc', 'NaN', 'Infinity', Infinity, -Infinity, NaN, true, false, [], [5], {}, '0x10', '1,000', 0.001, 1.234, 10000000000, '1e309']) {
    assert.throws(() => priceAmount(value), { statusCode: 400 });
    assert.throws(() => priceAmount(value, 409), { statusCode: 409 });
  }
});

test('persisted invalid add-on prices cannot offset a positive base price during checkout', () => {
  for (const price of [-100, 'bad', null, true, 0.001]) {
    const group = { id: 1, name: 'Extra', is_active: true, min_choices: 0, max_choices: 1, choices: [{ id: 'extra', name: 'Extra', price, is_available: true }] };
    assert.throws(() => resolveOptions([group], ['extra']), { statusCode: 409 });
    assert.equal(resolveOptions([group], []).extra, 0);
  }
});
