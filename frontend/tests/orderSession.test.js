import test from 'node:test';
import assert from 'node:assert/strict';

test('order session survives reload and does not replace the stored token with missing/error values', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } });
  try {
    const first = await import('../src/services/orderSession.js?first');
    first.rememberOrderSession('signed-session-fixture');
    for (const invalid of [undefined, null, '', {}, 'a'.repeat(2049)]) first.rememberOrderSession(invalid);
    const reloaded = await import('../src/services/orderSession.js?reload');
    assert.equal(reloaded.getOrderSessionToken(), 'signed-session-fixture');
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
});

test('blocked browser storage retains one session in memory for subsequent order submissions', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new Error('Storage blocked'); } });
  try {
    const session = await import('../src/services/orderSession.js?blocked');
    assert.equal(session.getOrderSessionToken(), null);
    session.rememberOrderSession('signed-session-fixture');
    assert.equal(session.getOrderSessionToken(), 'signed-session-fixture');
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
});
