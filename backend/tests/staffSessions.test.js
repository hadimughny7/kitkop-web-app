const test = require('node:test');
const assert = require('node:assert/strict');
const { sessionMatches } = require('../services/staffSessions');

test('legacy tokens are accepted only before the first password reset', () => {
  assert.equal(sessionMatches({}, { session_version: 0 }), true);
  assert.equal(sessionMatches({}, { session_version: 1 }), false);
  assert.equal(sessionMatches({ sessionVersion: 0 }, { session_version: 0 }), true);
  assert.equal(sessionMatches({ sessionVersion: 1 }, { session_version: 1 }), true);
  assert.equal(sessionMatches({ sessionVersion: 1 }, { session_version: 2 }), false);
});

test('malformed session versions never match an account', () => {
  for (const claims of [null, undefined, 'token', []]) assert.equal(sessionMatches(claims, { session_version: 0 }), false);
  for (const sessionVersion of [null, '', '0', true, false, [], {}, -1, 0.5, Infinity, NaN]) {
    assert.equal(sessionMatches({ sessionVersion }, { session_version: 0 }), false);
  }
  for (const session_version of [undefined, null, '0', -1]) assert.equal(sessionMatches({}, { session_version }), false);
});
