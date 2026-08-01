import assert from 'node:assert/strict';
import test from 'node:test';
import { tokenExpiryState } from '../../netlify/functions/_shared/provider-health.mjs';

test('token state becomes expiring fourteen Sydney dates before expiry', () => {
  assert.equal(tokenExpiryState('2026-08-15', '2026-08-01'), 'expiring');
  assert.equal(tokenExpiryState('2026-08-16', '2026-08-01'), 'healthy');
  assert.equal(tokenExpiryState('2026-07-31', '2026-08-01'), 'expired');
  assert.equal(tokenExpiryState('', '2026-08-01'), 'unknown');
});

test('token state handles same-day, leap-day, and malformed calendar dates', () => {
  assert.equal(tokenExpiryState('2026-08-01', '2026-08-01'), 'expiring');
  assert.equal(tokenExpiryState('2028-02-29', '2028-02-15'), 'expiring');
  assert.equal(tokenExpiryState('2028-02-30', '2028-02-15'), 'unknown');
  assert.equal(tokenExpiryState('secret expiry value', '2028-02-15'), 'unknown');
  assert.equal(tokenExpiryState('2028-02-29', 'not-a-date'), 'unknown');
});
