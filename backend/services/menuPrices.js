// Matches DECIMAL(12, 2) used by menus, order items and order totals.
const MAX_PRICE = 9999999999.99;
const priceAmount = (value, statusCode = 400, label = 'Harga menu') => {
  const validType = typeof value === 'number'
    || (typeof value === 'string' && /^\+?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()));
  const amount = validType ? Number(value) : NaN;
  const rounded = Math.round(amount * 100) / 100;
  if (!Number.isFinite(amount) || amount < 0 || amount > MAX_PRICE
    || Math.abs(amount - rounded) > Number.EPSILON * Math.max(1, amount)) {
    throw Object.assign(new Error(`${label} harus berupa angka 0 sampai ${MAX_PRICE}, maksimal 2 angka desimal.`), { statusCode });
  }
  return rounded;
};

module.exports = { priceAmount, MAX_PRICE };
