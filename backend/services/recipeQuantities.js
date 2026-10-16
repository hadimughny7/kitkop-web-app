// Recipes and stock are stored with two decimal places in MySQL.
const positiveQuantity = (value, statusCode, maximum) => {
  const validType = typeof value === 'number'
    || (typeof value === 'string' && /^\+?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()));
  const quantity = validType ? Number(value) : NaN;
  if (!Number.isFinite(quantity) || quantity < 0.01 || quantity > maximum
    || Math.abs(quantity - Math.round(quantity * 100) / 100) > Number.EPSILON * Math.max(1, quantity)) {
    throw Object.assign(new Error(`Jumlah bahan resep harus berupa angka positif 0.01–${maximum}, maksimal 2 angka desimal.`), { statusCode });
  }
  return quantity;
};

const recipeQuantity = (value, statusCode = 400) => positiveQuantity(value, statusCode, 99999999.99);
// A snapshot can combine a base recipe and several add-ons for the same material.
const stockUsageQuantity = value => positiveQuantity(value, 409, 9999999999.99);

module.exports = { recipeQuantity, stockUsageQuantity };
