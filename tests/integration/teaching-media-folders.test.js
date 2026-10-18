import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { buildMediaUsage } from '../../netlify/functions/_shared/media-usage.mjs';
import { buildCurriculum } from '../../netlify/functions/curriculum.mjs';
import {
  createMediaFoldersHandler,
  validateMediaFolders
} from '../../netlify/functions/media-folders.mjs';

const SECRET = 's'.repeat(32);
const env = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: SECRET };
const session = createSessionToken({
  now: Date.parse('2026-10-18T00:00:00Z'),
  randomBytes: () => Buffer.alloc(16, 4)
}, SECRET).token;

function memoryStore(entries = {}) {
  const map = new Map(Object.entries(entries));
  return {
    map,
    async get(key) { return map.get(key) ?? null; },
    async setJSON(key, value) { map.set(key, value); },
    async list({ prefix }) {
      return { blobs: [...map.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) };
    }
  };
}

function handlerFor(store) {
  return createMediaFoldersHandler({
    env,
    now: () => Date.parse('2026-10-18T01:00:00Z'),
    getContentStore: async () => store
  });
}

function call(handler, method, body) {
  return handler(new Request('https://api.adam-russell.com/api/media-folders', {
    method,
    headers: {
      cookie: `life_hub_session=${session}`,
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  }));
}

const media = (id, extra = {}) => ({
  id, type: 'media', title: id, slug: id, status: 'active', provider: 'external', media_type: 'pdf', ...extra
});

test('media folders save as one nested tree and read back', async () => {
  const store = memoryStore();
  const handler = handlerFor(store);
  const folders = [
    { id: 'fld_texts', name: ' Texts ', parent_id: null },
    { id: 'fld_poems', name: 'Poems', parent_id: 'fld_texts' }
  ];
  const put = await call(handler, 'PUT', { folders });
  assert.equal(put.status, 200);
  assert.deepEqual((await put.json()).data.folders[0], { id: 'fld_texts', name: 'Texts', parent_id: null });

  const get = await call(handler, 'GET');
  assert.equal(get.status, 200);
  assert.equal((await get.json()).data.folders.length, 2);
});

test('media folders reject missing parents, cycles, duplicates and blank names', async () => {
  assert.throws(() => validateMediaFolders([{ id: 'a', name: 'A', parent_id: 'ghost' }]), /missing parent/);
  assert.throws(() => validateMediaFolders([
    { id: 'a', name: 'A', parent_id: 'b' },
    { id: 'b', name: 'B', parent_id: 'a' }
  ]), /inside itself/);
  assert.throws(() => validateMediaFolders([
    { id: 'a', name: 'A', parent_id: null },
    { id: 'a', name: 'Again', parent_id: null }
  ]), /Duplicate/);
  assert.throws(() => validateMediaFolders([{ id: 'a', name: '  ', parent_id: null }]), /name is required/);

  const store = memoryStore();
  const response = await call(handlerFor(store), 'PUT', { folders: [{ id: 'a', name: 'A', parent_id: 'a' }] });
  assert.equal(response.status, 400);
  assert.equal(store.map.size, 0, 'a rejected tree writes nothing');
});

test('usage finds resources by media_id, exact URL, URL inside HTML and file route', () => {
  const usage = buildMediaUsage({
    media: [
      media('media_poem', { preview_url: 'https://example.com/poem.pdf' }),
      media('media_photo', { thumbnail_url: 'https://example.com/photo.jpg?w=1&h=2' }),
      media('media_upload', { preview_url: '/api/media/media_upload/file' }),
      media('media_cover'),
      media('media_unused', { preview_url: 'https://example.com/unused.pdf' })
    ],
    lessons: [
      { id: 'l1', type: 'lesson', blocks: [{ type: 'embed', content: { url: 'https://example.com/poem.pdf' } }] },
      { id: 'l2', type: 'lesson', blocks: [{ type: 'rich_text', html: '<img src="https://example.com/photo.jpg?w=1&amp;h=2">' }] },
      { id: 'l3', type: 'lesson', blocks: [{ type: 'file', content: { url: 'https://hub.example/api/media/media_upload/file' } }] },
      { id: 'l4', type: 'lesson', status: 'trashed', blocks: [{ content: { url: 'https://example.com/unused.pdf' } }] }
    ],
    units: [{ id: 'u1', type: 'unit', lesson_ids: ['l1'], cover: { media_id: 'media_cover' } }],
    classes: []
  });
  assert.deepEqual(usage.media_poem.lesson_ids, ['l1']);
  assert.deepEqual(usage.media_photo.lesson_ids, ['l2']);
  assert.deepEqual(usage.media_upload.lesson_ids, ['l3']);
  assert.deepEqual(usage.media_cover.unit_ids, ['u1']);
  assert.equal(usage.media_unused, undefined, 'a trashed lesson does not count as a use');
});

test('curriculum carries the folder tree and usage map', async () => {
  const store = memoryStore({
    'media/media_poem': media('media_poem', { preview_url: 'https://example.com/poem.pdf', folder_id: 'fld_texts' }),
    'lessons/l1': { id: 'l1', type: 'lesson', title: 'Poem day', unit_id: 'u1', blocks: [{ content: { url: 'https://example.com/poem.pdf' } }] },
    'meta/media_folders': { folders: [{ id: 'fld_texts', name: 'Texts', parent_id: null }] }
  });
  const curriculum = await buildCurriculum(store);
  assert.deepEqual(curriculum.media_folders, [{ id: 'fld_texts', name: 'Texts', parent_id: null }]);
  assert.deepEqual(curriculum.media_usage, { media_poem: { lesson_ids: ['l1'], unit_ids: [], class_ids: [] } });
  assert.equal(curriculum.media[0].folder_id, 'fld_texts');
});
