import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { createMockApi } from '../../scripts/mock-api';
import type { SeedData } from '../../scripts/mock-store';
import { createBlock } from '@/blocks/create-block';
import { createLinkedSectionStub } from '@/blocks/composition-link';
import type { CompositionTemplate } from '@/schemas/composition';
import type { Lesson } from '@/schemas/lesson';
import type { Block } from '@/schemas/block';

const __dirname = dirname(fileURLToPath(import.meta.url));
const seedFixture = JSON.parse(
  readFileSync(join(__dirname, '../../fixtures/seed.json'), 'utf-8')
) as SeedData;

const PASSPHRASE = 'teaching-hub-local';
const LESSON_ID = 'lesson_aotfw_008';

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

describe('publish linked compositions (mock)', () => {
  it('publish expands linked composition into independent section', async () => {
    const api = freshApi();
    const cookie = await signIn(api);

    const root = createBlock('section', 'block_sec_publish');
    if (root.block_type !== 'section') throw new Error('expected section');
    root.content.title = 'Do Now';
    root.content.blocks.push(
      createBlock('rich_text', 'block_rt_publish') as (typeof root.content.blocks)[number]
    );

    const createRes = await api.request('POST', '/api/compositions', {
      cookie,
      body: { title: 'Do Now pack', root }
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()).data as CompositionTemplate;

    const lessonRes = await api.request('GET', `/api/lessons/${LESSON_ID}`, { cookie });
    expect(lessonRes.status).toBe(200);
    const lesson = (await lessonRes.json()).data as Lesson;
    const stub = createLinkedSectionStub({
      id: 'block_linked_stub',
      sourceCompositionId: created.id,
      titleHint: 'Linked hint'
    });
    lesson.blocks = [stub];

    const putRes = await api.request('PUT', `/api/lessons/${LESSON_ID}`, {
      cookie,
      body: lesson
    });
    expect(putRes.status).toBe(200);

    const publishRes = await api.request('POST', `/api/lessons/${LESSON_ID}/publish`, {
      cookie
    });
    expect(publishRes.status).toBe(200);

    const publishedRes = await api.request('GET', `/api/published/lessons/${LESSON_ID}`);
    expect(publishedRes.status).toBe(200);
    const published = (await publishedRes.json()).data as { blocks: Block[] };
    expect(published.blocks).toHaveLength(1);
    const section = published.blocks[0]!;
    expect(section.block_type).toBe('section');
    if (section.block_type !== 'section') throw new Error('expected section');
    expect(section.content.link).toBeUndefined();
    expect(section.content.title).toBe('Do Now');
    expect(section.content.blocks.length).toBe(1);
    expect(section.content.blocks[0]!.block_type).toBe('rich_text');

    const draftAfter = await (
      await api.request('GET', `/api/lessons/${LESSON_ID}`, { cookie })
    ).json();
    const draftBlocks = draftAfter.data.blocks as Block[];
    expect(draftBlocks).toHaveLength(1);
    const draftSection = draftBlocks[0]!;
    expect(draftSection.block_type).toBe('section');
    if (draftSection.block_type !== 'section') throw new Error('expected section');
    expect(draftSection.content.link?.mode).toBe('linked');
    expect(draftSection.content.link?.source_composition_id).toBe(created.id);
    expect(draftSection.content.blocks).toEqual([]);
  });

  it('publish fails when linked composition is missing', async () => {
    const api = freshApi();
    const cookie = await signIn(api);

    const lessonRes = await api.request('GET', `/api/lessons/${LESSON_ID}`, { cookie });
    expect(lessonRes.status).toBe(200);
    const lesson = (await lessonRes.json()).data as Lesson;
    lesson.blocks = [
      createLinkedSectionStub({
        id: 'block_linked_missing',
        sourceCompositionId: 'composition_missing',
        titleHint: 'Missing source'
      })
    ];

    const putRes = await api.request('PUT', `/api/lessons/${LESSON_ID}`, {
      cookie,
      body: lesson
    });
    expect(putRes.status).toBe(200);

    const publishRes = await api.request('POST', `/api/lessons/${LESSON_ID}/publish`, {
      cookie
    });
    expect(publishRes.status).toBe(400);
    const body = await publishRes.json();
    expect(body.error.code).toBe('validation_error');
    expect(body.error.message).toMatch(/composition_missing/i);
  });
});
