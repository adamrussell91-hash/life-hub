import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { createMockApi } from '../../scripts/mock-api';
import type { SeedData } from '../../scripts/mock-store';
import { createBlock } from '@/blocks/create-block';
import { createLinkedSectionStub } from '@/blocks/composition-link';
import { compositionKey } from '@/storage/keys';
import type { CompositionTemplate } from '@/schemas/composition';

const __dirname = dirname(fileURLToPath(import.meta.url));
const seedFixture = JSON.parse(
  readFileSync(join(__dirname, '../../fixtures/seed.json'), 'utf-8')
) as SeedData;

const PASSPHRASE = 'teaching-hub-local';

function freshSeed(): SeedData {
  return JSON.parse(JSON.stringify(seedFixture)) as SeedData;
}

function freshApi(seed: SeedData = freshSeed()) {
  return createMockApi({ seed, passphrase: PASSPHRASE });
}

async function signIn(api: ReturnType<typeof createMockApi>): Promise<string> {
  const res = await api.request('POST', '/api/auth', {
    body: { passphrase: PASSPHRASE }
  });
  expect(res.status).toBe(200);
  const cookie = res.headers.get('set-cookie');
  expect(cookie).toBeTruthy();
  return cookie as string;
}

describe('compositions API (mock)', () => {
  it('returns 401 without auth for GET /api/compositions', async () => {
    const api = freshApi();
    const res = await api.request('GET', '/api/compositions');
    expect(res.status).toBe(401);
  });

  it('POST /api/compositions stores a composition and lists it', async () => {
    const api = freshApi();
    const cookie = await signIn(api);
    const root = createBlock('section', 'block_sec_save');
    if (root.block_type !== 'section') throw new Error('expected section');
    root.content.title = 'Do Now';

    const createRes = await api.request('POST', '/api/compositions', {
      cookie,
      body: { title: 'Do Now pack', root }
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()).data as CompositionTemplate;
    expect(created.type).toBe('composition_template');
    expect(created.title).toBe('Do Now pack');
    expect(created.root.block_type).toBe('section');
    expect(created.root.content.title).toBe('Do Now');

    const listRes = await api.request('GET', '/api/compositions', { cookie });
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.data.compositions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: created.id, title: 'Do Now pack' })
      ])
    );

    const getRes = await api.request('GET', `/api/compositions/${created.id}`, { cookie });
    expect(getRes.status).toBe(200);
    const fetched = (await getRes.json()).data as CompositionTemplate;
    expect(fetched.root.id).toBe(root.id);
  });

  it('rejects non-section root', async () => {
    const api = freshApi();
    const cookie = await signIn(api);
    const root = createBlock('rich_text', 'block_rt');
    const res = await api.request('POST', '/api/compositions', {
      cookie,
      body: { title: 'Bad', root }
    });
    expect(res.status).toBe(400);
  });

  it('returns 404 for missing composition', async () => {
    const api = freshApi();
    const cookie = await signIn(api);
    const res = await api.request('GET', '/api/compositions/composition_missing', { cookie });
    expect(res.status).toBe(404);
    expect(compositionKey('composition_missing')).toBe(
      'templates/compositions/composition_missing'
    );
  });

  it('PATCH /api/compositions/:id updates title and root', async () => {
    const api = freshApi();
    const cookie = await signIn(api);
    const root = createBlock('section', 'block_sec_save');
    if (root.block_type !== 'section') throw new Error('expected section');
    root.content.title = 'Original root';

    const createRes = await api.request('POST', '/api/compositions', {
      cookie,
      body: { title: 'Original', root }
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()).data as CompositionTemplate;

    const newRoot = createBlock('section', 'block_new_root');
    if (newRoot.block_type !== 'section') throw new Error('expected section');
    newRoot.content.title = 'Updated root';

    const patchRes = await api.request('PATCH', `/api/compositions/${created.id}`, {
      cookie,
      body: { title: 'Renamed', root: newRoot }
    });
    expect(patchRes.status).toBe(200);
    const patched = (await patchRes.json()).data as CompositionTemplate;
    expect(patched.title).toBe('Renamed');
    expect(patched.root.content.title).toBe('Updated root');
  });

  it('PATCH rejects empty body', async () => {
    const api = freshApi();
    const cookie = await signIn(api);
    const root = createBlock('section', 'block_sec_empty_patch');
    if (root.block_type !== 'section') throw new Error('expected section');
    root.content.title = 'Keep';

    const createRes = await api.request('POST', '/api/compositions', {
      cookie,
      body: { title: 'Keep title', root }
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()).data as CompositionTemplate;

    const patchRes = await api.request('PATCH', `/api/compositions/${created.id}`, {
      cookie,
      body: {}
    });
    expect(patchRes.status).toBe(400);
  });

  it('PATCH returns 404 for missing id', async () => {
    const api = freshApi();
    const cookie = await signIn(api);
    const res = await api.request('PATCH', '/api/compositions/composition_missing', {
      cookie,
      body: { title: 'X' }
    });
    expect(res.status).toBe(404);
  });

  it('PATCH rejects root with content.link', async () => {
    const api = freshApi();
    const cookie = await signIn(api);
    const root = createBlock('section', 'block_sec_link_patch');
    if (root.block_type !== 'section') throw new Error('expected section');
    root.content.title = 'Own root';

    const createRes = await api.request('POST', '/api/compositions', {
      cookie,
      body: { title: 'Owned', root }
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()).data as CompositionTemplate;

    const linkedRoot = createLinkedSectionStub({
      id: 'block_linked_root',
      sourceCompositionId: 'composition_other',
      titleHint: 'Linked'
    });

    const patchRes = await api.request('PATCH', `/api/compositions/${created.id}`, {
      cookie,
      body: { root: linkedRoot }
    });
    expect(patchRes.status).toBe(400);
  });
});
