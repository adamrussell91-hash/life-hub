import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { createMockApi } from '../../scripts/mock-api';
import type { SeedData } from '../../scripts/mock-store';
import { classKey, scheduledLessonKey, unitKey } from '../../src/storage/keys';
import type { Class, ScheduledLesson, Unit } from '@/schemas';

const __dirname = dirname(fileURLToPath(import.meta.url));
const seedFixture = JSON.parse(
  readFileSync(join(__dirname, '../../fixtures/seed.json'), 'utf-8')
) as SeedData;

const PASSPHRASE = 'teaching-hub-local';
const CLASS_ID = 'class_2026_12engadv1';
const UNIT_ID = 'unit_aotfw';
const PATH = `/api/classes/${CLASS_ID}/schedule-unit`;

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

const ISO = '2026-01-01T00:00:00.000Z';

describe('POST /api/classes/:classId/schedule-unit (mock)', () => {
  it('returns 401 without auth', async () => {
    const api = freshApi();
    const res = await api.request('POST', PATH, {
      body: { unit_id: UNIT_ID, start_date: '2026-09-01' }
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('unauthorized');
  });

  it('schedules missing lessons and persists meeting_days', async () => {
    const api = freshApi();
    const cookie = await signIn(api);

    const res = await api.request('POST', PATH, {
      cookie,
      body: {
        unit_id: UNIT_ID,
        start_date: '2026-09-01',
        meeting_days: [1, 3, 5]
      }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    const created: ScheduledLesson[] = body.data.scheduled_lessons;
    expect(created.map((row) => row.lesson_id)).toEqual([
      'lesson_aotfw_003',
      'lesson_aotfw_004',
      'lesson_aotfw_005'
    ]);
    expect(created.every((row) => row.class_id === CLASS_ID)).toBe(true);
    expect(created.every((row) => row.unit_id === UNIT_ID)).toBe(true);
    expect(created[0].id).toBe(`scheduled_${CLASS_ID}_lesson_aotfw_003`);

    const updatedClass: Class = body.data.class;
    expect(updatedClass.meeting_days).toEqual([1, 3, 5]);
    expect(updatedClass.active_unit_ids).toContain(UNIT_ID);

    const curriculum = await (
      await api.request('GET', '/api/curriculum', { cookie })
    ).json();
    const classFromCurriculum = curriculum.data.classes.find(
      (cls: Class) => cls.id === CLASS_ID
    );
    expect(classFromCurriculum.meeting_days).toEqual([1, 3, 5]);

    const createdIds = new Set(created.map((row) => row.id));
    const fromCurriculum = curriculum.data.scheduled_lessons.filter((row: ScheduledLesson) =>
      createdIds.has(row.id)
    );
    expect(fromCurriculum).toHaveLength(3);
  });

  it('returns already_scheduled when every unit lesson is scheduled', async () => {
    const seed = freshSeed();
    const tinyUnit: Unit = {
      id: 'unit_tiny',
      type: 'unit',
      title: 'Tiny Unit',
      slug: 'tiny',
      year_id: 'year_12',
      subject_id: 'subject_y12_engadv',
      lesson_ids: ['lesson_aotfw_001', 'lesson_aotfw_002'],
      status: 'active',
      created_at: ISO,
      updated_at: ISO,
      schema_version: 1
    };
    seed.units.push(tinyUnit);
    seed.scheduled_lessons.push(
      {
        id: 'scheduled_tiny_001',
        type: 'scheduled_lesson',
        class_id: CLASS_ID,
        unit_id: 'unit_tiny',
        lesson_id: 'lesson_aotfw_001',
        date: '2026-08-20',
        schedule_order: 10,
        delivery_status: 'planned',
        created_at: ISO,
        updated_at: ISO,
        schema_version: 1
      },
      {
        id: 'scheduled_tiny_002',
        type: 'scheduled_lesson',
        class_id: CLASS_ID,
        unit_id: 'unit_tiny',
        lesson_id: 'lesson_aotfw_002',
        date: '2026-08-21',
        schedule_order: 11,
        delivery_status: 'planned',
        created_at: ISO,
        updated_at: ISO,
        schema_version: 1
      }
    );

    const api = freshApi(seed);
    const cookie = await signIn(api);

    const res = await api.request('POST', `/api/classes/${CLASS_ID}/schedule-unit`, {
      cookie,
      body: { unit_id: 'unit_tiny', start_date: '2026-09-01' }
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('already_scheduled');
    expect(body.error.message).toBe('Already scheduled');
  });

  it('returns 400 when unit subject does not match class', async () => {
    const seed = freshSeed();
    seed.units.push({
      id: 'unit_wrong_subject',
      type: 'unit',
      title: 'Wrong Subject Unit',
      slug: 'wrong-subject',
      year_id: 'year_12',
      subject_id: 'subject_y12_engstd',
      lesson_ids: ['lesson_aotfw_003'],
      status: 'active',
      created_at: ISO,
      updated_at: ISO,
      schema_version: 1
    });

    const api = freshApi(seed);
    const cookie = await signIn(api);

    const res = await api.request('POST', PATH, {
      cookie,
      body: { unit_id: 'unit_wrong_subject', start_date: '2026-09-01' }
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('subject_mismatch');
  });

  it('returns no_lessons when the unit has an empty lesson list', async () => {
    const seed = freshSeed();
    seed.units.push({
      id: 'unit_empty',
      type: 'unit',
      title: 'Empty Unit',
      slug: 'empty-unit',
      year_id: 'year_12',
      subject_id: 'subject_y12_engadv',
      lesson_ids: [],
      status: 'active',
      created_at: ISO,
      updated_at: ISO,
      schema_version: 1
    });

    const api = freshApi(seed);
    const cookie = await signIn(api);

    const res = await api.request('POST', PATH, {
      cookie,
      body: { unit_id: 'unit_empty', start_date: '2026-09-01' }
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('no_lessons');
  });

  it('returns 404 for unknown class', async () => {
    const api = freshApi();
    const cookie = await signIn(api);
    const res = await api.request('POST', '/api/classes/class_missing/schedule-unit', {
      cookie,
      body: { unit_id: UNIT_ID, start_date: '2026-09-01' }
    });
    expect(res.status).toBe(404);
  });

  it('returns 409 when stable scheduled lesson id already exists', async () => {
    const seed = freshSeed();
    const collisionId = `scheduled_${CLASS_ID}_lesson_aotfw_003`;
    seed.scheduled_lessons.push({
      id: collisionId,
      type: 'scheduled_lesson',
      class_id: 'class_other',
      unit_id: 'unit_other',
      lesson_id: 'lesson_other',
      date: '2026-01-01',
      schedule_order: 99,
      delivery_status: 'planned',
      created_at: ISO,
      updated_at: ISO,
      schema_version: 1
    });

    const api = freshApi(seed);
    const cookie = await signIn(api);
    const res = await api.request('POST', PATH, {
      cookie,
      body: { unit_id: UNIT_ID, start_date: '2026-09-01' }
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('conflict');
  });
});

// Smoke that key helpers used by the route stay aligned with expected blob paths.
describe('schedule-unit storage keys', () => {
  it('builds class, unit, and scheduled lesson keys', () => {
    expect(classKey(CLASS_ID)).toBe(`classes/${CLASS_ID}`);
    expect(unitKey(UNIT_ID)).toBe(`units/${UNIT_ID}`);
    expect(scheduledLessonKey(`scheduled_${CLASS_ID}_lesson_x`)).toBe(
      `scheduled_lessons/scheduled_${CLASS_ID}_lesson_x`
    );
  });
});
