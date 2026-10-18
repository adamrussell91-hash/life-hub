// tests/unit/notion-media.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import { IMPORT_MAX_BYTES, importMediaId, rehostMedia } from '../../netlify/functions/_shared/notion-media.mjs';
import { mediaFileKey, mediaKey } from '../../netlify/functions/_shared/teaching-blobs.mjs';

function memoryStore() {
  const map = new Map();
  return {
    map,
    async get(key, opts) { const v = map.get(key); return v === undefined ? null : opts?.type === 'json' ? JSON.parse(v.value) : v.value; },
    async set(key, value, opts) { map.set(key, { value, metadata: opts?.metadata }); },
    async setJSON(key, value) { map.set(key, { value: JSON.stringify(value) }); }
  };
}
const ok = (bytes, type) => new Response(bytes, { status: 200, headers: { 'content-type': type, 'content-length': String(bytes.length) } });
const ref = (purpose, name = 'a.png') => ({ ref: 'blk-1', page_id: 'p', notion_block_id: 'blk-1', url: 'https://files.example/a', name, purpose });
const opts = (fetchImpl, extra = {}) => ({ fetchImpl, origin: 'https://hub.example', now: '2026-10-18T00:00:00.000Z', ...extra });

test('stores a Notion file as a media record and returns its file url', async () => {
  const store = memoryStore();
  const result = await rehostMedia(store, ref('image'), opts(async () => ok(new Uint8Array([1, 2, 3]), 'image/png')));
  const id = importMediaId('blk-1', 'https://files.example/a');
  assert.equal(result.ok, true);
  assert.equal(result.url, `https://hub.example/api/media/${id}/file`);
  assert.ok(store.map.has(mediaFileKey(id)));
  const record = JSON.parse(store.map.get(mediaKey(id)).value);
  assert.equal(record.media_type, 'image');
  assert.equal(record.provider, 'direct');
});

test('reuses an already-stored file without downloading again', async () => {
  const store = memoryStore();
  await rehostMedia(store, ref('image'), opts(async () => ok(new Uint8Array([1]), 'image/png')));
  let fetched = false;
  const again = await rehostMedia(store, ref('image'), opts(async () => { fetched = true; return ok(new Uint8Array([1]), 'image/png'); }));
  assert.equal(again.ok, true);
  assert.equal(fetched, false);
});

test('rejects files over the cap', async () => {
  const store = memoryStore();
  const result = await rehostMedia(store, ref('video', 'big.mp4'), opts(async () => ok(new Uint8Array(10), 'video/mp4'), { maxBytes: 5 }));
  assert.deepEqual({ ok: result.ok, reason: result.reason }, { ok: false, reason: 'too_big' });
  assert.equal(store.map.size, 0);
});

test('rejects types outside the import allow-list', async () => {
  const result = await rehostMedia(memoryStore(), ref('attachment', 'x.exe'), opts(async () => ok(new Uint8Array([1]), 'application/x-msdownload')));
  assert.equal(result.reason, 'type');
});

test('accepts docx and video for imports', async () => {
  const docx = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  assert.equal((await rehostMedia(memoryStore(), ref('attachment', 'w.docx'), opts(async () => ok(new Uint8Array([1]), docx)))).ok, true);
  assert.equal((await rehostMedia(memoryStore(), ref('video', 'c.mp4'), opts(async () => ok(new Uint8Array([1]), 'video/mp4')))).ok, true);
});

test('returns html text for html refs without storing media', async () => {
  const store = memoryStore();
  const result = await rehostMedia(store, ref('html', 'sim.html'), opts(async () => ok(new TextEncoder().encode('<html>hi</html>'), 'text/html')));
  assert.deepEqual({ ok: result.ok, text: result.text }, { ok: true, text: '<html>hi</html>' });
  assert.equal(store.map.size, 0);
});

test('reports download failures', async () => {
  const result = await rehostMedia(memoryStore(), ref('image'), opts(async () => new Response('', { status: 403 })));
  assert.equal(result.reason, 'failed');
});

test('titles a cover "Cover image" and keeps the file name', async () => {
  const store = memoryStore();
  await rehostMedia(store, ref('cover', 'cover'), opts(async () => ok(new Uint8Array([1]), 'image/png')));
  const record = JSON.parse(store.map.get(mediaKey(importMediaId('blk-1', 'https://files.example/a'))).value);
  assert.equal(record.title, 'Cover image');
  assert.equal(record.file_name, 'cover');
});

test('titles other media from the Notion file name', async () => {
  const store = memoryStore();
  await rehostMedia(store, ref('image', 'diagram.png'), opts(async () => ok(new Uint8Array([1]), 'image/png')));
  const record = JSON.parse(store.map.get(mediaKey(importMediaId('blk-1', 'https://files.example/a'))).value);
  assert.equal(record.title, 'diagram.png');
  assert.equal(record.file_name, 'diagram.png');
});

