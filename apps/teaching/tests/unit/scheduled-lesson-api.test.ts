import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { createMockApi } from '../../scripts/mock-api';
import type { SeedData } from '../../scripts/mock-store';
import { scheduledLessonKey } from '../../src/storage/keys';
import type { ScheduledLesson } from '@/schemas';

const __dirname = dirname(fileURLToPath(import.meta.url));
const seedFixture = JSON.parse(
  readFileSync(join(__dirname, '../../fixtures/seed.json'), 'utf-8')
) as SeedData;

const PASSPHRASE = 'teaching-hub-local';
const TARGET_ID = 'scheduled_aotfw_007';
const PATH = `/api/scheduled-lessons/${TARGET_ID}`;

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

describe('PATCH /api/scheduled-lessons/:id (mock)', () => {
  it('returns 401 without auth', async () => {
    const api = freshApi();
    const res = await api.request('PATCH', PATH, {
      body: { date: '2026-09-01' }
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('unauthorized');
  });

  it('returns 404 for unknown scheduled lesson', async () => {
    const api = freshApi();
    const cookie = await signIn(api);
    const res = await api.request('PATCH', '/api/scheduled-lessons/scheduled_missing', {
      cookie,
      body: { date: '2026-09-01' }
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('not_found');
  });

  it('patches date and persists', async () => {
    const api = freshApi();
    const cookie = await signIn(api);

    const res = await api.request('PATCH', PATH, {
      cookie,
      body: { date: '2026-09-15' }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.id).toBe(TARGET_ID);
    expect(body.data.date).toBe('2026-09-15');
    expect(body.data.schedule_order).toBe(2);

    const curriculum = await (
      await api.request('GET', '/api/curriculum', { cookie })
    ).json();
    const fromCurriculum = curriculum.data.scheduled_lessons.find(
      (row: ScheduledLesson) => row.id === TARGET_ID
    );
    expect(fromCurriculum.date).toBe('2026-09-15');
  });

  it('reorders up and persists swapped schedule_order values', async () => {
    const api = freshApi();
    const cookie = await signIn(api);

    const res = await api.request('PATCH', PATH, {
      cookie,
      body: { direction: 'up' }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe(TARGET_ID);
    expect(body.data.schedule_order).toBe(1);

    const curriculum = await (
      await api.request('GET', '/api/curriculum', { cookie })
    ).json();
    const scheduledLessons = curriculum.data.scheduled_lessons as ScheduledLesson[];
    const byId = new Map(scheduledLessons.map((row) => [row.id, row] as const));
    expect(byId.get(TARGET_ID)?.schedule_order).toBe(1);
    expect(byId.get('scheduled_aotfw_006')?.schedule_order).toBe(2);
  });

  it('no-ops at the top end with 200', async () => {
    const api = freshApi();
    const cookie = await signIn(api);

    const res = await api.request('PATCH', '/api/scheduled-lessons/scheduled_aotfw_006', {
      cookie,
      body: { direction: 'up' }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.schedule_order).toBe(1);
  });
});

describe('scheduled-lesson storage key', () => {
  it('builds scheduled lesson key', () => {
    expect(scheduledLessonKey(TARGET_ID)).toBe(`scheduled_lessons/${TARGET_ID}`);
  });
});
