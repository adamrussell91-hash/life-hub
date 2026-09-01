import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UMBRELLA_APP_ORIGINS,
  allowedRequestOrigins,
  isAllowedRequestOrigin
} from '../../netlify/functions/_shared/umbrella-origins.mjs';

test('umbrella origins include Life and Teaching Pages', () => {
  assert.deepEqual(UMBRELLA_APP_ORIGINS, [
    'https://life-hub.adam-russell.com',
    'https://teaching-hub.adam-russell.com'
  ]);
});

test('SITE_ORIGIN is allowed alongside the built-in app origins', () => {
  const origins = allowedRequestOrigins({ SITE_ORIGIN: 'https://preview.example' });
  assert.ok(origins.includes('https://preview.example'));
  assert.ok(origins.includes('https://teaching-hub.adam-russell.com'));
});

test('foreign origins stay rejected', () => {
  assert.equal(isAllowedRequestOrigin('https://foreign.example', {}), false);
  assert.equal(isAllowedRequestOrigin('https://teaching-hub.adam-russell.com', {}), true);
});
