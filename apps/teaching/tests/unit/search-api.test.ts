import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createBlock } from '@/blocks/create-block';
import { runContentSearch } from '@/search/run-content-search';
import type { Block, Lesson } from '@/schemas';
import { createMockApi } from '../../scripts/mock-api';
import type { SeedData } from '../../scripts/mock-store';

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

describe('runContentSearch', () => {
  it('returns empty for short queries', () => {
    expect(
      runContentSearch('n', {
        lessons: [
          {
            id: 'l1',
            blocks: [
              { ...createBlock('heading', 'h1'), content: { text: 'Newton' } } as Block
            ]
          }
        ],
        units: [],
        compositions: []
      })
    ).toEqual([]);
  });

  it('finds lesson block text with snippet', () => {
    const hits = runContentSearch('newton', {
      lessons: [
        {
          id: 'l1',
          blocks: [
            {
              ...createBlock('rich_text', 'r1'),
              content: { html: '<p>Isaac Newton changed physics</p>' }
            } as Block
          ]
        }
      ],
      units: [],
      compositions: []
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ type: 'lesson', id: 'l1' });
    expect(hits[0]?.snippet.toLowerCase()).toContain('newton');
  });

  it('finds unit block text', () => {
    const hits = runContentSearch('friction', {
      lessons: [],
      units: [
        {
          id: 'u1',
          blocks: [
            {
              ...createBlock('heading', 'h1'),
              content: { text: 'Friction and surfaces' }
            } as Block
          ]
        }
      ],
      compositions: []
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ type: 'unit', id: 'u1' });
    expect(hits[0]?.snippet.toLowerCase()).toContain('friction');
  });

  it('finds composition root section text', () => {
    const root = {
      ...createBlock('section', 'sec1'),
      content: {
        title: 'Lab write-up',
        blocks: [
          {
            ...createBlock('rich_text', 'r1'),
            content: { html: '<p>Record your hypothesis carefully</p>' }
          } as Block
        ]
      }
    } as Block;
    const hits = runContentSearch('hypothesis', {
      lessons: [],
      units: [],
      compositions: [{ id: 'c1', blocks: [root] }]
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ type: 'composition', id: 'c1' });
    expect(hits[0]?.snippet.toLowerCase()).toContain('hypothesis');
  });
});

describe('GET /api/search (mock)', () => {
  it('returns 401 without auth', async () => {
    const api = freshApi();
    const res = await api.request('GET', '/api/search?q=newton');
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('unauthorized');
  });

  it('finds seeded lesson block text when authenticated', async () => {
    const seed = freshSeed();
    const lesson = seed.lessons[0] as Lesson;
    const searchable = createBlock('rich_text', 'block_newton_search');
    if (searchable.block_type !== 'rich_text') throw new Error('expected rich_text');
    searchable.content = { html: '<p>Isaac Newton changed physics</p>' };
    lesson.blocks = [...(lesson.blocks ?? []), searchable];

    const api = freshApi(seed);
    const cookie = await signIn(api);
    const res = await api.request('GET', '/api/search?q=newton', { cookie });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.hits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'lesson',
          id: lesson.id,
          snippet: expect.stringMatching(/newton/i)
        })
      ])
    );
  });
});
