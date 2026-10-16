const axios = require('axios');
const { randomUUID } = require('node:crypto');
const { sequelize } = require('../config/database');
const { Order, Transaction, QrisAttempt } = require('../models');
const { fail } = require('./menuOptions');

const deadline = order => new Date(order.created_at).getTime() + 10 * 60 * 1000;
const isMock = trx => /^KTK-MOCK-/i.test(trx.ref_id || '') || /^mock-/i.test(trx.qris_content || '');
const httpUrl = value => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? value : null; } catch { return null; }
};
const qrString = value => typeof value === 'string' && value.startsWith('000201') && value.length >= 20 && value.length <= 10000 ? value : null;
const inFlight = attempt => attempt?.status === 'creating' && Date.now() - new Date(attempt.updated_at).getTime() < 30000;
const ready = (trx, attempt, order) => trx.status === 'pending' && trx.payment_method === 'QRIS'
  && attempt?.source === 'gateway' && attempt.ref_id === trx.ref_id && attempt.status === 'pending'
  && attempt.trx_id && (httpUrl(attempt.qr_url) || qrString(attempt.qr_string))
  && new Date(attempt.expires_at).getTime() > Date.now() && order.status === 'pending' && deadline(order) > Date.now();

const paymentData = (trx, attempt, order) => {
  const usable = Boolean(ready(trx, attempt, order));
  const paid = trx.status === 'paid';
  const creating = !paid && inFlight(attempt);
  const mock = isMock(trx) || attempt?.source === 'legacy-mock';
  const expired = new Date(attempt?.expires_at || 0).getTime() <= Date.now();
  const state = paid ? 'paid' : usable ? 'ready' : creating ? 'creating' : mock ? 'mock'
    : attempt?.status === 'unknown' || attempt?.status === 'creating' ? 'unknown'
      : trx.status === 'expired' || (attempt && expired) ? 'expired' : 'failed';
  return {
    transaction_id: trx.id, ref_id: trx.ref_id, trx_id: trx.trx_id,
    amount: Number(trx.amount), total_bayar: Number(trx.amount), status: trx.status,
    payment_method: trx.payment_method, paid_at: trx.paid_at,
    source: mock ? 'legacy-mock' : attempt ? 'gateway' : 'unverified', qris_state: state,
    qr_url: usable ? httpUrl(attempt.qr_url) : null,
    qr_string: usable ? qrString(attempt.qr_string) : null,
    qris_content: usable ? httpUrl(attempt.qr_url) || qrString(attempt.qr_string) : null,
    pay_url: usable ? httpUrl(attempt.pay_url) : null,
    expires_at: attempt?.expires_at || null,
    can_retry: !paid && !usable && !creating && order.status === 'pending' && deadline(order) > Date.now(),
    retry_after: creating ? 2 : null,
  };
};

const currentAttempt = (trx, transaction) => trx
  ? QrisAttempt.findOne({ where: { transaction_id: trx.id, ref_id: trx.ref_id }, transaction }) : null;

const prepare = orderId => sequelize.transaction(async transaction => {
  const order = await Order.findByPk(orderId, { transaction, lock: transaction.LOCK.UPDATE });
  if (!order) fail('Pesanan tidak ditemukan.', 404);
  let trx = await Transaction.findOne({ where: { order_id: order.id }, transaction, lock: transaction.LOCK.UPDATE });
  let attempt = await currentAttempt(trx, transaction);
  if (trx?.status === 'paid') return { data: paymentData(trx, attempt, order) };
  if (order.status !== 'pending' || deadline(order) <= Date.now()) fail('Pesanan sudah tidak dapat dibuatkan QRIS baru.', 409);
  if (trx && (ready(trx, attempt, order) || inFlight(attempt))) return { data: paymentData(trx, attempt, order), busy: inFlight(attempt) };
  const amount = Math.round(Number(order.total));
  if (!Number.isFinite(amount) || amount < 100 || amount > 9999999999) fail('Nominal QRIS tidak valid.');
  if (!process.env.KUYZPAY_MERCHANT_ID || !process.env.KUYZPAY_SECRET) fail('Layanan QRIS belum dikonfigurasi.', 503);

  if (trx && !attempt && trx.payment_method === 'QRIS') {
    // Keep legacy references too: a retry must not lose a later provider callback.
    attempt = await QrisAttempt.create({ transaction_id: trx.id, ref_id: trx.ref_id, trx_id: trx.trx_id,
      source: isMock(trx) ? 'legacy-mock' : 'gateway', amount: trx.amount,
      status: trx.status === 'expired' ? 'expired' : 'failed', expires_at: new Date(Math.min(deadline(order), new Date(trx.created_at).getTime() + 600000)),
    }, { transaction });
  }
  // A timeout may have created an invoice remotely. Retry its same idempotent ref.
  const uncertain = attempt?.source === 'gateway' && ['unknown', 'creating'].includes(attempt.status)
    && new Date(attempt.expires_at).getTime() > Date.now();
  const ref = uncertain ? attempt.ref_id : `KTK-${order.id}-${randomUUID().replace(/-/g, '').slice(0, 24)}`;
  const values = { ref_id: ref, trx_id: null, amount, status: 'pending', payment_method: 'QRIS', qris_content: null, pay_url: null };
  if (trx) await trx.update(values, { transaction });
  else trx = await Transaction.create({ order_id: order.id, ...values }, { transaction });
  if (uncertain) await attempt.update({ status: 'creating' }, { transaction });
  else attempt = await QrisAttempt.create({ transaction_id: trx.id, ref_id: ref, amount, status: 'creating', expires_at: new Date(deadline(order)) }, { transaction });
  return { attempt: attempt.toJSON(), orderId: order.id, amount };
});

