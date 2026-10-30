import test from 'node:test';
import assert from 'node:assert/strict';
import { CREST_DIR, createOrgCrestImageHandler, crestManifest } from '../../netlify/functions/org-crest-image.mjs';

const env = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: 'x'.repeat(32) };
const signedIn = { verifySessionToken: () => ({ valid: true }) };
const req = (url, init) => new Request(`https://example.test${url}`, init);

// Invented organisations only.
const REF = 'shared:organisation:organisation_0000aaaa-1111-2222-3333-444455556666';
const MANIFEST = { [REF]: 'example-college-0000aaaa.png', 'shared:organisation:bad': 'x.png', [`${REF}0`]: '../escape.png' };
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function handler({ manifest = MANIFEST, files = { [`${CREST_DIR}/example-college-0000aaaa.png`]: PNG }, signed = signedIn } = {}) {
  const reads = [];
  return {
    reads,
    handle: createOrgCrestImageHandler({
      env,
      ...signed,
      readPrivateJsonFile: async (path) => {
        reads.push(path);
        if (manifest instanceof Error) throw manifest;
        return manifest;
      },
      readPrivateFileBytes: async (path) => {
        reads.push(path);
        if (!files[path]) throw Object.assign(new Error('missing'), { status: 404 });
        return files[path];
      }
    })
  };
}

test('crest-image lists only well-formed refs from the private manifest', async () => {
  const { handle } = handler();
  const { data } = await (await handle(req('/api/organisations/crest-image'))).json();
  assert.deepEqual(data, { refs: [REF], status: 'ready' });
  assert.deepEqual(crestManifest(MANIFEST), { [REF]: 'example-college-0000aaaa.png' });
});

test('crest-image serves a listed PNG and caches the manifest', async () => {
  const { handle, reads } = handler();
  const response = await handle(req(`/api/organisations/crest-image?ref=${encodeURIComponent(REF)}`));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.equal(response.headers.get('cache-control'), 'private, max-age=86400');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), PNG);
  await handle(req('/api/organisations/crest-image'));
  assert.deepEqual(reads, [`${CREST_DIR}/manifest.json`, `${CREST_DIR}/example-college-0000aaaa.png`]);
});

test('crest-image 404s unknown organisations and missing files', async () => {
  const { handle } = handler({ files: {} });
  assert.equal((await handle(req('/api/organisations/crest-image?ref=shared%3Aorganisation%3Aorganisation_ffff0000'))).status, 404);
  assert.equal((await handle(req(`/api/organisations/crest-image?ref=${encodeURIComponent(REF)}`))).status, 404);
});

test('crest-image degrades to an empty list when the private repo is unreachable', async () => {
  const { handle } = handler({ manifest: Object.assign(new Error('down'), { status: 503 }) });
  const { data } = await (await handle(req('/api/organisations/crest-image'))).json();
  assert.deepEqual(data, { refs: [], status: 'unavailable' });
  assert.equal((await handle(req(`/api/organisations/crest-image?ref=${encodeURIComponent(REF)}`))).status, 503);
});

test('crest-image needs a session and GET', async () => {
  const { handle } = handler({ signed: { verifySessionToken: () => ({ valid: false }) } });
  assert.equal((await handle(req('/api/organisations/crest-image'))).status, 401);
  const ok = handler().handle;
  assert.equal((await ok(req('/api/organisations/crest-image', { method: 'POST' }))).status, 405);
});
