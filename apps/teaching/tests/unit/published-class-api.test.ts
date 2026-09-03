import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { createMockApi } from '../../scripts/mock-api';
import type { SeedData } from '../../scripts/mock-store';
import { publishedLessonKey } from '../../src/storage/keys';

const __dirname = dirname(fileURLToPath(import.meta.url));
const seedFixture = JSON.parse(
  readFileSync(join(__dirname, '../../fixtures/seed.json'), 'utf-8')
) as SeedData;

const CLASS_ID = 'class_2026_12engadv1';
const PATH = `/api/published/classes/${CLASS_ID}`;

function freshSeed(): SeedData {
  return JSON.parse(JSON.stringify(seedFixture)) as SeedData;
}

function freshApi(seed: SeedData = freshSeed()) {
  return createMockApi({ seed, passphrase: 'teaching-hub-local' });
}

describe('GET /api/published/classes/:id (mock)', () => {
  it('returns 404 when the class is missing', async () => {
    const api = freshApi();
    const res = await api.request('GET', '/api/published/classes/class_missing');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('not_found');
  });

  it('returns 404 when the class is archived', async () => {
    const seed = freshSeed();
    seed.classes[0] = { ...(seed.classes[0] as Record<string, unknown>), status: 'archived' };
    const api = freshApi(seed);

    const res = await api.request('GET', PATH);
    expect(res.status).toBe(404);
  });

  it('is public and returns schedule, homepage, and resolved titles without auth', async () => {
    const api = freshApi();
    const res = await api.request('GET', PATH);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.id).toBe(CLASS_ID);
    expect(body.data.code).toBe('12ENGADV1');
    expect(body.data.title).toBe('Year 12 English Advanced');
    expect(body.data.display_name).toBe('12ENGADV1');

    expect(body.data.homepage).toEqual({
      announcements: [],
      resources: [],
      custom: []
    });

    expect(body.data.current_unit).toEqual({
      id: 'unit_aotfw',
      title: 'Artist of the Floating World',
      lessons: []
    });

    expect(body.data.current_lesson).toEqual({
      id: 'scheduled_aotfw_008',
      title: 'Memory, Identity and Ono',
      lesson_id: 'lesson_aotfw_008'
    });

    expect(body.data.active_units).toEqual([
      { id: 'unit_aotfw', title: 'Artist of the Floating World' }
    ]);

    expect(body.data.schedule).toHaveLength(5);
    expect(body.data.schedule.map((row: { schedule_order: number }) => row.schedule_order)).toEqual([
      1, 2, 3, 4, 5
    ]);
    expect(body.data.schedule[2]).toMatchObject({
      id: 'scheduled_aotfw_008',
      lesson_id: 'lesson_aotfw_008',
      title: 'Memory, Identity and Ono',
      published: false
    });
  });

  it('includes published unscheduled unit lessons on current_unit', async () => {
    const api = freshApi();
    const authRes = await api.request('POST', '/api/auth', {
      body: { passphrase: 'teaching-hub-local' }
    });
    const cookie = authRes.headers.get('set-cookie') as string;

    const publishRes = await api.request('POST', '/api/lessons/lesson_aotfw_003/publish', {
      cookie
    });
    expect(publishRes.status).toBe(200);

    const res = await api.request('GET', PATH);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.current_unit.lessons).toEqual([
      {
        id: 'lesson_aotfw_003',
        title: 'Narrative Structure and Unreliable Memory'
      }
    ]);
  });

  it('marks schedule rows published when a published lesson snapshot exists', async () => {
    const api = freshApi();
    const authRes = await api.request('POST', '/api/auth', {
      body: { passphrase: 'teaching-hub-local' }
    });
    const cookie = authRes.headers.get('set-cookie') as string;

    const publishRes = await api.request('POST', '/api/lessons/lesson_aotfw_008/publish', {
      cookie
    });
    expect(publishRes.status).toBe(200);

    const res = await api.request('GET', PATH);
    expect(res.status).toBe(200);
    const body = await res.json();
    const current = body.data.schedule.find(
      (row: { lesson_id: string }) => row.lesson_id === 'lesson_aotfw_008'
    );
    expect(current.published).toBe(true);
  });

  it('returns homepage regions from the class record', async () => {
    const seed = freshSeed();
    const cls = seed.classes[0] as Record<string, unknown>;
    cls.homepage = {
      announcements: [
        {
          id: 'block_ann_001',
          type: 'block',
          block_type: 'heading',
          variant: 'section',
          visibility: 'student_teacher',
          content: { text: 'Welcome' },
          layout: {},
          print: {},
          settings: {},
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
          schema_version: 1
        }
      ],
      resources: [],
      custom: []
    };

    const api = freshApi(seed);
    const res = await api.request('GET', PATH);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.homepage.announcements).toHaveLength(1);
    expect(body.data.homepage.announcements[0].content).toEqual({ text: 'Welcome' });
  });
});

describe('published lesson key helper', () => {
  it('builds published lesson key', () => {
    expect(publishedLessonKey('lesson_aotfw_008')).toBe('published/lessons/lesson_aotfw_008');
  });
});
