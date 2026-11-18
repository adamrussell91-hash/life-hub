import assert from 'node:assert/strict';
import test from 'node:test';
import { withCors } from '../../netlify/functions/_shared/http.mjs';

const ALLOWED_ORIGIN = 'https://life-hub.adam-russell.com';
const FOREIGN_ORIGIN = 'https://foreign.example';

const requestFrom = origin =>
  new Request('https://api.example/api/anything', { headers: origin ? { origin } : {} });

/** The Vary a route's response carries once withCors has wrapped it. */
function varyAfterCors(routeVary, origin = ALLOWED_ORIGIN) {
  const response = new Response('{}', { headers: routeVary === null ? {} : { vary: routeVary } });
  return withCors(response, requestFrom(origin), {}).headers.get('vary');
}

test('withCors appends origin to a Vary the route set, keeping the route\'s own entries', () => {
  assert.equal(varyAfterCors('cookie'), 'cookie, origin');
  assert.equal(varyAfterCors('Cookie, Accept-Encoding'), 'Cookie, Accept-Encoding, origin');
});

test('withCors sets Vary: origin when the route set none', () => {
  assert.equal(varyAfterCors(null), 'origin');
});

test('withCors does not list origin twice, whatever its case or position', () => {
  assert.equal(varyAfterCors('origin'), 'origin');
  assert.equal(varyAfterCors('Origin'), 'Origin');
  assert.equal(varyAfterCors('cookie, Origin'), 'cookie, Origin');
  assert.equal(varyAfterCors('ORIGIN,cookie'), 'ORIGIN,cookie');
});

test('withCors leaves Vary: * alone', () => {
  assert.equal(varyAfterCors('*'), '*');
});

test('withCors adds nothing to Vary for a disallowed or absent origin', () => {
  assert.equal(varyAfterCors('cookie', FOREIGN_ORIGIN), 'cookie');
  assert.equal(varyAfterCors(null, FOREIGN_ORIGIN), null);
  assert.equal(varyAfterCors('cookie', null), 'cookie');
  assert.equal(varyAfterCors(null, null), null);
});

test('withCors still replaces the other CORS headers a route set', () => {
  const response = new Response('{}', {
    headers: { 'access-control-allow-origin': '*', 'access-control-allow-credentials': 'false' }
  });
  const wrapped = withCors(response, requestFrom(ALLOWED_ORIGIN), {});
  assert.equal(wrapped.headers.get('access-control-allow-origin'), ALLOWED_ORIGIN);
  assert.equal(wrapped.headers.get('access-control-allow-credentials'), 'true');
});
