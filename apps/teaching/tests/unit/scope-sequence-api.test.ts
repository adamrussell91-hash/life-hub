import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { createMockApi } from '../../scripts/mock-api';
import type { SeedData } from '../../scripts/mock-store';
import { scopeSequenceKey } from '../../src/storage/keys';
import type { ScopeSequence, TimelineItem } from '@/schemas';

const __dirname = dirname(fileURLToPath(import.meta.url));
const seedFixture = JSON.parse(
  readFileSync(join(__dirname, '../../fixtures/seed.json'), 'utf-8')
) as SeedData;

const PASSPHRASE = 'teaching-hub-local';
const SCOPE_ID = 'scope_y12_engadv_2026';
const PATH = `/api/scope-sequences/${SCOPE_ID}`;

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

const replacementItems: TimelineItem[] = [
  {
    id: 'ti_unit_aotfw',
    kind: 'unit',
    unit_id: 'unit_aotfw',
    start_week: 1,
    end_week: 5,
    order: 1
  },
  {
    id: 'ti_note_mid',
    kind: 'note',
    title: 'Checkpoint',
    start_week: 6,
    end_week: 6,
    order: 2
  }
];

describe('PATCH /api/scope-sequences/:id (mock)', () => {
  it('returns 401 without auth', async () => {
    const api = freshApi();
    const res = await api.request('PATCH', PATH, {
      body: { timeline_items: replacementItems }
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('unauthorized');
  });

  it('returns 404 for a missing scope sequence', async () => {
    const api = freshApi();
    const cookie = await signIn(api);

    const res = await api.request('PATCH', '/api/scope-sequences/scope_missing', {
      cookie,
      body: { timeline_items: [] }
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('not_found');
  });

  it('replaces timeline_items and bumps updated_at', async () => {
    const api = freshApi();
    const cookie = await signIn(api);

    const before = (freshSeed().scope_sequences as ScopeSequence[]).find(
      (s) => s.id === SCOPE_ID
    );
    expect(before).toBeTruthy();

    const res = await api.request('PATCH', PATH, {
      cookie,
      body: { timeline_items: replacementItems }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.timeline_items).toEqual(replacementItems);
    expect(body.data.updated_at).not.toBe(before!.updated_at);

    const curriculum = await (
      await api.request('GET', '/api/curriculum', { cookie })
    ).json();
    const scope = curriculum.data.scope_sequences.find(
      (row: ScopeSequence) => row.id === SCOPE_ID
    );
    expect(scope.timeline_items).toEqual(replacementItems);
    expect(scope.updated_at).toBe(body.data.updated_at);
  });

  it('rejects duplicate unit_id among unit items', async () => {
    const api = freshApi();
    const cookie = await signIn(api);

    const res = await api.request('PATCH', PATH, {
      cookie,
      body: {
        timeline_items: [
          {
            id: 'ti_a',
            kind: 'unit',
            unit_id: 'unit_aotfw',
            start_week: 1,
            end_week: 2,
            order: 1
          },
          {
            id: 'ti_b',
            kind: 'unit',
            unit_id: 'unit_aotfw',
            start_week: 3,
            end_week: 4,
            order: 2
          }
        ]
      }
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('validation_error');
  });

  it('rejects out-of-range weeks', async () => {
    const api = freshApi();
    const cookie = await signIn(api);

    const res = await api.request('PATCH', PATH, {
      cookie,
      body: {
        timeline_items: [
          {
            id: 'ti_bad',
            kind: 'note',
            title: 'Too late',
            start_week: 41,
            end_week: 41,
            order: 1
          }
        ]
      }
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('validation_error');
  });

  it('rejects unknown unit_id', async () => {
    const api = freshApi();
    const cookie = await signIn(api);

    const res = await api.request('PATCH', PATH, {
      cookie,
      body: {
        timeline_items: [
          {
            id: 'ti_missing',
            kind: 'unit',
            unit_id: 'unit_does_not_exist',
            start_week: 1,
            end_week: 2,
            order: 1
          }
        ]
      }
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('validation_error');
    expect(body.error.message).toContain('Unknown unit_id');
  });

  it('rejects unit_id from another subject', async () => {
    const seed = freshSeed();
    seed.units.push({
      id: 'unit_other_subject',
      type: 'unit',
      title: 'Other Subject Unit',
      slug: 'other_subject_unit',
      status: 'active',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      schema_version: 1,
      year_id: 'year_12',
      subject_id: 'subject_other',
      lesson_ids: []
    });
    const api = freshApi(seed);
    const cookie = await signIn(api);

    const res = await api.request('PATCH', PATH, {
      cookie,
      body: {
        timeline_items: [
          {
            id: 'ti_wrong_subject',
            kind: 'unit',
            unit_id: 'unit_other_subject',
            start_week: 1,
            end_week: 2,
            order: 1
          }
        ]
      }
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('validation_error');
    expect(body.error.message).toContain('scope subject');
  });
});

describe('scope sequence storage key', () => {
  it('builds scope sequence key', () => {
    expect(scopeSequenceKey(SCOPE_ID)).toBe(`scope_sequences/${SCOPE_ID}`);
  });
});
