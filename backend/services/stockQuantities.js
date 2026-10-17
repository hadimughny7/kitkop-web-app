// RawMaterial.stock/min_stock and StockLog.change_qty use DECIMAL(12, 2).
const MAX_STOCK = 9999999999.99;
const stockQuantity = (value, positive = false, label = 'Jumlah stok') => {
  const validType = typeof value === 'number'
    || (typeof value === 'string' && /^\+?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()));
  const quantity = validType ? Number(value) : NaN;
  const cents = quantity * 100;
  if (!Number.isFinite(quantity) || quantity < (positive ? 0.01 : 0) || quantity > MAX_STOCK
    || Math.abs(cents - Math.round(cents)) > Number.EPSILON * Math.abs(cents) * 2) {
    throw Object.assign(new Error(`${label} harus berupa angka ${positive ? '0.01' : '0'} sampai ${MAX_STOCK}, maksimal 2 angka desimal.`), { statusCode: 400 });
  }
  return Math.round(cents) / 100;
};

// Work in hundredths so repeated fractional changes match their DECIMAL logs.
// Existing negative balances from automatic deductions may be restocked; this
// does not change the payment policy that can consume stock below zero.
const changedStock = (current, change) => {
  const cents = Math.round(Number(current) * 100) + Math.round(change * 100);
  if (!Number.isSafeInteger(cents) || Math.abs(cents) > Math.round(MAX_STOCK * 100)) {
    throw Object.assign(new Error('Hasil perubahan stok melebihi batas penyimpanan bahan.'), { statusCode: 400 });
  }
  return cents / 100;
};

module.exports = { stockQuantity, changedStock, MAX_STOCK };