test('media id follows the file path, not the signed query string', () => {
  const a = importMediaId('blk-1', 'https://files.example/ws/uuid-1/a.png?sig=1');
  assert.equal(a, importMediaId('blk-1', 'https://files.example/ws/uuid-1/a.png?sig=2'));
  assert.notEqual(a, importMediaId('blk-1', 'https://files.example/ws/uuid-2/a.png?sig=1'));
  assert.equal(importMediaId('blk-1', 'not a url'), importMediaId('blk-1', 'also not a url'));
});

test('a replaced file downloads again under a new id', async () => {
  const store = memoryStore();
  const first = await rehostMedia(store, { ...ref('image'), url: 'https://files.example/uuid-1/a.png?s=1' }, opts(async () => ok(new Uint8Array([1]), 'image/png')));
  let fetched = false;
  const second = await rehostMedia(store, { ...ref('image'), url: 'https://files.example/uuid-2/a.png?s=1' }, opts(async () => { fetched = true; return ok(new Uint8Array([2]), 'image/png'); }));
  assert.equal(fetched, true);
  assert.notEqual(first.media_id, second.media_id);
});

test('default cap is 20 MB and the message says it was not imported', async () => {
  assert.equal(IMPORT_MAX_BYTES, 20 * 1024 * 1024);
  const result = await rehostMedia(memoryStore(), ref('video', 'big.mp4'), opts(async () => ok(new Uint8Array(10), 'video/mp4'), { maxBytes: 20 * 1024 * 1024 - 1 + 0 }));
  assert.equal(result.ok, true);
  const big = await rehostMedia(memoryStore(), ref('video', 'big.mp4'), opts(async () => new Response(new Uint8Array(1), { status: 200, headers: { 'content-type': 'video/mp4', 'content-length': String(21 * 1024 * 1024) } })));
  assert.equal(big.message, 'big.mp4 is over 20 MB, so it wasn\'t imported.');
});

test('a throwing store write returns a failed result', async () => {
  const store = memoryStore();
  store.set = async () => { throw new Error('disk full'); };
  const result = await rehostMedia(store, ref('image'), opts(async () => ok(new Uint8Array([1]), 'image/png')));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'failed');
});

test('a broken body stream returns a failed result', async () => {
  const body = new ReadableStream({ pull() { throw new Error('reset'); } });
  const result = await rehostMedia(memoryStore(), ref('image'), opts(async () => new Response(body, { status: 200, headers: { 'content-type': 'image/png' } })));
  assert.equal(result.reason, 'failed');
});

test('non-Latin names get a usable slug', async () => {
  const store = memoryStore();
  await rehostMedia(store, ref('image', '图片.png'), opts(async () => ok(new Uint8Array([1]), 'image/png')));
  const record = JSON.parse(store.map.get(mediaKey(importMediaId('blk-1', 'https://files.example/a'))).value);
  assert.equal(record.slug, 'imported-file');
  const store2 = memoryStore();
  await rehostMedia(store2, ref('image', '图片'), opts(async () => ok(new Uint8Array([1]), 'image/png')));
  assert.equal(JSON.parse(store2.map.get(mediaKey(importMediaId('blk-1', 'https://files.example/a'))).value).slug, 'imported-file');
});

test('cancels the body on early rejects', async () => {
  let cancelled = 0;
  const mk = (status, type, len) => {
    const body = new ReadableStream({ cancel() { cancelled += 1; } });
    return new Response(body, { status, headers: { 'content-type': type, ...(len ? { 'content-length': String(len) } : {}) } });
  };
  await rehostMedia(memoryStore(), ref('image'), opts(async () => mk(403, 'image/png')));
  await rehostMedia(memoryStore(), ref('attachment', 'x.exe'), opts(async () => mk(200, 'application/x-msdownload')));
  await rehostMedia(memoryStore(), ref('video', 'v.mp4'), opts(async () => mk(200, 'video/mp4', 999), { maxBytes: 5 }));
  assert.equal(cancelled, 3);
});

test('slug drops the file extension', async () => {
  const store = memoryStore();
  await rehostMedia(store, ref('image', 'Lab Diagram.png'), opts(async () => ok(new Uint8Array([1]), 'image/png')));
  assert.equal(JSON.parse(store.map.get(mediaKey(importMediaId('blk-1', 'https://files.example/a'))).value).slug, 'lab-diagram');
});

test('passes an abort signal to the download', async () => {
  const store = memoryStore();
  const signal = AbortSignal.timeout(60000);
  let seen;
  await rehostMedia(store, ref('image'), opts(async (_url, init) => { seen = init?.signal; return ok(new Uint8Array([1]), 'image/png'); }, { signal }));
  assert.equal(seen, signal);
});
