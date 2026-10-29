import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmbedResolveHandler, resolveMapsShortLink } from '../../netlify/functions/embed-resolve.mjs';

const redirect = (location) => new Response(null, { status: 302, headers: { location } });

test('follows a Maps Share link to the full google.com/maps address', async () => {
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(url);
    return redirect('https://www.google.com/maps/place/Sydney/@-33.86,151.2,12z?entry=tts');
  };
  assert.equal(await resolveMapsShortLink('https://maps.app.goo.gl/AbC123', fetchImpl), 'https://www.google.com/maps/place/Sydney/@-33.86,151.2,12z?entry=tts');
  assert.deepEqual(seen, ['https://maps.app.goo.gl/AbC123']);
});

test('only fetches Maps Share links and stops when a hop leaves Google', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return redirect('https://evil.example/maps'); };
  assert.equal(await resolveMapsShortLink('https://example.com/maps', fetchImpl), null);
  assert.equal(await resolveMapsShortLink('http://maps.app.goo.gl/AbC', fetchImpl), null);
  assert.equal(calls, 0);
  assert.equal(await resolveMapsShortLink('https://maps.app.goo.gl/AbC', fetchImpl), null);
  assert.equal(calls, 1);
});

test('handler needs the operator session and answers 422 when a link will not open', async () => {
  const origin = 'https://life-hub.adam-russell.com';
  const env = { SITE_ORIGIN: origin, SESSION_SECRET: 'x'.repeat(32), LIFE_HUB_PASSPHRASE_HASH: 'y' };
  const req = (url) => new Request(`https://api.example/api/embed/resolve?url=${encodeURIComponent(url)}`, { headers: { origin, cookie: 'umbrella_session=ok' } });
  const ok = createEmbedResolveHandler({ env, verifySessionToken: () => ({ valid: true }), fetchImpl: async () => redirect('https://www.google.com/maps/place/Sydney') });
  const res = await ok(req('https://maps.app.goo.gl/AbC'));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).data.url, 'https://www.google.com/maps/place/Sydney');
  const dead = createEmbedResolveHandler({ env, verifySessionToken: () => ({ valid: true }), fetchImpl: async () => new Response('nope', { status: 404 }) });
  assert.equal((await dead(req('https://maps.app.goo.gl/AbC'))).status, 422);
  const out = createEmbedResolveHandler({ env, verifySessionToken: () => ({ valid: false }) });
  assert.equal((await out(req('https://maps.app.goo.gl/AbC'))).status, 401);
});
