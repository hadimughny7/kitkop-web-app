import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStaffSummary, fetchAllOrders, getWibDate } from '../src/pages/dashboard/staffDashboardData.js';

const order = (id, overrides = {}) => ({
  id, total: '20000', status: 'confirmed', created_at: '2026-10-15T03:00:00Z',
  transaction: { status: 'paid', payment_method: 'CASH' }, items: [], ...overrides,
});
const summarize = (overrides = {}) => buildStaffSummary({ todayOrders: [], activeOrders: [], ...overrides });

test('daily totals exclude unpaid and cancelled orders and split payment methods case-insensitively', () => {
  const result = summarize({ todayOrders: [
    order(1), order(2, { total: '30000.50', transaction: { status: 'paid', payment_method: 'qris' } }),
    order(3, { total: '90000', transaction: { status: 'pending' }, status: 'pending' }),
    order(4, { status: 'cancelled' }),
    order(5, { total: '15000', transaction: { status: 'paid', payment_method: 'CARD' } }),
  ] });
  assert.equal(result.todayCount, 5);
  assert.equal(result.paidCount, 3);
  assert.equal(result.paidTotal, 65000.5);
  assert.equal(result.cashTotal, 20000);
  assert.equal(result.qrisTotal, 30000.5);
  assert.equal(result.otherTotal, 15000);
});

test('production queue includes only paid active orders, deduplicates orders and keeps yesterday backlog', () => {
  const early = order(1, { created_at: '2026-10-14T10:00:00Z', items: [
    { id: 11, qty: 3, item_type: 'minuman', status: 'pending', notes: 'Tanpa gula' },
    { id: 12, qty: 2, item_type: 'makanan', status: 'pending' },
    { id: 13, qty: 8, item_type: 'makanan', status: 'rejected', notes: 'Ditolak' },
  ] });
  const later = order(2, { status: 'preparing', items: [
    { id: 21, qty: 4, item_type: 'snack', status: 'preparing' },
    { id: 22, qty: 5, item_type: 'minuman', status: 'completed', notes: 'Sudah selesai' },
  ] });
  const result = summarize({ activeOrders: [later, early, early,
    order(3, { transaction: { status: 'pending' } }), order(4, { status: 'completed' }),
  ] });
  assert.deepEqual(result.queue.map((o) => o.id), [1, 2]);
  assert.equal(result.incomingCount, 1);
  assert.equal(result.preparingCount, 1);
});

test('completed order count excludes cancelled and still-processing orders', () => {
  const result = summarize({ todayOrders: [
    order(4, { status: 'completed' }), order(5, { status: 'preparing' }),
    order(6, { status: 'cancelled' }),
    order(7, { status: 'completed', updated_at: '2026-10-15T05:00:00Z' }),
    order(8, { status: 'completed', transaction: { status: 'pending' } }),
  ] });
  assert.equal(result.completedOrderCount, 2);
  assert.deepEqual(result.completedOrders.map((o) => o.id), [7, 4]);
});

test('empty operational data produces zero totals and empty queues', () => {
  const result = summarize();
  assert.equal(result.paidTotal, 0);
  assert.deepEqual(result.queue, []);
  assert.deepEqual(result.completedOrders, []);
});

test('daily query follows WIB midnight rather than the computer timezone', () => {
  assert.equal(getWibDate(new Date('2026-10-14T16:59:59Z')), '2026-10-14');
  assert.equal(getWibDate(new Date('2026-10-14T17:00:00Z')), '2026-10-15');
});

test('all pages are loaded so the dashboard is not silently limited to the first 100 orders', async () => {
  const requests = [];
  const result = await fetchAllOrders(async (params) => {
    requests.push(params);
    return { data: { data: params.page === 1 ? [order(1), order(2)] : [order(2), order(3)], pagination: { totalPages: 2 } } };
  }, { date: '2026-10-15' });
  assert.deepEqual(result.map((o) => o.id), [1, 2, 3]);
  assert.deepEqual(requests, [
    { date: '2026-10-15', page: 1, limit: 100 }, { date: '2026-10-15', page: 2, limit: 100 },
  ]);
});

test('a failed later page rejects the entire summary instead of showing a partial financial total', async () => {
  await assert.rejects(fetchAllOrders(async ({ page }) => {
    if (page === 2) throw new Error('Connection failed');
    return { data: { data: [order(1)], pagination: { totalPages: 2 } } };
  }, {}), /Connection failed/);
});
