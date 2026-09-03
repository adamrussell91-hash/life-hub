// @vitest-environment node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createMockApi } from '../../scripts/mock-api';
import type { SeedData } from '../../scripts/mock-store';
import type { Class, Lesson, Unit } from '@/schemas';

const __dirname = dirname(fileURLToPath(import.meta.url));
const seedFixture = JSON.parse(
  readFileSync(join(__dirname, '../../fixtures/seed.json'), 'utf-8')
) as SeedData;

const PASSPHRASE = 'teaching-hub-local';
const LESSON_ID = 'lesson_aotfw_001';
const UNIT_ID = 'unit_aotfw';
const CLASS_ID = 'class_2026_12engadv1';

function freshSeed(): SeedData {
  return JSON.parse(JSON.stringify(seedFixture)) as SeedData;
}

/** Seed with lesson removed from unit lesson_ids and scheduled_lessons. */
function seedWithoutLessonRefs(): SeedData {
  const seed = freshSeed();
  for (const raw of seed.units) {
    const unit = raw as Unit;
    if (unit.id === UNIT_ID) {
      unit.lesson_ids = unit.lesson_ids.filter((id) => id !== LESSON_ID);
    }
  }
  seed.scheduled_lessons = (seed.scheduled_lessons ?? []).filter(
    (s) => (s as { lesson_id: string }).lesson_id !== LESSON_ID
  );
  return seed;
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

type TrashSummary = {
  type: string;
  id: string;
  title: string;
  trashed_at?: string;
  previous_status?: string;
};

describe('lifecycle APIs (mock)', () => {
  it('trash lesson sets trashed_at and appears in GET /api/trash', async () => {
    const api = freshApi();
    const cookie = await signIn(api);

    const trash = await api.request('PATCH', `/api/lessons/${LESSON_ID}`, {
      cookie,
      body: { status: 'trashed' }
    });
    expect(trash.status).toBe(200);
    const trashed = ((await trash.json()) as { ok: boolean; data: Lesson }).data;
    expect(trashed.status).toBe('trashed');
    expect(trashed.trashed_at).toBeTruthy();
    expect(trashed.previous_status).toBe('active');

    const list = await api.request('GET', '/api/trash', { cookie });
    expect(list.status).toBe(200);
    const summaries = ((await list.json()) as { ok: boolean; data: TrashSummary[] }).data;
    const hit = summaries.find((s) => s.type === 'lesson' && s.id === LESSON_ID);
    expect(hit).toMatchObject({
      type: 'lesson',
      id: LESSON_ID,
      previous_status: 'active'
    });
    expect(hit?.trashed_at).toBeTruthy();
    expect(hit?.title).toBeTruthy();
  });

  it('restore-from-trash returns previous status', async () => {
    const api = freshApi();
    const cookie = await signIn(api);

    const archive = await api.request('PATCH', `/api/lessons/${LESSON_ID}`, {
      cookie,
      body: { status: 'archived' }
    });
    expect(archive.status).toBe(200);
    expect(((await archive.json()) as { ok: boolean; data: Lesson }).data.status).toBe('archived');

    const trash = await api.request('PATCH', `/api/lessons/${LESSON_ID}`, {
      cookie,
      body: { status: 'trashed' }
    });
    expect(trash.status).toBe(200);
    expect(((await trash.json()) as { ok: boolean; data: Lesson }).data.previous_status).toBe(
      'archived'
    );

    const restore = await api.request('POST', `/api/lessons/${LESSON_ID}/restore-from-trash`, {
      cookie
    });
    expect(restore.status).toBe(200);
    const restored = ((await restore.json()) as { ok: boolean; data: Lesson }).data;
    expect(restored.status).toBe('archived');
    expect(restored.trashed_at).toBeUndefined();
    expect(restored.previous_status).toBeUndefined();
  });

  it('permanent DELETE while unit still lists lesson_id returns 409', async () => {
    const api = freshApi();
    const cookie = await signIn(api);

    const trash = await api.request('PATCH', `/api/lessons/${LESSON_ID}`, {
      cookie,
      body: { status: 'trashed' }
    });
    expect(trash.status).toBe(200);

    const del = await api.request('DELETE', `/api/lessons/${LESSON_ID}`, { cookie });
    expect(del.status).toBe(409);
    const body = (await del.json()) as {
      ok: boolean;
      error: { code: string; details?: { dependencies?: unknown[] } };
    };
    expect(body.error.code).toBe('conflict');
    expect(body.error.details?.dependencies?.length).toBeGreaterThan(0);
  });

  it('after clearing refs, trash + DELETE removes draft, published, and versions', async () => {
    const api = freshApi(seedWithoutLessonRefs());
    const cookie = await signIn(api);

    const publish = await api.request('POST', `/api/lessons/${LESSON_ID}/publish`, { cookie });
    expect(publish.status).toBe(200);

    const checkpoint = await api.request('POST', `/api/lessons/${LESSON_ID}/versions`, {
      cookie,
      body: { label: 'before delete' }
    });
    expect(checkpoint.status).toBe(200);

    const trash = await api.request('PATCH', `/api/lessons/${LESSON_ID}`, {
      cookie,
      body: { status: 'trashed' }
    });
    expect(trash.status).toBe(200);

    const del = await api.request('DELETE', `/api/lessons/${LESSON_ID}`, { cookie });
    expect(del.status).toBe(200);

    const getDraft = await api.request('GET', `/api/lessons/${LESSON_ID}`, { cookie });
    expect(getDraft.status).toBe(404);

    const getPublished = await api.request('GET', `/api/published/lessons/${LESSON_ID}`);
    expect(getPublished.status).toBe(404);

    const versions = await api.request('GET', `/api/lessons/${LESSON_ID}/versions`, { cookie });
    expect(versions.status).toBe(200);
    const index = ((await versions.json()) as { ok: boolean; data: { entries: unknown[] } }).data;
    expect(index.entries).toHaveLength(0);

    const trashList = await api.request('GET', '/api/trash', { cookie });
    const summaries = ((await trashList.json()) as { ok: boolean; data: TrashSummary[] }).data;
    expect(summaries.some((s) => s.id === LESSON_ID)).toBe(false);
  });

  it('archive class → archived and still GET-able via curriculum', async () => {
    const api = freshApi();
    const cookie = await signIn(api);

    const archive = await api.request('PATCH', `/api/classes/${CLASS_ID}`, {
      cookie,
      body: { status: 'archived' }
    });
    expect(archive.status).toBe(200);
    const archived = ((await archive.json()) as { ok: boolean; data: Class }).data;
    expect(archived.status).toBe('archived');

    const curriculum = await api.request('GET', '/api/curriculum', { cookie });
    expect(curriculum.status).toBe(200);
    const data = ((await curriculum.json()) as { ok: boolean; data: { classes: Class[] } }).data;
    const cls = data.classes.find((c) => c.id === CLASS_ID);
    expect(cls?.status).toBe('archived');
  });
});
