import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createMockApi } from '../../scripts/mock-api';
import type { SeedData } from '../../scripts/mock-store';
import { createBlock } from '@/blocks/create-block';

const __dirname = dirname(fileURLToPath(import.meta.url));
const seedFixture = JSON.parse(
  readFileSync(join(__dirname, '../../fixtures/seed.json'), 'utf-8')
) as SeedData;

const PASSPHRASE = 'teaching-hub-local';

function freshApi(seed: SeedData = JSON.parse(JSON.stringify(seedFixture)) as SeedData) {
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

describe('lesson/unit template APIs (mock)', () => {
  it('returns 401 without auth for GET /api/lesson-templates', async () => {
    const api = freshApi();
    const res = await api.request('GET', '/api/lesson-templates');
    expect(res.status).toBe(401);
  });

  it('creates, lists, renames, and archives a lesson template', async () => {
    const api = freshApi();
    const cookie = await signIn(api);

    const heading = {
      ...createBlock('heading', 'h1'),
      content: { text: 'Read closely' }
    };
    const created = await api.request('POST', '/api/lesson-templates', {
      cookie,
      body: { title: 'Close reading pack', blocks: [heading] }
    });
    expect(created.status).toBe(201);
    const body = (await created.json()).data as { id: string; title: string };
    expect(body.title).toBe('Close reading pack');

    const list = await api.request('GET', '/api/lesson-templates', { cookie });
    expect(list.status).toBe(200);
    const listed = (await list.json()).data as { templates: Array<{ id: string }> };
    expect(listed.templates.some((t) => t.id === body.id)).toBe(true);

    const patched = await api.request('PATCH', `/api/lesson-templates/${body.id}`, {
      cookie,
      body: { title: 'Close reading v2' }
    });
    expect(patched.status).toBe(200);

    const archived = await api.request('PATCH', `/api/lesson-templates/${body.id}`, {
      cookie,
      body: { status: 'archived' }
    });
    expect(archived.status).toBe(200);
    const after = await api.request('GET', '/api/lesson-templates', { cookie });
    const afterBody = (await after.json()).data as { templates: Array<{ id: string }> };
    expect(afterBody.templates.some((t) => t.id === body.id)).toBe(false);
  });

  it('creates a unit template', async () => {
    const api = freshApi();
    const cookie = await signIn(api);
    const created = await api.request('POST', '/api/unit-templates', {
      cookie,
      body: { title: 'Poetry overview', description: 'Unit plan', blocks: [] }
    });
    expect(created.status).toBe(201);
    const body = (await created.json()).data as { title: string };
    expect(body.title).toBe('Poetry overview');
  });
});