const parseGateway = (body, attempt, amount) => {
  const data = body?.data;
  if (![1, 'Success'].includes(body?.status) || !data || typeof data !== 'object') throw new Error('Gateway rejected request');
  if (['Success', 'Completed', 'PaidLate'].includes(data.status)) throw Object.assign(new Error('Awaiting payment confirmation'), { uncertain: true });
  if (data.status !== undefined && !['Unpaid', 'Pending'].includes(data.status)) throw new Error('Inactive gateway invoice');
  const ref = data.ref_id || data.reff_id;
  const expiry = data.expired_ts != null ? Number(data.expired_ts) * 1000
    : typeof data.expired_at === 'string' ? new Date(data.expired_at.includes('T') ? data.expired_at : data.expired_at.replace(' ', 'T') + '+07:00').getTime() : NaN;
  const total = typeof data.total_bayar === 'number' || typeof data.total_bayar === 'string' ? Number(data.total_bayar) : NaN;
  if (ref !== attempt.ref_id || typeof data.trx_id !== 'string' || !data.trx_id.trim() || data.trx_id.length > 100
    || !Number.isFinite(total) || total < amount || total > 9999999999.99
    || !Number.isFinite(expiry) || expiry <= Date.now() || !(httpUrl(data.qr_link) || qrString(data.qr_string))) throw new Error('Invalid gateway invoice');
  return { trx_id: data.trx_id, amount: total, qr_url: httpUrl(data.qr_link), qr_string: qrString(data.qr_string),
    pay_url: httpUrl(data.pay_url), expires_at: new Date(Math.min(expiry, new Date(attempt.expires_at).getTime())) };
};

const createOrReuseQris = async orderId => {
  const reserved = await prepare(orderId);
  if (reserved.data) return { data: reserved.data, httpStatus: reserved.busy ? 202 : 200 };
  let invoice, failure;
  try {
    const response = await axios.post(`${process.env.KUYZPAY_BASE_URL || 'https://api.kuyzpay.xyz/api/v1'}/order`, {
      merchant_id: process.env.KUYZPAY_MERCHANT_ID, secret: process.env.KUYZPAY_SECRET,
      ref_id: reserved.attempt.ref_id, amount: reserved.amount, channel: 'QRIS', customer_name: 'Customer',
      expire_minutes: Math.max(1, Math.ceil((new Date(reserved.attempt.expires_at).getTime() - Date.now()) / 60000)),
    }, { timeout: 15000, headers: { 'Content-Type': 'application/json' } });
    invoice = parseGateway(response.data, reserved.attempt, reserved.amount);
  } catch (error) {
    failure = error.uncertain || (!error.response && error.isAxiosError) ? 'unknown' : 'failed';
  }
  const result = await sequelize.transaction(async transaction => {
    const order = await Order.findByPk(reserved.orderId, { transaction, lock: transaction.LOCK.UPDATE });
    const trx = await Transaction.findByPk(reserved.attempt.transaction_id, { transaction, lock: transaction.LOCK.UPDATE });
    const attempt = await QrisAttempt.findByPk(reserved.attempt.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (invoice) await attempt.update({ ...invoice, status: attempt.status === 'paid' ? 'paid' : 'pending' }, { transaction });
    else if (attempt.status !== 'paid') await attempt.update({ status: failure }, { transaction });
    // Cash/callback/cancellation may have finished while the gateway was responding.
    if (trx.status !== 'paid' && trx.ref_id === attempt.ref_id && order.status === 'pending' && deadline(order) > Date.now()) {
      await trx.update(invoice ? { trx_id: invoice.trx_id, amount: invoice.amount, qris_content: invoice.qr_url || invoice.qr_string, pay_url: invoice.pay_url, status: 'pending' }
        : { status: 'failed', qris_content: null, pay_url: null }, { transaction });
    }
    if (invoice && trx.status === 'paid' && trx.payment_method === 'QRIS' && attempt.status === 'paid'
      && (trx.trx_id === invoice.trx_id || (!trx.trx_id && trx.ref_id === attempt.ref_id))) {
      await trx.update({ amount: invoice.amount, trx_id: invoice.trx_id }, { transaction });
    }
    return paymentData(trx, await currentAttempt(trx, transaction), order);
  });
  if (failure && result.status !== 'paid') fail('QRIS belum dapat dibuat. Silakan coba lagi atau hubungi kasir.', 502);
  return { data: result, httpStatus: 200 };
};

module.exports = { createOrReuseQris, currentAttempt, paymentData };
