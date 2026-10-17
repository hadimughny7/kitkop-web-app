import test from 'node:test';
import assert from 'node:assert/strict';

test('tracking credentials stay scoped per order and survive a module reload through session storage', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  const values = new Map();
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { setItem: (key, value) => values.set(key, value), getItem: key => values.get(key) ?? null } });
  try {
    const first = await import('../src/services/orderTracking.js?storage-test');
    first.rememberOrderTracking({ order_number: 'A', tracking_token: 'token-A' });
    first.rememberOrderTracking({ order_number: 'B', tracking_token: 'token-B' });
    first.rememberOrderTracking({ order_number: 'C' });
    const reloaded = await import('../src/services/orderTracking.js?reloaded-test');
    assert.equal(reloaded.getOrderTrackingToken('A'), 'token-A');
    assert.equal(reloaded.getOrderTrackingToken('B'), 'token-B');
    assert.equal(reloaded.getOrderTrackingToken('C'), null);
  } finally {
    if (original) Object.defineProperty(globalThis, 'sessionStorage', original);
    else delete globalThis.sessionStorage;
  }
});

test('blocked session storage preserves checkout access in memory without granting other orders access', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get: () => { throw new Error('Storage blocked'); } });
  try {
    const tracking = await import('../src/services/orderTracking.js?blocked-storage-test');
    tracking.rememberOrderTracking({ order_number: 'A', tracking_token: 'token-A' });
    assert.equal(tracking.getOrderTrackingToken('A'), 'token-A');
    assert.equal(tracking.getOrderTrackingToken('B'), null);
  } finally {
    if (original) Object.defineProperty(globalThis, 'sessionStorage', original);
    else delete globalThis.sessionStorage;
  }
});
