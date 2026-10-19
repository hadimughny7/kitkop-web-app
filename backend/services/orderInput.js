const { fail } = require('./menuOptions');
const { priceAmount } = require('./menuPrices');

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const validId = value => {
  const numeric = typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value.trim()));
  return numeric && Number.isInteger(Number(value)) && Number(value) > 0 && Number(value) <= 2147483647;
};
const optionalText = (value, max, label) => {
  if (value !== undefined && value !== null && (typeof value !== 'string' || [...value].length > max)) {
    fail(`${label} harus berupa teks, maksimal ${max} karakter.`);
  }
};

// Validate the entire request before starting a transaction or writing any rows.
// Database-dependent rules (availability, option ownership, current price) remain
// in the controller; this function never trusts client prices or mutates input.
const validateOrderInput = body => {
  if (!record(body)) fail('Data pesanan harus berupa objek.');
  const { customer_name, customer_phone, customer_email, order_type, items, table_id } = body;
  if (!Array.isArray(items) || items.length === 0) fail('Pesanan harus memiliki minimal 1 item.');
  if (typeof customer_name !== 'string' || !customer_name.trim() || [...customer_name].length > 100) {
    fail('Nama pelanggan wajib berupa teks, maksimal 100 karakter.');
  }
  optionalText(customer_phone, 20, 'Nomor telepon');
  optionalText(customer_email, 100, 'Email');
  if (order_type !== undefined && order_type !== null && order_type !== '' && !['qr', 'kasir'].includes(order_type)) {
    fail('Jenis pesanan harus qr atau kasir.');
  }
  if (table_id !== undefined && table_id !== null && !validId(table_id)) fail('ID meja tidak valid.');

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const label = `Item pesanan ke-${index + 1}`;
    if (!record(item)) fail(`${label} harus berupa objek yang valid.`);
    if (!validId(item.menu_id)) fail(`${label}: ID menu tidak valid.`);
    if (!Number.isInteger(item.qty) || item.qty < 1 || item.qty > 999) fail(`${label}: jumlah harus bilangan bulat 1-999.`);
    if (item.notes !== undefined && item.notes !== null
      && (typeof item.notes !== 'string' || Buffer.byteLength(item.notes, 'utf8') > 65535)) {
      fail(`${label}: catatan harus berupa teks dan tidak melebihi kapasitas penyimpanan.`);
    }
    if (item.option_ids !== undefined && (!Array.isArray(item.option_ids) || item.option_ids.length > 1000
      || item.option_ids.some(id => typeof id !== 'string' || !/^[\w-]{1,64}$/.test(id))
      || new Set(item.option_ids).size !== item.option_ids.length)) {
      fail(`${label}: daftar pilihan tidak valid atau duplikat.`);
    }
    if (item.expected_price !== undefined) priceAmount(item.expected_price, 400, `${label}: harga`);
  }
  return body;
};

module.exports = { validateOrderInput };
