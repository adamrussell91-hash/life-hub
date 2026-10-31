import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UMBRELLA_APP_ORIGINS,
  allowedRequestOrigins,
  isAllowedRequestOrigin
} from '../../netlify/functions/_shared/umbrella-origins.mjs';

test('umbrella origins include Life, Teaching, Knowledge, and Tasks Pages', () => {
  assert.deepEqual(UMBRELLA_APP_ORIGINS, [
    'https://life-hub.adam-russell.com',
    'https://class.adam-russell.com',
    'https://teaching-hub.adam-russell.com',
    'https://knowledge-hub.adam-russell.com',
    'https://tasks-hub.adam-russell.com'
  ]);
});

test('SITE_ORIGIN is allowed alongside the built-in app origins', () => {
  const origins = allowedRequestOrigins({ SITE_ORIGIN: 'https://preview.example' });
  assert.ok(origins.includes('https://preview.example'));
  assert.ok(origins.includes('https://teaching-hub.adam-russell.com'));
});

test('foreign origins stay rejected', () => {
  assert.equal(isAllowedRequestOrigin('https://foreign.example', {}), false);
  assert.equal(isAllowedRequestOrigin('https://class.adam-russell.com', {}), true);
  assert.equal(isAllowedRequestOrigin('https://teaching-hub.adam-russell.com', {}), true);
  assert.equal(isAllowedRequestOrigin('https://knowledge-hub.adam-russell.com', {}), true);
  assert.equal(isAllowedRequestOrigin('https://tasks-hub.adam-russell.com', {}), true);
});

test('the class host never carries or changes the owner session', async () => {
  const { readUmbrellaSessionCookie, withCors } = await import('../../netlify/functions/_shared/http.mjs');
  const cookie = 'life_hub_session=tok';
  const fromClass = new Request('https://api.adam-russell.com/api/session', {
    headers: { origin: 'https://class.adam-russell.com', cookie }
  });
  const fromHub = new Request('https://api.adam-russell.com/api/session', {
    headers: { origin: 'https://life-hub.adam-russell.com', cookie }
  });
  assert.equal(readUmbrellaSessionCookie(fromClass), null);
  assert.equal(readUmbrellaSessionCookie(fromHub), 'tok');

  const clearing = new Response('{}', { status: 401, headers: { 'set-cookie': 'life_hub_session=; Max-Age=0' } });
  assert.equal(withCors(clearing, fromClass, {}).headers.get('set-cookie'), null);
  assert.ok(withCors(clearing, fromHub, {}).headers.get('set-cookie'));
  assert.equal(withCors(clearing, fromClass, {}).headers.get('access-control-allow-origin'), 'https://class.adam-russell.com');
});
