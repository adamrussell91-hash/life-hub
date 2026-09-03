import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { createMockApi } from '../../scripts/mock-api';
import type { SeedData } from '../../scripts/mock-store';
import type { Class, Lesson, ScopeSequence, Subject, Unit } from '@/schemas';

const __dirname = dirname(fileURLToPath(import.meta.url));
const seedFixture = JSON.parse(
  readFileSync(join(__dirname, '../../fixtures/seed.json'), 'utf-8')
) as SeedData;

const PASSPHRASE = 'teaching-hub-local';
const YEAR_ID = 'year_12';
const SUBJECT_ID = 'subject_y12_engadv';
const SUBJECT_STD_ID = 'subject_y12_engstd';
const UNIT_ID = 'unit_aotfw';

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

describe('POST create endpoints (mock)', () => {
  it('returns 401 without auth for POST /api/classes', async () => {
    const api = freshApi();
    const res = await api.request('POST', '/api/classes', {
      body: {
        title: '12 Eng Std',
        code: '12ENGSTD1',
        academic_year: 2026,
        year_id: YEAR_ID,
        subject_id: SUBJECT_ID
      }
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('unauthorized');
  });

  it('POST /api/classes creates a class', async () => {
    const api = freshApi();
    const cookie = await signIn(api);

    const res = await api.request('POST', '/api/classes', {
      cookie,
      body: {
        title: '12 Eng Std',
        code: '12ENGSTD1',
        academic_year: 2026,
        year_id: YEAR_ID,
        subject_id: SUBJECT_ID
      }
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.type).toBe('class');
    expect(body.data.code).toBe('12ENGSTD1');
    expect(body.data.title).toBe('12 Eng Std');
    expect(body.data.slug).toBeTruthy();
    expect(body.data.active_unit_ids).toEqual([]);
    expect(body.data.homepage).toEqual({
      announcements: [],
      resources: [],
      custom: []
    });
    expect(body.data.status).toBe('active');
    expect(body.data.schema_version).toBe(1);

    const curriculum = await (
      await api.request('GET', '/api/curriculum', { cookie })
    ).json();
    const created = curriculum.data.classes.find((row: Class) => row.id === body.data.id);
    expect(created).toBeTruthy();
    expect(created.code).toBe('12ENGSTD1');
  });

  it('POST /api/units creates a unit and appends to subject', async () => {
    const api = freshApi();
    const cookie = await signIn(api);

    const res = await api.request('POST', '/api/units', {
      cookie,
      body: {
        title: 'New Unit',
        year_id: YEAR_ID,
        subject_id: SUBJECT_ID
      }
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.type).toBe('unit');
    expect(body.data.lesson_ids).toEqual([]);
    expect(body.data.title).toBe('New Unit');
    expect(body.data.status).toBe('active');

    const curriculum = await (
      await api.request('GET', '/api/curriculum', { cookie })
    ).json();
    const created = curriculum.data.units.find((row: Unit) => row.id === body.data.id);
    expect(created).toBeTruthy();
    const subject = curriculum.data.subjects.find((row: Subject) => row.id === SUBJECT_ID);
    expect(subject.unit_ids).toContain(body.data.id);
  });

  it('POST /api/lessons creates a draft lesson and appends to unit', async () => {
    const api = freshApi();
    const cookie = await signIn(api);

    const beforeUnit = freshSeed().units.find((u) => (u as Unit).id === UNIT_ID) as Unit;
    const maxSequence = Math.max(
      0,
      ...((freshSeed().lessons as Lesson[])
        .filter((l) => l.unit_id === UNIT_ID)
        .map((l) => l.sequence))
    );

    const res = await api.request('POST', '/api/lessons', {
      cookie,
      body: { title: 'New Lesson', unit_id: UNIT_ID }
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.type).toBe('lesson');
    expect(body.data.blocks).toEqual([]);
    expect(body.data.unit_id).toBe(UNIT_ID);
    expect(body.data.sequence).toBe(maxSequence + 1);
    expect(body.data.status).toBe('active');

    const draft = await (
      await api.request('GET', `/api/lessons/${body.data.id}`, { cookie })
    ).json();
    expect(draft.data.id).toBe(body.data.id);
    expect(draft.data.blocks).toEqual([]);

    const curriculum = await (
      await api.request('GET', '/api/curriculum', { cookie })
    ).json();
    const unit = curriculum.data.units.find((row: Unit) => row.id === UNIT_ID);
    expect(unit.lesson_ids).toEqual([...beforeUnit.lesson_ids, body.data.id]);
  });

  it('POST /api/scope-sequences creates scope and links subject', async () => {
    const api = freshApi();
    const cookie = await signIn(api);

    const res = await api.request('POST', '/api/scope-sequences', {
      cookie,
      body: {
        title: 'Y12 Eng Std 2027',
        subject_id: SUBJECT_STD_ID,
        academic_year: 2027
      }
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.type).toBe('scope_sequence');
    expect(body.data.timeline_items).toEqual([]);
    expect(body.data.week_count).toBe(40);
    expect(body.data.terms).toHaveLength(4);
    expect(body.data.terms[0]).toMatchObject({
      term_number: 1,
      start_week: 1,
      end_week: 10
    });
    expect(body.data.terms[3]).toMatchObject({
      term_number: 4,
      start_week: 31,
      end_week: 40
    });

    const curriculum = await (
      await api.request('GET', '/api/curriculum', { cookie })
    ).json();
    const scope = curriculum.data.scope_sequences.find(
      (row: ScopeSequence) => row.id === body.data.id
    );
    expect(scope).toBeTruthy();
    const subject = curriculum.data.subjects.find((row: Subject) => row.id === SUBJECT_STD_ID);
    expect(subject.scope_id).toBe(body.data.id);
  });

  it('POST /api/subjects creates a global subject with empty relation arrays', async () => {
    const api = freshApi();
    const cookie = await signIn(api);

    const res = await api.request('POST', '/api/subjects', {
      cookie,
      body: { title: 'Psychology' }
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.type).toBe('subject');
    expect(body.data.title).toBe('Psychology');
    expect(body.data.display_title).toBe('Psychology');
    expect(body.data.slug).toBeTruthy();
    expect(body.data.unit_ids).toEqual([]);
    expect(body.data.outcome_ids).toEqual([]);
    expect(body.data.class_ids).toEqual([]);
    expect(body.data).not.toHaveProperty('year_id');
    expect(body.data.status).toBe('active');
    expect(body.data.schema_version).toBe(1);

    const curriculum = await (
      await api.request('GET', '/api/curriculum', { cookie })
    ).json();
    const created = curriculum.data.subjects.find((row: Subject) => row.id === body.data.id);
    expect(created).toBeTruthy();
    expect(created.title).toBe('Psychology');
  });

  it('POST /api/subjects returns 400 for a blank title', async () => {
    const api = freshApi();
    const cookie = await signIn(api);
    const res = await api.request('POST', '/api/subjects', {
      cookie,
      body: { title: '   ' }
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('validation_error');
  });

  it('POST /api/subjects returns 409 for a case-insensitive duplicate title', async () => {
    const api = freshApi();
    const cookie = await signIn(api);
    const res = await api.request('POST', '/api/subjects', {
      cookie,
      body: { title: 'english advanced' }
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('conflict');
  });

  it('POST /api/classes adds the subject to the year cache without duplicating', async () => {
    const seed = freshSeed();
    const year = seed.years.find((row) => (row as { id: string }).id === YEAR_ID) as {
      subject_ids: string[];
    };
    year.subject_ids = [SUBJECT_ID];
    const api = freshApi(seed);
    const cookie = await signIn(api);

    const first = await api.request('POST', '/api/classes', {
      cookie,
      body: {
        title: '12 Eng Std',
        code: '12ENGSTD1',
        academic_year: 2026,
        year_id: YEAR_ID,
        subject_id: SUBJECT_STD_ID
      }
    });
    expect(first.status).toBe(201);

    const curriculum = await (
      await api.request('GET', '/api/curriculum', { cookie })
    ).json();
    const updatedYear = curriculum.data.years.find((row: { id: string }) => row.id === YEAR_ID);
    expect(updatedYear.subject_ids).toEqual([SUBJECT_ID, SUBJECT_STD_ID]);

    const second = await api.request('POST', '/api/classes', {
      cookie,
      body: {
        title: '12 Eng Std B',
        code: '12ENGSTD2',
        academic_year: 2026,
        year_id: YEAR_ID,
        subject_id: SUBJECT_STD_ID
      }
    });
    expect(second.status).toBe(201);

    const afterDup = await (
      await api.request('GET', '/api/curriculum', { cookie })
    ).json();
    const yearAfter = afterDup.data.years.find((row: { id: string }) => row.id === YEAR_ID);
    expect(yearAfter.subject_ids).toEqual([SUBJECT_ID, SUBJECT_STD_ID]);
  });

  it('keeps GET/PUT /api/lessons/:id working alongside POST /api/lessons', async () => {
    const api = freshApi();
    const cookie = await signIn(api);

    const existingId = 'lesson_aotfw_001';
    const getRes = await api.request('GET', `/api/lessons/${existingId}`, { cookie });
    expect(getRes.status).toBe(200);

    const createRes = await api.request('POST', '/api/lessons', {
      cookie,
      body: { title: 'Another Lesson', unit_id: UNIT_ID }
    });
    expect(createRes.status).toBe(201);
  });
});
