import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { createMockApi } from '../../scripts/mock-api';
import type { SeedData } from '../../scripts/mock-store';
import { classKey } from '../../src/storage/keys';
import type { Class } from '@/schemas';

const __dirname = dirname(fileURLToPath(import.meta.url));
const seedFixture = JSON.parse(
  readFileSync(join(__dirname, '../../fixtures/seed.json'), 'utf-8')
) as SeedData;

const PASSPHRASE = 'teaching-hub-local';
const CLASS_ID = 'class_2026_12engadv1';
const PATH = `/api/classes/${CLASS_ID}`;
const ISO = '2026-01-01T00:00:00.000Z';

const validHeadingBlock = {
  id: 'block_001',
  type: 'block' as const,
  block_type: 'heading' as const,
  variant: 'section' as const,
  visibility: 'student_teacher' as const,
  content: { text: 'Welcome' },
  layout: {},
  print: {},
  settings: {},
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1 as const
};

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

describe('PATCH /api/classes/:id (mock)', () => {
  it('returns 401 without auth', async () => {
    const api = freshApi();
    const res = await api.request('PATCH', PATH, {
      body: { meeting_days: [1, 3, 5] }
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('unauthorized');
  });

  it('sets current_scheduled_lesson_id when the lesson belongs to this class', async () => {
    const api = freshApi();
    const cookie = await signIn(api);

    const res = await api.request('PATCH', PATH, {
      cookie,
      body: { current_scheduled_lesson_id: 'scheduled_aotfw_007' }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.current_scheduled_lesson_id).toBe('scheduled_aotfw_007');

    const curriculum = await (
      await api.request('GET', '/api/curriculum', { cookie })
    ).json();
    const cls = curriculum.data.classes.find((row: Class) => row.id === CLASS_ID);
    expect(cls.current_scheduled_lesson_id).toBe('scheduled_aotfw_007');
  });

  it('rejects current_scheduled_lesson_id for a scheduled lesson in another class', async () => {
    const seed = freshSeed();
    seed.scheduled_lessons.push({
      id: 'scheduled_other_class',
      type: 'scheduled_lesson',
      class_id: 'class_other',
      unit_id: 'unit_aotfw',
      lesson_id: 'lesson_aotfw_001',
      date: '2026-08-01',
      schedule_order: 1,
      delivery_status: 'planned',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      schema_version: 1
    });

    const api = freshApi(seed);
    const cookie = await signIn(api);

    const res = await api.request('PATCH', PATH, {
      cookie,
      body: { current_scheduled_lesson_id: 'scheduled_other_class' }
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('not_found');
  });

  it('updates meeting_days and persists', async () => {
    const api = freshApi();
    const cookie = await signIn(api);

    const res = await api.request('PATCH', PATH, {
      cookie,
      body: { meeting_days: [2, 4] }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.meeting_days).toEqual([2, 4]);

    const curriculum = await (
      await api.request('GET', '/api/curriculum', { cookie })
    ).json();
    const cls = curriculum.data.classes.find((row: Class) => row.id === CLASS_ID);
    expect(cls.meeting_days).toEqual([2, 4]);
  });

  it('persists homepage on PATCH', async () => {
    const api = freshApi();
    const cookie = await signIn(api);

    const homepage = {
      announcements: [validHeadingBlock],
      resources: [],
      custom: []
    };

    const res = await api.request('PATCH', PATH, {
      cookie,
      body: { homepage }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.homepage.announcements).toHaveLength(1);
    expect(body.data.homepage.announcements[0].block_type).toBe('heading');

    const curriculum = await (
      await api.request('GET', '/api/curriculum', { cookie })
    ).json();
    const cls = curriculum.data.classes.find((row: Class) => row.id === CLASS_ID);
    expect(cls.homepage?.announcements).toHaveLength(1);
    expect(cls.homepage?.announcements[0]?.content).toEqual({ text: 'Welcome' });
  });

  it('clears cover without changing the homepage announcement', async () => {
    const seed = freshSeed();
    const targetClass = seed.classes.find(
      (row) => (row as { id?: string }).id === CLASS_ID
    ) as Record<string, unknown>;
    targetClass.cover = {
      url: 'https://example.com/class-cover.jpg',
      alt_text: 'Class cover'
    };
    targetClass.homepage = {
      announcements: [validHeadingBlock],
      resources: [],
      custom: []
    };

    const api = freshApi(seed);
    const cookie = await signIn(api);
    const res = await api.request('PATCH', PATH, {
      cookie,
      body: { cover: null }
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).not.toHaveProperty('cover');
    expect(body.data.homepage.announcements).toEqual([validHeadingBlock]);
  });

  it('rejects invalid homepage blocks with 400', async () => {
    const api = freshApi();
    const cookie = await signIn(api);

    const res = await api.request('PATCH', PATH, {
      cookie,
      body: {
        homepage: {
          announcements: [
            {
              ...validHeadingBlock,
              block_type: 'slideshow',
              content: { slides: [] }
            }
          ],
          resources: [],
          custom: []
        }
      }
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('validation_error');
  });
});

describe('class storage key', () => {
  it('builds class key', () => {
    expect(classKey(CLASS_ID)).toBe(`classes/${CLASS_ID}`);
  });
});
