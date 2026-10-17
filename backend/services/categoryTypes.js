const ITEM_TYPES = ['makanan', 'minuman', 'snack'];
const categoryItemType = (value, statusCode = 400) => {
  if (!ITEM_TYPES.includes(value)) {
    throw Object.assign(new Error('Jenis kategori harus Makanan, Minuman, atau Snack. Tentukan jenis kategori sebelum memesan.'), { statusCode });
  }
  return value;
};

// Exact known names only, for the one-time migration of old categories.
// Unknown names remain unconfigured for the manager to classify explicitly.
const legacyTypes = new Map([
  ['coffee (espresso based)', 'minuman'], ['manual brew', 'minuman'], ['non-coffee', 'minuman'],
  ['pastry & bakery', 'makanan'], ['main course', 'makanan'], ['snack', 'snack'],
  ['makanan', 'makanan'], ['minuman', 'minuman'],
]);
const legacyCategoryType = name => legacyTypes.get(String(name).trim().toLowerCase()) || null;

module.exports = { ITEM_TYPES, categoryItemType, legacyCategoryType };
